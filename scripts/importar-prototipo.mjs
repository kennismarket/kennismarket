// Importa para o site os dados do protótipo publicado no claude.ai.
//
// Uso:  KM_TOKEN=<token do dono> node scripts/importar-prototipo.mjs <pasta-exportada> <endereço-do-site>
//
// Desde a etapa 2, só contas com login gravam: KM_TOKEN é o token de acesso da conta de dono
// (no navegador, logado como dono: JSON.parse(localStorage['km-sessao']).access).
//
// A pasta tem o formato da exportação do claude.ai:
//   <pasta>/stores/*.json, <pasta>/delivfiles/*.json, <pasta>/sellers/*.json  (um documento por arquivo)
//   <pasta>/arquivos/<id>.<ext>                                              (PDFs, imagens...)
// Os arquivos são enviados pelo site, que dá um id novo a cada um; o programa troca os ids
// antigos pelos novos dentro dos documentos antes de gravá-los.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const [pasta, site] = process.argv.slice(2);
if (!pasta || !site) {
  console.error('Uso: node scripts/importar-prototipo.mjs <pasta-exportada> <endereço-do-site>');
  process.exit(1);
}
const base = site.replace(/\/+$/, '');
const TIPOS = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json' };

async function pedir(metodo, caminho, corpo, tipo = 'application/json') {
  for (let tentativa = 1; ; tentativa++) {
    const headers = { 'Content-Type': tipo, ...(process.env.KM_TOKEN ? { Authorization: `Bearer ${process.env.KM_TOKEN}` } : {}) };
    const r = await fetch(base + caminho, { method: metodo, headers, body: corpo });
    if (r.ok) return r.json();
    // O site pode estar acordando (Render) ou limitando o ritmo: espera e tenta de novo.
    if ((r.status >= 500 || r.status === 429) && tentativa < 6) { await new Promise((ok) => setTimeout(ok, 5000 * tentativa)); continue; }
    throw new Error(`${metodo} ${caminho}: HTTP ${r.status} ${await r.text()}`);
  }
}

// 1. Arquivos: envia e anota id antigo → id novo.
const novos = {};
const pastaArquivos = join(pasta, 'arquivos');
const arquivos = existsSync(pastaArquivos) ? readdirSync(pastaArquivos) : [];
for (const nome of arquivos) {
  const antigo = basename(nome, extname(nome));
  const tipo = TIPOS[extname(nome).slice(1).toLowerCase()];
  if (!tipo) { console.warn(`pulado (tipo desconhecido): ${nome}`); continue; }
  const r = await pedir('POST', '/api/prototipo/arquivos', readFileSync(join(pastaArquivos, nome)), tipo);
  novos[antigo] = r.id;
  console.log(`arquivo ${nome} → ${r.id}`);
}

// 2. Documentos: troca os ids dos arquivos e grava.
const trocarIds = (texto) => texto.replace(/"(asset|logo)"\s*:\s*"([0-9a-f]{32})"/g, (todo, campo, id) => (novos[id] ? `"${campo}":"${novos[id]}"` : todo));
let semArquivo = 0;
for (const colecao of ['stores', 'delivfiles', 'sellers']) {
  const dir = join(pasta, colecao);
  if (!existsSync(dir)) continue;
  for (const nome of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const texto = readFileSync(join(dir, nome), 'utf8');
    for (const [, , id] of texto.matchAll(/"(asset|logo)"\s*:\s*"([0-9a-f]{32})"/g)) if (!novos[id]) semArquivo++;
    await pedir('PUT', `/api/prototipo/docs/${colecao}/${encodeURIComponent(basename(nome, '.json'))}`, JSON.stringify({ dados: JSON.parse(trocarIds(texto)) }));
  }
  console.log(`coleção ${colecao}: importada`);
}
console.log(`Pronto. ${Object.keys(novos).length} arquivos enviados.${semArquivo ? ` Atenção: ${semArquivo} referências a arquivos que não estavam na pasta.` : ''}`);
