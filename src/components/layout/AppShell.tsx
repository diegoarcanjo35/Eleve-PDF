import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { ConsentBanner } from "./ConsentBanner";

const ADMIN_PATH_PREFIX = "/admin";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  // A área /admin/* é privada e protegida server-side (ver AnalyticsDashboard e
  // functions/api/analytics/summary.ts) — nunca deve exibir UI pública de
  // consentimento/métricas, que só faz sentido para visitantes do site público.
  const isAdminArea = location.pathname.startsWith(ADMIN_PATH_PREFIX);

  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">{children}</main>
      <Footer />
      {!isAdminArea && <ConsentBanner />}
    </div>
  );
}
