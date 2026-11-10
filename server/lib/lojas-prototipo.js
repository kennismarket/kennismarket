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
// Várias lojas por conta (decisão dos donos, 04/11/2026): até 10 por conta de vendedor.
export const MAX_LOJAS_POR_CONTA = 10;

// Ids das lojas (do protótipo) de uma conta, na ordem em que foram criadas (id menor primeiro).
export async function lojasDaConta(repo, contaId) {
  const donas = await donasDasLojas(repo);
  return Object.keys(donas).filter((id) => donas[id] === contaId).map(Number).sort((a, b) => a - b);
}

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

// TODAS as lojas que têm o produto (os arquivos de entrega usam pkey = "p" + id do produto),
// com o produto de cada uma. Olha os documentos das lojas e as cópias nos documentos dos vendedores.
// Lojas antigas geradas de uma loja modelo podem repetir o id do produto do modelo: por isso a
// permissão olha todas, e não a primeira que aparecer (correção de segurança, 10/11/2026).
export async function lojasDoProduto(repo, pkey) {
  if (typeof pkey !== 'string' || !pkey.startsWith('p')) return [];
  const id = pkey.slice(1);
  const achadas = new Map();
  const olhar = (st) => {
    if (st?.id == null || !Array.isArray(st.prods) || achadas.has(Number(st.id))) return;
    const produto = st.prods.find((p) => p && String(p.id) === id);
    if (produto) achadas.set(Number(st.id), produto);
  };
  for (const d of await repo.listarDocsPrototipo('stores')) olhar(d.dados?.store);
  for (const d of await repo.listarDocsPrototipo('sellers')) olhar(d.dados?.acc?.store);
  return [...achadas].map(([lojaId, produto]) => ({ lojaId, produto }));
}

// pkey de um documento de arquivo de entrega: o campo pkey, ou o id "h-<pkey>-<idioma>".
export function pkeyDoArquivo(docId, dados) {
  if (dados && typeof dados.pkey === 'string') return dados.pkey;
  const m = /^h-(p.+)-[a-z]{2}$/.exec(docId);
  return m ? m[1] : null;
}
