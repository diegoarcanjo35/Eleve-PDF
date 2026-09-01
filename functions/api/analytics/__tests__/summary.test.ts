import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../summary";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("https://elevepdf.elevesites.com.br/api/analytics/summary", { headers });
}

/** Toda resposta deste endpoint carrega dados privados — nunca pode ser
 * armazenada em cache público, mesmo nos caminhos de erro. */
function expectNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Pragma")).toBe("no-cache");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
}

describe("GET /api/analytics/summary — protegido, só agregados", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("responde 503 (painel bloqueado) quando Access não está configurado, sempre sem cache", async () => {
    const response = await onRequestGet({
      request: makeRequest(),
      env: { DB: {} as never },
    } as never);
    expect(response.status).toBe(503);
    expectNoStore(response);
  });

  it("responde 403 quando não há um JWT válido, mesmo com Access configurado, sempre sem cache", async () => {
    const response = await onRequestGet({
      request: makeRequest({ "Cf-Access-Jwt-Assertion": "token-falso" }),
      env: {
        DB: {} as never,
        CF_ACCESS_TEAM_DOMAIN: "eleve-sites.cloudflareaccess.com",
        CF_ACCESS_AUD: "audience-tag",
      },
    } as never);
    expect(response.status).toBe(403);
    expectNoStore(response);
  });

  it("responde 403 quando o header do JWT nem está presente, sempre sem cache", async () => {
    const response = await onRequestGet({
      request: makeRequest(),
      env: {
        DB: {} as never,
        CF_ACCESS_TEAM_DOMAIN: "eleve-sites.cloudflareaccess.com",
        CF_ACCESS_AUD: "audience-tag",
      },
    } as never);
    expect(response.status).toBe(403);
    expectNoStore(response);
  });

  it("resposta 200 (sucesso) também nunca é cacheável e usa JSON com charset", async () => {
    const accessAuth = await import("../../../_shared/accessAuth");
    vi.spyOn(accessAuth, "verifyAccessJwt").mockResolvedValue({ sub: "user@example.com" } as never);

    const fakeResults = { results: [] };
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue(fakeResults) }),
      }),
    };

    const response = await onRequestGet({
      request: makeRequest({ "Cf-Access-Jwt-Assertion": "token-valido-simulado" }),
      env: {
        DB: db as never,
        CF_ACCESS_TEAM_DOMAIN: "eleve-sites.cloudflareaccess.com",
        CF_ACCESS_AUD: "audience-tag",
      },
    } as never);

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  });
});
