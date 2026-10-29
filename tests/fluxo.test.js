// Fluxo completo de venda com o provedor de pagamento SIMULADO e um banco de dados em memória.
// Não toca em nenhum banco de pagamento nem no Supabase de verdade.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';

const CPF_CLIENTE = '111.444.777-35';
const CPF_VENDEDORA = '52998224725';
const cfg = (provedor, extra = {}) => ({
  provedor, cartaoAtivo: false, simulado: { segredo: 'segredo-teste' },
  transfeera: { ambiente: 'sandbox', clientId: '', clientSecret: '', webhookSecret: '' }, ...extra,
});

let criarApp, criarPagamentos, repo, pagamentos, base, servidor;

function popular(r) {
  const t = r.tabelas;
  t.usuarios = {
    'tok-cliente': { id: 'u-cliente', email: 'joao@x.com', nome: 'João', papel: 'cliente' },
    'tok-vendedor': { id: 'u-vendedor', email: 'ana@x.com', nome: 'Ana', papel: 'vendedor' },
    'tok-outro': { id: 'u-outro', email: 'bia@x.com', nome: 'Bia', papel: 'vendedor' },
    'tok-dono': { id: 'u-dono', email: 'lucas@x.com', nome: 'Lucas', papel: 'dono' },
  };
  t.lojas = { loja1: { id: 'loja1', vendedor_id: 'u-vendedor', publicada: true, banida: false } };
  t.produtos = { prod1: { id: 'prod1', loja_id: 'loja1', titulo: 'Mentoria', preco_kn: 100, ativo: true } };
  t.cotacoes = [
    { data: '2026-10-26', moeda: 'BRL', taxa: 6.0, fonte: 'bce' },
    { data: '2026-10-27', moeda: 'BRL', taxa: 6.1234, fonte: 'bce' },
    { data: '2026-10-27', moeda: 'USD', taxa: 1.12, fonte: 'bce' },
  ];
}

async function subir(r, p) {
  const s = criarApp({ repo: r, pagamentos: p }).listen(0);
  return { s, url: `http://localhost:${s.address().port}` };
}

before(async () => {
  Object.assign(process.env, { TAREFAS_TOKEN: 'tarefas' });
  ({ criarApp } = await import('../server/app.js'));
  ({ criarPagamentos } = await import('../server/pagamentos/index.js'));
  repo = criarRepoMemoria();
  popular(repo);
  pagamentos = criarPagamentos(cfg('simulado'));
  ({ s: servidor, url: base } = await subir(repo, pagamentos));
});
after(() => servidor.close());

async function api(metodo, caminho, corpo, token, { url = base, extras = {}, bruto } = {}) {
  const headers = { 'Content-Type': 'application/json', ...extras };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(url + caminho, { method: metodo, headers, body: bruto ?? (corpo ? JSON.stringify(corpo) : undefined) });
  return { s: r.status, j: await r.json().catch(() => null), texto: r.headers.get('content-type') };
}
// Entrega um aviso do banco simulado pelo endereço real do webhook.
const entregar = ({ corpoBruto, cabecalhos }) =>
  api('POST', '/api/webhooks/pagamento', null, null, { bruto: corpoBruto, extras: cabecalhos });
const comprar = (forma = 'pix', token = 'tok-cliente') =>
  api('POST', '/api/pedidos', { produtoId: 'prod1', formaPagamento: forma, cpfCnpj: CPF_CLIENTE, moedaExibida: 'usd' }, token);
const cadastrarVendedora = (corpo = { nome: 'Ana Souza', cpfCnpj: CPF_VENDEDORA, pix: { chave: 'ana@x.com', tipo: 'email' } }) =>
  api('PUT', '/api/loja/recebimento', corpo, 'tok-vendedor');
const pedidoDe = (id) => repo.tabelas.pedidos[id];

test('loja sem dados de recebimento não vende', async () => {
  assert.equal((await comprar()).s, 409);
});

