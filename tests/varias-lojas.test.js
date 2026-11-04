// Várias lojas por conta (até 10): criar, limite, cópia nas tabelas, "Como você recebe" e
// pedidos por loja, e banir a conta tira todas as lojas do ar. Banco em memória.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';

let repo, base, servidor, dono, ana, bia;
const CPF = '52998224725';

before(async () => {
  const { criarApp } = await import('../server/app.js');
  repo = criarRepoMemoria();
  servidor = criarApp({ repo, limites: { desligados: true } }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
  await repo.criarConta({ email: 'dono@ex.com', senha: 'segredo123', nome: 'Dono', usuario: 'dono_vl', papel: 'dono' });
  dono = (await post('/api/contas/entrar', { login: 'dono@ex.com', senha: 'segredo123' })).j.sessao.access_token;
  ana = await vendedor('vltok1', 'ana_vl');
  bia = await vendedor('vltok2', 'bia_vl');
});
after(() => servidor.close());

async function req(metodo, caminho, corpo, token) {
  const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { s: r.status, j: await r.json().catch(() => null) };
}
const post = (c, corpo, t) => req('POST', c, corpo, t);
async function vendedor(token, usuario) {
  await repo.salvarDocPrototipo('stores', `inv-${token}`, { invite: { token, email: `${usuario}@ex.com`, exp: Date.now() + 864e5, used: false } });
  const r = (await post('/api/contas/vendedor/criar', { token, usuario, senha: 'segredo123' })).j;
  return { id: r.perfil.id, t: r.sessao.access_token };
}
const loja = (id) => ({ dados: { store: { id, n: `Loja ${id}`, c: 'mentoria', pub: true, prods: [{ id: `p${id}`, name: ['P', 'P', 'Produto', 'P'], price: 10 }] }, ts: 1 } });
const criar = (id, token) => req('PUT', `/api/prototipo/docs/stores/s${id}`, loja(id), token);
const lojaReal = (pid) => Object.values(repo.tabelas.lojas).find((l) => l.prototipo_id === pid);

test('uma conta cria até 10 lojas; a 11ª é recusada; todas ficam dela nas tabelas', async () => {
  for (let i = 1; i <= 10; i++) assert.equal((await criar(9000 + i, ana.t)).s, 200, `loja ${i}`);
  const onze = await criar(9011, ana.t);
  assert.equal(onze.s, 409);
  assert.match(onze.j.erro, /10 lojas/);
  for (let i = 1; i <= 10; i++) assert.equal(lojaReal(9000 + i).vendedor_id, ana.id);
  // outra conta tem o próprio limite
  assert.equal((await criar(9101, bia.t)).s, 200);
  // a lista "Suas lojas"
  const m = (await req('GET', '/api/loja/minhas', null, ana.t)).j;
  assert.equal(m.limite, 10);
  assert.deepEqual(m.lojas.map((l) => l.prototipoId), Array.from({ length: 10 }, (_, i) => 9001 + i));
  assert.equal(m.lojas[0].nome, 'Loja 9001');
  // apagou uma: abre espaço para outra
  assert.equal((await req('DELETE', '/api/prototipo/docs/stores/s9010', null, ana.t)).s, 200);
  assert.equal((await criar(9011, ana.t)).s, 200);
});

test('"Como você recebe" é por loja; a loja nova sugere os dados de outra loja da conta', async () => {
  const pix = { nome: 'Ana Souza', cpfCnpj: CPF, pix: { tipo: 'email', chave: 'ana@ex.com' } };
  assert.equal((await req('PUT', '/api/loja/recebimento?loja=9001', pix, ana.t)).s, 200);
  assert.equal((await req('GET', '/api/loja/recebimento?loja=9001', null, ana.t)).j.situacao, 'pronto');
  const nova = (await req('GET', '/api/loja/recebimento?loja=9002', null, ana.t)).j;
  assert.equal(nova.situacao, 'nao_cadastrado');
  assert.equal(nova.sugestao, true);
  assert.equal(nova.recebedor.pix.chave, 'ana@ex.com');
  // a 9002 ainda não vende de verdade (não confirmou), a 9001 sim
  const preco = async (pid) => (await req('GET', `/api/pedidos/preco?loja=${pid}&produto=p${pid}`, null, bia.t)).j;
  assert.equal((await preco(9002)).motivo, 'sem_recebimento');
  // loja de outra conta: não
  assert.equal((await req('GET', '/api/loja/recebimento?loja=9101', null, ana.t)).s, 404);
  assert.equal((await req('PUT', '/api/loja/recebimento?loja=9101', pix, ana.t)).s, 404);
});

test('pedidos e faturamento por loja', async () => {
  const l1 = lojaReal(9001), l2 = lojaReal(9002);
  const prod = (l) => Object.values(repo.tabelas.produtos).find((p) => p.loja_id === l.id);
  const ped = (id, l) => { repo.tabelas.pedidos[id] = { id, cliente_id: 'c', loja_id: l.id, produto_id: prod(l).id, status: 'pago', valor_kn: 10, valor_centavos: 6000, vendedor_centavos: 3000, repasse_status: 'repassado', criado_em: new Date().toISOString() }; };
  ped('x1', l1); ped('x2', l2); ped('x3', l2);
  const pedidos = async (pid) => (await req('GET', `/api/loja/pedidos?loja=${pid}`, null, ana.t)).j.pedidos.map((p) => p.id).sort();
  assert.deepEqual(await pedidos(9001), ['x1']);
  assert.deepEqual(await pedidos(9002), ['x2', 'x3']);
  assert.equal((await req('GET', '/api/loja/pedidos?loja=9101', null, ana.t)).s, 404);
  const v = (await req('GET', '/api/loja/vendas', null, ana.t)).j;
  assert.equal(v.vendas, 3);
  assert.deepEqual(v.lojas.filter((l) => l.vendas).map((l) => [l.prototipoId, l.vendas]), [[9001, 1], [9002, 2]]);
});

test('banir a conta tira todas as lojas dela do ar; desbanir devolve', async () => {
  const r = (await post(`/api/admin/contas/${ana.id}/banir`, { banir: true }, dono)).j;
  assert.equal(r.lojas.length, 10);
  assert.ok([9001, 9005, 9011].every((id) => r.lojas.includes(id)));
  assert.ok([9001, 9005, 9011].every((id) => lojaReal(id).banida && !lojaReal(id).publicada));
  assert.equal(lojaReal(9101).banida, false); // a da Bia não
  await post(`/api/admin/contas/${ana.id}/banir`, { banir: false }, dono);
  assert.ok([9001, 9011].every((id) => !lojaReal(id).banida && lojaReal(id).publicada));
});
