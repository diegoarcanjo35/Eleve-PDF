import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { track } from "@/analytics/client";
import type { CtaId } from "@shared/analytics/events";

interface ToolPageLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  crossLink: { label: string; to: string };
  crossLinkCtaId: CtaId;
}

export function ToolPageLayout({
  title,
  description,
  children,
  crossLink,
  crossLinkCtaId,
}: ToolPageLayoutProps) {
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
          <h1 className="tool-page__title">{title}</h1>
          <p className="tool-page__description">{description}</p>
          <span className="tool-page__local-note">
            <ShieldCheck size={15} aria-hidden="true" />
            Processado no seu dispositivo — nenhum arquivo é enviado a servidores
          </span>
        </div>

        {children}

        <p className="tool-page__cross-link">
          Precisa de outra coisa?{" "}
          <Link to={crossLink.to} onClick={() => track("tool_open", { cta_id: crossLinkCtaId })}>
            {crossLink.label}
          </Link>
        </p>
      </div>
    </div>
  );
}
