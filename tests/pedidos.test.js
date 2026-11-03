// Etapa 4: pedidos depois do pagamento (listas do cliente e do vendedor, confirmação automática
// em 7 dias, casos de suporte do dono com reembolso total ou parcial) e a trava dos PDFs só nas
// lojas de vendedores reais. Banco em memória e pagamento simulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';

let repo, base, servidor;
const DIA = 864e5;
const atras = (dias) => new Date(Date.now() - dias * DIA).toISOString();

before(async () => {
  Object.assign(process.env, { TAREFAS_TOKEN: 'tarefas' });
  const { criarApp } = await import('../server/app.js');
  const { criarPagamentos } = await import('../server/pagamentos/index.js');
  repo = criarRepoMemoria();
  const t = repo.tabelas;
  t.usuarios = {
    'tok-cli': { id: 'u-cli', email: 'joao@x.com', nome: 'João Silva', papel: 'cliente' },
    'tok-cli2': { id: 'u-cli2', email: 'bia@x.com', nome: 'Bia', papel: 'cliente' },
    'tok-vend': { id: 'u-vend', email: 'ana@x.com', nome: 'Ana', papel: 'vendedor' },
    'tok-dono': { id: 'u-dono', email: 'lucas@x.com', nome: 'Lucas', papel: 'dono' },
  };
  t.lojas = { loja1: { id: 'loja1', vendedor_id: 'u-vend', nome: 'Loja da Ana', prototipo_id: 5001, publicada: true, banida: false, porcentagem_vendedor: 60 } };
  t.produtos = { prod1: { id: 'prod1', loja_id: 'loja1', titulo: 'Mentoria', prototipo_id: 'm1', preco_kn: 100, ativo: true } };
  const pedido = (id, cliente, status, extra = {}) => ({
    id, cliente_id: cliente, loja_id: 'loja1', produto_id: 'prod1', status, valor_kn: 100, valor_centavos: 60000,
    taxa_percentual: 40, vendedor_centavos: 36000, plataforma_centavos: 24000, provedor: 'simulado', cobranca_id: `cob-${id}`,
    criado_em: atras(10), pago_em: atras(10), ...extra,
  });
  t.pedidos = {
    p1: pedido('p1', 'u-cli', 'pago'),
    p2: pedido('p2', 'u-cli', 'entregue', { entregue_em: atras(8) }), // vira concluído sozinho
    p3: pedido('p3', 'u-cli', 'entregue', { entregue_em: atras(6) }), // ainda não
    p4: pedido('p4', 'u-cli2', 'pago'),
    p5: pedido('p5', 'u-cli', 'aguardando_pagamento'), // não aparece
  };
  const pagamentos = criarPagamentos({ provedor: 'simulado', cartaoAtivo: false, simulado: { segredo: 's' }, transfeera: { ambiente: 'sandbox' } });
  // cada pedido tem uma cobrança paga no simulador (para o reembolso poder devolver)
  for (const p of Object.values(t.pedidos)) {
    p.cobranca_id = (await pagamentos.criarCobranca({
      pedidoId: p.id, valorCentavos: p.valor_centavos, forma: 'pix', vencimento: '2030-01-01', pagador: { nome: 'João', email: 'joao@x.com' },
      divisao: { vendedor: { centavos: p.vendedor_centavos, recebedor: { nome: 'Ana', documento: '52998224725', pix: { chave: 'ana@x.com', tipo: 'email' } } },
        plataforma: { centavos: p.plataforma_centavos } },
    })).cobrancaId;
    if (p.status !== 'aguardando_pagamento') pagamentos.simulador.gerarAviso(p.cobranca_id, 'pago');
  }
  servidor = criarApp({ repo, pagamentos, limites: { desligados: true } }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
});
after(() => servidor.close());

async function api(metodo, caminho, corpo, token, extras = {}) {
  const headers = { 'Content-Type': 'application/json', ...extras };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  return { s: r.status, j: await r.json().catch(() => null) };
}

test('Meus pedidos: só os pedidos pagos do próprio cliente; entregue há mais de 7 dias vira concluído', async () => {
  assert.equal((await api('GET', '/api/pedidos')).s, 401);
  const r = await api('GET', '/api/pedidos', null, 'tok-cli');
  assert.equal(r.s, 200);
  const porId = Object.fromEntries(r.j.pedidos.map((p) => [p.id, p]));
  assert.deepEqual(Object.keys(porId).sort(), ['p1', 'p2', 'p3']);
  assert.equal(porId.p2.status, 'concluido');
  assert.equal(porId.p3.status, 'entregue');
  assert.ok(Date.parse(porId.p3.concluiSozinhoEm) > Date.now());
  assert.deepEqual(porId.p1.loja, { nome: 'Loja da Ana', prototipoId: 5001 });
  assert.deepEqual(porId.p1.produto, { titulo: 'Mentoria', prototipoId: 'm1' });
  assert.equal(porId.p1.cliente, undefined); // o cliente não precisa disso
  assert.equal(porId.p1.vendedorCentavos, undefined);
});

test('Minha loja → Pedidos: só o vendedor da loja, com o primeiro nome do cliente', async () => {
  const r = await api('GET', '/api/loja/pedidos', null, 'tok-vend');
  assert.equal(r.s, 200);
  assert.equal(r.j.pedidos.length, 4);
  const p1 = r.j.pedidos.find((p) => p.id === 'p1');
  assert.equal(p1.cliente, 'João');
  assert.equal(p1.vendedorCentavos, 36000);
  // quem não tem loja recebe lista vazia
  assert.deepEqual((await api('GET', '/api/loja/pedidos', null, 'tok-cli')).j, { loja: null, pedidos: [] });
});

test('entregar, confirmar e pedir reembolso respeitam quem pode e a ordem', async () => {
  assert.equal((await api('POST', '/api/pedidos/p1/entregue', null, 'tok-cli')).s, 404); // cliente não entrega
  assert.equal((await api('POST', '/api/pedidos/p1/recebido', null, 'tok-cli')).s, 409); // ainda não entregue
  assert.equal((await api('POST', '/api/pedidos/p1/entregue', null, 'tok-vend')).s, 200);
  assert.equal((await api('POST', '/api/pedidos/p1/entregue', null, 'tok-vend')).s, 409); // só uma vez
  assert.equal((await api('POST', '/api/pedidos/p1/recebido', null, 'tok-cli2')).s, 404); // pedido de outra pessoa
  assert.equal((await api('POST', '/api/pedidos/p1/recebido', null, 'tok-cli')).s, 200);
  assert.equal(repo.tabelas.pedidos.p1.status, 'concluido');
  // concluído ainda pode pedir reembolso
  assert.equal((await api('POST', '/api/pedidos/p1/reembolso', { motivo: '' }, 'tok-cli')).s, 400);
  assert.equal((await api('POST', '/api/pedidos/p1/reembolso', { motivo: 'Não é o que a loja mostrava' }, 'tok-cli')).s, 201);
  assert.equal((await api('POST', '/api/pedidos/p1/reembolso', { motivo: 'de novo' }, 'tok-cli')).s, 409);
  assert.equal(repo.tabelas.pedidos.p1.status, 'reembolso_solicitado');
});

test('Casos de suporte: só o dono; reembolso parcial anota o débito proporcional; negar volta como estava', async () => {
  assert.equal((await api('GET', '/api/admin/casos', null, 'tok-vend')).s, 403);
  await api('POST', '/api/pedidos/p4/reembolso', { motivo: 'Vendedor sumiu' }, 'tok-cli2');
  let casos = (await api('GET', '/api/admin/casos', null, 'tok-dono')).j;
  assert.equal(casos.abertos.length, 2);
  assert.equal(casos.diasConfirmacao, 7);
  const c1 = casos.abertos.find((c) => c.pedido.id === 'p1');
  const c4 = casos.abertos.find((c) => c.pedido.id === 'p4');
  assert.equal(c1.motivo, 'Não é o que a loja mostrava');
  assert.equal(c1.statusAnterior, 'concluido');
  assert.equal(c1.pedido.cliente, 'João Silva');
  assert.equal(c1.pedido.porcentagemVendedor, 60);
  assert.deepEqual(c1.pedido.loja, { nome: 'Loja da Ana', prototipoId: 5001 });

  // parcial: devolve R$ 300 de R$ 600 → o vendedor deve metade da parte dele (R$ 180)
  assert.equal((await api('POST', `/api/admin/reembolsos/${c1.id}`, { aprovar: true, valorCentavos: 70000 }, 'tok-dono')).s, 400); // mais que o pago
  const ok = await api('POST', `/api/admin/reembolsos/${c1.id}`, { aprovar: true, valorCentavos: 30000 }, 'tok-dono');
  assert.equal(ok.s, 200);
  assert.equal(ok.j.debito.valor_centavos, 18000);
  assert.equal(repo.tabelas.pedidos.p1.status, 'reembolsado');
  assert.equal((await api('POST', `/api/admin/reembolsos/${c1.id}`, { aprovar: false }, 'tok-dono')).s, 409); // já decidido

  assert.equal((await api('POST', `/api/admin/reembolsos/${c4.id}`, { aprovar: false }, 'tok-dono')).s, 200);
  assert.equal(repo.tabelas.pedidos.p4.status, 'pago');

  casos = (await api('GET', '/api/admin/casos', null, 'tok-dono')).j;
  assert.equal(casos.abertos.length, 0);
  assert.equal(casos.decididos.length, 2);
  assert.equal(casos.debitos.length, 1);
  assert.equal(casos.debitos[0].valorCentavos, 18000);
  assert.equal(casos.debitos[0].pedido.loja.nome, 'Loja da Ana');

  // o cliente vê o reembolso aprovado (e o valor devolvido) em Meus pedidos
  const p1 = (await api('GET', '/api/pedidos', null, 'tok-cli')).j.pedidos.find((p) => p.id === 'p1');
  assert.equal(p1.status, 'reembolsado');
  assert.deepEqual({ ...p1.reembolso, decididoEm: null }, { status: 'aprovado', valorCentavos: 30000, decididoEm: null });
  const p4 = (await api('GET', '/api/pedidos', null, 'tok-cli2')).j.pedidos.find((p) => p.id === 'p4');
  assert.equal(p4.reembolso.status, 'negado');
});

test('tarefa diária: conclui os entregues há mais de 7 dias (só com o token)', async () => {
  repo.tabelas.pedidos.p6 = { ...repo.tabelas.pedidos.p3, id: 'p6', status: 'entregue', entregue_em: atras(9) };
  assert.equal((await api('POST', '/api/tarefas/pedidos')).s, 401);
  const r = await api('POST', '/api/tarefas/pedidos', null, null, { 'x-tarefas-token': 'tarefas' });
  assert.equal(r.s, 200);
  assert.equal(r.j.concluidos, 1);
  assert.equal(repo.tabelas.pedidos.p6.status, 'concluido');
  assert.equal(repo.tabelas.pedidos.p3.status, 'entregue');
});
