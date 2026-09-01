import { describe, expect, it } from "vitest";
import { isAllowedHost, isAllowedOrigin } from "../origin";

describe("isAllowedOrigin / isAllowedHost", () => {
  it("aceita a origem/host de produção", () => {
    expect(isAllowedOrigin("https://elevepdf.elevesites.com.br", false)).toBe(true);
    expect(isAllowedHost("elevepdf.elevesites.com.br", false)).toBe(true);
  });

  it("rejeita qualquer outra origem/host quando dev local não está habilitado", () => {
    expect(isAllowedOrigin("https://evil.example.com", false)).toBe(false);
    expect(isAllowedOrigin("http://localhost:5173", false)).toBe(false);
    expect(isAllowedHost("evil.example.com", false)).toBe(false);
    expect(isAllowedOrigin(null, false)).toBe(false);
  });

  it("aceita localhost só quando dev local está explicitamente habilitado", () => {
    expect(isAllowedOrigin("http://localhost:5173", true)).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com", true)).toBe(false);
  });
});