test('cadastro do vendedor: só os dados para receber, validados', async () => {
  assert.equal((await api('PUT', '/api/loja/recebimento', {}, null)).s, 401);
  assert.equal((await api('PUT', '/api/loja/recebimento', { nome: 'X', cpfCnpj: CPF_VENDEDORA }, 'tok-outro')).s, 404); // sem loja
  assert.equal((await cadastrarVendedora({ nome: 'Ana', cpfCnpj: CPF_VENDEDORA })).s, 400); // sem Pix nem banco
  assert.equal((await cadastrarVendedora({ nome: 'Ana', cpfCnpj: '123.456.789-00', pix: { chave: 'a@x.com', tipo: 'email' } })).s, 400); // CPF inválido
  assert.equal((await cadastrarVendedora({ nome: 'Ana', cpfCnpj: CPF_VENDEDORA, pix: { chave: 'a@x.com', tipo: 'EVP-errado' } })).s, 400);
  assert.equal((await cadastrarVendedora({ nome: 'Ana', cpfCnpj: CPF_VENDEDORA, banco: { codigo: '1', agencia: '1', conta: '1', tipoConta: 'x' } })).s, 400);
  // dados bancários completos também servem
  const banco = await cadastrarVendedora({ nome: 'Ana', cpfCnpj: CPF_VENDEDORA, banco: { codigo: '001', agencia: '1234', conta: '56789-0', tipoConta: 'corrente' } });
  assert.equal(banco.s, 200);
  assert.equal(banco.j.situacao, 'pronto');
  // fica com a chave Pix
  const ok = await cadastrarVendedora();
  assert.equal(ok.s, 200);
  const linha = repo.tabelas.dadosRecebimento.loja1;
  assert.deepEqual([linha.pix_tipo, linha.provedor, linha.situacao, linha.banco_codigo], ['email', 'simulado', 'pronto', null]);
  assert.match(linha.provedor_recebedor_id, /^rec_sim_/);
  assert.equal((await api('GET', '/api/loja/recebimento', null, 'tok-vendedor')).j.situacao, 'pronto');
});

test('compra exige login e dados válidos; cartão está desligado', async () => {
  assert.equal((await api('POST', '/api/pedidos', {})).s, 401);
  assert.equal((await api('POST', '/api/pedidos', { produtoId: 'prod1', formaPagamento: 'pix', cpfCnpj: '123' }, 'tok-cliente')).s, 400);
  assert.equal((await api('POST', '/api/pedidos', { produtoId: 'prod1', formaPagamento: 'PIX', cpfCnpj: CPF_CLIENTE }, 'tok-cliente')).s, 400);
  assert.equal((await comprar('cartao')).s, 400);
  assert.equal((await comprar('pix', 'tok-vendedor')).s, 400); // da própria loja
});

