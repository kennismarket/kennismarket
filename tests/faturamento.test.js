// Etapa 6: faturamento da conta (soma de todas as lojas) e de cada loja, com repasse e débitos,
// e o dono marcando débitos como quitados ou perdoados. Banco em memória.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';

let repo, base, servidor;

before(async () => {
  const { criarApp } = await import('../server/app.js');
  repo = criarRepoMemoria();
  const t = repo.tabelas;
  t.usuarios = {
    'tok-ana': { id: 'u-ana', email: 'ana@x.com', nome: 'Ana', papel: 'vendedor' },
    'tok-bia': { id: 'u-bia', email: 'bia@x.com', nome: 'Bia', papel: 'vendedor' },
    'tok-dono': { id: 'u-dono', email: 'lucas@x.com', nome: 'Lucas', papel: 'dono' },
  };
  t.contas = {
    'u-ana': { id: 'u-ana', email: 'ana@x.com', nome: 'Ana', usuario: 'ana', papel: 'vendedor' },
    'u-bia': { id: 'u-bia', email: 'bia@x.com', nome: 'Bia', usuario: 'bia', papel: 'vendedor' },
  };
  // a Ana tem duas lojas (o faturamento da conta soma as duas)
  t.lojas = {
    l1: { id: 'l1', vendedor_id: 'u-ana', nome: 'Loja Um', prototipo_id: 1, porcentagem_vendedor: 50, publicada: true, banida: false },
    l2: { id: 'l2', vendedor_id: 'u-ana', nome: 'Loja Dois', prototipo_id: 2, porcentagem_vendedor: 60, publicada: true, banida: false },
    l3: { id: 'l3', vendedor_id: 'u-bia', nome: 'Loja da Bia', prototipo_id: 3, porcentagem_vendedor: 50, publicada: true, banida: false },
  };
  t.produtos = {
    p1: { id: 'p1', loja_id: 'l1', titulo: 'Mentoria' }, p2: { id: 'p2', loja_id: 'l2', titulo: 'E-book' }, p3: { id: 'p3', loja_id: 'l3', titulo: 'Site' },
  };
  const ped = (id, loja, produto, status, repasse, centavos, parte, dia) => {
    t.pedidos[id] = { id, loja_id: loja, produto_id: produto, cliente_id: 'c', status, repasse_status: repasse, valor_kn: centavos / 600,
      valor_centavos: centavos, vendedor_centavos: parte, criado_em: `2026-11-0${dia}T10:00:00Z` };
  };
  ped('a1', 'l1', 'p1', 'concluido', 'repassado', 60000, 30000, 1);
  ped('a2', 'l1', 'p1', 'pago', 'processando', 12000, 6000, 2);
  ped('a3', 'l2', 'p2', 'entregue', 'falhou', 30000, 18000, 3); // o banco não repassou: a receber
  ped('a4', 'l2', 'p2', 'reembolsado', 'repassado', 6000, 3600, 4); // recebeu, depois reembolso total
  ped('b1', 'l3', 'p3', 'pago', 'repassado', 6000, 3000, 1);
  t.debitos = {
    d1: { id: 'd1', loja_id: 'l2', pedido_id: 'a4', reembolso_id: 'r1', valor_centavos: 3600, situacao: 'aberto', criado_em: '2026-11-04T10:00:00Z' },
  };
  servidor = criarApp({ repo, limites: { desligados: true } }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
});
after(() => servidor.close());

async function api(metodo, caminho, corpo, token) {
  const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { s: r.status, j: await r.json().catch(() => null) };
}

test('faturamento da conta soma todas as lojas; cada loja tem o seu', async () => {
  const { j } = await api('GET', '/api/loja/vendas', null, 'tok-ana');
  // conta: 3 vendas válidas (a4 foi reembolsada), total R$ 1.020,00, parte da Ana R$ 540,00
  assert.deepEqual([j.vendas, j.reembolsadas, j.totalCentavos, j.vendedorCentavos], [3, 1, 102000, 54000]);
  // repasse: recebido a1 + a4 (ela recebeu antes do reembolso), processando a2, a receber a3
  assert.deepEqual([j.recebidoCentavos, j.processandoCentavos, j.aReceberCentavos], [33600, 6000, 18000]);
  assert.equal(j.debitoAbertoCentavos, 3600);
  assert.equal(j.saldoCentavos, 33600 + 18000 - 3600);
  assert.deepEqual(j.debitos.map((d) => [d.valorCentavos, d.situacao, d.produto]), [[3600, 'aberto', 'E-book']]);
  assert.deepEqual(new Set(j.lista.map((v) => v.loja)), new Set(['Loja Um', 'Loja Dois']));
  assert.ok(!j.lista.some((v) => v.id === 'b1')); // venda de outra conta não entra

  const [um, dois] = j.lojas;
  assert.deepEqual([um.nome, um.prototipoId, um.vendas, um.totalCentavos, um.recebidoCentavos, um.debitoAbertoCentavos, um.saldoCentavos],
    ['Loja Um', 1, 2, 72000, 30000, 0, 30000]);
  assert.deepEqual([dois.nome, dois.porcentagem, dois.vendas, dois.aReceberCentavos, dois.debitoAbertoCentavos, dois.saldoCentavos],
    ['Loja Dois', 60, 1, 18000, 3600, 3600 + 18000 - 3600]);
  assert.equal(dois.debitos.length, 1);
});

test('dono: vê o faturamento de cada vendedor e marca o débito como quitado (sai do saldo)', async () => {
  const vend = (await api('GET', '/api/admin/vendedores?vendas=1', null, 'tok-dono')).j.vendedores;
  const ana = vend.find((v) => v.usuario === 'ana');
  assert.deepEqual(ana.lojas.map((l) => l.nome), ['Loja Um', 'Loja Dois']);
  assert.deepEqual([ana.aReceberCentavos, ana.debitoAbertoCentavos], [18000, 3600]);
  assert.equal(vend.find((v) => v.usuario === 'bia').debitoAbertoCentavos, 0);

  assert.equal((await api('POST', '/api/admin/debitos/d1', { situacao: 'quitado' }, 'tok-ana')).s, 403);
  assert.equal((await api('POST', '/api/admin/debitos/d1', { situacao: 'pago' }, 'tok-dono')).s, 400);
  assert.equal((await api('POST', '/api/admin/debitos/nao-existe', { situacao: 'quitado' }, 'tok-dono')).s, 404);
  const ok = await api('POST', '/api/admin/debitos/d1', { situacao: 'quitado', observacao: 'Pix recebido em 05/11' }, 'tok-dono');
  assert.equal(ok.s, 200);
  assert.equal(ok.j.situacao, 'quitado');
  assert.ok(ok.j.resolvido_em);
  const j = (await api('GET', '/api/loja/vendas', null, 'tok-ana')).j;
  assert.equal(j.debitoAbertoCentavos, 0);
  assert.equal(j.debitos[0].situacao, 'quitado');
  // voltar para "em aberto" desfaz
  await api('POST', '/api/admin/debitos/d1', { situacao: 'aberto' }, 'tok-dono');
  assert.equal(repo.tabelas.debitos.d1.resolvido_em, null);
  assert.equal((await api('GET', '/api/loja/vendas', null, 'tok-ana')).j.debitoAbertoCentavos, 3600);
});
