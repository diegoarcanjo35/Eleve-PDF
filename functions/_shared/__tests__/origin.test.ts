import { describe, expect, it } from "vitest";
import { isAllowedRequestOrigin } from "../origin";

const PROD_ORIGIN = "https://elevepdf.elevesites.com.br";
const PROD_HOST = "elevepdf.elevesites.com.br";

const OFF = { allowLocalDev: false, allowPagesPreview: false };
const PREVIEW_ON = { allowLocalDev: false, allowPagesPreview: true };
const LOCAL_ON = { allowLocalDev: true, allowPagesPreview: false };

describe("isAllowedRequestOrigin", () => {
  it("1. aceita o domínio oficial de produção (flags desligadas)", () => {
    expect(isAllowedRequestOrigin(PROD_ORIGIN, PROD_HOST, OFF)).toBe(true);
  });

  it("2. aceita a raiz do preview do projeto eleve-pdf com a flag ligada", () => {
    const origin = "https://eleve-pdf.pages.dev";
    const host = "eleve-pdf.pages.dev";
    expect(isAllowedRequestOrigin(origin, host, PREVIEW_ON)).toBe(true);
  });

  it("3. aceita um preview de branch (subdomínio nomeado) com a flag ligada", () => {
    const origin = "https://fase-teste.eleve-pdf.pages.dev";
    const host = "fase-teste.eleve-pdf.pages.dev";
    expect(isAllowedRequestOrigin(origin, host, PREVIEW_ON)).toBe(true);
  });

  it("4. aceita um preview por hash de deployment com a flag ligada", () => {
    const origin = "https://abc123.eleve-pdf.pages.dev";
    const host = "abc123.eleve-pdf.pages.dev";
    expect(isAllowedRequestOrigin(origin, host, PREVIEW_ON)).toBe(true);
  });

  it("5. rejeita qualquer preview do eleve-pdf quando a flag está desligada", () => {
    const origin = "https://fase-teste.eleve-pdf.pages.dev";
    const host = "fase-teste.eleve-pdf.pages.dev";
    expect(isAllowedRequestOrigin(origin, host, OFF)).toBe(false);
    expect(isAllowedRequestOrigin("https://eleve-pdf.pages.dev", "eleve-pdf.pages.dev", OFF)).toBe(false);
  });

  it("6. rejeita o domínio pages.dev de outro projeto, mesmo com a flag ligada", () => {
    const origin = "https://outro-projeto.pages.dev";
    const host = "outro-projeto.pages.dev";
    expect(isAllowedRequestOrigin(origin, host, PREVIEW_ON)).toBe(false);
  });

  it("7. rejeita domínio sufixado por evil.com, mesmo com a flag ligada", () => {
    const origin = "https://eleve-pdf.pages.dev.evil.com";
    const host = "eleve-pdf.pages.dev.evil.com";
    expect(isAllowedRequestOrigin(origin, host, PREVIEW_ON)).toBe(false);
  });

  it("8. rejeita prefixo malicioso colado ao domínio real, mesmo com a flag ligada", () => {
    const origin = "https://evil-eleve-pdf.pages.dev";
    const host = "evil-eleve-pdf.pages.dev";
    expect(isAllowedRequestOrigin(origin, host, PREVIEW_ON)).toBe(false);
  });

  it("9. rejeita HTTP em preview, mesmo com a flag ligada", () => {
    const origin = "http://fase-teste.eleve-pdf.pages.dev";
    const host = "fase-teste.eleve-pdf.pages.dev";
    expect(isAllowedRequestOrigin(origin, host, PREVIEW_ON)).toBe(false);
  });

  it("10. rejeita Origin e Host divergentes, mesmo quando cada um sozinho seria permitido", () => {
    const originA = "https://alice.eleve-pdf.pages.dev";
    const hostB = "bob.eleve-pdf.pages.dev";
    expect(isAllowedRequestOrigin(originA, hostB, PREVIEW_ON)).toBe(false);
    // Origin de produção com Host de preview (ambos individualmente válidos em seus próprios contextos).
    expect(isAllowedRequestOrigin(PROD_ORIGIN, "fase-teste.eleve-pdf.pages.dev", PREVIEW_ON)).toBe(false);
  });

  it("11. localhost continua rejeitado quando ANALYTICS_ALLOW_LOCAL_DEV está desligada", () => {
    expect(isAllowedRequestOrigin("http://localhost:5173", "localhost:5173", OFF)).toBe(false);
    expect(isAllowedRequestOrigin("http://localhost:5173", "localhost:5173", PREVIEW_ON)).toBe(false);
  });

  it("localhost aceito só quando ANALYTICS_ALLOW_LOCAL_DEV está explicitamente ligada", () => {
    expect(isAllowedRequestOrigin("http://localhost:5173", "localhost:5173", LOCAL_ON)).toBe(true);
  });

  it("12. nenhuma regressão no domínio oficial: rejeita outras origens/hosts e ausência de Origin/Host, com ou sem preview ligado", () => {
    expect(isAllowedRequestOrigin(PROD_ORIGIN, PROD_HOST, PREVIEW_ON)).toBe(true);
    expect(isAllowedRequestOrigin("https://evil.example.com", PROD_HOST, OFF)).toBe(false);
    expect(isAllowedRequestOrigin("https://evil.example.com", PROD_HOST, PREVIEW_ON)).toBe(false);
    expect(isAllowedRequestOrigin(null, PROD_HOST, OFF)).toBe(false);
    expect(isAllowedRequestOrigin(PROD_ORIGIN, null, OFF)).toBe(false);
    expect(isAllowedRequestOrigin("https://eleve-pdf-pages.dev", "eleve-pdf-pages.dev", PREVIEW_ON)).toBe(false);
    expect(isAllowedRequestOrigin("https://evil.com", "evil.com", PREVIEW_ON)).toBe(false);
  });
});
