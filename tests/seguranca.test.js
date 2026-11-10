// Correção dos problemas críticos do relatório de segurança (10/11/2026):
// 1. convites e contas de vendedor à vista e convite regravável (tomada de conta de vendedor);
// 2. código colocado na página pelos campos da loja (cor, ano, nota, logo gerada).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';
import { limparLoja, docsVisiveis } from '../server/lib/visibilidade.js';

let repo, base, servidor, dono, cliente, vendedor;

const pedir = async (metodo, caminho, corpo, token) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const lista = async (c, token, extra = '') => (await pedir('GET', `/api/prototipo/colecoes/${c}?versao=${extra}`, null, token)).j.docs;

before(async () => {
  const { criarApp } = await import('../server/app.js');
  repo = criarRepoMemoria();
  servidor = criarApp({ repo, limites: { desligados: true } }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
  await repo.criarConta({ email: 'dono@ex.com', senha: 'segredo123', nome: 'Dono', usuario: 'dono_site', papel: 'dono' });
  dono = (await pedir('POST', '/api/contas/entrar', { login: 'dono@ex.com', senha: 'segredo123' })).j.sessao.access_token;
  cliente = (await pedir('POST', '/api/contas/cadastro', { nome: 'Cli Ente', usuario: 'cliente1', senha: 'segredo123' })).j.sessao.access_token;
  await repo.salvarDocPrototipo('stores', 'inv-vend1234', { invite: { token: 'vend1234', email: 'vendedor@ex.com', exp: Date.now() + 864e5, used: false } });
  await repo.salvarDocPrototipo('stores', 'inv-livre123', { invite: { token: 'livre123', email: 'novo@ex.com', exp: Date.now() + 864e5, used: false } });
  vendedor = (await pedir('POST', '/api/contas/vendedor/criar', { token: 'vend1234', usuario: 'vendedor_real', senha: 'senhaDoVendedor1' })).j.sessao.access_token;
  await pedir('PUT', '/api/prototipo/docs/stores/s5001', { dados: { store: { id: 5001, n: 'Loja Real', prods: [{ id: 'p1', name: ['P'], price: 10 }] }, ts: 1 } }, vendedor);
  // conta antiga do protótipo, ainda não passada para o Supabase (hash fraco no documento)
  await repo.salvarDocPrototipo('sellers', 'acc-antigo99', { acc: { token: 'antigo99', username: 'antigo', salt: 'abc', hash: 'f'.repeat(64), store: { id: 6001, n: 'Loja Antiga' } } });
});
after(() => servidor.close());

test('sem login: não aparecem convites, e-mails, códigos de link, usuários nem hashes', async () => {
  const lojas = await lista('stores');
  const vendedores = await lista('sellers');
  const tudo = JSON.stringify([lojas, vendedores]);
  assert.equal(lojas.some((d) => d.id.startsWith('inv-')), false);
  for (const segredo of ['vend1234', 'livre123', 'antigo99', 'vendedor@ex.com', 'novo@ex.com', 'vendedor_real', 'antigo', 'f'.repeat(64)]) {
    assert.equal(tudo.includes(segredo), false, segredo);
  }
  // a vitrine continua: a loja antiga que só existe no documento do vendedor aparece, com apelido
  const antiga = vendedores.find((d) => d.dados.acc.store?.id === 6001);
  assert.ok(antiga);
  assert.match(antiga.id, /^acc-[0-9a-f]{16}$/);
  assert.deepEqual(Object.keys(antiga.dados.acc).sort(), ['store', 'storeId', 'token']);
});

test('cliente logado também não vê convites nem contas dos outros', async () => {
  const tudo = JSON.stringify([await lista('stores', cliente), await lista('sellers', cliente)]);
  for (const segredo of ['vend1234', 'livre123', 'vendedor@ex.com', 'vendedor_real']) assert.equal(tudo.includes(segredo), false, segredo);
});

test('quem abre o link de convite vê só aquele convite e a conta dele (sem o hash)', async () => {
  const lojas = await lista('stores', null, '&convite=livre123');
  assert.deepEqual(lojas.filter((d) => d.id.startsWith('inv-')).map((d) => d.id), ['inv-livre123']);
  const vendedores = await lista('sellers', null, '&convite=antigo99');
  const acc = vendedores.find((d) => d.id === 'acc-antigo99').dados.acc;
  assert.equal(acc.username, 'antigo');
  assert.equal(acc.hash, true); // a tela só precisa saber que existe senha
  assert.equal(acc.salt, undefined);
});

test('o vendedor vê a própria conta; o dono vê tudo', async () => {
  const doVendedor = await lista('sellers', vendedor);
  assert.equal(doVendedor.find((d) => d.id === 'acc-vend1234')?.dados.acc.username, 'vendedor_real');
  const doDono = JSON.stringify([await lista('stores', dono), await lista('sellers', dono)]);
  for (const v of ['inv-vend1234', 'inv-livre123', 'vendedor@ex.com', 'acc-antigo99']) assert.ok(doDono.includes(v), v);
});

test('cada pessoa recebe a sua versão da lista (trocar de conta busca de novo)', async () => {
  const anonimo = (await pedir('GET', '/api/prototipo/colecoes/stores')).j.versao;
  const doDono = (await pedir('GET', '/api/prototipo/colecoes/stores', null, dono)).j.versao;
  assert.notEqual(anonimo, doDono);
  const r = await pedir('GET', `/api/prototipo/colecoes/stores?versao=${encodeURIComponent(anonimo)}`, null, dono);
  assert.equal(r.j.inalterado, undefined); // o dono não fica com a lista do visitante
  assert.ok(r.j.docs.some((d) => d.id.startsWith('inv-')));
});

test('o ataque do relatório não funciona mais: cliente não regrava o convite e não troca a senha do vendedor', async () => {
  const regravar = await pedir('PUT', '/api/prototipo/docs/stores/inv-vend1234', { dados: { invite: { token: 'vend1234', used: false, from: 'x', exp: Date.now() + 864e5 } } }, cliente);
  assert.equal(regravar.s, 403);
  const redefinir = await pedir('POST', '/api/contas/vendedor/redefinir', { token: 'vend1234', senha: 'senhaDoAtacante1' });
  assert.equal(redefinir.s, 410);
  assert.equal((await pedir('POST', '/api/contas/entrar', { login: 'vendedor_real', senha: 'senhaDoAtacante1' })).s, 401);
  assert.equal((await pedir('POST', '/api/contas/entrar', { login: 'vendedor_real', senha: 'senhaDoVendedor1' })).s, 200);
  // o vendedor também não mexe em convites
  assert.equal((await pedir('PUT', '/api/prototipo/docs/stores/inv-vend1234', { dados: { invite: { token: 'vend1234', used: true } } }, vendedor)).s, 403);
});

const VENENO = '"><img src=x onerror=alert(1)>';

test('loja gravada pelo vendedor: campos com código são corrigidos ou tirados', async () => {
  const store = {
    id: 5001, n: 'Loja Real', c: 'mentoria', color: `red" onmouseover="alert(1)`, since: VENENO, rating: VENENO,
    glogo: { v: 3, M: 'spark', P: 2, L: 1, F: 0, u: `a${VENENO}` }, logo: `x${VENENO}`,
    prods: [{ id: 'p1', name: ['P'], price: VENENO, deliv: 'x' }],
  };
  assert.equal((await pedir('PUT', '/api/prototipo/docs/stores/s5001', { dados: { store, ts: 2 } }, vendedor)).s, 200);
  const salvo = (await repo.listarDocsPrototipo('stores')).find((d) => d.id === 's5001').dados.store;
  assert.equal(JSON.stringify(salvo).includes('onerror'), false);
  assert.equal(JSON.stringify(salvo).includes('onmouseover'), false);
  assert.equal(salvo.color, undefined);
  assert.equal(salvo.since, undefined);
  assert.equal(salvo.logo, undefined);
  assert.deepEqual(salvo.glogo, { v: 3, M: 'spark', P: 2, L: 1, F: 0, u: 'x' });
  assert.equal(salvo.prods[0].price, 0);
  assert.deepEqual(salvo.prods[0].deliv, []);
  assert.equal(salvo.n, 'Loja Real');
});

test('loja que já estava gravada com código também sai limpa para o navegador', async () => {
  await repo.salvarDocPrototipo('stores', 's7001', { store: { id: 7001, n: ['nome em lista'], c: 'nao-existe', color: `#fff" onclick="x`, since: 2020, glogo: { v: 2, u: VENENO, P: 'abc' } } });
  const loja = (await lista('stores')).find((d) => d.id === 's7001').dados.store;
  assert.equal(JSON.stringify(loja).includes('onerror'), false);
  assert.equal(loja.n, 'nome em lista');
  assert.equal(loja.c, 'mentoria');
  assert.equal(loja.color, undefined);
  assert.equal(loja.since, 2020);
  assert.deepEqual(loja.glogo, { v: 2, P: 0, u: 'x' });
});

test('limparLoja: valores certos continuam iguais e nada é inventado', () => {
  const certa = { id: 1, n: 'A', o: 'B', c: 'design', color: '#102A43', since: 2024, sales: 3, rating: 4.8, reviews: 2, ver: true, h: ['a', 'b'], desc: ['x'],
    logo: 'a'.repeat(32), glogo: { v: 3, M: 'gem', P: 4, L: 2, F: 1, u: 'ab12cd' }, prods: [{ id: 'x2advcd6', type: 'custom', name: ['N'], desc: [''], price: 20, deliv: [] }], tiers: [[['N'], [''], 20, 1]], src: 300001, lockLoc: true };
  assert.deepEqual(limparLoja(certa), certa);
  assert.deepEqual(limparLoja({ id: 1001, n: 'Loja' }), { id: 1001, n: 'Loja' });
});

test('docsVisiveis: coleção de arquivos de entrega continua igual', () => {
  const docs = [{ id: 'h-pp1-pt', dados: { pkey: 'pp1', asset: 'a'.repeat(32) } }];
  assert.deepEqual(docsVisiveis('delivfiles', docs, { apelido: (t) => t }), docs);
});
