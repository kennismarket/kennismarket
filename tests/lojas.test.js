// Etapa 2: lojas seguras (lojas, arquivos de entrega e envios no formato do protótipo).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';

let repo, base, servidor, dono, cliente;

before(async () => {
  const { criarApp } = await import('../server/app.js');
  repo = criarRepoMemoria();
  servidor = criarApp({ repo, limites: { desligados: true } }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
  await repo.criarConta({ email: 'dono@ex.com', senha: 'segredo123', nome: 'Dono', usuario: 'dono_site', papel: 'dono' });
  dono = (await entrar('dono@ex.com')).sessao.access_token;
  cliente = (await post('/api/contas/cadastro', { nome: 'Cli Ente', usuario: 'cliente1', senha: 'segredo123' })).sessao.access_token;
});
after(() => servidor.close());

async function post(caminho, corpo, token) {
  const r = await fetch(base + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(corpo) });
  return r.json();
}
const entrar = (login) => post('/api/contas/entrar', { login, senha: 'segredo123' });
async function vendedor(token, usuario) {
  await repo.salvarDocPrototipo('stores', `inv-${token}`, { invite: { token, email: `${usuario}@ex.com`, exp: Date.now() + 864e5, used: false } });
  const r = await post('/api/contas/vendedor/criar', { token, usuario, senha: 'segredo123' });
  return { id: r.perfil.id, t: r.sessao.access_token };
}
const gravar = async (metodo, caminho, dados, token) => {
  const r = await fetch(`${base}/api/prototipo/docs/${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: dados ? JSON.stringify({ dados }) : undefined,
  });
  return r.status;
};
const doc = async (c, id) => (await repo.listarDocsPrototipo(c)).find((d) => d.id === id)?.dados;
const loja = (id, extra = {}) => ({ store: { id, n: `Loja ${id}`, prods: [{ id: `x${id}`, name: ['P'], price: 10 }], ...extra }, ts: 1 });

test('vendedor cria a própria loja (uma só), edita só a dele, e não muda nota, vendas, selo nem porcentagem', async () => {
  const ana = await vendedor('anatok1', 'ana_v');
  const bia = await vendedor('biatok1', 'bia_v');
  assert.equal(await gravar('PUT', 'stores/s5001', loja(5001), null), 401);
  assert.equal(await gravar('PUT', 'stores/s5001', loja(5001), cliente), 403);

  // cria: fica dela; a porcentagem que ela mandou é ignorada
  assert.equal(await gravar('PUT', 'stores/s5001', loja(5001, { split: 90, rating: 5 }), ana.t), 200);
  const d = await doc('stores', 's5001');
  assert.equal(d.contaDona, ana.id);
  assert.equal(d.store.split, undefined);
  // segunda loja: não
  assert.equal(await gravar('PUT', 'stores/s5002', loja(5002), ana.t), 409);
  // id do documento tem que bater com o da loja
  assert.equal(await gravar('PUT', 'stores/s5003', loja(9999), bia.t), 400);

  // edita a dela: nota, vendas, selo e porcentagem continuam os de antes
  assert.equal(await gravar('PUT', 'stores/s5001', loja(5001, { n: 'Nome novo', rating: 1, sales: 999, ver: true, split: 80 }), ana.t), 200);
  const e = (await doc('stores', 's5001')).store;
  assert.equal(e.n, 'Nome novo');
  assert.equal(e.rating, 5); // a nota da criação (versão de testes) fica
  assert.equal(e.sales, undefined);
  assert.equal(e.ver, undefined);
  assert.equal(e.split, undefined);

  // outra vendedora não mexe nela
  assert.equal(await gravar('PUT', 'stores/s5001', loja(5001), bia.t), 403);
  assert.equal(await gravar('DELETE', 'stores/s5001', null, bia.t), 403);
  // lojas do dono do site (sem dona): vendedor não mexe
  assert.equal(await gravar('PUT', 'stores/s5100', loja(5100), dono), 200);
  assert.equal(await gravar('PUT', 'stores/s5100', loja(5100), bia.t), 403);
});

test('dono do site: edita qualquer loja e define a porcentagem do vendedor (10% a 90%)', async () => {
  assert.equal(await gravar('PUT', 'stores/s5001', loja(5001, { split: 95 }), dono), 400);
  assert.equal(await gravar('PUT', 'stores/s5001', loja(5001, { split: 5 }), dono), 400);
  assert.equal(await gravar('PUT', 'stores/s5001', loja(5001, { split: 70, ver: true, rating: 4.8 }), dono), 200);
  const d = await doc('stores', 's5001');
  assert.equal(d.store.split, 70);
  assert.ok(d.contaDona); // continua da vendedora
});

test('loja antiga: a dona vem do documento do vendedor (acc.storeId)', async () => {
  const cris = await vendedor('cristok1', 'cris_v');
  await repo.salvarDocPrototipo('stores', 's5200', loja(5200));
  const acc = (await doc('sellers', 'acc-cristok1')).acc;
  await repo.salvarDocPrototipo('sellers', 'acc-cristok1', { acc: { ...acc, storeId: 5200 } });
  assert.equal(await gravar('PUT', 'stores/s5200', loja(5200, { n: 'Editada' }), cris.t), 200);
  assert.equal((await doc('stores', 's5200')).contaDona, cris.id);
});

test('documento do vendedor: só ele mesmo, sem trocar a conta nem o usuário', async () => {
  const dani = await vendedor('danitok1', 'dani_v');
  const outro = await vendedor('outrotok', 'outro_v');
  const acc = (await doc('sellers', 'acc-danitok1')).acc;
  assert.equal(await gravar('PUT', 'sellers/acc-danitok1', { acc: { ...acc, storeId: 1 } }, outro.t), 403);
  assert.equal(await gravar('PUT', 'sellers/acc-danitok1', { acc: { ...acc, storeId: 1, userId: outro.id, username: 'hack' } }, dani.t), 200);
  const novo = (await doc('sellers', 'acc-danitok1')).acc;
  assert.deepEqual([novo.userId, novo.username, novo.storeId], [dani.id, 'dani_v', 1]);
});

test('arquivos de entrega: só o vendedor da loja do produto (ou o dono)', async () => {
  const eva = await vendedor('evatok1', 'eva_v');
  const fred = await vendedor('fredtok1', 'fred_v');
  assert.equal(await gravar('PUT', 'stores/s5300', loja(5300), eva.t), 200);
  const arq = { pkey: 'px5300', lg: 'pt', asset: 'a'.repeat(32), name: 'guia.pdf' };
  assert.equal(await gravar('PUT', 'delivfiles/p-1-pt-1', arq, null), 401);
  assert.equal(await gravar('PUT', 'delivfiles/p-1-pt-1', arq, fred.t), 403);
  assert.equal(await gravar('PUT', 'delivfiles/p-1-pt-1', arq, eva.t), 200);
  // lista de ocultos do produto (h-<pkey>-<idioma>)
  assert.equal(await gravar('PUT', 'delivfiles/h-px5300-pt', { hidden: [] }, eva.t), 200);
  // não dá para "roubar" o documento de outra loja trocando o pkey
  assert.equal(await gravar('PUT', 'delivfiles/p-1-pt-1', { ...arq, pkey: 'pxoutra' }, fred.t), 403);
  assert.equal(await gravar('DELETE', 'delivfiles/p-1-pt-1', null, fred.t), 403);
  assert.equal(await gravar('DELETE', 'delivfiles/p-1-pt-1', null, eva.t), 200);
  // produto que não é de nenhuma loja do banco: só o dono
  assert.equal(await gravar('PUT', 'delivfiles/pf-ka-x-en', { pkey: 'pf-ka-x', asset: 'b'.repeat(32) }, eva.t), 403);
  assert.equal(await gravar('PUT', 'delivfiles/pf-ka-x-en', { pkey: 'pf-ka-x', asset: 'b'.repeat(32) }, dono), 200);
});

test('enviar arquivo: só vendedor ou dono; apagar, só quem enviou (ou o dono)', async () => {
  const gil = await vendedor('giltok1', 'gil_v');
  const hal = await vendedor('haltok1', 'hal_v');
  const enviar = async (token) => {
    const r = await fetch(`${base}/api/prototipo/arquivos`, { method: 'POST', headers: { 'Content-Type': 'application/pdf', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: '%PDF-1.4 x' });
    return { s: r.status, j: await r.json() };
  };
  const apagar = async (id, token) => (await fetch(`${base}/api/prototipo/arquivos/${id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} })).status;
  assert.equal((await enviar(null)).s, 401);
  assert.equal((await enviar(cliente)).s, 403);
  const up = await enviar(gil.t);
  assert.equal(up.s, 201);
  assert.equal(await apagar(up.j.id, hal.t), 403);
  assert.equal(await apagar(up.j.id, gil.t), 200);
  const up2 = await enviar(gil.t);
  assert.equal(await apagar(up2.j.id, dono), 200);
});

