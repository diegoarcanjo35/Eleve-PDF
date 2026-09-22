import type { AskEvidence } from "@shared/intelligence/types";
import { track } from "@/analytics/client";

interface SourceBadgesProps {
  evidence: AskEvidence[];
  onNavigateToPage: (page: number) => void;
}

/** Lista de "Fontes" de uma resposta fundamentada — sempre páginas reais
 * devolvidas pelo backend (nunca inventadas no cliente, ver
 * `AskEvidence`/`functions/api/intelligence/sessions/[sessionId]/ask.ts`).
 * Uma evidência pode cobrir mais de uma página (`startPage`..`endPage`).
 *
 * `relevantPage` (Sprint 01L.1): quando o backend resolveu, com
 * segurança, uma página mais específica dentro dessa amplitude, o rótulo
 * mostra as duas informações — a página específica E a amplitude real do
 * chunk (nunca esconde que a evidência cobre um intervalo maior) — e o
 * clique navega para ela. Sem `relevantPage` (amplitude ambígua ou chunk
 * legado sem proveniência granular), o comportamento é exatamente o de
 * antes desta sprint: rótulo só com a amplitude, clique vai para
 * `startPage`.
 *
 * `intel_source_clicked` (Sprint 01P): evento estrutural de Analytics no
 * clique — só `tool_id`, nunca chunkId/sessionId/texto/página exata (ver
 * `shared/analytics/events.ts`). Sujeito ao mesmo consentimento de cookies
 * que qualquer outro `track()` (no-op silencioso sem consentimento
 * aceito). */
export function SourceBadges({ evidence, onNavigateToPage }: SourceBadgesProps) {
  if (evidence.length === 0) return null;

  return (
    <div className="intel-sources">
      <span className="intel-sources__label">Fontes</span>
      <ul className="intel-sources__list">
        {evidence.map((item) => {
          const rangeLabel =
            item.startPage === item.endPage ? `Página ${item.startPage}` : `Páginas ${item.startPage}–${item.endPage}`;
          const label =
            item.relevantPage !== undefined && item.startPage !== item.endPage
              ? `Página ${item.relevantPage} · fonte: páginas ${item.startPage}–${item.endPage}`
              : rangeLabel;
          return (
            <li key={item.evidenceId}>
              <button
                type="button"
                className="intel-sources__badge"
                onClick={() => {
                  track("intel_source_clicked", { tool_id: "conversar-com-pdf" });
                  onNavigateToPage(item.relevantPage ?? item.startPage);
                }}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
