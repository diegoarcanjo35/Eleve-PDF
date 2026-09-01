import { afterEach, describe, expect, it } from "vitest";
import { getOrCreateSessionId, __resetSessionStateForTests } from "../session";

describe("getOrCreateSessionId", () => {
  afterEach(() => {
    __resetSessionStateForTests();
  });

  it("permanece o mesmo dentro da mesma aba (mesmo sessionStorage)", () => {
    const first = getOrCreateSessionId();
    const second = getOrCreateSessionId();
    expect(second).toBe(first);
  });

  it("gera uma nova sessão quando o contexto de sessão é reiniciado (nova aba/nova visita)", () => {
    const first = getOrCreateSessionId();
    __resetSessionStateForTests(); // simula uma nova aba: sessionStorage vazio de novo
    const second = getOrCreateSessionId();
    expect(second).not.toBe(first);
  });

  it("é um UUID v4 válido", () => {
    const id = getOrCreateSessionId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
