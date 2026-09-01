import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import Home from "@/pages/Home";

// As páginas de ferramenta puxam, por trás de cena, o cliente do Web Worker
// (src/lib/pdfWorkerClient.ts) e os motores pesados de PDF. Carregá-las sob
// demanda (code-splitting por rota) garante que a Home nunca baixe `pdf-lib`
// nem `pdfjs-dist` — só quando o usuário efetivamente abre uma ferramenta.
const CompressPage = lazy(() => import("@/pages/CompressPage"));
const SplitPage = lazy(() => import("@/pages/SplitPage"));

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
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/compactar-pdf" element={<CompressPage />} />
          <Route path="/dividir-pdf-por-tamanho" element={<SplitPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
