import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  StandardFonts,
  rgb,
} from "pdf-lib";
import jpeg from "jpeg-js";
import zlib from "node:zlib";

/** Gera bytes de PDF reais (não mocks) para os testes, sem depender de arquivos externos. */
export async function makeTextPdf(pageCount: number, paragraphRepeat = 6): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Fixture de teste — página ${i + 1}`, {
      x: 50,
      y: 780,
      size: 16,
      font,
      color: rgb(0.05, 0.08, 0.12),
    });
    const text = "Conteúdo sintético gerado para testes automatizados. ".repeat(paragraphRepeat);
    page.drawText(text, {
      x: 50,
      y: 700,
      size: 11,
      font,
      maxWidth: 495,
      lineHeight: 15,
    });
  }
  return doc.save();
}

export function makeJpegBytes(width = 400, height = 300, quality = 90): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = Math.floor((x / width) * 255);
      data[i + 1] = Math.floor((y / height) * 255);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return new Uint8Array(jpeg.encode({ data, width, height }, quality).data);
}

export async function makePdfWithJpegImage(pageCount = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const jpegBytes = makeJpegBytes();
  const image = await doc.embedJpg(jpegBytes);
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([595, 842]);
    const { width, height } = image.scaleToFit(495, 600);
    page.drawImage(image, { x: 50, y: 100, width, height });
  }
  return doc.save();
}

/** Monta um PNG mínimo, porém válido, codificado de verdade via zlib (sem libs externas). */
function makeMinimalPng(width: number, height: number, rgbaColor: [number, number, number, number]): Uint8Array {
  const [r, g, b, a] = rgbaColor;
  const rowBytes = width * 4 + 1; // +1 = byte de tipo de filtro (0 = None) por linha
  const raw = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filtro "None"
    for (let x = 0; x < width; x += 1) {
      const px = rowStart + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }
  const idatData = zlib.deflateSync(Buffer.from(raw));

  function chunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcInput = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((zlib.crc32 ? zlib.crc32(crcInput) : crc32(crcInput)) >>> 0, 0);
    return Buffer.concat([length, typeBuf, data, crc]);
  }

  // Node < 20.12 não tem zlib.crc32 embutido — fallback puro em JS.
  function crc32(buf: Buffer): number {
    let crc = ~0;
    for (const byte of buf) {
      crc ^= byte;
      for (let i = 0; i < 8; i += 1) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
    }
    return ~crc;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return new Uint8Array(png);
}

/** PDF com uma imagem PNG real embutida (Filter FlateDecode) — usada para provar que
 *  imagens fora do caminho seguro (não-JPEG) nunca são recomprimidas nesta versão. */
export async function makePdfWithFlateImage(pageCount = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pngBytes = makeMinimalPng(40, 30, [30, 120, 200, 255]);
  const image = await doc.embedPng(pngBytes);
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([300, 200]);
    page.drawImage(image, { x: 20, y: 20, width: 200, height: 150 });
  }
  return doc.save();
}

export interface ImageDictOverrides {
  ColorSpace?: "DeviceGray" | "DeviceCMYK";
  BitsPerComponent?: number;
  withSMask?: boolean;
  withMask?: boolean;
  withDecodeParms?: boolean;
}

/**
 * Constrói um PDF com uma única imagem JPEG real e válida, mas com o DICIONÁRIO do
 * XObject deliberadamente alterado (ColorSpace/BitsPerComponent/SMask/Mask/DecodeParms),
 * para testar o PORTÃO de elegibilidade (`checkJpegEligibility`) isoladamente — o
 * portão decide só olhando o dicionário, antes de qualquer tentativa de decodificação,
 * então isso testa a lógica de decisão sem depender de gerar pixels reais em cada
 * espaço de cor (inviável no Node sem um decodificador de imagem completo).
 */
export async function makeImagePdfWithDictOverrides(overrides: ImageDictOverrides): Promise<Uint8Array> {
  const draftDoc = await PDFDocument.create();
  const jpegBytes = makeJpegBytes(200, 150, 85);
  const image = await draftDoc.embedJpg(jpegBytes);
  const draftPage = draftDoc.addPage([300, 200]);
  draftPage.drawImage(image, { x: 20, y: 20, width: 200, height: 150 });
  // pdf-lib só materializa o XObject da imagem no contexto durante o save() (embedding
  // preguiçoso) — por isso salvamos e recarregamos antes de procurar o objeto para editar.
  const draftBytes = await draftDoc.save();
  const doc = await PDFDocument.load(draftBytes);

  const context = doc.context;
  let targetRef: import("pdf-lib").PDFRef | null = null;
  let targetStream: PDFRawStream | null = null;
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") {
      targetRef = ref;
      targetStream = obj;
    }
  }
  if (!targetRef || !targetStream) throw new Error("XObject de imagem não encontrado no fixture");

  // Construído do zero (NÃO a partir de um spread de `dict.entries()` — as chaves ali
  // são instâncias de PDFName cuja coerção implícita a string de objeto JS produz um
  // nome PDF inválido/escapado, então um spread ingênuo silenciosamente perde todos os
  // campos originais). Começa com os campos reais e válidos da imagem JPEG embutida
  // (RGB, 8 bits, sem máscara) e aplica só os overrides pedidos por cima.
  const entries: Record<string, unknown> = {
    Type: PDFName.of("XObject"),
    Subtype: PDFName.of("Image"),
    Filter: PDFName.of("DCTDecode"),
    ColorSpace: PDFName.of("DeviceRGB"),
    BitsPerComponent: PDFNumber.of(8),
    Width: targetStream.dict.get(PDFName.of("Width")),
    Height: targetStream.dict.get(PDFName.of("Height")),
    Length: PDFNumber.of(targetStream.contents.byteLength),
  };

  if (overrides.ColorSpace) {
    entries.ColorSpace = PDFName.of(overrides.ColorSpace);
  }
  if (overrides.BitsPerComponent) {
    entries.BitsPerComponent = PDFNumber.of(overrides.BitsPerComponent);
  }
  if (overrides.withSMask) {
    const smaskDict = context.obj({
      Type: PDFName.of("XObject"),
      Subtype: PDFName.of("Image"),
      Width: PDFNumber.of(1),
      Height: PDFNumber.of(1),
      BitsPerComponent: PDFNumber.of(8),
      ColorSpace: PDFName.of("DeviceGray"),
      Filter: PDFName.of("FlateDecode"),
    }) as unknown as PDFDict;
    const smaskRef = context.register(PDFRawStream.of(smaskDict, zlib.deflateSync(Buffer.from([255]))));
    entries.SMask = smaskRef;
  }
  if (overrides.withMask) {
    const maskDict = context.obj({
      Type: PDFName.of("XObject"),
      Subtype: PDFName.of("Image"),
      Width: PDFNumber.of(1),
      Height: PDFNumber.of(1),
      BitsPerComponent: PDFNumber.of(1),
      ImageMask: true,
      Filter: PDFName.of("FlateDecode"),
    }) as unknown as PDFDict;
    const maskRef = context.register(PDFRawStream.of(maskDict, zlib.deflateSync(Buffer.from([0]))));
    entries.Mask = maskRef;
  }
  if (overrides.withDecodeParms) {
    entries.DecodeParms = context.obj({ ColorTransform: PDFNumber.of(0) });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newDict = context.obj(entries as any) as unknown as PDFDict;
  const newStream = PDFRawStream.of(newDict, targetStream.contents);
  context.assign(targetRef, newStream);

  return doc.save();
}

/** PDF de 2 páginas com AcroForm (campo de texto), outline apontando para a página 2,
 *  destino nomeado, link externo (URI) e link interno (GoTo) — usado para provar,
 *  com testes reais, o que a divisão preserva e o que não preserva. */
export async function makePdfWithSensitiveStructures(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const form = doc.getForm();
  const page1 = doc.addPage([300, 200]);
  const page2 = doc.addPage([300, 200]);

  const textField = form.createTextField("nome");
  textField.addToPage(page1, { x: 10, y: 10, width: 100, height: 20 });

  const linkAnnotDict = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [10, 90, 60, 110],
    Border: [0, 0, 0],
    A: doc.context.obj({ Type: "Action", S: "URI", URI: PDFString.of("https://example.com") }),
  });
  const linkAnnotRef = doc.context.register(linkAnnotDict);
  // createTextField(...).addToPage(...) já colocou a anotação Widget do campo no
  // array de Annots da página — reaproveitar esse array (em vez de substituí-lo)
  // para não apagar o Widget que acabou de ser adicionado.
  const currentAnnots = page1.node.get(PDFName.of("Annots"));
  const annotsArray = currentAnnots instanceof PDFArray ? currentAnnots : (doc.context.obj([]) as PDFArray);
  annotsArray.push(linkAnnotRef);
  page1.node.set(PDFName.of("Annots"), annotsArray);

  const outlineItemDict = doc.context.obj({
    Title: PDFString.of("Capítulo 2"),
    Dest: doc.context.obj([page2.ref, PDFName.of("Fit")]),
  });
  const outlineItemRef = doc.context.register(outlineItemDict);
  const outlinesDict = doc.context.obj({
    Type: "Outlines",
    First: outlineItemRef,
    Last: outlineItemRef,
    Count: 1,
  });
  doc.catalog.set(PDFName.of("Outlines"), doc.context.register(outlinesDict));

  const namesDict = doc.context.obj({
    Dests: doc.context.obj({
      Names: doc.context.obj([PDFString.of("secao2"), doc.context.obj([page2.ref, PDFName.of("Fit")])]),
    }),
  });
  doc.catalog.set(PDFName.of("Names"), doc.context.register(namesDict));

  return doc.save();
}

/** PDF de 1 página com um campo de assinatura digital (FT /Sig) no AcroForm. */
export async function makePdfWithSignatureField(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);

  const sigFieldDict = doc.context.obj({
    FT: PDFName.of("Sig"),
    T: PDFString.of("Assinatura1"),
    Rect: [10, 10, 100, 40],
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Widget"),
  });
  const sigFieldRef = doc.context.register(sigFieldDict);

  const acroFormDict = doc.context.obj({
    Fields: doc.context.obj([sigFieldRef]),
    SigFlags: PDFNumber.of(3),
  });
  doc.catalog.set(PDFName.of("AcroForm"), doc.context.register(acroFormDict));
  page.node.set(PDFName.of("Annots"), doc.context.obj([sigFieldRef]));

  return doc.save();
}

export function corrupt(bytes: Uint8Array, ratio = 0.6): Uint8Array {
  return bytes.slice(0, Math.floor(bytes.length * ratio));
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
