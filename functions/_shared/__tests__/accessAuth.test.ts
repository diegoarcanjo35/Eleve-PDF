import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAccessJwt, __resetAccessJwksCacheForTests } from "../accessAuth";

const TEAM_DOMAIN = "eleve-sites.cloudflareaccess.com";
const AUDIENCE = "test-audience-tag";
const KID = "test-key-1";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlJson(obj: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function makeKeyPair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
}

async function signJwt(privateKey: CryptoKey, payload: Record<string, unknown>): Promise<string> {
  const header = { alg: "RS256", typ: "JWT", kid: KID };
  const headerB64 = base64UrlJson(header);
  const payloadB64 = base64UrlJson(payload);
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, signingInput);
  return `${headerB64}.${payloadB64}.${base64Url(new Uint8Array(signature))}`;
}

describe("verifyAccessJwt — validação real de assinatura + claims", () => {
  beforeEach(() => {
    __resetAccessJwksCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function stubJwks(publicKey: CryptoKey) {
    const jwk = await crypto.subtle.exportKey("jwk", publicKey);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ keys: [{ ...jwk, kid: KID }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  }

  it("aceita um JWT genuíno assinado pela chave privada correspondente ao JWKS", async () => {
    const { publicKey, privateKey } = await makeKeyPair();
    await stubJwks(publicKey);
    const jwt = await signJwt(privateKey, {
      iss: `https://${TEAM_DOMAIN}`,
      aud: [AUDIENCE],
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: "diego@example.com",
    });

    const result = await verifyAccessJwt(jwt, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE });
    expect(result).not.toBeNull();
    expect(result?.email).toBe("diego@example.com");
  });

  it("rejeita quando a configuração (team domain / audience) não está definida — painel bloqueado por padrão", async () => {
    const { privateKey } = await makeKeyPair();
    const jwt = await signJwt(privateKey, {
      iss: `https://${TEAM_DOMAIN}`,
      aud: [AUDIENCE],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(await verifyAccessJwt(jwt, null)).toBeNull();
    expect(await verifyAccessJwt(jwt, { teamDomain: "", audience: "" })).toBeNull();
  });

  it("rejeita quando não há JWT nenhum (header ausente)", async () => {
    expect(await verifyAccessJwt(null, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE })).toBeNull();
  });

  it("rejeita um header falso / string arbitrária que não é um JWT válido", async () => {
    expect(
      await verifyAccessJwt("nao-sou-um-jwt-de-verdade", { teamDomain: TEAM_DOMAIN, audience: AUDIENCE }),
    ).toBeNull();
    expect(
      await verifyAccessJwt("a.b.c", { teamDomain: TEAM_DOMAIN, audience: AUDIENCE }),
    ).toBeNull();
  });

  it("rejeita quando a assinatura não confere com o JWKS configurado (chave errada)", async () => {
    const { publicKey } = await makeKeyPair(); // chave pública "certa" no JWKS
    const { privateKey: wrongPrivateKey } = await makeKeyPair(); // mas assinado com outra chave
    await stubJwks(publicKey);
    const jwt = await signJwt(wrongPrivateKey, {
      iss: `https://${TEAM_DOMAIN}`,
      aud: [AUDIENCE],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(await verifyAccessJwt(jwt, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE })).toBeNull();
  });

  it("rejeita audiência (aud) que não corresponde à aplicação configurada", async () => {
    const { publicKey, privateKey } = await makeKeyPair();
    await stubJwks(publicKey);
    const jwt = await signJwt(privateKey, {
      iss: `https://${TEAM_DOMAIN}`,
      aud: ["outra-aplicacao-qualquer"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(await verifyAccessJwt(jwt, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE })).toBeNull();
  });

  it("rejeita token expirado", async () => {
    const { publicKey, privateKey } = await makeKeyPair();
    await stubJwks(publicKey);
    const jwt = await signJwt(privateKey, {
      iss: `https://${TEAM_DOMAIN}`,
      aud: [AUDIENCE],
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    expect(await verifyAccessJwt(jwt, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE })).toBeNull();
  });

  it("rejeita emissor (iss) diferente do team domain configurado", async () => {
    const { publicKey, privateKey } = await makeKeyPair();
    await stubJwks(publicKey);
    const jwt = await signJwt(privateKey, {
      iss: "https://outro-time.cloudflareaccess.com",
      aud: [AUDIENCE],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(await verifyAccessJwt(jwt, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE })).toBeNull();
  });
});
