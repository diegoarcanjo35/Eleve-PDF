/**
 * Gera os ativos sociais/ícone do ElevePDF de forma reprodutível, usando o
 * Playwright (`playwright`) já presente como devDependency para os testes
 * E2E — nenhuma dependência nova só para isto. Renderiza HTML puro (sem
 * fontes externas, para não depender de rede) em viewports com o tamanho
 * exato desejado e tira um screenshot PNG.
 *
 * Uso: `npx tsx scripts/generateSocialAssets.ts`
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, Helvetica, sans-serif";

// Mesma paleta de src/index.css (--bg, --accent, --accent-2, --ink, --ink-soft).
const COLORS = {
  bg: "#0a0d12",
  bgElevated: "#0d131c",
  accent: "#3478ff",
  accent2: "#82aaff",
  ink: "#f1eee8",
  inkSoft: "#a9b2c0",
};

function ogImageHtml(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; background: ${COLORS.bg}; font-family: ${FONT_STACK}; }
  body {
    display: flex; flex-direction: column; justify-content: center;
    padding: 90px; position: relative; overflow: hidden;
  }
  .glow {
    position: absolute; top: -220px; right: -160px; width: 620px; height: 620px;
    border-radius: 50%; background: radial-gradient(circle, rgba(52,120,255,0.35) 0%, rgba(52,120,255,0) 70%);
  }
  .kicker {
    color: ${COLORS.accent2}; font-size: 22px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; margin-bottom: 22px;
  }
  .brand { font-size: 108px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; margin-bottom: 28px; }
  .brand .eleve { color: ${COLORS.accent2}; }
  .brand .pdf { color: ${COLORS.ink}; }
  .tagline { color: ${COLORS.ink}; font-size: 38px; font-weight: 600; max-width: 900px; line-height: 1.25; margin-bottom: 26px; }
  .badges { display: flex; gap: 14px; }
  .badge {
    color: ${COLORS.inkSoft}; font-size: 22px; font-weight: 600; padding: 10px 20px;
    border: 1px solid #333f52; border-radius: 999px; background: ${COLORS.bgElevated};
  }
</style></head>
<body>
  <div class="glow"></div>
  <p class="kicker">Ferramentas gratuitas para PDF</p>
  <h1 class="brand"><span class="eleve">Eleve</span><span class="pdf">PDF</span></h1>
  <p class="tagline">Compacte e divida PDFs direto no navegador.</p>
  <div class="badges">
    <span class="badge">Grátis</span>
    <span class="badge">Privado</span>
    <span class="badge">Sem upload</span>
  </div>
</body></html>`;
}

/**
 * O apple-touch-icon precisa ser o MESMO símbolo do favicon.svg (fundo azul,
 * quadrado arredondado, documento branco com dobra no canto) — nunca um
 * desenho diferente (ex.: uma letra solta). Em vez de redesenhar o símbolo à
 * mão em HTML/CSS (o que arriscaria divergir do favicon com o tempo), lê o
 * próprio `public/favicon.svg` do disco e o escala para caber em 180×180,
 * com margem de segurança nas bordas.
 *
 * O canto arredondado do favicon só fica visível se a cor ao redor dele for
 * diferente da cor de preenchimento do próprio ícone — por isso o fundo da
 * página usa `--bg` (o fundo escuro do próprio app, não transparente: PNGs
 * de apple-touch-icon com transparência são desencorajados pela Apple) em
 * vez da mesma cor azul do favicon. Resultado: mesmo símbolo (fundo azul,
 * quadrado arredondado, documento branco, dobra no canto), com uma margem
 * segura e opaca ao redor, sem transparência.
 */
function appleTouchIconHtml(): string {
  const faviconSvg = readFileSync("public/favicon.svg", "utf-8");
  const ICON_SIZE = 148; // 180 - 2*16px de margem segura de cada lado
  const scaledSvg = faviconSvg.replace("<svg ", `<svg width="${ICON_SIZE}" height="${ICON_SIZE}" `);

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 180px; height: 180px; }
  body {
    width: 180px; height: 180px; background: ${COLORS.bg};
    display: flex; align-items: center; justify-content: center;
  }
</style></head>
<body>${scaledSvg}</body></html>`;
}

async function main() {
  // `--icon-only` regenera só o apple-touch-icon, sem tocar em og-elevepdf.png
  // — útil para uma correção que mexe apenas no ícone (a imagem OG já
  // aprovada não deve ser reescrita à toa). Sem a flag, gera os dois, como
  // sempre (uso normal deste script).
  const iconOnly = process.argv.includes("--icon-only");

  const browser = await chromium.launch();

  if (!iconOnly) {
    const ogPage = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await ogPage.setContent(ogImageHtml());
    const ogPath = resolve("public/og-elevepdf.png");
    await ogPage.screenshot({ path: ogPath });
    await ogPage.close();
    console.log(`OG image escrita em ${ogPath}`);
  }

  const iconPage = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await iconPage.setContent(appleTouchIconHtml());
  const iconPath = resolve("public/apple-touch-icon.png");
  await iconPage.screenshot({ path: iconPath });
  await iconPage.close();

  await browser.close();

  console.log(`apple-touch-icon escrito em ${iconPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
