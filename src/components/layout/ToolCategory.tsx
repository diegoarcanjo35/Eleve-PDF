import type { ToolCategory as ToolCategoryId } from "@/toolsRegistry";
import { TOOL_CATEGORY_LABELS, getToolsByCategory } from "@/toolsRegistry";
import { ToolGrid } from "./ToolGrid";

interface ToolCategoryProps {
  category: ToolCategoryId;
}

export function ToolCategory({ category }: ToolCategoryProps) {
  const tools = getToolsByCategory(category);
  return (
    <div className="tool-category" id={category}>
      <h3 className="tool-category__title">{TOOL_CATEGORY_LABELS[category]}</h3>
      <ToolGrid tools={tools} />
    </div>
  );
}
