// O site mostra o próprio protótipo (kennismarket-prototipo.html), sem mudar nada visual.
// Na hora de entregar a página, o servidor faz só estes ajustes:
// 1. carrega a ponte (public/js/ponte-claude.js) que guarda os dados no Supabase;
// 2. os links de convite apontam para o endereço do site, e não para o claude.ai;
// 3. as cotações vêm do nosso servidor (/api/rates);
// 4. o ícone da aba do navegador: a moeda K no hexágono, desenhada pelo próprio protótipo
//    (função coinSVG, versão para tamanhos pequenos), em public/favicon.svg;
// 5. login real (public/js/contas.js): as telas de login do protótipo passam a usar o servidor;
//    só a conta de dono vê o botão do painel do dono e consegue abrir o painel (e o editor de
//    lojas dele); o e-mail cabe no campo de usuário; o link do vendedor reconhece as contas
//    que já passaram para o Supabase.
import { readFileSync } from 'node:fs';

const ARQUIVO = new URL('../../kennismarket-prototipo.html', import.meta.url);

export const AJUSTES = [
  { nome: 'ponte', de: /<head>/, para: '<head><script src="/js/ponte-claude.js"></script><script src="/js/contas.js"></script>' },
  { nome: 'ícone da aba', de: /<head>/, para: '<head><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">' },
  { nome: 'links de convite', de: /const SITE_URL="[^"]*";/, para: 'const SITE_URL=location.origin+"/";' },
  { nome: 'cotações', de: /var RATES_URL="[^"]*";/, para: 'var RATES_URL="/api/rates";' },
  { nome: 'painel só para o dono', de: /function vAdmin\(\)\{/, para: 'function vAdmin(){if(!window.KM_DONO)return kmSemAcesso();' },
  { nome: 'editor de lojas só para o dono', de: /function vEditStore\(\)\{/, para: 'function vEditStore(){if(!window.KM_DONO)return kmSemAcesso();' },
  { nome: 'botão do painel só para o dono', de: /<button class="btn block" data-a="go" data-v="admin">\$\{tr\("accAdmin"\)\}<\/button>/,
    para: '${window.KM_DONO?\'<button class="btn block" data-a="go" data-v="admin">\'+tr("accAdmin")+\'</button>\':""}' },
  { nome: 'e-mail cabe no campo de usuário', de: /(id="au-user"[^>]*?)maxlength="20"/, para: '$1maxlength="80"' },
  { nome: 'vendedor com conta no Supabase entra pelo link', de: /const mode=!acc\?"new":acc\.hash\?"login":"reset";/,
    para: 'const mode=!acc?"new":(acc.hash||(acc.userId&&!acc.resetFrom))?"login":"reset";' },
];

// Devolve a página pronta e a lista de ajustes que não encontraram o trecho esperado
// (se o protótipo mudar, o aviso aparece no log em vez de o site quebrar).
export function montarPaginaPrototipo(html = readFileSync(ARQUIVO, 'utf8')) {
  const faltando = [];
  for (const a of AJUSTES) {
    if (a.de.test(html)) html = html.replace(a.de, a.para);
    else faltando.push(a.nome);
  }
  return { html, faltando };
}
