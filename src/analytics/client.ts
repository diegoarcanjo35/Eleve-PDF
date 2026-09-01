import { validateEventPayload } from "@shared/analytics/validate";
import type { AnalyticsEventPayload, AnalyticsEventType } from "@shared/analytics/events";
import { getConsent } from "./consent";
import { captureAttributionOnce, getOrCreateSessionId } from "./session";
import { pathToRouteId } from "./routeMap";

const ENDPOINT = "/api/analytics/event";

export type TrackParams = Omit<Partial<AnalyticsEventPayload>, "event" | "session_id">;

/**
 * Único ponto de saída de eventos de Analytics — os componentes nunca fazem
 * `fetch` diretamente. `track()` nunca lança, nunca bloqueia a UI, e é um
 * no-op completo (não gera sessão, não lê nada, não envia nada) enquanto o
 * consentimento não for "accepted".
 */
export function track(event: AnalyticsEventType, params: TrackParams = {}): void {
  if (getConsent() !== "accepted") return;
  if (typeof window === "undefined" || typeof fetch === "undefined") return;

  // Nunca enviamos `occurred_at` — o horário persistido é sempre atribuído
  // pelo servidor no momento do recebimento (ver validate.ts/event.ts). O
  // relógio do navegador não é confiável para esse propósito.
  const attribution = captureAttributionOnce(pathToRouteId);
  const payload: AnalyticsEventPayload = {
    event,
    session_id: getOrCreateSessionId(),
    ...attribution,
    ...params,
  };

  // Validação client-side é defesa em profundidade (evita round-trips óbvios
  // com payload malformado) — a validação que importa de verdade é a do
  // servidor, que nunca confia neste resultado.
  const validated = validateEventPayload(payload);
  if (!validated) return;

  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validated),
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      // Falha de rede nunca deve aparecer para o usuário nem interromper a
      // ferramenta — Analytics é estritamente best-effort.
    });
  } catch {
    // `fetch` pode lançar em ambientes muito restritos (ex.: CSP) — ignorado
    // pelo mesmo motivo acima.
  }
}
