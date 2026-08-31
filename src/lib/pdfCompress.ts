import {
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

export interface ImageRecompressionSkip {
  reason: "unsupported-filter" | "decode-failed" | "encode-unsupported" | "no-gain";
  count: number;
}

export interface CompressResult {
  bytes: Uint8Array;
  imagesFound: number;
  imagesRecompressed: number;
  skips: ImageRecompressionSkip[];
  usedImageRecompression: boolean;
  usedRasterization: false;
}

const JPEG_FILTER_NAME = "DCTDecode";

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
 * - "equilibrada"/"maxima": localiza XObjects de imagem com Filter DCTDecode (JPEG) no PDF,
 *   decodifica via createImageBitmap, redesenha em OffscreenCanvas e recomprime como JPEG na
 *   qualidade do nível (e, na máxima, reduz a resolução). O novo stream substitui o objeto
 *   original pela MESMA referência indireta, então todas as páginas que compartilham a imagem
 *   são atualizadas automaticamente.
 * - Imagens que não usam DCTDecode (ex.: bitmaps Flate/indexados) NÃO são recomprimidas nesta
 *   versão — é uma limitação conhecida e documentada, não uma falha silenciosa.
 * - Esta versão NUNCA rasteriza páginas inteiras em imagem. Se um PDF for majoritariamente
 *   texto vetorial, o nível "máxima" pode reduzir pouco — e isso é reportado honestamente.
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
  const skipCounts = new Map<ImageRecompressionSkip["reason"], number>();
  const bump = (reason: ImageRecompressionSkip["reason"]) =>
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

      const filters = getFilterNames(stream.dict);
      if (!filters.includes(JPEG_FILTER_NAME) || filters.length > 1) {
        bump("unsupported-filter");
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

      const newDict = doc.context.obj({
        ...Object.fromEntries(stream.dict.entries()),
        Type: PDFName.of("XObject"),
        Subtype: PDFName.of("Image"),
        Filter: PDFName.of(JPEG_FILTER_NAME),
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

  return {
    bytes: outBytes,
    imagesFound,
    imagesRecompressed,
    skips,
    usedImageRecompression: settings.recompressImages,
    usedRasterization: false,
  };
}
