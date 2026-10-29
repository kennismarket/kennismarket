// O módulo de pagamento sozinho: escolha do banco, conferências do contrato e provedores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPagamentos, ErroPagamento } from '../server/pagamentos/index.js';
import { conferirCobranca, conferirAviso, conferirStatus } from '../server/pagamentos/contrato.js';

const cfg = (provedor, extra = {}) => ({
  provedor, cartaoAtivo: false, simulado: { segredo: 's' },
  transfeera: { ambiente: 'sandbox', clientId: '', clientSecret: '', webhookSecret: '' }, ...extra,
});
const recebedor = { nome: 'Ana', documento: '52998224725', pix: { chave: 'a@x.com', tipo: 'email' }, banco: null, recebedorId: null };
const cobranca = (extra = {}) => ({
  pedidoId: 'p1', valorCentavos: 1001, forma: 'pix', descricao: 'x', vencimento: '2026-11-01',
  pagador: { nome: 'João', email: 'j@x.com', documento: '11144477735' },
  divisao: { vendedor: { centavos: 501, recebedor }, plataforma: { centavos: 500 } }, ...extra,
});

test('o banco é escolhido pela configuração (PAYMENT_PROVIDER)', () => {
  assert.equal(criarPagamentos(cfg('simulado')).provedor, 'simulado');
  assert.equal(criarPagamentos(cfg('transfeera')).provedor, 'transfeera');
  assert.throws(() => criarPagamentos(cfg('outro')), /PAYMENT_PROVIDER desconhecido/);
});

test('cartão só aparece quando ligado (PAYMENT_CARD_ENABLED)', async () => {
  assert.deepEqual(criarPagamentos(cfg('simulado')).formas, ['pix', 'boleto']);
  const comCartao = criarPagamentos(cfg('simulado', { cartaoAtivo: true }));
  assert.deepEqual(comCartao.formas, ['pix', 'boleto', 'cartao']);
  assert.ok((await comCartao.criarCobranca(cobranca({ forma: 'cartao' }))).linkPagamento);
  await assert.rejects(criarPagamentos(cfg('simulado')).criarCobranca(cobranca({ forma: 'cartao' })), /indisponível/);
});

test('o módulo recusa cobrança com divisão errada ou dados incompletos, antes de chamar o banco', async () => {
  const p = criarPagamentos(cfg('simulado'));
  const casos = [
    cobranca({ divisao: { vendedor: { centavos: 600, recebedor }, plataforma: { centavos: 500 } } }), // não soma
    cobranca({ divisao: { vendedor: { centavos: -1, recebedor }, plataforma: { centavos: 1002 } } }),
    cobranca({ valorCentavos: 10.5 }),
    cobranca({ pagador: { nome: 'J', email: 'j@x.com', documento: '12345678900' } }),
    cobranca({ divisao: { vendedor: { centavos: 501, recebedor: { ...recebedor, pix: null } }, plataforma: { centavos: 500 } } }),
    cobranca({ vencimento: '01/11/2026' }),
  ];
  for (const c of casos) {
    await assert.rejects(p.criarCobranca(c), (e) => e instanceof ErroPagamento && e.status === 400);
  }
});

test('Transfeera: tudo responde "pendente" (501) até chegar a documentação', async () => {
  const p = criarPagamentos(cfg('transfeera'));
  const chamadas = [
    p.criarCobranca(cobranca()),
    p.confirmarPagamento({ corpoBruto: Buffer.from('{}'), cabecalhos: {} }),
    p.cadastrarRecebedor(recebedor),
    p.consultarStatus({ cobrancaId: 'c1' }),
    p.devolverPagamento({ cobrancaId: 'c1', valorCentavos: 100 }),
  ];
  for (const c of chamadas) {
    await assert.rejects(c, (e) => e instanceof ErroPagamento && e.status === 501 && /documentação/.test(e.message));
  }
  assert.deepEqual(criarPagamentos(cfg('transfeera', { transfeera: { ambiente: 'producao', clientId: 'a', clientSecret: 'b' } })).situacao(),
    { provedor: 'transfeera', formas: ['pix', 'boleto'], ambiente: 'producao', credenciais: 'preenchidas', implementado: false });
});

test('simulado: só aceita avisos assinados com o segredo dele', async () => {
  const p = criarPagamentos(cfg('simulado'));
  const outro = criarPagamentos(cfg('simulado', { simulado: { segredo: 'outro' } }));
  const { cobrancaId } = await p.criarCobranca(cobranca());
  const aviso = p.simulador.gerarAviso(cobrancaId, 'pago');
  const ok = await p.confirmarPagamento(aviso);
  assert.equal(ok.autentico, true);
  assert.deepEqual(ok.eventos.map((e) => [e.tipo, e.cobrancaId, e.repasse]), [['pago', cobrancaId, 'repassado']]);
  assert.equal((await outro.confirmarPagamento(aviso)).autentico, false);
  assert.equal((await p.confirmarPagamento({ corpoBruto: Buffer.from('{"tipo":"pago"}'), cabecalhos: aviso.cabecalhos })).autentico, false);
});

test('simulado: devolução não passa do valor pago', async () => {
  const p = criarPagamentos(cfg('simulado'));
  const { cobrancaId } = await p.criarCobranca(cobranca());
  await assert.rejects(p.devolverPagamento({ cobrancaId, valorCentavos: 100 }), /aguardando/); // ainda não pago
  p.simulador.gerarAviso(cobrancaId, 'pago');
  await p.devolverPagamento({ cobrancaId, valorCentavos: 1000 });
  await assert.rejects(p.devolverPagamento({ cobrancaId, valorCentavos: 2 }), /maior que o valor pago/);
  await p.devolverPagamento({ cobrancaId, valorCentavos: 1 });
  assert.equal((await p.consultarStatus({ cobrancaId })).pagamento, 'devolvido');
});

test('resposta de banco fora do contrato vira erro do banco (502), não estraga o site', () => {
  assert.throws(() => conferirCobranca({}), (e) => e.status === 502);
  assert.throws(() => conferirAviso({ autentico: true, eventos: [{ eventoId: 'e', cobrancaId: 'c', tipo: 'outro' }] }), (e) => e.status === 502);
  assert.deepEqual(conferirAviso({ autentico: 'sim' }), { autentico: false });
  assert.throws(() => conferirStatus({ pagamento: 'pago', repasse: 'talvez' }), (e) => e.status === 502);
});
