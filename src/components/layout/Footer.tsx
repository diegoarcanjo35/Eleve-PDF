import { ArrowUpRight } from "lucide-react";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__row">
          Seus arquivos são processados no seu dispositivo e não ficam armazenados em nossos
          servidores.
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
        </p>
      </div>
    </footer>
  );
}
