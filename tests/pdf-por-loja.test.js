// Item 3 do relatório de segurança (10/11/2026): um vendedor não troca nem apaga o PDF de entrega
// de um produto que outra loja também tem (lojas geradas de uma loja modelo repetiam o id do produto).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';
import { separarProdutosDasLojas } from '../server/lib/ids-produtos.js';
import { espelharTodas } from '../server/lib/espelho-lojas.js';

let repo, base, servidor, dono, cliente, clienteId, ana, anaId, bia;

const pedir = async (metodo, caminho, { corpo, tipo = 'application/json', token } = {}) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { ...(corpo !== undefined ? { 'Content-Type': tipo } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: corpo });
  return { s: r.status, j: r.headers.get('content-type')?.includes('json') ? await r.json() : null };
};
const json = (dados) => JSON.stringify({ dados });
const doc = async (c, id) => (await repo.listarDocsPrototipo(c)).find((d) => d.id === id)?.dados;
async function vendedor(token, usuario) {
  await repo.salvarDocPrototipo('stores', `inv-${token}`, { invite: { token, email: `${usuario}@ex.com`, exp: Date.now() + 864e5, used: false } });
  const r = (await pedir('POST', '/api/contas/vendedor/criar', { corpo: JSON.stringify({ token, usuario, senha: 'segredo123' }) })).j;
  return { t: r.sessao.access_token, id: r.perfil.id };
}

