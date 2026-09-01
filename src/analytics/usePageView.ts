import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { track } from "./client";
import { pathToRouteId } from "./routeMap";
import { useConsent } from "./useConsent";

/**
 * Dispara `page_view` exatamente uma vez por rota real reconhecida, e só
 * enquanto o consentimento for "accepted" — cobre todo o ciclo:
 *  - sem escolha (`unset`) ou recusado: nenhum evento (delegado a `track`,
 *    que já é no-op nesses estados; aqui também não avançamos o "último
 *    disparado", para que uma aceitação futura sempre dispare de novo);
 *  - aceitar na página atual: dispara um `page_view` da rota atual, sem
 *    precisar de reload (o efeito reage à mudança do próprio `consent`);
 *  - já aceito e entra no site: dispara um `page_view` inicial no mount;
 *  - navegação SPA: dispara um `page_view` por mudança real de pathname;
 *  - re-render sem mudança de rota/consentimento: não duplica (chave só
 *    muda quando pathname ou consent mudam de verdade);
 *  - revogar e aceitar de novo: `consent` passa por "declined" entre as
 *    duas aceitações, o que já reresta a "última rota disparada" — a nova
 *    aceitação sempre dispara de novo, com uma sessão pseudônima nova
 *    (ver `consent.ts`/`session.ts`).
 * Rotas não mapeadas em `routeMap.ts` (ex.: `/admin/analytics`) nunca geram
 * `page_view` — o painel administrativo não é contado nas métricas públicas.
 */
export function usePageView(): void {
  const location = useLocation();
  const [consent] = useConsent();
  const lastFiredRouteRef = useRef<string | null>(null);

  useEffect(() => {
    if (consent !== "accepted") {
      // Não aceito (ainda) — nada é enviado, e qualquer disparo anterior é
      // esquecido, para que uma aceitação futura sempre conte como nova.
      lastFiredRouteRef.current = null;
      return;
    }

    const routeId = pathToRouteId(location.pathname);
    if (!routeId) return;
    if (lastFiredRouteRef.current === routeId) return;

    lastFiredRouteRef.current = routeId;
    track("page_view", { route_id: routeId });
  }, [location.pathname, consent]);
}
