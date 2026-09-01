import type { ToolDefinition } from "@/toolsRegistry";
import { ToolCard } from "./ToolCard";

interface ToolGridProps {
  tools: ToolDefinition[];
  primary?: boolean;
}

export function ToolGrid({ tools, primary = false }: ToolGridProps) {
  return (
    <div className={`tool-grid${primary ? " tool-grid--primary" : ""}`}>
      {tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} primary={primary} />
      ))}
    </div>
  );
}
