import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom não implementa Blob/File.prototype.arrayBuffer() (usado por
// usePdfUpload/useMultiPdfUpload para ler o arquivo selecionado) — sem isso,
// nenhum teste que simula upload de arquivo consegue rodar. FileReader, que
// o jsdom implementa de verdade, serve de base para o polyfill.
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

afterEach(() => {
  cleanup();
});
