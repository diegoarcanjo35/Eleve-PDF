import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { NAV_LINKS } from "./navLinks";
import { PrivacyBadge } from "./PrivacyBadge";
import { MobileMenu } from "./MobileMenu";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__brand">
          <span className="site-header__brand-name">
            <span className="brand__eleve">Eleve</span>
            <span className="brand__pdf">PDF</span>
          </span>
        </Link>

        <nav className="site-nav" aria-label="Navegação principal">
          <Link to="/" className="site-nav__link" aria-current={isHome ? "page" : undefined}>
            Home
          </Link>
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="site-nav__link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="site-header__right">
          <PrivacyBadge pathname={location.pathname} />
          <button
            ref={menuButtonRef}
            type="button"
            className="menu-toggle"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} triggerRef={menuButtonRef} />
    </header>
  );
}
