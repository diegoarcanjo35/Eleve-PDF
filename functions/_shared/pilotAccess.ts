import { verifyAccessJwt } from "./accessAuth";

/**
 * Segunda camada de controle de acesso do piloto controlado da Eleve IA
 * (Sprint 01P) — reaproveita inteiramente `accessAuth.ts` (já usado pelo
 * painel de Analytics), nunca reimplementa verificação de JWT.
 *
 * POR QUE UMA SEGUNDA CAMADA NO CÓDIGO, SE O CLOUDFLARE ACCESS JÁ PODE
 * PROTEGER A ROTA NO EDGE: proteger só `/conversar-com-pdf` (a página) no
 * dashboard do Access NÃO protege automaticamente `/api/intelligence/*` — um
 * visitante pode chamar a API diretamente, sem nunca passar pela tela de
 * login do Access, se a Access Application não cobrir esses paths também.
 * A checagem abaixo garante que os 4 endpoints de Intelligence recusam
 * requisições sem um JWT válido do Access mesmo que a configuração da
 * Access Application no dashboard esteja incompleta/errada/esquecida — a
 * mesma filosofia de "nunca confiar só numa camada" já usada pela
 * capability de sessão + rate limit + Origin check.
 *
 * `INTEL_ACCESS_REQUIRED` (nova flag, Sprint 01P) — deliberadamente
 * SEPARADA de `ELEVE_IA_ENABLED` (kill switch geral, ver `featureFlags.ts`)
 * e nunca a substitui: com `INTEL_ACCESS_REQUIRED` ausente/"false" (estado
 * de TODOS os ambientes nesta sprint), o comportamento é idêntico a antes —
 * zero mudança observável, nenhum teste/gate anterior quebra. Só quando
 * `INTEL_ACCESS_REQUIRED === "true"` (nunca ativado nesta sprint) é que o
 * Access passa a ser exigido, com fail-closed se mal configurado — mesmo
 * padrão de `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` do painel de Analytics.
 *
 * IDENTIDADE: o `email` do Access, quando presente, É devolvido pela função
 * abaixo (útil para uma eventual allowlist), mas NUNCA é persistido em
 * telemetria/Analytics nesta sprint — controle de acesso, não identificação
 * por pessoa (ver relatório da sprint, item 13/21).
 */
export interface IntelAccessEnv {
  INTEL_ACCESS_REQUIRED?: string;
  INTEL_ACCESS_TEAM_DOMAIN?: string;
  INTEL_ACCESS_AUD?: string;
}

export interface IntelAccessResult {
  allowed: boolean;
  /** Só presente quando `allowed` e o Access de fato verificou a
   * requisição — nunca inventado, nunca um fallback. */
  email?: string;
}

export async function checkIntelAccess(request: Request, env: IntelAccessEnv): Promise<IntelAccessResult> {
  if (env.INTEL_ACCESS_REQUIRED !== "true") {
    return { allowed: true };
  }
  if (!env.INTEL_ACCESS_TEAM_DOMAIN || !env.INTEL_ACCESS_AUD) {
    // Exigido mas mal configurado — fail-closed, nunca abre exceção.
    return { allowed: false };
  }
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  const claims = await verifyAccessJwt(jwt, {
    teamDomain: env.INTEL_ACCESS_TEAM_DOMAIN,
    audience: env.INTEL_ACCESS_AUD,
  });
  if (!claims) return { allowed: false };
  return { allowed: true, email: claims.email };
}
