// Logos oficiais das lojas que já existem (enviadas pelos donos em novembro/2026).
//
// Os arquivos ficam em server/dados/logos-lojas/ (um SVG por loja, e lojas.json diz qual é de qual
// loja). Ao ligar, o servidor coloca cada logo na sua loja: envia o SVG para o armazenamento e troca
// a logo da loja ("stores/s<id>" e a cópia no documento do vendedor, se houver).
//
// Cada logo é aplicada UMA vez só. O registro fica em "stores/cfg-logos-oficiais" (as telas ignoram
// esse documento). Se depois o vendedor ou o dono trocar a logo pelo editor, o servidor não mexe
// mais. Para aplicar de novo, basta mudar o arquivo SVG (o registro guarda qual arquivo foi aplicado).
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const PASTA = new URL('../dados/logos-lojas/', import.meta.url);
export const DOC_REGISTRO = 'cfg-logos-oficiais';

// Lê as logos da pasta. O id do arquivo vem do próprio conteúdo: o mesmo SVG gera sempre o mesmo id.
export function lerLogosOficiais(pasta = PASTA) {
  const lista = JSON.parse(readFileSync(new URL('lojas.json', pasta), 'utf8'));
  return lista.map(({ loja, arquivo }) => {
    const svg = readFileSync(new URL(arquivo, pasta));
    return { loja, svg, id: crypto.createHash('sha256').update(svg).digest('hex').slice(0, 32) };
  });
}

const comLogo = (store, id) => ({ ...store, logo: id, glogo: null });

// Coloca as logos que ainda não foram aplicadas. Devolve o que fez.
export async function aplicarLogosOficiais(repo, { logos = lerLogosOficiais(), mudou = () => {} } = {}) {
  const [lojas, vendedores] = await Promise.all([repo.listarDocsPrototipo('stores'), repo.listarDocsPrototipo('sellers')]);
  const registro = lojas.find((d) => d.id === DOC_REGISTRO)?.dados?.aplicadas || {};
  const r = { aplicadas: [], jaFeitas: 0, semLoja: [] };
  const mudaram = new Set();

  for (const { loja, svg, id } of logos) {
    if (registro[loja] === id) { r.jaFeitas++; continue; }
    const doc = lojas.find((d) => d.id === loja);
    const numero = Number(loja.slice(1));
    const copias = vendedores.filter((v) => v.dados?.acc?.store && Number(v.dados.acc.store.id) === numero);
    if (!doc?.dados?.store && !copias.length) { r.semLoja.push(loja); continue; }

    await repo.salvarArquivoPrototipo(id, 'image/svg+xml', svg, null);
    if (doc?.dados?.store) {
      await repo.salvarDocPrototipo('stores', loja, { ...doc.dados, store: comLogo(doc.dados.store, id) });
      mudaram.add('stores');
    }
    for (const v of copias) {
      await repo.salvarDocPrototipo('sellers', v.id, { ...v.dados, acc: { ...v.dados.acc, store: comLogo(v.dados.acc.store, id) } });
      mudaram.add('sellers');
    }
    registro[loja] = id;
    r.aplicadas.push(loja);
  }

  if (r.aplicadas.length) {
    await repo.salvarDocPrototipo('stores', DOC_REGISTRO, { aplicadas: registro, ts: Date.now() });
    mudaram.add('stores');
  }
  mudaram.forEach((c) => mudou(c)); // as telas abertas recarregam as lojas
  return r;
}
