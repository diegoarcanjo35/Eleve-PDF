import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { ToolDefinition } from "@/toolsRegistry";
import { track } from "@/analytics/client";
import type { CtaId, ToolId } from "@shared/analytics/events";

interface ToolCardProps {
  tool: ToolDefinition;
  primary?: boolean;
}

const CARD_CTA_ID: Partial<Record<ToolId, CtaId>> = {
  "compactar-pdf": "card_compactar",
  "dividir-pdf-por-tamanho": "card_dividir",
};

export function ToolCard({ tool, primary = false }: ToolCardProps) {
  const Icon = tool.icon;
  const className = `tool-card${primary ? " tool-card--primary" : ""}`;

  const content = (
    <>
      <div className="tool-card__icon">
        <Icon size={22} aria-hidden="true" />
      </div>
      <div className="tool-card__title-row">
        <h3 className="tool-card__title">{tool.name}</h3>
        <span className={`status-pill status-pill--${tool.status === "available" ? "available" : "soon"}`}>
          {tool.status === "available" ? "Disponível" : "Em breve"}
        </span>
      </div>
      <p className="tool-card__description">{tool.description}</p>
      {tool.status === "available" && (
        <span className="tool-card__cta">
          Usar ferramenta
          <ArrowRight size={15} aria-hidden="true" />
        </span>
      )}
    </>
  );

  if (tool.status === "available" && tool.route) {
    const ctaId = CARD_CTA_ID[tool.id as ToolId];
    return (
      <Link
        to={tool.route}
        className={className}
        aria-label={`${tool.name} — disponível`}
        onClick={() => ctaId && track("tool_open", { cta_id: ctaId, tool_id: tool.id as ToolId })}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={`${className} tool-card--disabled`} aria-disabled="true">
      {content}
    </div>
  );
}