test('banir o vendedor tira a loja do catálogo e trava a edição; desbanir devolve', async () => {
  const ivo = await vendedor('ivotok1', 'ivo_v');
  assert.equal(await gravar('PUT', 'stores/s5400', loja(5400, { pub: true }), ivo.t), 200);
  const banir = (b) => fetch(`${base}/api/admin/contas/${ivo.id}/banir`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dono}` }, body: JSON.stringify({ banir: b }) }).then((r) => r.json());
  const r = await banir(true);
  assert.deepEqual(r.lojas, [5400]);
  let d = await doc('stores', 's5400');
  assert.equal(d.banida, true);
  assert.equal(d.store.pub, false);
  // o dono editando a loja banida não a devolve ao catálogo
  assert.equal(await gravar('PUT', 'stores/s5400', loja(5400, { pub: true }), dono), 200);
  assert.equal((await doc('stores', 's5400')).store.pub, false);

  await banir(false);
  d = await doc('stores', 's5400');
  assert.equal(d.banida, false);
  assert.equal(d.store.pub, true);
  // de volta, o vendedor edita normalmente
  const t = (await post('/api/contas/vendedor/entrar', { token: 'ivotok1', usuario: 'ivo_v', senha: 'segredo123' })).sessao.access_token;
  assert.equal(await gravar('PUT', 'stores/s5400', loja(5400, { n: 'Volta' }), t), 200);
});

test('loja banida: mesmo com login válido, o vendedor não edita', async () => {
  const jo = await vendedor('jotok1', 'jo_v');
  assert.equal(await gravar('PUT', 'stores/s5500', loja(5500), jo.t), 200);
  const d = await doc('stores', 's5500');
  await repo.salvarDocPrototipo('stores', 's5500', { ...d, banida: true }); // banida direto (ex.: pelo SQL)
  assert.equal(await gravar('PUT', 'stores/s5500', loja(5500), jo.t), 403);
  assert.equal(await gravar('PUT', 'delivfiles/p-9-pt-1', { pkey: 'px5500', asset: 'c'.repeat(32) }, jo.t), 403);
});

test('cópia da loja no documento do vendedor: sem inventar nota e sem apontar para loja alheia', async () => {
  const kim = await vendedor('kimtok1', 'kim_v');
  const acc = (await doc('sellers', 'acc-kimtok1')).acc;
  // loja dela, criada pelo convite: só no documento do vendedor
  assert.equal(await gravar('PUT', 'sellers/acc-kimtok1', { acc: { ...acc, storeId: 5600, store: { id: 5600, n: 'Kim', rating: 5, ver: true, sales: 99 } } }, kim.t), 200);
  const s1 = (await doc('sellers', 'acc-kimtok1')).acc.store;
  assert.deepEqual([s1.rating, s1.ver, s1.sales], [undefined, undefined, undefined]);
  // depois ela grava a loja na coleção de lojas (o editor do protótipo faz isso): é a mesma loja dela
  assert.equal(await gravar('PUT', 'stores/s5600', loja(5600), kim.t), 200);
  // apontar a conta para uma loja do dono do site: não
  assert.equal(await gravar('PUT', 'stores/s5700', loja(5700), dono), 200);
  assert.equal(await gravar('PUT', 'sellers/acc-kimtok1', { acc: { ...acc, storeId: 5700, store: { id: 5700 } } }, kim.t), 403);

  // banir esconde também a cópia e trava o documento
  const r = await fetch(`${base}/api/admin/contas/${kim.id}/banir`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dono}` }, body: JSON.stringify({ banir: true }) }).then((x) => x.json());
  assert.deepEqual(r.lojas, [5600]);
  const a = (await doc('sellers', 'acc-kimtok1')).acc;
  assert.equal(a.banida, true);
  assert.equal(a.store.pub, false);
});

