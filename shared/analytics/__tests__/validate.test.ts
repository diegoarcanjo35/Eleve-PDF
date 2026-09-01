import { describe, expect, it } from "vitest";
import { validateEventPayload } from "../validate";

const BASE = { event: "page_view", session_id: "11111111-1111-4111-8111-111111111111" };

describe("validateEventPayload — só eventos e valores permitidos", () => {
  it("aceita um evento válido da lista fechada", () => {
    const result = validateEventPayload({ ...BASE, route_id: "home" });
    expect(result).not.toBeNull();
    expect(result?.event).toBe("page_view");
    expect(result?.route_id).toBe("home");
  });

  it("rejeita um tipo de evento fora da lista fechada", () => {
    expect(validateEventPayload({ ...BASE, event: "user_clicked_everything" })).toBeNull();
  });

  it("rejeita quando session_id não é um UUID v4 válido", () => {
    expect(validateEventPayload({ ...BASE, session_id: "not-a-uuid" })).toBeNull();
    expect(validateEventPayload({ event: "page_view" })).toBeNull();
  });

  it("descarta silenciosamente propriedades arbitrárias fora da lista fechada", () => {
    const result = validateEventPayload({
      ...BASE,
      file_name: "contrato-confidencial.pdf",
      random_field: "qualquer coisa",
    });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("file_name");
    expect(result).not.toHaveProperty("random_field");
  });

  it("nunca aceita nome de arquivo, tamanho exato ou conteúdo do PDF — esses campos não existem no schema", () => {
    const result = validateEventPayload({
      ...BASE,
      fileName: "algo.pdf",
      file_size_bytes: 123456,
      pdf_content: "base64....",
    });
    expect(result).not.toBeNull();
    const keys = Object.keys(result as object);
    expect(keys).not.toContain("fileName");
    expect(keys).not.toContain("file_size_bytes");
    expect(keys).not.toContain("pdf_content");
  });

  it("rejeita valores de tool_id/outcome/error_category/cta_id fora das listas fechadas (viram undefined, evento continua válido)", () => {
    const result = validateEventPayload({
      ...BASE,
      tool_id: "juntar-pdfs-inexistente",
      outcome: "muito_bom",
      error_category: "algo_qualquer",
      cta_id: "botao_secreto",
    });
    expect(result).not.toBeNull();
    expect(result?.tool_id).toBeUndefined();
    expect(result?.outcome).toBeUndefined();
    expect(result?.error_category).toBeUndefined();
    expect(result?.cta_id).toBeUndefined();
  });

  it("rejeita UTM que parece URL, e-mail, telefone, ou tem caracteres de controle", () => {
    const urlAttempt = validateEventPayload({ ...BASE, utm_source: "http://evil.example.com" });
    expect(urlAttempt?.utm_source).toBeUndefined();

    const emailAttempt = validateEventPayload({ ...BASE, utm_campaign: "contato@pessoa.com" });
    expect(emailAttempt?.utm_campaign).toBeUndefined();

    const phoneAttempt = validateEventPayload({ ...BASE, utm_term: "+55 61 99999-9999" });
    expect(phoneAttempt?.utm_term).toBeUndefined();

    const controlCharAttempt = validateEventPayload({ ...BASE, utm_medium: "cpc\x00injected" });
    expect(controlCharAttempt?.utm_medium).toBeUndefined();
  });

  it("aceita UTM simples e segura", () => {
    const result = validateEventPayload({ ...BASE, utm_source: "google", utm_medium: "cpc" });
    expect(result?.utm_source).toBe("google");
    expect(result?.utm_medium).toBe("cpc");
  });

  it("referrer_host guarda só o hostname — descarta caminho, query e fragmento", () => {
    const result = validateEventPayload({
      ...BASE,
      referrer_host: "https://www.google.com/search?q=elevepdf#resultados",
    });
    expect(result?.referrer_host).toBe("www.google.com");
  });

  it("landing_page só aceita um pathname já conhecido do ElevePDF", () => {
    const known = validateEventPayload({ ...BASE, landing_page: "compactar-pdf" });
    expect(known?.landing_page).toBe("compactar-pdf");

    const unknown = validateEventPayload({ ...BASE, landing_page: "/qualquer/rota/externa" });
    expect(unknown?.landing_page).toBeUndefined();
  });

  it("nunca aceita occurred_at do cliente — o campo não existe no resultado validado, mesmo se enviado", () => {
    const withValidDate = validateEventPayload({ ...BASE, occurred_at: "2020-01-01T00:00:00.000Z" });
    expect(withValidDate).not.toBeNull();
    expect(withValidDate).not.toHaveProperty("occurred_at");

    const withFakeFutureDate = validateEventPayload({ ...BASE, occurred_at: "2099-12-31T23:59:59.000Z" });
    expect(withFakeFutureDate).not.toHaveProperty("occurred_at");

    const withGarbage = validateEventPayload({ ...BASE, occurred_at: "não é uma data" });
    expect(withGarbage).not.toBeNull();
    expect(withGarbage).not.toHaveProperty("occurred_at");
  });
});
