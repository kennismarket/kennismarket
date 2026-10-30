// O site mostra o próprio protótipo (kennismarket-prototipo.html), sem mudar nada visual.
// Na hora de entregar a página, o servidor faz só estes ajustes:
// 1. carrega a ponte (public/js/ponte-claude.js) que guarda os dados no Supabase;
// 2. os links de convite apontam para o endereço do site, e não para o claude.ai;
// 3. as cotações vêm do nosso servidor (/api/rates);
// 4. o ícone da aba do navegador: a moeda K no hexágono, desenhada pelo próprio protótipo
//    (função coinSVG, versão para tamanhos pequenos), em public/favicon.svg;
// 5. a administração (e o editor de lojas dela) só abre com a conta de dono:
//    sem login de dono, mostra a tela de login de public/js/admin-dono.js.
import { readFileSync } from 'node:fs';

const ARQUIVO = new URL('../../kennismarket-prototipo.html', import.meta.url);

export const AJUSTES = [
  { nome: 'ponte', de: /<head>/, para: '<head><script src="/js/ponte-claude.js"></script><script src="/js/admin-dono.js"></script>' },
  { nome: 'ícone da aba', de: /<head>/, para: '<head><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">' },
  { nome: 'links de convite', de: /const SITE_URL="[^"]*";/, para: 'const SITE_URL=location.origin+"/";' },
  { nome: 'cotações', de: /var RATES_URL="[^"]*";/, para: 'var RATES_URL="/api/rates";' },
  { nome: 'administração só para donos', de: /function vAdmin\(\)\{/,
    para: 'function vAdmin(){if(!window.KM_DONO)return kmLoginDono();return vAdminDono().replace(/<\\/div><\\/div>$/,kmSairDonoHTML()+"</div></div>")}function vAdminDono(){' },
  { nome: 'editor de lojas só para donos', de: /function vEditStore\(\)\{/, para: 'function vEditStore(){if(!window.KM_DONO)return kmLoginDono();' },
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
