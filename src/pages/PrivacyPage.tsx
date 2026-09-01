import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useConsent } from "@/analytics/useConsent";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { findSeoPage } from "@shared/seo/pages";

const PAGE_META = findSeoPage("/privacidade")!;

export default function PrivacyPage() {
  useDocumentMeta(PAGE_META);
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
          <h2 style={{ margin: 0, fontSize: 18 }}>Seus arquivos</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            O PDF que você envia nunca sai do seu dispositivo. Toda a compactação e divisão
            acontecem dentro do seu navegador, em um Web Worker — nenhum arquivo, nome, conteúdo
            ou metadado do documento trafega pela rede em nenhum momento.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>O que as métricas registram, e só depois do seu consentimento</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Antes de você aceitar, nenhum evento é enviado. Depois de aceitar, o ElevePDF registra
            eventos operacionais simples e pseudônimos — como qual ferramenta foi aberta, se uma
            compactação teve sucesso, ou a categoria de um erro — associados a um identificador
            pseudônimo (um UUID aleatório) válido só para esta aba do navegador, guardado em{" "}
            <code>sessionStorage</code> e descartado quando você fecha a aba ou revoga o
            consentimento.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Sua escolha sobre métricas (aceitar ou recusar) é guardada separadamente, em{" "}
            <code>localStorage</code>, para lembrarmos sua preferência entre visitas — isso não
            identifica você, só registra a escolha em si.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>O que nunca é coletado</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Nunca coletamos o arquivo PDF, seu nome, conteúdo, texto, imagens, metadados, tamanho
            exato, e-mail, IP bruto ou qualquer identificador entre dispositivos. Os eventos são{" "}
            <strong>pseudônimos, não anônimos no sentido absoluto</strong> — um identificador
            técnico existe (o UUID de sessão), mas ele nunca é combinado com dados que
            identifiquem uma pessoa.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Onde os eventos ficam guardados</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Os eventos aceitos são enviados a um endpoint próprio do ElevePDF e armazenados em um
            banco Cloudflare D1 dedicado a esse fim — nenhum serviço de analytics de terceiros (como
            Google Analytics) é usado. O plano de retenção é manter os eventos por até 90 dias;
            depois disso, o plano é removê-los automaticamente.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Sua escolha pode ser revogada a qualquer momento</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Você pode aceitar, recusar ou revogar sua escolha sobre métricas quando quiser, nesta
            página. Revogar interrompe o envio de novos eventos imediatamente e limpa o
            identificador de sessão pseudônimo guardado neste navegador.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Limitações do que essas métricas mostram</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Uma sessão pseudônima não é a mesma coisa que uma pessoa — o mesmo visitante em duas
            abas ou dispositivos diferentes conta como duas sessões. Esses números servem para
            entender uso agregado das ferramentas, não para identificar ou perfilar indivíduos.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Links externos</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            O ElevePDF é desenvolvido pela{" "}
            <a href="https://elevesites.com.br/" target="_blank" rel="noopener noreferrer">
              EleveSites
            </a>
            . Links para sites externos, quando existirem, não estão sob nosso controle — a
            política de privacidade deles é responsabilidade de cada site.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Atualizações</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Esta página pode ser atualizada conforme o ElevePDF evolui. Mudanças relevantes na
            forma como tratamos dados serão refletidas aqui.
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
