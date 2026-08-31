import {
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
} from "pdf-lib";
import type { CompressionLevel } from "./compressionLevels";

export type { CompressionLevel } from "./compressionLevels";

interface LevelSettings {
  recompressImages: boolean;
  jpegQuality: number;
  maxLongestSideDimensionPx: number | null;
}

const LEVEL_SETTINGS: Record<CompressionLevel, LevelSettings> = {
  leve: { recompressImages: false, jpegQuality: 1, maxLongestSideDimensionPx: null },
  equilibrada: { recompressImages: true, jpegQuality: 0.75, maxLongestSideDimensionPx: null },
  maxima: { recompressImages: true, jpegQuality: 0.4, maxLongestSideDimensionPx: 1200 },
};

export interface CompressProgress {
  stage: "reading" | "recompressing-images" | "saving";
  imagesProcessed: number;
  imagesTotal: number;
}

/**
 * Motivos pelos quais uma imagem NÃO foi recomprimida — sempre contabilizados e
 * reportados, nunca silenciosos:
 * - "unsupported-filter": a imagem não usa exclusivamente DCTDecode (JPEG).
 * - "unsupported-color-space": ColorSpace ausente ou diferente de /DeviceRGB
 *   (ex.: DeviceGray, DeviceCMYK, Indexed, ICCBased, Separation) — recodificar via
 *   canvas sempre produz JPEG RGB de 3 componentes, então qualquer outro espaço de
 *   cor original ficaria inconsistente com o novo conteúdo.
 * - "soft-mask-present": a imagem tem /SMask (transparência) — o canvas descarta
 *   canal alfa ao decodificar um JPEG, então recomprimir apagaria a transparência
 *   sem avisar.
 * - "mask-present": a imagem tem /Mask (stencil ou color-key) — mesmo risco do SMask.
 * - "unsupported-bits-per-component": diferente de 8 bits — canvas só lida com 8 bits.
 * - "unsupported-decode-params": presença de /Decode ou /DecodeParms customizados,
 *   que alteram a interpretação dos componentes de cor e não são reproduzidos pela
 *   recodificação via canvas.
 * - "decode-failed": dimensões ausentes/inválidas no dicionário, ou falha ao
 *   decodificar os bytes originais como JPEG.
 * - "encode-unsupported": ambiente sem OffscreenCanvas/createImageBitmap.
 * - "no-gain": a imagem foi decodificada e recodificada com sucesso, mas o
 *   resultado não ficou menor — o stream original é mantido.
 */
export type ImageSkipReason =
  | "unsupported-filter"
  | "unsupported-color-space"
  | "soft-mask-present"
  | "mask-present"
  | "unsupported-bits-per-component"
  | "unsupported-decode-params"
  | "decode-failed"
  | "encode-unsupported"
  | "no-gain";

export interface ImageRecompressionSkip {
  reason: ImageSkipReason;
  count: number;
}

/**
 * "reduced": o arquivo final é comprovadamente menor que o original — ele é
 * oferecido para download.
 * "no-gain-original-preserved": nenhuma redução real foi obtida (o resultado
 * processado ficou igual ou maior que o original). Nesse caso `bytes` é uma
 * cópia EXATA, byte a byte, do arquivo original enviado — nunca se entrega
 * silenciosamente uma versão maior fingindo ser uma compactação.
 */
export type CompressOutcome = "reduced" | "no-gain-original-preserved";

export interface CompressResult {
  bytes: Uint8Array;
  outcome: CompressOutcome;
  finalBytes: number;
  imagesFound: number;
  imagesRecompressed: number;
  skips: ImageRecompressionSkip[];
  usedImageRecompression: boolean;
  usedRasterization: false;
}

const JPEG_FILTER_NAME = "DCTDecode";
const RGB_COLOR_SPACE = "DeviceRGB";
const SUPPORTED_BITS_PER_COMPONENT = 8;

function isImageXObject(dict: PDFDict): boolean {
  const subtype = dict.get(PDFName.of("Subtype"));
  return subtype instanceof PDFName && subtype.asString() === "/Image";
}

