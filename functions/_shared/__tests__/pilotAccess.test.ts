import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkIntelAccess } from "../pilotAccess";
import { __resetAccessJwksCacheForTests } from "../accessAuth";

const TEAM_DOMAIN = "eleve-sites.cloudflareaccess.com";
const AUDIENCE = "test-intel-pilot-audience";
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

async function stubJwks(publicKey: CryptoKey) {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [{ ...jwk, kid: KID }] }), { status: 200 })),
  );
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://elevepdf.example/api/intelligence/sessions", { headers });
}

describe("checkIntelAccess (Sprint 01P)", () => {
  beforeEach(() => {
    __resetAccessJwksCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("INTEL_ACCESS_REQUIRED ausente: sempre permitido — comportamento idêntico a antes desta sprint", async () => {
    const result = await checkIntelAccess(makeRequest(), {});
    expect(result.allowed).toBe(true);
    expect(result.email).toBeUndefined();
  });

  it("INTEL_ACCESS_REQUIRED='false': sempre permitido", async () => {
    const result = await checkIntelAccess(makeRequest(), { INTEL_ACCESS_REQUIRED: "false" });
    expect(result.allowed).toBe(true);
  });

  it("exigido mas mal configurado (sem team domain/audience): fail-closed", async () => {
    const result = await checkIntelAccess(makeRequest(), { INTEL_ACCESS_REQUIRED: "true" });
    expect(result.allowed).toBe(false);
  });

  it("exigido e configurado, sem JWT no header: bloqueado", async () => {
    const result = await checkIntelAccess(makeRequest(), {
      INTEL_ACCESS_REQUIRED: "true",
      INTEL_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
      INTEL_ACCESS_AUD: AUDIENCE,
    });
    expect(result.allowed).toBe(false);
  });

  it("exigido e configurado, com JWT genuíno e válido: permitido, email devolvido", async () => {
    const { publicKey, privateKey } = await makeKeyPair();
    await stubJwks(publicKey);
    const jwt = await signJwt(privateKey, {
      iss: `https://${TEAM_DOMAIN}`,
      aud: [AUDIENCE],
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: "diego@example.com",
    });

    const result = await checkIntelAccess(makeRequest({ "Cf-Access-Jwt-Assertion": jwt }), {
      INTEL_ACCESS_REQUIRED: "true",
      INTEL_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
      INTEL_ACCESS_AUD: AUDIENCE,
    });
    expect(result.allowed).toBe(true);
    expect(result.email).toBe("diego@example.com");
  });

  it("exigido e configurado, com JWT assinado por chave errada: bloqueado", async () => {
    const { publicKey } = await makeKeyPair();
    const { privateKey: wrongPrivateKey } = await makeKeyPair();
    await stubJwks(publicKey);
    const jwt = await signJwt(wrongPrivateKey, {
      iss: `https://${TEAM_DOMAIN}`,
      aud: [AUDIENCE],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await checkIntelAccess(makeRequest({ "Cf-Access-Jwt-Assertion": jwt }), {
      INTEL_ACCESS_REQUIRED: "true",
      INTEL_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
      INTEL_ACCESS_AUD: AUDIENCE,
    });
    expect(result.allowed).toBe(false);
  });
});