test('Pix: KN vira reais pela cotação do euro, split 50/50 no valor cheio, repasse junto com o pagamento', async () => {
  const c = await comprar();
  assert.equal(c.s, 201);
  assert.equal(c.j.valorCentavos, 61234); // 100 KN × 6,1234
  assert.deepEqual(c.j.cotacao, { brl: 6.1234, data: '2026-10-27' });
  assert.deepEqual(c.j.divisao, { vendedorCentavos: 30617, plataformaCentavos: 30617 });
  assert.match(c.j.pix.copiaECola, /^PIX-SIMULADO-/);

  const p = pedidoDe(c.j.id);
  assert.deepEqual(
    [p.valor_kn, p.valor_centavos, p.cotacao_brl, p.cotacao_data, p.taxa_percentual, p.vendedor_centavos, p.plataforma_centavos, p.provedor, p.status, p.repasse_status],
    [100, 61234, 6.1234, '2026-10-27', 50, 30617, 30617, 'simulado', 'aguardando_pagamento', 'aguardando'],
  );
  assert.equal(p.moeda_exibida, 'USD');
  assert.equal(p.cotacao_exibida, 1.12);
  assert.ok(p.cobranca_id && p.pix_copia_cola);

  // vendedor não pode entregar antes do pagamento
  assert.equal((await api('POST', `/api/pedidos/${c.j.id}/entregue`, null, 'tok-vendedor')).s, 409);

  const aviso = pagamentos.simulador.gerarAviso(p.cobranca_id, 'pago');
  // aviso sem assinatura, com assinatura errada ou com o conteúdo alterado: recusado
  assert.equal((await entregar({ corpoBruto: aviso.corpoBruto, cabecalhos: {} })).s, 401);
  assert.equal((await entregar({ corpoBruto: aviso.corpoBruto, cabecalhos: { 'x-simulado-assinatura': 'f'.repeat(64) } })).s, 401);
  const alterado = Buffer.from(aviso.corpoBruto.toString().replace('"pago"', '"devolvido"'));
  assert.equal((await entregar({ corpoBruto: alterado, cabecalhos: aviso.cabecalhos })).s, 401);
  assert.equal(pedidoDe(c.j.id).status, 'aguardando_pagamento');

  // aviso verdadeiro: pago, e a parte da vendedora já repassada
  const r = await entregar(aviso);
  assert.equal(r.s, 200);
  assert.equal(pedidoDe(c.j.id).status, 'pago');
  assert.equal(pedidoDe(c.j.id).repasse_status, 'repassado');
  // o mesmo aviso de novo não é processado duas vezes
  assert.equal((await entregar(aviso)).j.eventos[0].duplicado, true);

  // entrega e confirmação do cliente
  assert.equal((await api('POST', `/api/pedidos/${c.j.id}/entregue`, null, 'tok-outro')).s, 404);
  assert.equal((await api('POST', `/api/pedidos/${c.j.id}/entregue`, null, 'tok-vendedor')).j.status, 'entregue');
  assert.equal((await api('POST', `/api/pedidos/${c.j.id}/recebido`, null, 'tok-cliente')).j.status, 'concluido');
});

test('boleto: devolve a linha digitável', async () => {
  const c = await comprar('boleto');
  assert.equal(c.s, 201);
  assert.ok(c.j.boleto.linhaDigitavel);
  assert.equal(pedidoDe(c.j.id).forma_pagamento, 'boleto');
});

async function compraPaga() {
  const c = await comprar();
  await entregar(pagamentos.simulador.gerarAviso(pedidoDe(c.j.id).cobranca_id, 'pago'));
  return c.j.id;
}

test('reembolso: cliente pede, suporte nega ou aprova; aprovado devolve em dinheiro e anota o débito da vendedora', async () => {
  const id = await compraPaga();
  assert.equal((await api('POST', `/api/pedidos/${id}/reembolso`, { motivo: '' }, 'tok-cliente')).s, 400);
  const rb = await api('POST', `/api/pedidos/${id}/reembolso`, { motivo: 'não condiz com o portfólio' }, 'tok-cliente');
  assert.equal(rb.s, 201);
  assert.equal(pedidoDe(id).status, 'reembolso_solicitado');
  assert.equal((await api('POST', `/api/pedidos/${id}/reembolso`, { motivo: 'de novo' }, 'tok-cliente')).s, 409);
  assert.equal((await api('POST', `/api/admin/reembolsos/${rb.j.id}`, { aprovar: true }, 'tok-vendedor')).s, 403);

  // negado: volta para onde estava, sem débito
  const neg = await api('POST', `/api/admin/reembolsos/${rb.j.id}`, { aprovar: false }, 'tok-dono');
  assert.equal(neg.j.reembolso.status, 'negado');
  assert.equal(pedidoDe(id).status, 'pago');
  assert.equal((await api('POST', `/api/admin/reembolsos/${rb.j.id}`, { aprovar: true }, 'tok-dono')).s, 409);

  // pede de novo e é aprovado: devolve tudo, e a vendedora fica devendo a parte dela
  const rb2 = await api('POST', `/api/pedidos/${id}/reembolso`, { motivo: 'entrega diferente' }, 'tok-cliente');
  const dec = await api('POST', `/api/admin/reembolsos/${rb2.j.id}`, { aprovar: true }, 'tok-dono');
  assert.equal(dec.s, 200);
  assert.equal(dec.j.reembolso.status, 'aprovado');
  assert.equal(dec.j.reembolso.valor_centavos, 61234);
  assert.match(dec.j.reembolso.devolucao_id, /^dev_sim_/);
  assert.equal(pedidoDe(id).status, 'reembolsado');
  assert.deepEqual([dec.j.debito.valor_centavos, dec.j.debito.situacao, dec.j.debito.loja_id], [30617, 'aberto', 'loja1']);
  // o banco simulado registrou a devolução: devolver de novo é recusado
  assert.equal((await pagamentos.consultarStatus({ cobrancaId: pedidoDe(id).cobranca_id })).pagamento, 'devolvido');
  const debitos = await api('GET', '/api/admin/debitos?situacao=aberto', null, 'tok-dono');
  assert.ok(debitos.j.some((d) => d.pedido_id === id));
});

