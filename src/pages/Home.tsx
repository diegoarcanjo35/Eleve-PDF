import { Link } from "react-router-dom";
import { ShieldCheck, MonitorSmartphone, Gift, UserX, ArrowRight } from "lucide-react";
import { ToolGrid } from "@/components/layout/ToolGrid";
import { ToolCategory } from "@/components/layout/ToolCategory";
import { getAvailableTools } from "@/toolsRegistry";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { track } from "@/analytics/client";
import { findSeoPage } from "@shared/seo/pages";

const PAGE_META = findSeoPage("/")!;

const TRUST_ITEMS = [
  { icon: MonitorSmartphone, label: "Processamento no seu dispositivo" },
  { icon: ShieldCheck, label: "Arquivos nunca enviados a servidores" },
  { icon: Gift, label: "Uso gratuito" },
  { icon: UserX, label: "Sem necessidade de cadastro" },
];

const STEPS = [
  { title: "Escolha uma ferramenta", description: "Selecione o que você precisa fazer com o seu PDF." },
  { title: "Processe no seu dispositivo", description: "Tudo acontece no seu navegador, sem upload." },
  { title: "Baixe o resultado", description: "Receba o arquivo pronto, individualmente ou em ZIP." },
];

export default function Home() {
  useDocumentMeta(PAGE_META);
  const availableTools = getAvailableTools();

  return (
    <div className="page-container">
        <section className="hero">
          <p className="hero__kicker">Seu PDF no tamanho certo</p>
          <h1 className="hero__title">
            <span className="brand__eleve">Eleve</span>
            <span className="brand__pdf">PDF</span>
          </h1>
          <p className="hero__lead">
            Ferramentas simples para otimizar e organizar seus PDFs, direto no navegador.
          </p>
          <p className="hero__note">
            Grátis e direto no navegador — nas ferramentas clássicas, sem enviar seus documentos
            para nossos servidores.
          </p>
          <div className="hero__actions">
            <Link
              to="/compactar-pdf"
              className="button button--primary"
              onClick={() => track("tool_open", { cta_id: "hero_compactar", tool_id: "compactar-pdf" })}
            >
              Compactar PDF
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link
              to="/dividir-pdf-por-tamanho"
              className="button button--secondary"
              onClick={() => track("tool_open", { cta_id: "hero_dividir", tool_id: "dividir-pdf-por-tamanho" })}
            >
              Dividir por tamanho
            </Link>
          </div>
        </section>

        <section className="section intel-promo" aria-labelledby="intel-promo-title">
          <div className="intel-promo__text">
            <p className="section__kicker">Novidade</p>
            <h2 className="section__title" id="intel-promo-title">
              Converse com seu PDF usando a Eleve IA
            </h2>
            <p className="section__lead">
              Envie um documento e faça perguntas sobre o conteúdo dele. A Eleve IA responde com
              base no seu PDF e sempre mostra as páginas de origem.
            </p>
          </div>
          <Link
            to="/conversar-com-pdf"
            className="button button--primary"
            onClick={() => track("tool_open", { cta_id: "hero_conversar", tool_id: "conversar-com-pdf" })}
          >
            Conversar com um PDF
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>

        <section className="section" aria-label="Privacidade e confiança">
          <ul className="trust-list">
            {TRUST_ITEMS.map(({ icon: Icon, label }) => (
              <li key={label} className="trust-list__item">
                <Icon size={18} aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5, marginTop: 8 }}>
            Essas garantias valem para as ferramentas clássicas. A Eleve IA funciona de um jeito
            diferente — veja como em <Link to="/privacidade">Privacidade e métricas</Link>.
          </p>
        </section>

        <section className="section" id="ferramentas" aria-labelledby="ferramentas-title">
          <p className="section__kicker">Ferramentas disponíveis</p>
          <h2 className="section__title" id="ferramentas-title">
            Comece por aqui
          </h2>
          <ToolGrid tools={availableTools} primary />
        </section>

        <section className="section" aria-labelledby="futuras-title">
          <p className="section__kicker">Em construção</p>
          <h2 className="section__title" id="futuras-title">
            Ferramentas futuras
          </h2>
          <p className="section__lead">
            Estamos expandindo o ElevePDF aos poucos. Estas ferramentas ainda não estão disponíveis.
          </p>
          <ToolCategory category="otimizar" />
          <ToolCategory category="organizar" />
          <ToolCategory category="converter" />
        </section>

        <section className="section" aria-labelledby="como-funciona-title">
          <p className="section__kicker">Como funciona</p>
          <h2 className="section__title" id="como-funciona-title">
            Três passos, sem complicação
          </h2>
          <div className="steps">
            {STEPS.map((step, index) => (
              <div className="step" key={step.title}>
                <p className="step__index">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="step__title">{step.title}</h3>
                <p className="step__description">{step.description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
  );
}
