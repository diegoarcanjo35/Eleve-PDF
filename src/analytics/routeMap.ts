import type { RouteId } from "@shared/analytics/events";

const PATH_TO_ROUTE_ID: Record<string, RouteId> = {
  "/": "home",
  "/compactar-pdf": "compactar-pdf",
  "/dividir-pdf-por-tamanho": "dividir-pdf-por-tamanho",
  "/juntar-pdfs": "juntar-pdfs",
  "/conversar-com-pdf": "conversar-com-pdf",
  "/privacidade": "privacidade",
  "/termos-de-uso": "termos-de-uso",
};

export function pathToRouteId(pathname: string): RouteId | null {
  return PATH_TO_ROUTE_ID[pathname] ?? null;
}
