import { useEffect, useState } from "react";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

interface SummaryResponse {
  period: { from: string; to: string };
  sessions: number;
  page_views: number;
  tool_usage: Array<{ tool_id: string; event_type: string; n: number }>;
  validations: Record<string, number>;
  processing: Record<string, number>;
  errors_by_category: Array<{ error_category: string; n: number }>;
  downloads: number;
  no_gain_returned: number;
  oversized_parts: Array<{ oversized_parts_bucket: string; n: number }>;
  by_utm_source: Array<{ value: string; n: number }>;
  by_referrer_host: Array<{ value: string; n: number }>;
  daily_evolution: Array<{ day: string; n: number }>;
}

type FetchState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "not-configured" }
  | { status: "error" }
  | { status: "ready"; data: SummaryResponse };

/**
 * Painel privado de Analytics.
 *
 * IMPORTANTE: esta rota (`/admin/analytics`) NÃO está listada em nenhum menu,
 * `toolsRegistry.ts` ou `sitemap.xml` — não é indexável nem descoberta pela
 * navegação normal. A proteção real de acesso é dupla:
 *   1. Em produção, o Cloudflare Access deve estar configurado para exigir
 *      login antes mesmo de a Cloudflare servir esta página (ainda não
 *      configurado nesta fase — ver relatório, "Proteção obrigatória").
 *   2. Mesmo sem (1), o endpoint que fornece os dados
 *      (GET /api/analytics/summary) valida o JWT do Cloudflare Access no
 *      servidor a cada requisição — sem CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD
 *      configurados, ele sempre responde 503, e sem um JWT válido, 403. Esta
 *      página nunca tem acesso a dados sem uma resposta 200 desse endpoint.
 */
export default function AnalyticsDashboard() {
  useDocumentMeta(
    "Painel de métricas — ElevePDF",
    "Painel privado de métricas do ElevePDF.",
    "/admin/analytics",
    "noindex, nofollow",
  );
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/analytics/summary", { credentials: "include" })
      .then((response) => {
        if (cancelled) return;
        if (response.status === 503) {
          setState({ status: "not-configured" });
        } else if (response.status === 403 || response.status === 401) {
          setState({ status: "unauthorized" });
        } else if (!response.ok) {
          setState({ status: "error" });
        } else {
          return response.json().then((data: SummaryResponse) => {
            if (!cancelled) setState({ status: "ready", data });
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-container">
      <div className="tool-page">
        <div className="tool-page__header">
          <h1 className="tool-page__title">Painel de métricas</h1>
          <p className="tool-page__description">
            Só dados agregados e pseudônimos — nenhuma sessão individual, nenhum evento bruto.
          </p>
        </div>

        {state.status === "loading" && <p role="status">Carregando…</p>}
        {state.status === "not-configured" && (
          <p className="notice notice--warning" role="alert">
            O painel ainda não está configurado nesta implantação — o Cloudflare Access precisa
            ser configurado (domínio protegido, Audience, política de acesso) antes de o painel
            ficar disponível. Isso é o comportamento esperado enquanto isso não acontece.
          </p>
        )}
        {state.status === "unauthorized" && (
          <p className="notice notice--error" role="alert">
            Acesso não autorizado. Este painel exige um login válido via Cloudflare Access.
          </p>
        )}
        {state.status === "error" && (
          <p className="notice notice--error" role="alert">
            Não foi possível carregar os dados do painel agora.
          </p>
        )}

        {state.status === "ready" && (
          <section className="tools" aria-label="Métricas agregadas">
            <dl className="result-stats">
              <div>
                <dt>Sessões</dt>
                <dd>{state.data.sessions}</dd>
              </div>
              <div>
                <dt>Visualizações de página</dt>
                <dd>{state.data.page_views}</dd>
              </div>
              <div>
                <dt>Downloads</dt>
                <dd>{state.data.downloads}</dd>
              </div>
              <div>
                <dt>Resultados sem ganho</dt>
                <dd>{state.data.no_gain_returned}</dd>
              </div>
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
