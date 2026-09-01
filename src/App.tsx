import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import Home from "@/pages/Home";
import { usePageView } from "@/analytics/usePageView";

// As páginas de ferramenta puxam, por trás de cena, o cliente do Web Worker
// (src/lib/pdfWorkerClient.ts) e os motores pesados de PDF. Carregá-las sob
// demanda (code-splitting por rota) garante que a Home nunca baixe `pdf-lib`
// nem `pdfjs-dist` — só quando o usuário efetivamente abre uma ferramenta.
const CompressPage = lazy(() => import("@/pages/CompressPage"));
const SplitPage = lazy(() => import("@/pages/SplitPage"));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage"));
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
          <Route path="/privacidade" element={<PrivacyPage />} />
          <Route path="/admin/analytics" element={<AnalyticsDashboard />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
