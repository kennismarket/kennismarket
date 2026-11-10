// Produtos com id próprio nas lojas de vendedores (correção de segurança, 10/11/2026).
//
// Antes, a loja gerada de uma loja modelo copiava o id dos produtos do modelo. Como os arquivos de
// entrega ficam presos ao id do produto, um vendedor podia trocar ou apagar o PDF que a loja modelo
// e as outras lojas geradas dela também vendem. Agora cada produto novo nasce com id próprio e
// guarda de onde veio (srcp), e o navegador mostra os arquivos do modelo como "herdados"
// (public/js/produto-modelo.js).
//
// Para as lojas que já existiam, ao ligar o servidor: todo produto de loja de vendedor real cujo id
// também aparece em outra loja ganha um id novo (srcp = id antigo). Os arquivos que o próprio
// vendedor enviou para aquele produto passam para o id novo, e o que ele tinha escondido também
// (copiado, sem mexer no modelo). Os pedidos antigos continuam valendo (o servidor também olha srcp).
import crypto from 'node:crypto';
import { donasDasLojas } from './lojas-prototipo.js';

const idNovo = () => `k${crypto.randomBytes(5).toString('hex')}`;

export async function separarProdutosDasLojas(repo, { mudou = () => {}, novoId = idNovo } = {}) {
  const lojasDocs = await repo.listarDocsPrototipo('stores');
  const vendedores = await repo.listarDocsPrototipo('sellers');
  const donas = await donasDasLojas(repo);

  // Em quantas lojas diferentes aparece cada id de produto.
  const lojasDoId = new Map();
  const contar = (st) => {
    if (st?.id == null || !Array.isArray(st.prods)) return;
    for (const p of st.prods) {
      if (p?.id == null) continue;
      const k = String(p.id);
      if (!lojasDoId.has(k)) lojasDoId.set(k, new Set());
      lojasDoId.get(k).add(Number(st.id));
    }
  };
  lojasDocs.forEach((d) => contar(d.dados?.store));
  vendedores.forEach((d) => contar(d.dados?.acc?.store));

  // Lojas de vendedor real: troca os ids repetidos (o mesmo id novo no documento e na cópia).
  const trocas = new Map(); // id da loja → Map(id antigo → id novo)
  const trocar = (st) => {
    if (st?.id == null || !donas[Number(st.id)] || !Array.isArray(st.prods)) return null;
    const lojaId = Number(st.id);
    if (!trocas.has(lojaId)) trocas.set(lojaId, new Map());
    const mapa = trocas.get(lojaId);
    let mudouAlgo = false;
    const prods = st.prods.map((p) => {
      if (p?.id == null) return p;
      const antigo = String(p.id);
      if (!mapa.has(antigo) && (lojasDoId.get(antigo)?.size || 0) <= 1) return p;
      if (!mapa.has(antigo)) mapa.set(antigo, novoId());
      mudouAlgo = true;
      return { ...p, id: mapa.get(antigo), srcp: p.srcp || antigo };
    });
    return mudouAlgo ? { ...st, prods, tiers: prods.map((p) => [p.name, p.desc, p.price, 1]) } : null;
  };

  const r = { lojas: [], produtos: 0, arquivos: 0 };
  for (const d of lojasDocs) {
    const st = trocar(d.dados?.store);
    if (!st) continue;
    await repo.salvarDocPrototipo('stores', d.id, { ...d.dados, store: st });
    r.lojas.push(Number(st.id));
    mudou('stores');
  }
  for (const d of vendedores) {
    const st = trocar(d.dados?.acc?.store);
    if (!st) continue;
    await repo.salvarDocPrototipo('sellers', d.id, { ...d.dados, acc: { ...d.dados.acc, store: st } });
    if (!r.lojas.includes(Number(st.id))) r.lojas.push(Number(st.id));
    mudou('sellers');
  }

  // Arquivos do próprio vendedor e o que ele escondeu passam para o id novo.
  const arquivos = await repo.listarDocsPrototipo('delivfiles');
  for (const [lojaId, mapa] of trocas) {
    const vendedor = donas[lojaId];
    for (const [antigo, novo] of mapa) {
      r.produtos++;
      for (const a of arquivos) {
        if (a.dados?.pkey !== `p${antigo}`) continue;
        const dele = a.dados.asset ? (await repo.quemEnviouArquivoPrototipo(a.dados.asset)) === vendedor : false;
        if (!dele) continue;
        await repo.salvarDocPrototipo('delivfiles', a.id, { ...a.dados, pkey: `p${novo}` });
        r.arquivos++;
      }
      for (const a of arquivos) {
        const m = new RegExp(`^h-p${antigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-([a-z]{2})$`).exec(a.id);
        if (m && !arquivos.some((x) => x.id === `h-p${novo}-${m[1]}`)) {
          await repo.salvarDocPrototipo('delivfiles', `h-p${novo}-${m[1]}`, a.dados);
        }
      }
    }
  }
  if (r.arquivos || r.produtos) mudou('delivfiles');
  return r;
}
