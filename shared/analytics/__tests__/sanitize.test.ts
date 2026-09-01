import { describe, expect, it } from "vitest";
import { referrerToHostname, sanitizeUtmValue } from "../sanitize";

describe("referrerToHostname", () => {
  it("guarda só o hostname, descartando caminho/query/fragmento/credenciais/porta", () => {
    expect(referrerToHostname("https://user:pass@www.example.com:8443/a/b?c=1#d")).toBe("www.example.com");
  });

  it("rejeita valores que não são URLs http(s) válidas", () => {
    expect(referrerToHostname("")).toBeNull();
    expect(referrerToHostname(null)).toBeNull();
    expect(referrerToHostname("javascript:alert(1)")).toBeNull();
    expect(referrerToHostname("not a url")).toBeNull();
  });
});

describe("sanitizeUtmValue", () => {
  it("aceita valores simples", () => {
    expect(sanitizeUtmValue("google")).toBe("google");
    expect(sanitizeUtmValue("campanha-2026_v2")).toBe("campanha-2026_v2");
  });

  it("rejeita valores longos demais", () => {
    expect(sanitizeUtmValue("a".repeat(65))).toBeNull();
  });

  it("rejeita URLs, e-mails e telefones disfarçados de UTM", () => {
    expect(sanitizeUtmValue("https://malicious.example.com")).toBeNull();
    expect(sanitizeUtmValue("alguem@example.com")).toBeNull();
    expect(sanitizeUtmValue("+55 11 91234-5678")).toBeNull();
  });

  it("rejeita caracteres de controle", () => {
    expect(sanitizeUtmValue("abc\x00def")).toBeNull();
    expect(sanitizeUtmValue("abc\x1fdef")).toBeNull();
  });

  it("rejeita valores não-string", () => {
    expect(sanitizeUtmValue(123)).toBeNull();
    expect(sanitizeUtmValue(undefined)).toBeNull();
    expect(sanitizeUtmValue({})).toBeNull();
  });
});
