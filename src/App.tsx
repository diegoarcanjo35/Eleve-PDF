import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import Home from "@/pages/Home";
import { usePageView } from "@/analytics/usePageView";
import { ELEVE_IA_ENABLED } from "@/featureFlags";

// As páginas de ferramenta puxam, por trás de cena, o cliente do Web Worker
// (src/lib/pdfWorkerClient.ts) e os motores pesados de PDF. Carregá-las sob
// demanda (code-splitting por rota) garante que a Home nunca baixe `pdf-lib`
// nem `pdfjs-dist` — só quando o usuário efetivamente abre uma ferramenta.
const CompressPage = lazy(() => import("@/pages/CompressPage"));
const SplitPage = lazy(() => import("@/pages/SplitPage"));
const MergePage = lazy(() => import("@/pages/MergePage"));
const ConversarComPdfPage = lazy(() => import("@/pages/ConversarComPdfPage"));
// Ver `src/featureFlags.ts` — só um dos dois é escolhido por rota abaixo,
// então o chunk do outro nunca é baixado (o `lazy` só dispara o
// `import()` quando o componente é efetivamente renderizado).
const ConversarComPdfDisabledPage = lazy(() => import("@/pages/ConversarComPdfDisabledPage"));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage"));
const TermsPage = lazy(() => import("@/pages/TermsPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));
// Painel privado — não listado em nenhum menu/registro/sitemap (ver o
// comentário no topo do componente). Protegido de verdade pelo endpoint,
// não pela obscuridade desta rota.
const AnalyticsDashboard = lazy(() => import("@/pages/admin/AnalyticsDashboard"));

function RouteFallback() {
  return (
    <div className="page-container">
      <p className="tool-page__local-note" role="status">
        Carregando ferramenta…
      </p>
    </div>
  );
}

export default function App() {
  usePageView();

  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/compactar-pdf" element={<CompressPage />} />
          <Route path="/dividir-pdf-por-tamanho" element={<SplitPage />} />
          <Route path="/juntar-pdfs" element={<MergePage />} />
          <Route
            path="/conversar-com-pdf"
            element={ELEVE_IA_ENABLED ? <ConversarComPdfPage /> : <ConversarComPdfDisabledPage />}
          />
          <Route path="/privacidade" element={<PrivacyPage />} />
          <Route path="/termos-de-uso" element={<TermsPage />} />
          <Route path="/admin/analytics" element={<AnalyticsDashboard />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
