// Fluxo completo de venda contra um Asaas SIMULADO e um banco em memória.
// Não toca no Asaas nem no Supabase de verdade.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';
import { iniciarAsaasSimulado } from './apoio/asaas-simulado.js';

let simulado, repo, base, servidor;

before(async () => {
  simulado = await iniciarAsaasSimulado();
  Object.assign(process.env, {
    ASAAS_BASE_URL: simulado.url, ASAAS_API_KEY: 'chave-teste', ASAAS_WEBHOOK_TOKEN: 'whk', TAREFAS_TOKEN: 'tarefas',
  });
  const { criarApp } = await import('../server/app.js');
  repo = criarRepoMemoria();
  const t = repo.tabelas;
  t.usuarios = {
    'tok-cliente': { id: 'u-cliente', email: 'joao@x.com', nome: 'João', papel: 'cliente' },
    'tok-vendedor': { id: 'u-vendedor', email: 'ana@x.com', nome: 'Ana', papel: 'vendedor' },
    'tok-outro': { id: 'u-outro', email: 'bia@x.com', nome: 'Bia', papel: 'vendedor' },
    'tok-dono': { id: 'u-dono', email: 'lucas@x.com', nome: 'Lucas', papel: 'dono' },
  };
  t.lojas = { loja1: { id: 'loja1', vendedor_id: 'u-vendedor', publicada: true, banida: false } };
  t.dadosRepasse = { loja1: { loja_id: 'loja1', cpf_cnpj: '12345678909', pix_chave: 'ana@x.com', pix_tipo: 'EMAIL' } };
  t.produtos = { prod1: { id: 'prod1', loja_id: 'loja1', titulo: 'Mentoria', preco_kn: 100, ativo: true } };
  t.cotacoes = [
    { data: '2026-10-26', moeda: 'BRL', taxa: 6.0, fonte: 'bce' },
    { data: '2026-10-27', moeda: 'BRL', taxa: 6.1234, fonte: 'bce' },
    { data: '2026-10-27', moeda: 'USD', taxa: 1.12, fonte: 'bce' },
  ];
  servidor = criarApp({ repo }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
});

after(() => { servidor.close(); simulado.fechar(); });

async function api(metodo, caminho, corpo, token, extras = {}) {
  const headers = { 'Content-Type': 'application/json', ...extras };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  return { s: r.status, j: await r.json().catch(() => null) };
}
const aviso = (ev) => api('POST', '/api/webhooks/asaas', ev, null, { 'asaas-access-token': 'whk' });
const comprar = (forma = 'PIX') => api('POST', '/api/pedidos', { produtoId: 'prod1', formaPagamento: forma, cpfCnpj: '987.654.321-00', moedaExibida: 'usd' }, 'tok-cliente');
const transferencias = () => simulado.chamadas.filter((c) => c.url === '/v3/transfers');

test('compra exige login e dados válidos', async () => {
  assert.equal((await api('POST', '/api/pedidos', {})).s, 401);
  assert.equal((await api('POST', '/api/pedidos', { produtoId: 'prod1', formaPagamento: 'PIX', cpfCnpj: '123' }, 'tok-cliente')).s, 400);
  assert.equal((await api('POST', '/api/pedidos', { produtoId: 'prod1', formaPagamento: 'PIX', cpfCnpj: '98765432100' }, 'tok-vendedor')).s, 400);
});

test('Pix: KN vira reais pela cotação do euro, e o vendedor recebe 50% do líquido assim que o dinheiro cai', async () => {
  const c = await comprar();
  assert.equal(c.s, 201);
  // 100 KN × 6,1234 = R$ 612,34 (usa a cotação mais recente)
  assert.equal(c.j.valorCentavos, 61234);
  assert.deepEqual(c.j.cotacao, { brl: 6.1234, data: '2026-10-27' });
  assert.ok(c.j.pix.copiaECola);
  const cobranca = simulado.chamadas.find((x) => x.url === '/v3/payments').corpo;
  assert.equal(cobranca.value, 612.34);
  assert.equal(cobranca.externalReference, c.j.id);
  const pedido = repo.tabelas.pedidos[c.j.id];
  assert.equal(pedido.moeda_exibida, 'USD');
  assert.equal(pedido.cotacao_exibida, 1.12);

  // vendedor não pode entregar antes do pagamento
  assert.equal((await api('POST', `/api/pedidos/${c.j.id}/entregue`, null, 'tok-vendedor')).s, 409);

  // aviso com senha errada é recusado
  assert.equal((await api('POST', '/api/webhooks/asaas', { event: 'PAYMENT_RECEIVED', payment: { id: pedido.asaas_cobranca_id } }, null, { 'asaas-access-token': 'x' })).s, 401);

  // dinheiro caiu: líquido R$ 611,35 → vendedor 305,68 / Kennismarket 305,67
  const ev = { id: 'evt1', event: 'PAYMENT_RECEIVED', payment: { id: pedido.asaas_cobranca_id, netValue: 611.35 } };
  assert.equal((await aviso(ev)).s, 200);
  const p = repo.tabelas.pedidos[c.j.id];
  assert.equal(p.status, 'pago');
  assert.equal(p.repasse_status, 'enviado');
  assert.equal(p.vendedor_centavos, 30568);
  assert.equal(p.plataforma_centavos, 30567);
  const tr = transferencias().at(-1).corpo;
  assert.deepEqual({ v: tr.value, k: tr.pixAddressKey, t: tr.pixAddressKeyType }, { v: 305.68, k: 'ana@x.com', t: 'EMAIL' });

  // o mesmo aviso repetido não paga de novo
  assert.equal((await aviso(ev)).j.duplicado, true);
  // aviso diferente sobre o mesmo pagamento também não paga de novo
  await aviso({ ...ev, id: 'evt1-b' });
  assert.equal(transferencias().length, 1);

  // Asaas confirma a transferência
  await aviso({ id: 'evt2', event: 'TRANSFER_DONE', transfer: { id: p.repasse_id } });
  assert.equal(repo.tabelas.pedidos[c.j.id].repasse_status, 'concluido');

  // entrega e confirmação do cliente
  assert.equal((await api('POST', `/api/pedidos/${c.j.id}/entregue`, null, 'tok-outro')).s, 404);
  assert.equal((await api('POST', `/api/pedidos/${c.j.id}/entregue`, null, 'tok-vendedor')).j.status, 'entregue');
  assert.equal((await api('POST', `/api/pedidos/${c.j.id}/recebido`, null, 'tok-cliente')).j.status, 'concluido');
});

test('cartão: atende ao aprovar, mas só paga o vendedor quando o dinheiro cai', async () => {
  const c = await comprar('CREDIT_CARD');
  const id = repo.tabelas.pedidos[c.j.id].asaas_cobranca_id;
  const antes = transferencias().length;
  await aviso({ id: 'evt3', event: 'PAYMENT_CONFIRMED', payment: { id, netValue: 590 } });
  assert.equal(repo.tabelas.pedidos[c.j.id].status, 'pago');
  assert.equal(repo.tabelas.pedidos[c.j.id].repasse_status, 'aguardando_dinheiro');
  assert.equal(transferencias().length, antes);
  await aviso({ id: 'evt4', event: 'PAYMENT_RECEIVED', payment: { id, netValue: 590 } });
  assert.equal(repo.tabelas.pedidos[c.j.id].repasse_status, 'enviado');
  assert.equal(transferencias().at(-1).corpo.value, 295);
});

test('repasse recusado pelo Asaas: tarefa de hora em hora tenta de novo', async () => {
  const c = await comprar();
  const id = repo.tabelas.pedidos[c.j.id].asaas_cobranca_id;
  simulado.falhas['/v3/transfers'] = { status: 400 };
  await aviso({ id: 'evt5', event: 'PAYMENT_RECEIVED', payment: { id, netValue: 100 } });
  assert.equal(repo.tabelas.pedidos[c.j.id].repasse_status, 'falhou');
  delete simulado.falhas['/v3/transfers'];

  assert.equal((await api('POST', '/api/tarefas/repasses', null, null, { 'x-tarefas-token': 'errado' })).s, 401);
  const r = await api('POST', '/api/tarefas/repasses', null, null, { 'x-tarefas-token': 'tarefas' });
  assert.deepEqual(r.j.enviados, [c.j.id]);
  assert.equal(repo.tabelas.pedidos[c.j.id].repasse_status, 'enviado');
  assert.equal(repo.tabelas.pedidos[c.j.id].repasse_tentativas, 2);

  // Asaas avisa depois que a transferência falhou: volta para a fila
  await aviso({ id: 'evt6', event: 'TRANSFER_FAILED', transfer: { id: repo.tabelas.pedidos[c.j.id].repasse_id } });
  assert.equal(repo.tabelas.pedidos[c.j.id].repasse_status, 'falhou');
});

test('resposta do Asaas perdida: o repasse trava para conferência e nunca paga duas vezes', async () => {
  const c = await comprar();
  const id = repo.tabelas.pedidos[c.j.id].asaas_cobranca_id;
  simulado.falhas['/v3/transfers'] = 'cair';
  await aviso({ id: 'evt7', event: 'PAYMENT_RECEIVED', payment: { id, netValue: 100 } });
  delete simulado.falhas['/v3/transfers'];
  const p = repo.tabelas.pedidos[c.j.id];
  assert.equal(p.repasse_status, 'enviando');
  assert.match(p.repasse_erro, /CONFERIR NO ASAAS/);

  // a tarefa automática não mexe nele
  const r = await api('POST', '/api/tarefas/repasses', null, null, { 'x-tarefas-token': 'tarefas' });
  assert.ok(!r.j.enviados.includes(c.j.id));
  // só o dono destrava, depois de conferir
  assert.equal((await api('POST', `/api/admin/pedidos/${c.j.id}/repasse`, { acao: 'marcar_enviado', repasseId: 'tra_x' }, 'tok-vendedor')).s, 403);
  const ok = await api('POST', `/api/admin/pedidos/${c.j.id}/repasse`, { acao: 'marcar_enviado', repasseId: 'tra_x' }, 'tok-dono');
  assert.equal(ok.j.repasse_status, 'enviado');
});

test('reembolso: cliente pede, suporte decide, devolve em dinheiro', async () => {
  const c = await comprar();
  const cobranca = repo.tabelas.pedidos[c.j.id].asaas_cobranca_id;
  await aviso({ id: 'evt8', event: 'PAYMENT_RECEIVED', payment: { id: cobranca, netValue: 600 } });

  assert.equal((await api('POST', `/api/pedidos/${c.j.id}/reembolso`, { motivo: '' }, 'tok-cliente')).s, 400);
  const rb = await api('POST', `/api/pedidos/${c.j.id}/reembolso`, { motivo: 'não condiz com o portfólio' }, 'tok-cliente');
  assert.equal(rb.s, 201);
  assert.equal(repo.tabelas.pedidos[c.j.id].status, 'reembolso_solicitado');
  // não dá para pedir de novo enquanto está em análise
  assert.equal((await api('POST', `/api/pedidos/${c.j.id}/reembolso`, { motivo: 'de novo' }, 'tok-cliente')).s, 409);

  // negado: o pedido volta para onde estava
  assert.equal((await api('POST', `/api/admin/reembolsos/${rb.j.id}`, { aprovar: false }, 'tok-dono')).j.status, 'negado');
  assert.equal(repo.tabelas.pedidos[c.j.id].status, 'pago');
  assert.equal((await api('POST', `/api/admin/reembolsos/${rb.j.id}`, { aprovar: true }, 'tok-dono')).s, 409);

  // pede de novo e é aprovado: reembolso total pelo Asaas
  const rb2 = await api('POST', `/api/pedidos/${c.j.id}/reembolso`, { motivo: 'entrega diferente' }, 'tok-cliente');
  const dec = await api('POST', `/api/admin/reembolsos/${rb2.j.id}`, { aprovar: true }, 'tok-dono');
  assert.equal(dec.j.status, 'aprovado');
  assert.equal(repo.tabelas.pedidos[c.j.id].status, 'reembolsado');
  const chamada = simulado.chamadas.filter((x) => x.url.endsWith('/refund')).at(-1);
  assert.equal(chamada.url, `/v3/payments/${cobranca}/refund`);
  assert.equal(chamada.corpo.value, undefined); // total
});

test('reembolso recusado pelo Asaas volta para análise', async () => {
  const c = await comprar();
  await aviso({ id: 'evt9', event: 'PAYMENT_RECEIVED', payment: { id: repo.tabelas.pedidos[c.j.id].asaas_cobranca_id, netValue: 600 } });
  const rb = await api('POST', `/api/pedidos/${c.j.id}/reembolso`, { motivo: 'x' }, 'tok-cliente');
  const url = `/v3/payments/${repo.tabelas.pedidos[c.j.id].asaas_cobranca_id}/refund`;
  simulado.falhas[url] = { status: 400 };
  assert.equal((await api('POST', `/api/admin/reembolsos/${rb.j.id}`, { aprovar: true, valorCentavos: 1000 }, 'tok-dono')).s, 400);
  delete simulado.falhas[url];
  assert.equal(repo.tabelas.reembolsos[rb.j.id].status, 'em_analise');
  assert.equal(repo.tabelas.pedidos[c.j.id].status, 'reembolso_solicitado');
});

test('loja banida não recebe repasse', async () => {
  const c = await comprar();
  repo.tabelas.lojas.loja1.banida = true;
  await aviso({ id: 'evt10', event: 'PAYMENT_RECEIVED', payment: { id: repo.tabelas.pedidos[c.j.id].asaas_cobranca_id, netValue: 600 } });
  repo.tabelas.lojas.loja1.banida = false;
  assert.equal(repo.tabelas.pedidos[c.j.id].repasse_status, 'falhou');
  assert.match(repo.tabelas.pedidos[c.j.id].repasse_erro, /banida/);
});

test('todas as chamadas ao Asaas levaram a chave', () => {
  assert.ok(simulado.chamadas.every((c) => c.chave === 'chave-teste'));
});

test('repasse nunca sai duas vezes, nem chamado ao mesmo tempo, nem depois de enviado', async () => {
  const { repassar } = await import('../server/lib/repasse.js');
  const c = await comprar();
  const p = repo.tabelas.pedidos[c.j.id];
  Object.assign(p, { status: 'pago', repasse_status: 'pendente', valor_liquido_centavos: 1000 });
  const antes = transferencias().length;
  const resultados = await Promise.allSettled([repassar(repo, p.id), repassar(repo, p.id), repassar(repo, p.id)]);
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(transferencias().length, antes + 1);
  await assert.rejects(repassar(repo, p.id), /enviado/);
  assert.equal(transferencias().length, antes + 1);
});
