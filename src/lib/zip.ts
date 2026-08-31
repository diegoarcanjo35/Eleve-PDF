import JSZip from "jszip";

export async function zipFiles(
  files: { name: string; bytes: Uint8Array }[],
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.bytes);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
