import { describe, expect, it } from "vitest";
import {
  extractBearerCapability,
  generateSessionCapability,
  hashCapability,
  verifySessionCapability,
} from "../sessionCapability";

describe("generateSessionCapability", () => {
  it("2. gera uma capability com entropia/formato esperado: 256 bits em base64url, sem padding/caracteres inseguros em URL", () => {
    const capability = generateSessionCapability();
    // 32 bytes (256 bits) em base64url sem padding => 43 caracteres.
    expect(capability).toHaveLength(43);
    expect(capability).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(capability).not.toMatch(/[+/=]/);
  });

  it("nunca repete a mesma capability entre chamadas (fonte de entropia real, não determinística)", () => {
    const values = new Set(Array.from({ length: 50 }, () => generateSessionCapability()));
    expect(values.size).toBe(50);
  });
});

describe("hashCapability", () => {
  it("3. produz um hash diferente do valor bruto — nunca o segredo original", async () => {
    const capability = generateSessionCapability();
    const hash = await hashCapability(capability);
    expect(hash).not.toBe(capability);
    // SHA-256 em base64url sem padding => 43 caracteres, como a capability —
    // mas o CONTEÚDO nunca é igual (verificado acima).
    expect(hash).toHaveLength(43);
  });

  it("é determinístico: a mesma capability sempre produz o mesmo hash", async () => {
    const capability = generateSessionCapability();
    const [hash1, hash2] = await Promise.all([hashCapability(capability), hashCapability(capability)]);
    expect(hash1).toBe(hash2);
  });

  it("capabilities diferentes produzem hashes diferentes", async () => {
    const [hash1, hash2] = await Promise.all([
      hashCapability(generateSessionCapability()),
      hashCapability(generateSessionCapability()),
    ]);
    expect(hash1).not.toBe(hash2);
  });
});

describe("extractBearerCapability", () => {
  it("extrai o valor de um header 'Bearer <valor>'", () => {
    expect(extractBearerCapability("Bearer abc123")).toBe("abc123");
  });

  it("retorna null para header ausente, vazio, ou sem o prefixo Bearer", () => {
    expect(extractBearerCapability(null)).toBeNull();
    expect(extractBearerCapability("")).toBeNull();
    expect(extractBearerCapability("abc123")).toBeNull();
    expect(extractBearerCapability("Basic abc123")).toBeNull();
  });
});

describe("verifySessionCapability", () => {
  it("8. capability correta contra o hash correto: autorizado", async () => {
    const capability = generateSessionCapability();
    const hash = await hashCapability(capability);
    const authorized = await verifySessionCapability(`Bearer ${capability}`, hash);
    expect(authorized).toBe(true);
  });

  it("7. capability incorreta: nunca autorizado", async () => {
    const capability = generateSessionCapability();
    const hash = await hashCapability(capability);
    const wrong = generateSessionCapability();
    const authorized = await verifySessionCapability(`Bearer ${wrong}`, hash);
    expect(authorized).toBe(false);
  });

  it("header Authorization ausente: nunca autorizado", async () => {
    const capability = generateSessionCapability();
    const hash = await hashCapability(capability);
    const authorized = await verifySessionCapability(null, hash);
    expect(authorized).toBe(false);
  });

  it("9. sessão legada/capability_hash nulo: SEMPRE bloqueada, sem fallback para sessionId sozinho", async () => {
    const capability = generateSessionCapability();
    const authorized = await verifySessionCapability(`Bearer ${capability}`, null);
    expect(authorized).toBe(false);
  });
});