// ---------- cópia nas tabelas reais (lojas e produtos) e porcentagem no pedido ----------
const lojaReal = (pid) => Object.values(repo.tabelas.lojas).find((l) => l.prototipo_id === pid);
const produtosReais = (pid) => Object.values(repo.tabelas.produtos).filter((p) => p.loja_id === lojaReal(pid)?.id);
const lojaCompleta = (id, extra = {}) => ({ store: { id, n: `Loja ${id}`, c: 'mentoria', desc: ['Desc en', 'Desc es', 'Descrição pt', 'Desc nl'],
  prods: [{ id: `a${id}`, name: ['Mentoring', 'Mentoría', 'Mentoria', 'Mentoring'], desc: ['', '', '1 hora', ''], price: 100 },
    { id: `b${id}`, name: ['Ebook', 'Ebook', 'E-book', 'Ebook'], price: 19 }], ...extra }, ts: 1 });

test('cópia: a loja do vendedor vai para as tabelas, com produtos em português e a dona certa', async () => {
  const lia = await vendedor('liatok1', 'lia_v');
  assert.equal(await gravar('PUT', 'stores/s6001', lojaCompleta(6001), lia.t), 200);
  const l = lojaReal(6001);
  assert.equal(l.vendedor_id, lia.id);
  assert.equal(l.nome, 'Loja 6001');
  assert.equal(l.descricao, 'Descrição pt');
  assert.equal(l.publicada, true);
  assert.equal(l.porcentagem_vendedor, 50);
  const ps = produtosReais(6001);
  assert.deepEqual(ps.map((p) => [p.prototipo_id, p.titulo, p.preco_kn, p.ativo]).sort(), [['a6001', 'Mentoria', 100, true], ['b6001', 'E-book', 19, true]]);

  // tirou um produto: ele fica inativo; o dono define 70% e a cópia acompanha
  const sem = lojaCompleta(6001); sem.store.prods = sem.store.prods.slice(0, 1);
  assert.equal(await gravar('PUT', 'stores/s6001', sem, lia.t), 200);
  assert.equal(produtosReais(6001).find((p) => p.prototipo_id === 'b6001').ativo, false);
  assert.equal(await gravar('PUT', 'stores/s6001', lojaCompleta(6001, { split: 70 }), dono), 200);
  assert.equal(lojaReal(6001).porcentagem_vendedor, 70);

  // escondida do catálogo: não publicada
  assert.equal(await gravar('PUT', 'stores/s6001', lojaCompleta(6001, { split: 70, pub: false }), dono), 200);
  assert.equal(lojaReal(6001).publicada, false);
  assert.equal(await gravar('PUT', 'stores/s6001', lojaCompleta(6001, { split: 70 }), dono), 200);
});

