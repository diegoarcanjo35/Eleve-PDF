import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import type { SeoPageMeta } from "@shared/seo/pages";

/**
 * Renderizada em `/conversar-com-pdf` no lugar de `ConversarComPdfPage`
 * quando `ELEVE_IA_ENABLED` está desligada (Sprint 01H — ver
 * `src/featureFlags.ts` e `src/App.tsx`). Deliberadamente estática: nunca
 * chama `useIntelligenceSession`, nunca monta upload/chat/viewer, nunca
 * inicia sessão nem extrai conteúdo de PDF — o code-splitting por rota
 * garante que o chunk de `ConversarComPdfPage` nem é baixado neste caso.
 *
 * Meta própria (não reaproveita `findSeoPage("/conversar-com-pdf")`, que
 * descreve o estado "ligado"): `noindex` e sem canonical, para não indexar
 * uma funcionalidade indisponível — mesmo tratamento dado ao build estático
 * em `scripts/generateSeoHtml.ts`.
 */
const DISABLED_PAGE_META: SeoPageMeta = {
  path: "/conversar-com-pdf",
  title: "Converse com seu PDF — indisponível no momento | ElevePDF",
  description: "A Eleve IA está temporariamente indisponível nesta versão do ElevePDF.",
  robots: "noindex, nofollow",
  social: false,
  canonical: false,
};

export default function ConversarComPdfDisabledPage() {
  useDocumentMeta(DISABLED_PAGE_META);

  return (
    <div className="page-container">
      <div className="tool-page">
        <nav className="breadcrumb" aria-label="Trilha de navegação">
          <Link to="/">
            <ChevronLeft size={16} aria-hidden="true" />
            Home
          </Link>
        </nav>

        <div className="tool-page__header">
          <h1 className="tool-page__title">Converse com seu PDF</h1>
          <p className="tool-page__description">
            Esta funcionalidade está temporariamente indisponível. Volte para a Home para usar as
            ferramentas de PDF do ElevePDF.
          </p>
        </div>
      </div>
    </div>
  );
}
