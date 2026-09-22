import {
  RATE_LIMIT_SESSION_CREATE_MAX,
  RATE_LIMIT_WINDOW_MS,
} from "../../../shared/intelligence/constants";
import { isAllowedRequestOrigin } from "../../_shared/origin";
import { isRateLimited } from "../../_shared/rateLimit";
import { enforceDistributedRateLimit } from "../../_shared/distributedRateLimit";
import { createSession, type IntelligenceD1 } from "../../_shared/intelligenceDb";
import { computeExpiresAt, generateSessionId } from "../../_shared/intelligenceSession";
import { generateSessionCapability, hashCapability } from "../../_shared/sessionCapability";
import { isEleveIaEnabled, type EleveIaFlagEnv } from "../../_shared/featureFlags";
import { logIntelligenceError } from "../../_shared/intelligenceTelemetry";
import { checkIntelAccess, type IntelAccessEnv } from "../../_shared/pilotAccess";

interface Env extends EleveIaFlagEnv, IntelAccessEnv {
  INTEL_DB: IntelligenceD1;
  /** Secret de assinatura HMAC do rate limit distribuído (Sprint 01E.1) —
   * nunca commitado, nunca logado, nunca enviado ao Analytics. Ausente =>
   * fail-closed (ver `_shared/distributedRateLimit.ts`). Configuração
   * remota fora do escopo desta sprint. */
  RATE_LIMIT_HMAC_KEY?: string;
  // Reaproveita as mesmas flags do domínio de Analytics de propósito: a
  // checagem de Origin/Host (`_shared/origin.ts`) é genérica ao projeto, não
  // específica de Analytics, e ambos os domínios (Analytics e Inteligência
  // Documental) devem permitir exatamente os mesmos hosts de dev/preview.
  ANALYTICS_ALLOW_LOCAL_DEV?: string;
  ANALYTICS_ALLOW_PAGES_PREVIEW?: string;
}

function genericError(status: number): Response {
  logIntelligenceError({ route: "sessions", status });
  return new Response(null, { status });
}

/**
 * POST /api/intelligence/sessions — cria uma sessão temporária opaca, sem
 * autenticação de usuário, sem Library, sem associação a conta. Nenhum
 * conteúdo de documento é aceito aqui (isso é `.../:sessionId/ingest`).
 *
 * AUTORIZAÇÃO (Sprint 01E.1): a resposta retorna, além do `sessionId`
 * (identificador opaco), uma `sessionCapability` — segredo de autorização
 * separado, retornado SÓ AGORA, uma única vez. Nenhum endpoint posterior a
 * devolve de novo. Sem ela (via `Authorization: Bearer`), nenhum endpoint
 * de sessão (ingest/retrieve/ask) opera a sessão — ver
 * `_shared/sessionCapability.ts`.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Feature flag (Sprint 01H) — primeiríssima checagem, antes de Origin/Host,
  // rate limit ou qualquer uso do D1 de Intelligence. Ver
  // `_shared/featureFlags.ts`.
  if (!isEleveIaEnabled(env)) return genericError(404);

  const allowLocalDev = env.ANALYTICS_ALLOW_LOCAL_DEV === "true";
  const allowPagesPreview = env.ANALYTICS_ALLOW_PAGES_PREVIEW === "true";

  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host");
  if (!isAllowedRequestOrigin(origin, host, { allowLocalDev, allowPagesPreview })) {
    return genericError(403);
  }

  // Segunda camada de acesso do piloto (Sprint 01P) — só exigida quando
  // INTEL_ACCESS_REQUIRED === "true" (nunca nesta sprint); ver
  // `_shared/pilotAccess.ts`. Nunca substitui a capability de sessão abaixo.
  const access = await checkIntelAccess(request, env);
  if (!access.allowed) return genericError(401);

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // Barreira barata (em memória, best-effort) — nunca a única proteção, ver
  // _shared/rateLimit.ts. Continua ativa, nunca removida.
  const rateLimitKey = `intel-session-create:${ip}`;
  if (isRateLimited(rateLimitKey)) {
    return genericError(429);
  }

  // Barreira autoritativa e distribuída (D1), por identidade de rede
  // pseudonimizada — fail-closed: qualquer falha em derivar a identidade ou
  // em consumir a janela bloqueia a criação (nunca segue sem confirmação).
  const distributed = await enforceDistributedRateLimit(
    env.INTEL_DB,
    env.RATE_LIMIT_HMAC_KEY,
    { operation: "session-create", ip },
    { windowMs: RATE_LIMIT_WINDOW_MS, maxRequests: RATE_LIMIT_SESSION_CREATE_MAX },
  );
  if (distributed === "blocked") return genericError(429);
  if (distributed === "error") return genericError(503);

  const id = generateSessionId();
  const capability = generateSessionCapability();
  const capabilityHash = await hashCapability(capability);
  const nowMs = Date.now();
  const expiresAtMs = computeExpiresAt(nowMs);
  const createdAtIso = new Date(nowMs).toISOString();
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  try {
    await createSession(env.INTEL_DB, { id, createdAtIso, expiresAtIso, capabilityHash });
  } catch {
    return genericError(500);
  }

  return new Response(
    JSON.stringify({
      sessionId: id,
      sessionCapability: capability,
      status: "created",
      expiresAt: expiresAtIso,
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
};
