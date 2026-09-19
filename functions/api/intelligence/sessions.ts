import { isAllowedRequestOrigin } from "../../_shared/origin";
import { isRateLimited } from "../../_shared/rateLimit";
import { createSession, type IntelligenceD1 } from "../../_shared/intelligenceDb";
import { computeExpiresAt, generateSessionId } from "../../_shared/intelligenceSession";

interface Env {
  INTEL_DB: IntelligenceD1;
  // Reaproveita as mesmas flags do domínio de Analytics de propósito: a
  // checagem de Origin/Host (`_shared/origin.ts`) é genérica ao projeto, não
  // específica de Analytics, e ambos os domínios (Analytics e Inteligência
  // Documental) devem permitir exatamente os mesmos hosts de dev/preview.
  ANALYTICS_ALLOW_LOCAL_DEV?: string;
  ANALYTICS_ALLOW_PAGES_PREVIEW?: string;
}

function genericError(status: number): Response {
  return new Response(null, { status });
}

/**
 * POST /api/intelligence/sessions — cria uma sessão temporária opaca, sem
 * autenticação de usuário, sem Library, sem associação a conta. Nenhum
 * conteúdo de documento é aceito aqui (isso é `.../:sessionId/ingest`).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const allowLocalDev = env.ANALYTICS_ALLOW_LOCAL_DEV === "true";
  const allowPagesPreview = env.ANALYTICS_ALLOW_PAGES_PREVIEW === "true";

  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host");
  if (!isAllowedRequestOrigin(origin, host, { allowLocalDev, allowPagesPreview })) {
    return genericError(403);
  }

  const rateLimitKey = `intel-session-create:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`;
  if (isRateLimited(rateLimitKey)) {
    return genericError(429);
  }

  const id = generateSessionId();
  const nowMs = Date.now();
  const expiresAtMs = computeExpiresAt(nowMs);
  const createdAtIso = new Date(nowMs).toISOString();
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  try {
    await createSession(env.INTEL_DB, { id, createdAtIso, expiresAtIso });
  } catch {
    return genericError(500);
  }

  return new Response(JSON.stringify({ sessionId: id, status: "created", expiresAt: expiresAtIso }), {
    status: 201,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
