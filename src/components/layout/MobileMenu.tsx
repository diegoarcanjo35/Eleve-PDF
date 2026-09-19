import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { NAV_LINKS } from "./navLinks";
import { PrivacyBadge } from "./PrivacyBadge";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export function MobileMenu({ open, onClose, triggerRef }: MobileMenuProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <>
      <div className="mobile-menu-overlay" onClick={onClose} />
      <div className="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu de navegação">
        <div className="mobile-menu__header">
          <span className="site-header__brand-name">
            <span className="brand__eleve">Eleve</span>
            <span className="brand__pdf">PDF</span>
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            className="mobile-menu__close"
            onClick={onClose}
            aria-label="Fechar menu"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <Link
          to="/"
          className="mobile-menu__link"
          aria-current={location.pathname === "/" ? "page" : undefined}
          onClick={onClose}
        >
          Home
        </Link>
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className="mobile-menu__link" onClick={onClose}>
            {link.label}
          </a>
        ))}

        <div className="mobile-menu__privacy">
          <PrivacyBadge pathname={location.pathname} />
        </div>
      </div>
    </>
  );
}
