import { Link } from "react-router-dom";
import { ArrowRight, Home as HomeIcon } from "lucide-react";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { SEO_NOT_FOUND } from "@shared/seo/pages";

export default function NotFoundPage() {
  useDocumentMeta(SEO_NOT_FOUND);

  return (
    <div className="page-container">
      <div className="tool-page not-found">
        <p className="hero__kicker">Erro 404</p>
        <h1 className="tool-page__title">Página não encontrada</h1>
        <p className="tool-page__description">
          O endereço que você tentou acessar não existe ou foi movido. Volte para a Home ou escolha
          uma das ferramentas abaixo.
        </p>

        <div className="hero__actions">
          <Link to="/" className="button button--primary">
            <HomeIcon size={16} aria-hidden="true" />
            Voltar para a Home
          </Link>
          <Link to="/compactar-pdf" className="button button--secondary">
            Compactar PDF
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link to="/dividir-pdf-por-tamanho" className="button button--secondary">
            Dividir por tamanho
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
