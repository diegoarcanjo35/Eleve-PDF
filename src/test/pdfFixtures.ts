import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import jpeg from "jpeg-js";

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

export function corrupt(bytes: Uint8Array, ratio = 0.6): Uint8Array {
  return bytes.slice(0, Math.floor(bytes.length * ratio));
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
