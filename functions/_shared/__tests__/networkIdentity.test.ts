import { describe, expect, it } from "vitest";
import { deriveNetworkIdentity } from "../networkIdentity";

describe("deriveNetworkIdentity", () => {
  it("13. é determinístico: o mesmo IP com a mesma chave sempre produz o mesmo identificador", async () => {
    const [a, b] = await Promise.all([
      deriveNetworkIdentity("203.0.113.55", "chave-de-teste-1"),
      deriveNetworkIdentity("203.0.113.55", "chave-de-teste-1"),
    ]);
    expect(a).toBe(b);
  });

  it("14. muda com uma chave (secret) diferente para o mesmo IP", async () => {
    const withKeyA = await deriveNetworkIdentity("203.0.113.55", "chave-de-teste-1");
    const withKeyB = await deriveNetworkIdentity("203.0.113.55", "chave-de-teste-2");
    expect(withKeyA).not.toBe(withKeyB);
  });

  it("IPs diferentes com a mesma chave produzem identificadores diferentes", async () => {
    const ipA = await deriveNetworkIdentity("203.0.113.55", "chave-de-teste-1");
    const ipB = await deriveNetworkIdentity("198.51.100.20", "chave-de-teste-1");
    expect(ipA).not.toBe(ipB);
  });

  it("o resultado nunca contém o IP bruto por extenso", async () => {
    const ip = "203.0.113.55";
    const result = await deriveNetworkIdentity(ip, "chave-de-teste-1");
    expect(result).not.toContain(ip);
    expect(result).not.toContain("203");
  });

  it("resultado é uma string base64url compacta, sem caracteres inseguros em URL/header", async () => {
    const result = await deriveNetworkIdentity("203.0.113.55", "chave-de-teste-1");
    expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