test('reembolso parcial: débito proporcional', async () => {
  const id = await compraPaga();
  const rb = await api('POST', `/api/pedidos/${id}/reembolso`, { motivo: 'parte não veio' }, 'tok-cliente');
  assert.equal((await api('POST', `/api/admin/reembolsos/${rb.j.id}`, { aprovar: true, valorCentavos: 999999 }, 'tok-dono')).s, 400);
  const dec = await api('POST', `/api/admin/reembolsos/${rb.j.id}`, { aprovar: true, valorCentavos: 1000 }, 'tok-dono');
  assert.equal(dec.j.reembolso.valor_centavos, 1000);
  assert.equal(dec.j.debito.valor_centavos, 500); // metade dos R$ 10,00 devolvidos
});

test('devolução recusada pelo banco: volta para análise e nada é anotado', async () => {
  const id = await compraPaga();
  const rb = await api('POST', `/api/pedidos/${id}/reembolso`, { motivo: 'x' }, 'tok-cliente');
  const { ErroPagamento } = await import('../server/pagamentos/index.js');
  pagamentos.simulador.falhas.devolverPagamento = new ErroPagamento('recusado', 'saldo insuficiente no teste');
  const dec = await api('POST', `/api/admin/reembolsos/${rb.j.id}`, { aprovar: true }, 'tok-dono');
  assert.equal(dec.s, 400);
  assert.match(dec.j.erro, /saldo insuficiente/);
  assert.equal(repo.tabelas.reembolsos[rb.j.id].status, 'em_analise');
  assert.equal(pedidoDe(id).status, 'reembolso_solicitado');
  assert.equal((await repo.listarDebitos({ pedidoId: id })).length, 0);
});

test('cobrança cancelada no banco cancela o pedido', async () => {
  const c = await comprar();
  await entregar(pagamentos.simulador.gerarAviso(pedidoDe(c.j.id).cobranca_id, 'cancelado'));
  assert.equal(pedidoDe(c.j.id).status, 'cancelado');
});

test('aviso perdido: o suporte pergunta ao banco (consultarStatus) e o pedido é corrigido', async () => {
  const c = await comprar();
  pagamentos.simulador.gerarAviso(pedidoDe(c.j.id).cobranca_id, 'pago'); // o banco recebeu, mas o aviso nunca chegou
  assert.equal(pedidoDe(c.j.id).status, 'aguardando_pagamento');
  const r = await api('POST', `/api/admin/pedidos/${c.j.id}/atualizar-status`, null, 'tok-dono');
  assert.deepEqual(r.j.banco, { pagamento: 'pago', repasse: 'repassado' });
  assert.equal(pedidoDe(c.j.id).status, 'pago');
  assert.equal(pedidoDe(c.j.id).repasse_status, 'repassado');
});

