import { useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

interface DocumentViewerPaneProps {
  fileBytes: ArrayBuffer;
  fileName: string;
  pageCount: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

/**
 * Visualizador do PDF — lado esquerdo do layout de conversa (Sprint 01F).
 *
 * DECISÃO DE ESCOPO: usa o visualizador nativo do navegador via `<iframe>`
 * apontando para um Blob URL do próprio arquivo (nunca enviado a nenhum
 * servidor), navegando para a página via fragmento `#page=N` — é a
 * "infraestrutura mínima necessária" para clique-em-fonte navegar até a
 * página (item 10 do prompt da Sprint 01F), sem embarcar um motor de
 * renderização em canvas próprio nesta primeira versão. A maioria dos
 * navegadores modernos (Chrome, Edge, Firefox, Safari) tem visualizador de
 * PDF nativo com suporte a esse fragmento; onde não houver, o link "Abrir em
 * nova aba" garante que o documento continua acessível.
 */
export function DocumentViewerPane({
  fileBytes,
  fileName,
  pageCount,
  currentPage,
  onPageChange,
}: DocumentViewerPaneProps) {
  const blobUrl = useMemo(() => {
    const blob = new Blob([fileBytes], { type: "application/pdf" });
    return URL.createObjectURL(blob);
  }, [fileBytes]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < pageCount;

  return (
    <div className="intel-viewer">
      <div className="intel-viewer__toolbar">
        <button
          type="button"
          className="button button--ghost intel-viewer__nav"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrev}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="intel-viewer__page-indicator">
          Página {currentPage} de {pageCount}
        </span>
        <button
          type="button"
          className="button button--ghost intel-viewer__nav"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          aria-label="Próxima página"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <a
          className="intel-viewer__open-tab"
          href={blobUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Abrir ${fileName} em nova aba`}
        >
          <ExternalLink size={15} aria-hidden="true" />
          Abrir em nova aba
        </a>
      </div>
      <iframe
        key={blobUrl}
        className="intel-viewer__frame"
        src={`${blobUrl}#page=${currentPage}`}
        title={`Visualização de ${fileName}`}
      />
    </div>
  );
}
