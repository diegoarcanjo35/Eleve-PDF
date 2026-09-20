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
            O ElevePDF tem duas formas de processar seus arquivos. As ferramentas clássicas
            (compactar, dividir, juntar) processam tudo inteiramente no seu dispositivo, sem
            enviar nada a nenhum servidor. A Eleve IA funciona de um jeito diferente, explicado
            abaixo. Nenhuma das duas muda conforme sua escolha sobre métricas.
          </p>
        </div>

        <section className="tools" aria-label="O que coletamos">
          <h2 style={{ margin: 0, fontSize: 18 }}>Seus arquivos</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            O PDF que você envia nunca sai do seu dispositivo. Toda a compactação e divisão
            acontecem dentro do seu navegador, em um Web Worker — nenhum arquivo, nome, conteúdo
            ou metadado do documento trafega pela rede em nenhum momento.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Eleve IA</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            A Eleve IA é a funcionalidade "Converse com seu PDF": você envia um documento e faz
            perguntas sobre o conteúdo dele. O texto do PDF é extraído primeiro localmente, no seu
            navegador. Em seguida, o texto extraído — não o arquivo PDF original — é enviado aos
            serviços de inteligência do ElevePDF para ser dividido em trechos, transformado em
            representações numéricas (embeddings) e indexado temporariamente. Quando você faz uma
            pergunta, o sistema busca os trechos mais relevantes do seu documento e usa um modelo
            de linguagem para gerar uma resposta fundamentada nesses trechos, sempre indicando as
            páginas de origem. Sua pergunta também é enviada para gerar essa resposta.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>Sessão temporária:</strong> hoje a Eleve IA não exige cadastro nem login. Ao
            enviar um PDF, é criada uma sessão temporária apenas para aquele documento — não
            existe uma Biblioteca de documentos, histórico entre sessões, nem "memória" do
            documento entre visitas. A sessão expira automaticamente após um período curto de
            inatividade. Como parte do processo de expiração pode depender de rotinas internas que
            não são instantâneas, não prometemos exclusão garantida no exato instante da
            expiração — o objetivo é que o conteúdo da sessão deixe de ser acessível e seja
            removido em um prazo curto.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>Conteúdo processado:</strong> para a Eleve IA funcionar, diferentes tipos de
            conteúdo podem estar em jogo: o arquivo PDF original (permanece só no seu navegador);
            o texto extraído dele; trechos (chunks) desse texto; representações numéricas
            (embeddings) desses trechos; as perguntas que você digita; as respostas geradas; as
            evidências (trechos e páginas) usadas para fundamentar cada resposta; e informações
            técnicas de operação do sistema, como contagem de páginas ou status de processamento.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>Fornecedores:</strong> a Eleve IA usa infraestrutura da Cloudflare
            (armazenamento temporário e execução das funções de backend), o serviço de embeddings
            da própria Cloudflare (Workers AI, modelo BGE-M3) para transformar trechos de texto em
            vetores, o banco vetorial Cloudflare Vectorize para indexação temporária desses
            vetores, e a API da OpenAI para gerar a resposta final a partir da pergunta e dos
            trechos relevantes. Nenhum desses fornecedores recebe o arquivo PDF original — apenas
            o texto extraído dele, ou trechos e representações derivadas desse texto. Segundo a
            documentação atual da Cloudflare, o que processamos no Workers AI (entradas, saídas e
            embeddings) é tratado como "Customer Content": a Cloudflare não usa esse conteúdo para
            treinar os modelos disponibilizados no Workers AI, nem para melhorar seus próprios
            serviços ou de terceiros, sem consentimento explícito. Esse conteúdo pode ficar
            armazenado enquanto usado em conjunto com um serviço de armazenamento como o Vectorize
            — no nosso caso, pelo período da indexação temporária da sessão.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>OpenAI:</strong> na chamada à OpenAI enviamos apenas o necessário para gerar a
            resposta — sua pergunta e os trechos de evidência relevantes do documento. Segundo a
            documentação atual da OpenAI, dados enviados pela API não são usados por padrão para
            treinar ou melhorar os modelos, salvo adesão explícita a esse uso — adesão que o
            ElevePDF não faz. Essa chamada usa a opção <code>store: false</code>, que evita reter a
            interação para fins como histórico da conversa. Isso não equivale a "Zero Data
            Retention" (ZDR): a própria OpenAI mantém, separadamente, logs de monitoramento de
            abuso da API que podem conter o conteúdo enviado, retidos por até 30 dias no regime
            padrão, ressalvadas exceções previstas pela OpenAI. ZDR é um controle adicional,
            disponível só para organizações elegíveis e aprovadas — o ElevePDF não possui esse
            controle hoje.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>Rede e segurança:</strong> para conter abusos, como excesso de requisições, o
            ElevePDF usa um identificador de rede pseudonimizado por HMAC — não o endereço IP em
            texto claro — para aplicar limites de uso. Isso não significa que nenhuma camada de
            infraestrutura tenha contato com o IP real: a Cloudflare, como qualquer provedor de
            borda, pode processar metadados de rede tecnicamente necessários para entregar as
            requisições. O que o ElevePDF, como aplicação, evita fazer é armazenar o IP bruto
            associado a esse controle de uso.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>Analytics:</strong> o sistema de métricas descrito no restante desta página
            nunca recebe o conteúdo do PDF, o nome do arquivo, a pergunta feita à Eleve IA, a
            resposta gerada, os trechos de evidência, o identificador de sessão da Eleve IA nem o
            segredo de autorização dessa sessão. O modelo de consentimento de métricas descrito
            abaixo vale também para a página Converse com seu PDF.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>OCR:</strong> a versão atual da Eleve IA não realiza reconhecimento óptico de
            caracteres. Documentos que sejam só imagem, sem texto extraível — por exemplo, PDFs
            escaneados sem camada de texto — não são processados pela Eleve IA.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>Recursos que ainda não existem:</strong> Biblioteca de documentos, conta de
            usuário, memória do documento entre sessões, compartilhamento e um plano Business não
            fazem parte da versão atual do ElevePDF. Se algum desses recursos for lançado no
            futuro, esta página será atualizada antes disso.
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