test('página de teste: fluxo inteiro só com os endereços dela e os do site', async () => {
  const pg = await api('GET', '/teste/pagamentos');
  assert.equal(pg.s, 200);
  assert.match(pg.texto, /text\/html/);
  const d = await api('POST', '/api/teste/preparar');
  assert.equal(d.s, 200);
  assert.deepEqual(d.j.formas, ['pix', 'boleto']);
  const { cliente, dono } = d.j.tokens;
  const c = await api('POST', '/api/pedidos', { produtoId: d.j.produtoId, formaPagamento: 'pix', cpfCnpj: CPF_CLIENTE }, cliente);
  assert.equal(c.s, 201);
  assert.equal((await api('POST', '/api/teste/simular', { pedidoId: c.j.id, tipo: 'pago' })).s, 200);
  assert.equal(pedidoDe(c.j.id).repasse_status, 'repassado');
  const rb = await api('POST', `/api/pedidos/${c.j.id}/reembolso`, { motivo: 'teste' }, cliente);
  const dec = await api('POST', `/api/admin/reembolsos/${rb.j.id}`, { aprovar: true }, dono);
  assert.equal(dec.j.debito.valor_centavos, c.j.divisao.vendedorCentavos);
  assert.equal((await api('GET', `/api/teste/debitos/${c.j.id}`)).j.length, 1);
});

test('com a Transfeera: página de teste some, contas de teste param, e o que falta da documentação responde 501', async () => {
  const r2 = criarRepoMemoria();
  popular(r2);
  const pT = criarPagamentos(cfg('transfeera'));
  const { s, url } = await subir(r2, pT);
  try {
    // dados de teste criados enquanto era simulado não servem com banco real
    const tokTeste = 'tok-teste-dono-x';
    r2.tabelas.usuarios[tokTeste] = { id: 'u-t', email: 'dono@teste.kennismarket.invalid', nome: 'T', papel: 'dono' };
    assert.equal((await api('GET', '/teste/pagamentos', null, null, { url })).s, 404);
    assert.equal((await api('POST', '/api/teste/preparar', null, null, { url })).s, 404);
    assert.equal((await api('GET', '/api/admin/debitos', null, tokTeste, { url })).s, 403);

    const saude = await api('GET', '/api/saude', null, null, { url });
    assert.deepEqual(saude.j.pagamentos, { provedor: 'transfeera', formas: ['pix', 'boleto'], ambiente: 'sandbox', credenciais: 'NÃO PREENCHIDAS', implementado: false });

    // cadastro do vendedor depende da documentação
    const cad = await api('PUT', '/api/loja/recebimento', { nome: 'Ana', cpfCnpj: CPF_VENDEDORA, pix: { chave: 'a@x.com', tipo: 'email' } }, 'tok-vendedor', { url });
    assert.equal(cad.s, 501);
    assert.match(cad.j.erro, /Transfeera.*documentação/);

    // recebedor confirmado com o simulado precisa ser confirmado de novo com a Transfeera
    r2.tabelas.dadosRecebimento.loja1 = { loja_id: 'loja1', nome: 'Ana', cpf_cnpj: CPF_VENDEDORA, pix_chave: 'a@x.com', pix_tipo: 'email', provedor: 'simulado', situacao: 'pronto' };
    assert.equal((await api('POST', '/api/pedidos', { produtoId: 'prod1', formaPagamento: 'pix', cpfCnpj: CPF_CLIENTE }, 'tok-cliente', { url })).s, 409);
    // com recebedor da Transfeera, a cobrança esbarra na documentação e o pedido é cancelado
    r2.tabelas.dadosRecebimento.loja1.provedor = 'transfeera';
    const c = await api('POST', '/api/pedidos', { produtoId: 'prod1', formaPagamento: 'pix', cpfCnpj: CPF_CLIENTE }, 'tok-cliente', { url });
    assert.equal(c.s, 501);
    assert.ok(Object.values(r2.tabelas.pedidos).every((p) => p.status === 'cancelado'));

    // aviso enquanto o provedor não está pronto: o banco deve tentar de novo depois
    assert.equal((await api('POST', '/api/webhooks/pagamento', null, null, { url, bruto: '{}' })).s, 503);
  } finally {
    s.close();
  }
});
