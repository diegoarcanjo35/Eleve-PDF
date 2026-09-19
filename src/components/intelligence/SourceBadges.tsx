import type { AskEvidence } from "@shared/intelligence/types";

interface SourceBadgesProps {
  evidence: AskEvidence[];
  onNavigateToPage: (page: number) => void;
}

/** Lista de "Fontes" de uma resposta fundamentada — sempre páginas reais
 * devolvidas pelo backend (nunca inventadas no cliente, ver
 * `AskEvidence`/`functions/api/intelligence/sessions/[sessionId]/ask.ts`).
 * Uma evidência pode cobrir mais de uma página (`startPage`..`endPage`);
 * clicar navega para a página inicial da evidência. */
export function SourceBadges({ evidence, onNavigateToPage }: SourceBadgesProps) {
  if (evidence.length === 0) return null;

  return (
    <div className="intel-sources">
      <span className="intel-sources__label">Fontes</span>
      <ul className="intel-sources__list">
        {evidence.map((item) => (
          <li key={item.evidenceId}>
            <button
              type="button"
              className="intel-sources__badge"
              onClick={() => onNavigateToPage(item.startPage)}
            >
              {item.startPage === item.endPage
                ? `Página ${item.startPage}`
                : `Páginas ${item.startPage}–${item.endPage}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
