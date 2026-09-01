import { useConsent } from "@/analytics/useConsent";

export function ConsentBanner() {
  const [consent, setConsent] = useConsent();

  if (consent !== "unset") return null;

  return (
    <div className="consent-banner" role="region" aria-label="Escolha sobre métricas">
      <p className="consent-banner__text">
        Usamos métricas próprias e pseudônimas para entender quais ferramentas são utilizadas e
        melhorar o ElevePDF. Seus PDFs nunca são enviados.
      </p>
      <div className="consent-banner__actions">
        <button
          type="button"
          className="button button--choice"
          onClick={() => setConsent("declined")}
        >
          Recusar
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
  );
}
