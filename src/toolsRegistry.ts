import {
  Shrink,
  Scissors,
  Target,
  Combine,
  ListOrdered,
  FileMinus2,
  RotateCw,
  FileOutput,
  SplitSquareHorizontal,
  Images,
  FileImage,
  Image,
  type LucideIcon,
} from "lucide-react";

export type ToolCategory = "otimizar" | "organizar" | "converter";
export type ToolStatus = "available" | "coming-soon";

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  status: ToolStatus;
  /** Só presente quando `status` é "available" — nunca um link enganoso para "em breve". */
  route?: string;
  icon: LucideIcon;
  order: number;
}

export const TOOL_CATEGORY_LABELS: Record<ToolCategory, string> = {
  otimizar: "Otimizar PDF",
  organizar: "Organizar PDF",
  converter: "Converter PDF",
};

/**
 * Registro central de ferramentas — usado pela Home para montar os cartões.
 * Não contém lógica de processamento de PDF (isso vive em `src/lib`, carregado
 * só dentro do Web Worker), apenas metadados de apresentação.
 */
export const TOOLS: ToolDefinition[] = [
  {
    id: "compactar-pdf",
    name: "Compactar PDF",
    description: "Reduza o tamanho do seu PDF sem entregar uma versão maior que o original.",
    category: "otimizar",
    status: "available",
    route: "/compactar-pdf",
    icon: Shrink,
    order: 1,
  },
  {
    id: "dividir-pdf-por-tamanho",
    name: "Dividir por tamanho",
    description: "Divida o PDF usando um tamanho máximo como alvo, sem cortar páginas ao meio.",
    category: "otimizar",
    status: "available",
    route: "/dividir-pdf-por-tamanho",
    icon: Scissors,
    order: 2,
  },
  {
    id: "compactar-tamanho-alvo",
    name: "Compactar para tamanho-alvo",
    description: "Escolha o tamanho final desejado e deixe o ElevePDF ajustar a compactação.",
    category: "otimizar",
    status: "coming-soon",
    icon: Target,
    order: 3,
  },
  {
    id: "juntar-pdfs",
    name: "Juntar PDFs",
    description: "Combine vários arquivos PDF em um único documento, na ordem que você definir.",
    category: "organizar",
    status: "coming-soon",
    icon: Combine,
    order: 4,
  },
  {
    id: "organizar-paginas",
    name: "Organizar páginas",
    description: "Reordene as páginas do seu PDF por arrastar e soltar.",
    category: "organizar",
    status: "coming-soon",
    icon: ListOrdered,
    order: 5,
  },
  {
    id: "remover-paginas",
    name: "Remover páginas",
    description: "Apague páginas específicas sem afetar o restante do documento.",
    category: "organizar",
    status: "coming-soon",
    icon: FileMinus2,
    order: 6,
  },
  {
    id: "girar-pdf",
    name: "Girar PDF",
    description: "Corrija a orientação de páginas giradas incorretamente.",
    category: "organizar",
    status: "coming-soon",
    icon: RotateCw,
    order: 7,
  },
  {
    id: "extrair-paginas",
    name: "Extrair páginas",
    description: "Salve um intervalo de páginas como um novo PDF independente.",
    category: "organizar",
    status: "coming-soon",
    icon: FileOutput,
    order: 8,
  },
  {
    id: "dividir-por-intervalos",
    name: "Dividir por intervalos",
    description: "Divida o PDF em partes definidas por intervalos de página, não por tamanho.",
    category: "organizar",
    status: "coming-soon",
    icon: SplitSquareHorizontal,
    order: 9,
  },
  {
    id: "imagens-para-pdf",
    name: "Imagens para PDF",
    description: "Transforme uma ou mais imagens em um único arquivo PDF.",
    category: "converter",
    status: "coming-soon",
    icon: Images,
    order: 10,
  },
  {
    id: "pdf-para-jpg",
    name: "PDF para JPG",
    description: "Converta as páginas do seu PDF em imagens JPG.",
    category: "converter",
    status: "coming-soon",
    icon: FileImage,
    order: 11,
  },
  {
    id: "pdf-para-png",
    name: "PDF para PNG",
    description: "Converta as páginas do seu PDF em imagens PNG.",
    category: "converter",
    status: "coming-soon",
    icon: Image,
    order: 12,
  },
];

export function getAvailableTools(): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.status === "available").sort((a, b) => a.order - b.order);
}

export function getToolsByCategory(category: ToolCategory): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.category === category).sort((a, b) => a.order - b.order);
}
