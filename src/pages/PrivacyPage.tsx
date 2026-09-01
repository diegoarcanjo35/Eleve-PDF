import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useConsent } from "@/analytics/useConsent";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

export default function PrivacyPage() {
  useDocumentMeta(
    "Privacidade e métricas — ElevePDF",
    "Como o ElevePDF processa seus PDFs e quais métricas próprias e pseudônimas são usadas.",
    "/privacidade",
  );
  const [consent, setConsent] = useConsent();

  return (
    <div className="page-container">
      <div className="tool-page">
        <nav className="breadcrumb" aria-label="Trilha de navegação">
          <Link to="/">
            <ChevronLeft size={16} aria-hidden="true" />
            Home
          </Link>
        </nav>

        <div className="tool-page__header">
          <h1 className="tool-page__title">Privacidade e métricas</h1>
          <p className="tool-page__description">
            Seus PDFs são processados inteiramente no seu dispositivo e nunca são enviados para
            nenhum servidor — isso não muda, independentemente da sua escolha abaixo sobre
            métricas.
          </p>
        </div>

        <section className="tools" aria-label="O que coletamos">
          <h2 style={{ margin: 0, fontSize: 18 }}>O que as métricas registram</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Quando você aceita, o ElevePDF registra eventos simples e pseudônimos — como qual
            ferramenta foi aberta, se uma compactação teve sucesso, ou a categoria de um erro —
            associados a um identificador aleatório válido só nesta aba, nunca a você.
          </p>
          <h2 style={{ margin: 0, fontSize: 18 }}>O que nunca é coletado</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Nunca coletamos o arquivo PDF, seu nome, conteúdo, texto, imagens, metadados, tamanho
            exato, e-mail, IP bruto ou qualquer identificador entre dispositivos.
          </p>

          <div className="split-risk-notice" style={{ marginTop: 8 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Sua escolha atual: {consentLabel(consent)}</p>
            <div className="hero__actions">
              <button
                type="button"
                className="button button--choice"
                onClick={() => setConsent("declined")}
              >
                Recusar métricas
              </button>
              <button
                type="button"
                className="button button--choice"
                onClick={() => setConsent("accepted")}
              >
                Aceitar métricas
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function consentLabel(consent: "unset" | "accepted" | "declined"): string {
  if (consent === "accepted") return "métricas aceitas";
  if (consent === "declined") return "métricas recusadas";
  return "ainda não escolhida";
}
