export interface NavLink {
  label: string;
  href: string;
}

/** Itens do cabeçalho — âncoras para as seções da Home, preparadas para crescer
 * conforme novas categorias de ferramenta forem lançadas. */
export const NAV_LINKS: NavLink[] = [
  { label: "Todas as ferramentas", href: "/#ferramentas" },
  { label: "Otimizar", href: "/#otimizar" },
  { label: "Organizar", href: "/#organizar" },
  { label: "Converter", href: "/#converter" },
];