test('cópia: loja que existe só no documento do vendedor, loja apagada e loja banida', async () => {
  const max = await vendedor('maxtok1', 'max_v');
  const acc = (await doc('sellers', 'acc-maxtok1')).acc;
  assert.equal(await gravar('PUT', 'sellers/acc-maxtok1', { acc: { ...acc, storeId: 6100, store: lojaCompleta(6100).store } }, max.t), 200);
  assert.equal(lojaReal(6100).vendedor_id, max.id);
  // ganhou documento de loja e depois foi apagado: continua pela cópia do vendedor
  assert.equal(await gravar('PUT', 'stores/s6100', lojaCompleta(6100), max.t), 200);
  assert.equal(await gravar('DELETE', 'stores/s6100', null, max.t), 200);
  assert.equal(lojaReal(6100).publicada, true);
  // banido: sai do ar nas tabelas também
  await fetch(`${base}/api/admin/contas/${max.id}/banir`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dono}` }, body: JSON.stringify({ banir: true }) });
  assert.deepEqual([lojaReal(6100).publicada, lojaReal(6100).banida], [false, true]);
  // loja do dono apagada de vez: sai do ar, os produtos ficam inativos
  assert.equal(await gravar('PUT', 'stores/s6200', lojaCompleta(6200), dono), 200);
  assert.equal(lojaReal(6200).vendedor_id, null);
  assert.equal(await gravar('DELETE', 'stores/s6200', null, dono), 200);
  assert.equal(lojaReal(6200).publicada, false);
  assert.ok(produtosReais(6200).every((p) => !p.ativo));
});

test('copiar todas (painel do dono): pega lojas gravadas direto no banco', async () => {
  await repo.salvarDocPrototipo('stores', 's6300', lojaCompleta(6300));
  assert.equal(lojaReal(6300), undefined);
  const r = await fetch(`${base}/api/admin/lojas/copiar`, { method: 'POST', headers: { Authorization: `Bearer ${dono}` } }).then((x) => x.json());
  assert.ok(r.copiadas >= 1);
  assert.deepEqual(r.erros, []);
  assert.equal(lojaReal(6300).nome, 'Loja 6300');
  assert.equal((await fetch(`${base}/api/admin/lojas/copiar`, { method: 'POST', headers: { Authorization: `Bearer ${cliente}` } })).status, 403);
});

test('pedido: a divisão usa a porcentagem da loja, congelada no pedido', async () => {
  const nina = await vendedor('ninatok1', 'nina_v');
  assert.equal(await gravar('PUT', 'stores/s6400', lojaCompleta(6400), nina.t), 200);
  assert.equal(await gravar('PUT', 'stores/s6400', lojaCompleta(6400, { split: 70 }), dono), 200);
  // a vendedora diz como recebe (a loja dela agora existe nas tabelas)
  const rec = await fetch(`${base}/api/loja/recebimento`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nina.t}` },
    body: JSON.stringify({ nome: 'Nina Lima', cpfCnpj: '529.982.247-25', pix: { chave: 'nina@ex.com', tipo: 'email' } }) });
  assert.equal(rec.status, 200);
  await repo.salvarCotacoes([{ data: '2026-10-30', moeda: 'BRL', taxa: 6, fonte: 'bce' }]);
  const produto = produtosReais(6400).find((p) => p.prototipo_id === 'a6400'); // 100 KN
  const r = await fetch(`${base}/api/pedidos`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cliente}` },
    body: JSON.stringify({ produtoId: produto.id, formaPagamento: 'pix', cpfCnpj: '111.444.777-35' }) });
  assert.equal(r.status, 201);
  const pedido = repo.tabelas.pedidos[(await r.json()).id];
  assert.equal(pedido.valor_centavos, 60000); // 100 KN × R$ 6
  assert.equal(pedido.vendedor_centavos, 42000); // 70%
  assert.equal(pedido.plataforma_centavos, 18000);
  assert.equal(pedido.taxa_percentual, 30);
  // o dono muda a porcentagem depois: o pedido já feito não muda
  assert.equal(await gravar('PUT', 'stores/s6400', lojaCompleta(6400, { split: 40 }), dono), 200);
  assert.equal(repo.tabelas.pedidos[pedido.id].vendedor_centavos, 42000);
});