function getFilterNames(dict: PDFDict): string[] {
  const filter = dict.get(PDFName.of("Filter"));
  if (!filter) return [];
  if (filter instanceof PDFName) return [filter.asString().replace(/^\//, "")];
  const maybeArray = filter as unknown as { asArray?: () => unknown[] };
  if (typeof maybeArray.asArray === "function") {
    return (maybeArray.asArray() ?? [])
      .filter((item): item is PDFName => item instanceof PDFName)
      .map((item) => item.asString().replace(/^\//, ""));
  }
  return [];
}

function resolve(context: PDFContext, value: unknown): unknown {
  if (value instanceof PDFRef) return context.lookup(value);
  return value;
}

type Eligibility = { eligible: true } | { eligible: false; reason: ImageSkipReason };

/**
 * Portão de elegibilidade: decide, olhando SÓ o dicionário (antes de qualquer
 * tentativa de decodificação), se é seguro recomprimir esta imagem pelo caminho
 * implementado (decodificar via createImageBitmap → redesenhar em
 * OffscreenCanvas → recodificar como JPEG RGB de 8 bits). Ver a documentação de
 * `ImageSkipReason` para o motivo de cada critério.
 */
function checkJpegEligibility(dict: PDFDict, context: PDFContext): Eligibility {
  const filters = getFilterNames(dict);
  if (filters.length !== 1 || filters[0] !== JPEG_FILTER_NAME) {
    return { eligible: false, reason: "unsupported-filter" };
  }

  const colorSpace = resolve(context, dict.get(PDFName.of("ColorSpace")));
  const isRgb = colorSpace instanceof PDFName && colorSpace.asString() === `/${RGB_COLOR_SPACE}`;
  if (!isRgb) {
    return { eligible: false, reason: "unsupported-color-space" };
  }

  const smask = dict.get(PDFName.of("SMask"));
  if (smask) {
    return { eligible: false, reason: "soft-mask-present" };
  }

  const mask = dict.get(PDFName.of("Mask"));
  if (mask) {
    return { eligible: false, reason: "mask-present" };
  }

  const bitsPerComponent = resolve(context, dict.get(PDFName.of("BitsPerComponent")));
  const bpc = bitsPerComponent instanceof PDFNumber ? bitsPerComponent.asNumber() : null;
  if (bpc !== SUPPORTED_BITS_PER_COMPONENT) {
    return { eligible: false, reason: "unsupported-bits-per-component" };
  }

  const decode = dict.get(PDFName.of("Decode"));
  const decodeParms = dict.get(PDFName.of("DecodeParms")) ?? dict.get(PDFName.of("DP"));
  if (decode || decodeParms) {
    return { eligible: false, reason: "unsupported-decode-params" };
  }

  const width = resolve(context, dict.get(PDFName.of("Width")));
  const height = resolve(context, dict.get(PDFName.of("Height")));
  const widthOk = width instanceof PDFNumber && width.asNumber() > 0;
  const heightOk = height instanceof PDFNumber && height.asNumber() > 0;
  if (!widthOk || !heightOk) {
    return { eligible: false, reason: "decode-failed" };
  }

  return { eligible: true };
}

function canRecompressInThisEnvironment(): boolean {
  return (
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

async function recompressJpegBytes(
  originalBytes: Uint8Array,
  quality: number,
  maxLongestSidePx: number | null,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  try {
    const blob = new Blob([originalBytes.slice()], { type: "image/jpeg" });
    const bitmap = await createImageBitmap(blob);

    let targetWidth = bitmap.width;
    let targetHeight = bitmap.height;
    if (maxLongestSidePx) {
      const longest = Math.max(targetWidth, targetHeight);
      if (longest > maxLongestSidePx) {
        const scale = maxLongestSidePx / longest;
        targetWidth = Math.max(1, Math.round(targetWidth * scale));
        targetHeight = Math.max(1, Math.round(targetHeight * scale));
      }
    }

    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const outBlob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    const buffer = await outBlob.arrayBuffer();
    return { bytes: new Uint8Array(buffer), width: targetWidth, height: targetHeight };
  } catch {
    return null;
  }
}

/**
 * Compacta um PDF de acordo com o nível escolhido.
 *
 * Estratégia real utilizada (documentada para não prometer o que não é feito):
 * - "leve": apenas reserialização estrutural sem perda (object streams), sem tocar em imagens.
 * - "equilibrada"/"maxima": localiza XObjects de imagem elegíveis (ver `checkJpegEligibility`
 *   e `ImageSkipReason`) — JPEG (DCTDecode) puro, DeviceRGB, 8 bits por componente, sem
 *   SMask/Mask/Decode/DecodeParms — decodifica via createImageBitmap, redesenha em
 *   OffscreenCanvas e recomprime como JPEG na qualidade do nível (e, na máxima, reduz a
 *   resolução). O novo stream substitui o objeto original pela MESMA referência indireta,
 *   então todas as páginas que compartilham a imagem são atualizadas automaticamente.
 *   Qualquer imagem que não seja comprovadamente segura para esse caminho é preservada
 *   como está, com o motivo do skip registrado — nunca há tentativa silenciosa.
 * - Esta versão NUNCA rasteriza páginas inteiras em imagem.
 * - Se o resultado final não ficar comprovadamente menor que o original (por imagem ou no
 *   documento como um todo), o arquivo original é devolvido intacto, byte a byte — nunca se
 *   entrega uma versão igual ou maior disfarçada de "compactada".
 */
export async function compressPdf(
  bytes: Uint8Array,
  level: CompressionLevel,
  onProgress?: (progress: CompressProgress) => void,
): Promise<CompressResult> {
  onProgress?.({ stage: "reading", imagesProcessed: 0, imagesTotal: 0 });
  const settings = LEVEL_SETTINGS[level];
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });

  let imagesFound = 0;
  let imagesRecompressed = 0;
  const skipCounts = new Map<ImageSkipReason, number>();
  const bump = (reason: ImageSkipReason) =>
    skipCounts.set(reason, (skipCounts.get(reason) ?? 0) + 1);

  if (settings.recompressImages) {
    const supported = canRecompressInThisEnvironment();
    const imageEntries: Array<[PDFRef, PDFRawStream]> = [];
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream && isImageXObject(obj.dict)) {
        imageEntries.push([ref, obj]);
      }
    }
    imagesFound = imageEntries.length;

    for (let i = 0; i < imageEntries.length; i += 1) {
      const [ref, stream] = imageEntries[i]!;
      onProgress?.({
        stage: "recompressing-images",
        imagesProcessed: i,
        imagesTotal: imageEntries.length,
      });

      const eligibility = checkJpegEligibility(stream.dict, doc.context);
      if (!eligibility.eligible) {
        bump(eligibility.reason);
        continue;
      }
      if (!supported) {
        bump("encode-unsupported");
        continue;
      }

      const recompressed = await recompressJpegBytes(
        stream.contents,
        settings.jpegQuality,
        settings.maxLongestSideDimensionPx,
      );
      if (!recompressed) {
        bump("decode-failed");
        continue;
      }
      if (recompressed.bytes.byteLength >= stream.contents.byteLength) {
        bump("no-gain");
        continue;
      }

      // Dicionário construído do zero (não a partir de um spread do dicionário
      // original) com exatamente os campos válidos para o JPEG RGB de 8 bits que
      // acabamos de gerar. O portão de elegibilidade já garantiu que a imagem de
      // entrada era DeviceRGB/8 bits/sem SMask/Mask/Decode/DecodeParms, então
      // reproduzir esses mesmos campos aqui é seguro e comprovadamente coerente
      // com os novos bytes — nenhuma propriedade incompatível é reaproveitada.
      const newDict = doc.context.obj({
        Type: PDFName.of("XObject"),
        Subtype: PDFName.of("Image"),
        Filter: PDFName.of(JPEG_FILTER_NAME),
        ColorSpace: PDFName.of(RGB_COLOR_SPACE),
        BitsPerComponent: PDFNumber.of(SUPPORTED_BITS_PER_COMPONENT),
        Width: PDFNumber.of(recompressed.width),
        Height: PDFNumber.of(recompressed.height),
        Length: PDFNumber.of(recompressed.bytes.byteLength),
      }) as unknown as PDFDict;

      const newStream = PDFRawStream.of(newDict, recompressed.bytes);
      doc.context.assign(ref, newStream);
      imagesRecompressed += 1;
    }
  }

  onProgress?.({
    stage: "saving",
    imagesProcessed: imagesFound,
    imagesTotal: imagesFound,
  });
  const outBytes = await doc.save({ useObjectStreams: true });

  const skips: ImageRecompressionSkip[] = Array.from(skipCounts.entries()).map(
    ([reason, count]) => ({ reason, count }),
  );

  // Nunca apresentar um resultado igual ou maior como se fosse uma redução: se o
  // documento final (já considerando todas as imagens recomprimidas) não ficou
  // menor que o original, devolve-se o original intacto, byte a byte.
  if (outBytes.byteLength >= bytes.byteLength) {
    // Nenhuma das recompressões individuais (se houve) foi mantida — o original
    // intacto é devolvido, então reportar imagesRecompressed > 0 aqui seria
    // enganoso: nenhum byte recomprimido chegou a ser entregue ao usuário.
    return {
      bytes: bytes.slice(),
      outcome: "no-gain-original-preserved",
      finalBytes: bytes.byteLength,
      imagesFound,
      imagesRecompressed: 0,
      skips,
      usedImageRecompression: settings.recompressImages,
      usedRasterization: false,
    };
  }

  return {
    bytes: outBytes,
    outcome: "reduced",
    finalBytes: outBytes.byteLength,
    imagesFound,
    imagesRecompressed,
    skips,
    usedImageRecompression: settings.recompressImages,
    usedRasterization: false,
  };
}