before(async () => {
  const { criarApp } = await import('../server/app.js');
  repo = criarRepoMemoria();
  servidor = criarApp({ repo, limites: { desligados: true }, entregasSoPagas: true }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
  await repo.criarConta({ email: 'dono@ex.com', senha: 'segredo123', nome: 'Dono', usuario: 'dono_p', papel: 'dono' });
  dono = (await pedir('POST', '/api/contas/entrar', { corpo: JSON.stringify({ login: 'dono@ex.com', senha: 'segredo123' }) })).j.sessao.access_token;
  const c = (await pedir('POST', '/api/contas/cadastro', { corpo: JSON.stringify({ nome: 'Cli Ente', usuario: 'cli_p', senha: 'segredo123' }) })).j;
  cliente = c.sessao.access_token; clienteId = c.perfil.id;
  ({ t: ana, id: anaId } = await vendedor('anapdf1', 'ana_pdf'));
  ({ t: bia } = await vendedor('biapdf1', 'bia_pdf'));
});
after(() => servidor.close());

test('produto repetido em outra loja: o vendedor não troca nem esconde o arquivo dele, em qualquer ordem', async () => {
  // loja da Ana gravada ANTES da loja modelo, com o mesmo id de produto (como as lojas antigas)
  assert.equal((await pedir('PUT', '/api/prototipo/docs/stores/s5101', { corpo: json({ store: { id: 5101, n: 'Loja Ana', prods: [{ id: 'm1', name: ['X'], price: 10 }] }, ts: 1 }), token: ana })).s, 200);
  assert.equal((await pedir('PUT', '/api/prototipo/docs/stores/s300101', { corpo: json({ store: { id: 300101, n: 'Modelo', prods: [{ id: 'm1', name: ['X'], price: 10 }] }, ts: 1 }), token: dono })).s, 200);
  await repo.salvarDocPrototipo('delivfiles', 'p-m1-pt-1', { pkey: 'pm1', lg: 'pt', asset: 'a'.repeat(32), name: 'original.pdf' });
  const up = (await pedir('POST', '/api/prototipo/arquivos', { corpo: '%PDF-1.4 da ana', tipo: 'application/pdf', token: ana })).j.id;
  assert.equal((await pedir('PUT', '/api/prototipo/docs/delivfiles/p-m1-pt-1', { corpo: json({ pkey: 'pm1', lg: 'pt', asset: up, name: 'trocado.pdf' }), token: ana })).s, 403);
  assert.equal((await pedir('DELETE', '/api/prototipo/docs/delivfiles/p-m1-pt-1', { token: ana })).s, 403);
  assert.equal((await pedir('PUT', '/api/prototipo/docs/delivfiles/h-pm1-pt', { corpo: json({ hidden: [0] }), token: ana })).s, 403);
  assert.equal((await doc('delivfiles', 'p-m1-pt-1')).name, 'original.pdf');
  // o dono continua mexendo
  assert.equal((await pedir('PUT', '/api/prototipo/docs/delivfiles/h-pm1-pt', { corpo: json({ hidden: [] }), token: dono })).s, 200);
});

test('produto com id próprio: o vendedor envia, esconde e apaga os arquivos dele normalmente', async () => {
  assert.equal((await pedir('PUT', '/api/prototipo/docs/stores/s5102', { corpo: json({ store: { id: 5102, n: 'Loja Ana 2', prods: [{ id: 'xana01', srcp: 'm1', name: ['X'], price: 10 }] }, ts: 1 }), token: ana })).s, 200);
  const up = (await pedir('POST', '/api/prototipo/arquivos', { corpo: '%PDF-1.4 meu', tipo: 'application/pdf', token: ana })).j.id;
  assert.equal((await pedir('PUT', '/api/prototipo/docs/delivfiles/p-x-pt-1', { corpo: json({ pkey: 'pxana01', lg: 'pt', asset: up, name: 'meu.pdf' }), token: ana })).s, 200);
  // esconder um arquivo herdado do modelo: só na lista desta loja
  assert.equal((await pedir('PUT', '/api/prototipo/docs/delivfiles/h-pxana01-pt', { corpo: json({ hidden: ['f:p-m1-pt-1'] }), token: ana })).s, 200);
  // outra vendedora não mexe
  assert.equal((await pedir('PUT', '/api/prototipo/docs/delivfiles/p-x-pt-1', { corpo: json({ pkey: 'pxana01', lg: 'pt', asset: up, name: 'x' }), token: bia })).s, 403);
  assert.equal((await pedir('DELETE', '/api/prototipo/docs/delivfiles/p-x-pt-1', { token: ana })).s, 200);
});

test('lojas que já existiam: o produto repetido ganha id próprio, e os arquivos e pedidos continuam', async () => {
  // a loja antiga da Bia, gerada do modelo (mesmo id m1), com um PDF que ELA enviou para o m1,
  // algo escondido, e a cópia da loja no documento dela
  await pedir('PUT', '/api/prototipo/docs/stores/s5201', { corpo: json({ store: { id: 5201, n: 'Loja Bia', prods: [{ id: 'm1', name: ['X'], price: 10 }, { id: 'so-dela', name: ['Y'], price: 5 }] }, ts: 1 }), token: bia });
  const daBia = (await pedir('POST', '/api/prototipo/arquivos', { corpo: '%PDF-1.4 bia', tipo: 'application/pdf', token: bia })).j.id;
  await repo.salvarDocPrototipo('delivfiles', 'p-bia-pt-1', { pkey: 'pm1', lg: 'pt', asset: daBia, name: 'bia.pdf' });
  await repo.salvarDocPrototipo('delivfiles', 'h-pm1-es', { hidden: [1] });
  const acc = Object.values((await repo.listarDocsPrototipo('sellers'))).find((d) => d.id === 'acc-biapdf1');
  await repo.salvarDocPrototipo('sellers', 'acc-biapdf1', { ...acc.dados, acc: { ...acc.dados.acc, store: { id: 5201, n: 'Loja Bia', prods: [{ id: 'm1', name: ['X'], price: 10 }] } } });
  // um cliente já tinha pago o produto m1 da Bia
  await espelharTodas(repo);
  const lojaBia = Object.values(repo.tabelas.lojas).find((l) => l.prototipo_id === 5201);
  const antigo = Object.values(repo.tabelas.produtos).find((p) => p.loja_id === lojaBia.id && p.prototipo_id === 'm1');
  repo.tabelas.pedidos.velho = { id: 'velho', cliente_id: clienteId, produto_id: antigo.id, status: 'pago' };

  let n = 0;
  const r = await separarProdutosDasLojas(repo, { novoId: () => `knovo${++n}` });
  assert.ok(r.lojas.includes(5201));
  const loja = (await doc('stores', 's5201')).store;
  const m1 = loja.prods.find((p) => p.srcp === 'm1');
  assert.ok(m1 && m1.id.startsWith('knovo'));
  assert.equal(loja.prods.find((p) => p.name[0] === 'Y').id, 'so-dela'); // id que não se repete fica
  assert.equal((await doc('sellers', 'acc-biapdf1')).acc.store.prods[0].id, m1.id); // a cópia ganha o mesmo id
  assert.equal((await doc('stores', 's300101')).store.prods[0].id, 'm1'); // loja do dono não muda
  assert.equal((await doc('delivfiles', 'p-bia-pt-1')).pkey, `p${m1.id}`); // o PDF dela vai junto
  assert.equal((await doc('delivfiles', 'p-m1-pt-1')).pkey, 'pm1'); // o do modelo fica no modelo
  assert.deepEqual((await doc('delivfiles', `h-p${m1.id}-es`)).hidden, [1]); // o que ela escondeu, também
  assert.ok(await doc('delivfiles', 'h-pm1-es')); // sem mexer no modelo

  // o cliente que pagou o produto antigo continua recebendo o PDF dela
  await espelharTodas(repo);
  const link = await pedir('GET', `/api/prototipo/arquivos/${daBia}/link`, { token: cliente });
  assert.equal(link.s, 200);
  assert.match(link.j.url, /ass=/);
  // e agora a Bia mexe nos arquivos do produto dela
  assert.equal((await pedir('PUT', '/api/prototipo/docs/delivfiles/p-bia-pt-1', { corpo: json({ pkey: `p${m1.id}`, lg: 'pt', asset: daBia, name: 'novo nome.pdf' }), token: bia })).s, 200);

  // rodar de novo não muda nada
  const r2 = await separarProdutosDasLojas(repo);
  assert.equal(r2.produtos, 0);
});
