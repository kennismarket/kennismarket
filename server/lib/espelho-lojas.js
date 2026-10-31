// Cópia das lojas do protótipo nas tabelas reais (lojas e produtos), que os pedidos usam.
//
// As telas continuam lendo as lojas no formato do protótipo ("stores/s<id>", ou a cópia no
// documento do vendedor "sellers/acc-<token>"). Sempre que uma loja é gravada, publicada,
// banida ou apagada, o servidor chama espelharLoja, que atualiza a cópia. Ao ligar, o
// servidor copia todas (espelharTodas), para pegar o que já existia.
import { donasDasLojas, idDaLoja } from './lojas-prototipo.js';

const PT = 2; // ordem dos textos no protótipo: en, es, pt, nl

// Texto em português (ou o primeiro que houver) de um campo do protótipo.
export function textoPt(v) {
  if (Array.isArray(v)) return String(v[PT] || v.find((x) => x) || '').trim();
  return typeof v === 'string' ? v.trim() : '';
}

// Uma loja do protótipo no formato das tabelas.
export function lojaParaTabelas(store, { prototipoId, vendedorId, banida }) {
  const split = Number(store.split);
  const produtos = (Array.isArray(store.prods) ? store.prods : [])
    .filter((p) => p && p.id != null && Number(p.price) > 0)
    .map((p) => ({
      prototipo_id: String(p.id),
      categoria: String(store.c || 'outros').slice(0, 40),
      titulo: (textoPt(p.name) || 'Produto').slice(0, 200),
      descricao: textoPt(p.desc).slice(0, 2000),
      preco_kn: Math.max(1, Math.round(Number(p.price))),
    }));
  return {
    loja: {
      prototipo_id: prototipoId,
      vendedor_id: vendedorId || null,
      nome: (String(store.n || '').trim() || `Loja ${prototipoId}`).slice(0, 120),
      descricao: textoPt(store.desc).slice(0, 2000),
      publicada: store.pub !== false && !banida,
      banida: Boolean(banida),
      porcentagem_vendedor: Number.isInteger(split) && split >= 10 && split <= 90 ? split : 50,
    },
    produtos,
  };
}

// De onde vem a loja: o documento da loja ou, se não houver, a cópia no documento do vendedor.
async function fonteDaLoja(repo, prototipoId) {
  const doc = (await repo.listarDocsPrototipo('stores')).find((d) => idDaLoja(d.id) === prototipoId)?.dados;
  if (doc?.store) return { store: doc.store, banida: Boolean(doc.banida) };
  for (const d of await repo.listarDocsPrototipo('sellers')) {
    const acc = d.dados?.acc;
    if (acc?.store?.id === prototipoId) return { store: acc.store, banida: Boolean(acc.banida) };
  }
  return null;
}

// Atualiza a cópia de uma loja. Loja que sumiu: sai do ar (os pedidos antigos continuam).
export async function espelharLoja(repo, prototipoId) {
  const id = Number(prototipoId);
  if (!Number.isInteger(id)) return null;
  const fonte = await fonteDaLoja(repo, id);
  if (!fonte) {
    await repo.desativarLojaEspelho(id);
    return null;
  }
  const donas = await donasDasLojas(repo);
  const vendedorId = donas[id] && (await repo.perfil(donas[id])) ? donas[id] : null; // conta apagada: sem vendedor
  const { loja, produtos } = lojaParaTabelas(fonte.store, { prototipoId: id, vendedorId, banida: fonte.banida });
  return repo.salvarLojaEspelho(loja, produtos);
}

// Copia todas as lojas que existem (ao ligar o servidor, ou pelo painel do dono).
export async function espelharTodas(repo) {
  const ids = new Set();
  for (const d of await repo.listarDocsPrototipo('stores')) {
    const id = idDaLoja(d.id);
    if (id != null && d.dados?.store) ids.add(id);
  }
  for (const d of await repo.listarDocsPrototipo('sellers')) {
    const id = Number(d.dados?.acc?.store?.id);
    if (Number.isInteger(id)) ids.add(id);
  }
  let copiadas = 0;
  const erros = [];
  for (const id of ids) {
    try {
      await espelharLoja(repo, id);
      copiadas++;
    } catch (e) {
      erros.push(`loja ${id}: ${e.message}`);
    }
  }
  return { copiadas, erros };
}

// Lojas afetadas por uma gravação num documento do protótipo (antes e depois).
export function lojasDoDocumento(colecao, docId, ...versoes) {
  if (colecao === 'stores') { const id = idDaLoja(docId); return id == null ? [] : [id]; }
  if (colecao !== 'sellers') return [];
  const ids = new Set();
  for (const v of versoes) {
    for (const x of [v?.acc?.storeId, v?.acc?.store?.id]) if (Number.isInteger(Number(x)) && x != null) ids.add(Number(x));
  }
  return [...ids];
}

// Depois de uma gravação: atualiza a cópia das lojas afetadas. Um erro aqui não desfaz a gravação.
export async function espelharDepois(repo, colecao, docId, ...versoes) {
  for (const id of lojasDoDocumento(colecao, docId, ...versoes)) {
    try { await espelharLoja(repo, id); } catch (e) { console.error(`cópia da loja ${id}:`, e.message); }
  }
}
