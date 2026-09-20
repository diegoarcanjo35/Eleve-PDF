import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { findSeoPage } from "@shared/seo/pages";

const PAGE_META = findSeoPage("/termos-de-uso")!;

export default function TermsPage() {
  useDocumentMeta(PAGE_META);

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
          <h1 className="tool-page__title">Termos de Uso</h1>
          <p className="tool-page__description">
            Este é um documento simples de transparência sobre como o ElevePDF funciona e o que
            esperar dele — não um contrato jurídico extenso.
          </p>
        </div>

        <section className="tools" aria-label="Termos de uso">
          <h2 style={{ margin: 0, fontSize: 18 }}>Uso gratuito e processamento local (ferramentas clássicas)</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            O ElevePDF é gratuito. Nas ferramentas clássicas — compactar, dividir e juntar — todo o
            processamento dos seus arquivos acontece dentro do seu próprio navegador. Nenhum PDF
            enviado por você nessas ferramentas trafega pela rede ou é armazenado em qualquer
            servidor nosso. A Eleve IA funciona de um jeito diferente, descrito a seguir.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Eleve IA</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            A Eleve IA auxilia na localização, síntese e compreensão de informações existentes nos
            documentos enviados pelo usuário. Diferente das ferramentas clássicas, para funcionar
            ela envia o texto extraído do seu PDF — não o arquivo original — a serviços de
            processamento de linguagem. Os detalhes completos desse fluxo estão na página de{" "}
            <Link to="/privacidade">Privacidade e métricas</Link>.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>Limitações:</strong> respostas geradas pela Eleve IA podem conter erros,
            interpretar incorretamente um trecho, omitir contexto relevante ou não identificar
            todas as informações pertinentes do documento. A Eleve IA é uma ferramenta de apoio,
            não uma fonte de verdade absoluta.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>Evidências:</strong> cada resposta da Eleve IA indica os trechos e páginas do
            documento usados para gerá-la, para facilitar a conferência. Você deve sempre verificar
            a informação relevante diretamente no documento original antes de tomar qualquer
            decisão com base nela.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>Decisões importantes:</strong> a Eleve IA não substitui a avaliação de um
            profissional qualificado em assuntos jurídicos, financeiros, médicos ou outras decisões
            de alto impacto. Use as respostas como ponto de partida para sua própria análise, não
            como decisão final.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>Sua responsabilidade pelo conteúdo enviado:</strong> ao usar a Eleve IA, você
            declara ter a autorização ou o direito necessário para processar os documentos que
            envia. Como em qualquer sistema que recebe arquivos de terceiros, o conteúdo enviado é
            tratado pelo sistema como dado não confiável até ser processado.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Sua responsabilidade pelos documentos</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Você é responsável pelos arquivos que envia e pelo uso que faz dos resultados. Como
            qualquer ferramenta que reescreve arquivos, recomendamos sempre preservar uma cópia do
            PDF original antes de compactar ou dividir, e conferir o resultado antes de descartar
            essa cópia.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Limites reais da compactação</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            A compactação pode reduzir o tamanho do arquivo, mas isso depende do conteúdo de cada
            PDF — alguns arquivos, especialmente os já otimizados, podem apresentar redução mínima
            ou nenhuma redução. Quando o resultado processado não fica menor que o original, o
            ElevePDF devolve o arquivo original intacto, em vez de entregar um resultado maior ou
            igual como se fosse uma melhora. Nos níveis que recomprimem imagens, isso pode causar
            perda de qualidade visual em imagens elegíveis para recompressão — o ElevePDF não
            garante ausência de perda perceptível nesses níveis. Não há garantia genérica de que a
            estrutura interna de todo PDF (formulários, marcadores, links internos, metadados) seja
            preservada em todos os cenários possíveis.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Limites reais da divisão</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            A divisão por tamanho trata o limite escolhido por você como um alvo, nunca cortando
            uma página ao meio para respeitá-lo. Isso significa que, se uma única página sozinha já
            ultrapassa o limite definido, essa página vira sua própria parte, marcada como acima do
            limite — a ferramenta nunca finge silenciosamente que essa parte respeita o tamanho
            pedido. Você é responsável por conferir o resultado da divisão antes de usá-lo,
            especialmente quando o PDF original tiver formulários, marcadores ou links internos,
            casos em que a interface já exibe um aviso específico antes de dividir.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Uso permitido</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            É proibido usar o ElevePDF para processar ou distribuir conteúdo ilegal, ou para
            qualquer finalidade que viole leis aplicáveis.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Disponibilidade e mudanças</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            O ElevePDF é oferecido "como está", sem garantia de disponibilidade contínua ou
            ininterrupta. O serviço, incluindo suas funcionalidades — como a Eleve IA — pode
            evoluir, ser ajustado ou ampliado ao longo do tempo, e estes termos podem ser
            atualizados a qualquer momento, conforme o ElevePDF evolui.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Métricas e privacidade</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            O ElevePDF só registra métricas próprias e pseudônimas de uso depois que você aceita
            explicitamente, e você pode revogar essa escolha a qualquer momento. Detalhes completos
            estão na página de{" "}
            <Link to="/privacidade">Privacidade e métricas</Link>.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Links externos</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            Quando este site linkar para sites externos, o conteúdo e as políticas desses sites são
            de responsabilidade de cada um deles, não do ElevePDF.
          </p>

          <h2 style={{ margin: 0, fontSize: 18 }}>Contato</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            O ElevePDF é desenvolvido pela{" "}
            <a href="https://elevesites.com.br/" target="_blank" rel="noopener noreferrer">
              EleveSites
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
