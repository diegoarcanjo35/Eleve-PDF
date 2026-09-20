import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__row">
          Ferramentas clássicas do ElevePDF processam seus arquivos no seu dispositivo, sem envio
          a servidores. A Eleve IA funciona de um jeito diferente — veja como cada uma trata seus
          arquivos em Privacidade e métricas.
        </p>
        <p className="site-footer__row">
          <span className="site-footer__credit">ElevePDF — Desenvolvido por Diego Arcanjo Web Studio</span>
          <a
            className="site-footer__link"
            href="https://elevesites.com.br/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Conheça a EleveSites
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <span className="site-footer__domain">elevesites.com.br</span>
          <Link className="site-footer__link" to="/privacidade">
            Privacidade e métricas
          </Link>
          <Link className="site-footer__link" to="/termos-de-uso">
            Termos de Uso
          </Link>
        </p>
      </div>
    </footer>
  );
}
