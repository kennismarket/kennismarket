// Quem pode mexer em cada loja da versão de testes (lojas no formato do protótipo).
//
// As lojas ficam em documentos "stores/s<id>" ({ store, ts }). O servidor guarda junto,
// fora do "store", de quem é a loja (contaDona) e se ela está banida (banida).
// Lojas antigas sem contaDona: a dona é a conta do vendedor cujo documento
// "sellers/acc-<token>" aponta para a loja (acc.storeId ou acc.store.id).
// Lojas sem dona (as geradas pelo dono no painel) só o dono do site altera.

// Campos que só o dono do site muda: o vendedor não inventa nota, vendas nem selo.
export const CAMPOS_DO_DONO = ['split', 'ver', 'rating', 'reviews', 'sales'];
export const SPLIT_MIN = 10;
export const SPLIT_MAX = 90;

export const idDaLoja = (docId) => (/^s\d{1,12}$/.test(docId) ? Number(docId.slice(1)) : null);

// { [storeId]: contaId } a partir dos documentos de lojas e de vendedores.
export async function donasDasLojas(repo) {
  const donas = {};
  for (const d of await repo.listarDocsPrototipo('sellers')) {
    const acc = d.dados?.acc;
    const loja = acc?.storeId ?? acc?.store?.id;
    if (acc?.userId && loja != null) donas[loja] = acc.userId;
  }
  for (const d of await repo.listarDocsPrototipo('stores')) {
    const id = idDaLoja(d.id);
    if (id != null && d.dados?.contaDona) donas[id] = d.dados.contaDona;
  }
  return donas;
}

// Loja (id) que tem o produto: os arquivos de entrega usam pkey = "p" + id do produto.
export async function lojaDoProduto(repo, pkey) {
  if (typeof pkey !== 'string' || !pkey.startsWith('p')) return null;
  const produto = pkey.slice(1);
  for (const d of await repo.listarDocsPrototipo('stores')) {
    const st = d.dados?.store;
    if (st?.id != null && Array.isArray(st.prods) && st.prods.some((p) => p && p.id === produto)) return st.id;
  }
  return null;
}

// pkey de um documento de arquivo de entrega: o campo pkey, ou o id "h-<pkey>-<idioma>".
export function pkeyDoArquivo(docId, dados) {
  if (dados && typeof dados.pkey === 'string') return dados.pkey;
  const m = /^h-(p.+)-[a-z]{2}$/.exec(docId);
  return m ? m[1] : null;
}
