// Segurança dos documentos do protótipo (correção dos problemas críticos do relatório de 10/11/2026).
//
// 1. O que cada pessoa pode LER nas coleções (GET /api/prototipo/colecoes/...):
//    - dono do site: tudo;
//    - convites ("stores/inv-*"): só o dono, e quem abriu o link daquele convite (?convite=<token>);
//    - contas de vendedor ("sellers/acc-*"): o próprio vendedor e quem abriu o link dele recebem o
//      documento (sem o hash antigo da senha); os demais recebem só a vitrine da loja (acc.store),
//      com um apelido no lugar do código do link e sem usuário, e-mail ou senha.
// 2. Toda loja (gravada ou entregue) passa por limparLoja: cada campo só fica se tiver o formato
//    esperado. Assim ninguém coloca código na página (cor, ano, nota, logo...) nem quebra o catálogo.

export const CATEGORIAS = ['mentoria', 'consultoria', 'sites', 'cardapio', 'marketing', 'financas', 'design', 'ebooks'];

const NUMEROS = ['id', 'since', 'sales', 'rating', 'reviews', 'resp', 'split', 'src'];
const NUMEROS_COM_ZERO = ['sales', 'rating', 'reviews', 'resp']; // a tela quebra sem eles: inválido vira 0
const SIM_NAO = ['gen', 'ver', 'online', 'mine', 'lockLoc', 'pub'];
const TEXTOS = ['n', 'o', 'city', 'cc', 'niche', 'book', 'elg'];
const TRADUZIDOS = ['h', 'desc', 'tl'];
const NUMEROS_LOGO = ['L', 'I', 'S', 'P', 'F', 'C', 'c', 'k', 'inv'];

const numero = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const texto = (v, max = 2000) => (typeof v === 'string' ? v : Array.isArray(v) ? texto(v.find((x) => typeof x === 'string') ?? '', max) : v == null ? v : String(v)).slice(0, max);
const traduzido = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.slice(0, 5000) : '')) : typeof v === 'string' ? v.slice(0, 5000) : '');

function limparLogo(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
  if ('v' in g && g.v !== 2 && g.v !== 3) return null; // versão desconhecida: volta às iniciais
  const out = {};
  if (g.v === 2 || g.v === 3) out.v = g.v;
  for (const k of NUMEROS_LOGO) {
    if (!(k in g)) continue;
    const n = numero(g[k]);
    out[k] = Number.isInteger(n) && n >= 0 && n < 1000 ? n : 0;
  }
  if ('M' in g) out.M = /^[A-Za-z0-9]{1,24}$/.test(String(g.M)) ? String(g.M) : 'spark';
  if ('u' in g) out.u = /^[A-Za-z0-9]{1,16}$/.test(String(g.u)) ? String(g.u) : 'x';
  return out;
}

function limparProduto(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'name' || k === 'desc') out[k] = traduzido(v);
    else if (k === 'price') { const n = numero(v); out.price = Number.isFinite(n) ? n : 0; }
    else if (k === 'deliv') out.deliv = Array.isArray(v) ? v.filter((x) => x == null || ['string', 'number'].includes(typeof x) || typeof x === 'object') : [];
    else if (k === 'id') out.id = String(v).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80);
    else if (v == null || ['number', 'boolean'].includes(typeof v)) out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 2000);
    else out[k] = v;
  }
  return out;
}

// Devolve uma cópia da loja só com valores no formato esperado. Campos que não vieram continuam
// sem vir (nada é inventado); campos com formato errado são corrigidos ou tirados.
export function limparLoja(store) {
  if (!store || typeof store !== 'object' || Array.isArray(store)) return store;
  const out = { ...store };
  for (const k of NUMEROS) {
    if (!(k in out) || out[k] == null || out[k] === '') continue;
    const n = numero(out[k]);
    if (Number.isFinite(n)) out[k] = n; else if (NUMEROS_COM_ZERO.includes(k)) out[k] = 0; else delete out[k];
  }
  for (const k of SIM_NAO) if (k in out) out[k] = Boolean(out[k]);
  for (const k of TEXTOS) if (k in out && out[k] != null) out[k] = texto(out[k], k === 'cc' ? 4 : 300);
  for (const k of TRADUZIDOS) if (k in out) out[k] = traduzido(out[k]);
  if ('c' in out && !CATEGORIAS.includes(out.c)) out.c = CATEGORIAS[0];
  if ('color' in out && !/^#[0-9A-Fa-f]{3,8}$/.test(String(out.color))) delete out.color;
  if ('logo' in out && out.logo != null && !/^[0-9a-f]{32}$/.test(String(out.logo))) delete out.logo;
  if ('glogo' in out && out.glogo != null) { const g = limparLogo(out.glogo); if (g) out.glogo = g; else delete out.glogo; }
  if ('prods' in out) out.prods = (Array.isArray(out.prods) ? out.prods : []).map(limparProduto).filter(Boolean);
  if ('tiers' in out && (!Array.isArray(out.tiers) || !out.tiers.every(Array.isArray))) {
    out.tiers = (out.prods || []).map((p) => [p.name, p.desc, p.price, 1]); // refeito a partir dos produtos
  }
  return out;
}

// Documento de uma coleção com as lojas limpas (loja do documento e cópia no documento do vendedor).
export function limparDocumento(colecao, dados) {
  if (!dados || typeof dados !== 'object') return dados;
  if (colecao === 'stores' && dados.store) return { ...dados, store: limparLoja(dados.store) };
  if (colecao === 'sellers' && dados.acc?.store) return { ...dados, acc: { ...dados.acc, store: limparLoja(dados.acc.store) } };
  return dados;
}

// O que vai para o navegador. quem = { dono, contaId, convite }; apelido(token) = código opaco.
export function docsVisiveis(colecao, docs, { dono = false, contaId = null, convite = null, apelido }) {
  if (dono) return docs.map((d) => ({ id: d.id, dados: limparDocumento(colecao, d.dados) }));
  if (colecao === 'stores') {
    return docs
      .filter((d) => !d.id.startsWith('inv-') || (convite && d.id === `inv-${convite}`))
      .map((d) => ({ id: d.id, dados: limparDocumento(colecao, d.dados) }));
  }
  if (colecao === 'sellers') {
    const out = [];
    for (const d of docs) {
      const acc = d.dados?.acc;
      if (!acc) continue;
      if ((contaId && acc.userId === contaId) || (convite && acc.token === convite)) {
        const { salt: _s, hash, ...resto } = acc;
        out.push({ id: d.id, dados: limparDocumento(colecao, { ...d.dados, acc: { ...resto, ...(hash ? { hash: true } : {}) } }) });
      } else if (acc.store && typeof acc.store === 'object') {
        const t = apelido(String(acc.token || d.id));
        out.push({ id: `acc-${t}`, dados: limparDocumento(colecao, { acc: { token: t, storeId: acc.storeId ?? null, store: acc.store, ...(acc.banida ? { banida: true } : {}) } }) });
      }
    }
    return out;
  }
  return docs.map((d) => ({ id: d.id, dados: limparDocumento(colecao, d.dados) }));
}
