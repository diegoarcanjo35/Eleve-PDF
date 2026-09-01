import { describe, expect, it, beforeEach } from "vitest";
import { isRateLimited, __resetRateLimitStateForTests } from "../rateLimit";

describe("isRateLimited — defensivo, em memória", () => {
  beforeEach(() => {
    __resetRateLimitStateForTests();
  });

  it("permite requisições abaixo do limite dentro da janela", () => {
    const now = 1_000_000;
    for (let i = 0; i < 20; i += 1) {
      expect(isRateLimited("client-a", now + i)).toBe(false);
    }
  });

  it("bloqueia a partir do limite dentro da mesma janela", () => {
    const now = 2_000_000;
    for (let i = 0; i < 20; i += 1) isRateLimited("client-b", now + i);
    expect(isRateLimited("client-b", now + 20)).toBe(true);
  });

  it("libera de novo depois que a janela expira", () => {
    const now = 3_000_000;
    for (let i = 0; i < 20; i += 1) isRateLimited("client-c", now);
    expect(isRateLimited("client-c", now)).toBe(true);
    expect(isRateLimited("client-c", now + 11_000)).toBe(false);
  });

  it("chaves diferentes têm contadores independentes", () => {
    const now = 4_000_000;
    for (let i = 0; i < 20; i += 1) isRateLimited("client-d", now);
    expect(isRateLimited("client-d", now)).toBe(true);
    expect(isRateLimited("client-e", now)).toBe(false);
  });
});
