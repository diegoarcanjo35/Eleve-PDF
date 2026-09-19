import { describe, expect, it } from "vitest";
import { computeExpiresAt, generateSessionId, isExpired } from "../intelligenceSession";
import { SESSION_TTL_MS } from "../../../shared/intelligence/constants";

describe("generateSessionId", () => {
  it("gera um UUID v4 opaco", () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("gera IDs diferentes a cada chamada (aleatoriedade criptográfica, sem padrão derivável)", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateSessionId()));
    expect(ids.size).toBe(50);
  });
});

describe("computeExpiresAt", () => {
  it("soma exatamente o TTL nomeado à data de criação", () => {
    const createdAt = 1_000_000;
    expect(computeExpiresAt(createdAt)).toBe(createdAt + SESSION_TTL_MS);
  });
});

describe("isExpired", () => {
  it("sessão não expirada retorna false", () => {
    expect(isExpired(2000, 1000)).toBe(false);
  });

  it("sessão expirada (agora >= expiresAt) retorna true de forma determinística", () => {
    expect(isExpired(1000, 1000)).toBe(true);
    expect(isExpired(1000, 1001)).toBe(true);
  });
});
