// Etapa 5: chat real (cliente ↔ vendedor), aviso de mensagem nova, marcação de contato por fora,
// suporte lendo só conversas marcadas ou com reembolso, mensagens automáticas do pagamento e
// arquivos anexados na entrega. Banco em memória e pagamento simulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';

let repo, base, servidor, pagamentos;

before(async () => {
  const { criarApp } = await import('../server/app.js');
  const { criarPagamentos } = await import('../server/pagamentos/index.js');
  repo = criarRepoMemoria();
  const t = repo.tabelas;
  t.usuarios = {
    'tok-cli': { id: 'u-cli', email: 'joao@x.com', nome: 'João Silva', papel: 'cliente' },
    'tok-cli2': { id: 'u-cli2', email: 'bia@x.com', nome: 'Bia', papel: 'cliente' },
    'tok-vend': { id: 'u-vend', email: 'ana@x.com', nome: 'Ana', papel: 'vendedor' },
    'tok-outro': { id: 'u-outro', email: 'rui@x.com', nome: 'Rui', papel: 'vendedor' },
    'tok-dono': { id: 'u-dono', email: 'lucas@x.com', nome: 'Lucas', papel: 'dono' },
  };
  t.lojas = {
    l1: { id: 'l1', vendedor_id: 'u-vend', nome: 'Loja da Ana', prototipo_id: 501, publicada: true, banida: false, porcentagem_vendedor: 50 },
    l2: { id: 'l2', vendedor_id: null, nome: 'Loja do dono', prototipo_id: 502, publicada: true, banida: false },
  };
  t.produtos = { p1: { id: 'p1', loja_id: 'l1', titulo: 'Análise', prototipo_id: 'a1', preco_kn: 50, ativo: true } };
  t.cotacoes = [{ data: '2026-11-04', moeda: 'BRL', taxa: 6, fonte: 'bce' }];
  pagamentos = criarPagamentos({ provedor: 'simulado', cartaoAtivo: false, simulado: { segredo: 's' }, transfeera: { ambiente: 'sandbox' } });
  t.dadosRecebimento.l1 = { loja_id: 'l1', situacao: 'pronto', provedor: 'simulado', nome: 'Ana', cpf_cnpj: '52998224725', pix_chave: 'ana@x.com', pix_tipo: 'email' };
  servidor = criarApp({ repo, pagamentos, limites: { desligados: true } }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
});
after(() => servidor.close());

async function api(metodo, caminho, corpo, token, tipo = 'application/json') {
  const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': tipo, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo == null ? undefined : (tipo === 'application/json' ? JSON.stringify(corpo) : corpo) });
  return { s: r.status, j: await r.json().catch(() => null) };
}
let conversaId;

test('cliente conversa com a loja de um vendedor real; loja do dono continua com o robô', async () => {
  assert.equal((await api('GET', '/api/chat/loja/501')).s, 401);
  assert.deepEqual((await api('GET', '/api/chat/loja/502', null, 'tok-cli')).j, { real: false, motivo: 'sem_vendedor' });
  assert.equal((await api('GET', '/api/chat/loja/501', null, 'tok-vend')).j.motivo, 'propria_loja');
  assert.deepEqual((await api('GET', '/api/chat/loja/501', null, 'tok-cli')).j, { real: true, conversa: null, mensagens: [] });
  assert.equal((await api('POST', '/api/chat/loja/501/mensagens', { texto: '   ' }, 'tok-cli')).s, 400);
  assert.equal((await api('POST', '/api/chat/loja/502/mensagens', { texto: 'oi' }, 'tok-cli')).s, 409);
  const r = await api('POST', '/api/chat/loja/501/mensagens', { texto: 'Oi! Vocês fazem análise de padaria?' }, 'tok-cli');
  assert.equal(r.s, 201);
  assert.equal(r.j.alerta, null);
  conversaId = r.j.conversaId;
  const g = (await api('GET', '/api/chat/loja/501', null, 'tok-cli')).j;
  assert.deepEqual(g.mensagens.map((m) => [m.de, m.texto]), [['cliente', 'Oi! Vocês fazem análise de padaria?']]);
});

test('vendedor vê a conversa com aviso de mensagem nova e responde; o cliente recebe só o que é novo', async () => {
  const lista = (await api('GET', '/api/chat/conversas?papel=vendedor', null, 'tok-vend')).j.conversas;
  assert.equal(lista.length, 1);
  assert.deepEqual([lista[0].cliente, lista[0].nova, lista[0].loja.prototipoId], ['João', true, 501]);
  assert.equal(lista[0].clienteId, 'u-cli');
  // outra pessoa não vê nem escreve
  assert.equal((await api('GET', `/api/chat/conversas/${conversaId}/mensagens`, null, 'tok-outro')).s, 404);
  assert.equal((await api('POST', `/api/chat/conversas/${conversaId}/mensagens`, { texto: 'x' }, 'tok-cli2')).s, 404);
  // abrir marca como lida
  const m = (await api('GET', `/api/chat/conversas/${conversaId}/mensagens`, null, 'tok-vend')).j;
  assert.equal(m.mensagens.length, 1);
  assert.equal((await api('GET', '/api/chat/conversas?papel=vendedor', null, 'tok-vend')).j.conversas[0].nova, false);
  const ultimo = m.mensagens[0].id;
  assert.equal((await api('POST', `/api/chat/conversas/${conversaId}/mensagens`, { texto: 'Fazemos sim!' }, 'tok-vend')).s, 201);
  assert.equal((await api('GET', '/api/chat/conversas', null, 'tok-cli')).j.conversas[0].nova, true);
  const novas = (await api('GET', `/api/chat/loja/501?depois=${ultimo}`, null, 'tok-cli')).j.mensagens;
  assert.deepEqual(novas.map((x) => [x.de, x.texto]), [['vendedor', 'Fazemos sim!']]);
  assert.equal((await api('GET', '/api/chat/conversas', null, 'tok-cli')).j.conversas[0].nova, false);
});

test('contato por fora: a mensagem passa, mas a conversa fica marcada e o suporte pode ler', async () => {
  // antes da marcação (e sem reembolso), o suporte não lê
  assert.equal((await api('GET', `/api/admin/conversas/${conversaId}/mensagens`, null, 'tok-dono')).s, 403);
  const r = await api('POST', `/api/chat/conversas/${conversaId}/mensagens`, { texto: 'Me chama no whats (11) 98765-4321' }, 'tok-vend');
  assert.equal(r.s, 201);
  assert.equal(r.j.alerta, 'contato_fora');
  const marcadas = (await api('GET', '/api/admin/conversas', null, 'tok-dono')).j.conversas;
  assert.equal(marcadas.length, 1);
  assert.equal(marcadas[0].marcada.motivo, 'contato_fora');
  const lida = (await api('GET', `/api/admin/conversas/${conversaId}/mensagens`, null, 'tok-dono')).j;
  assert.equal(lida.mensagens.length, 3);
  assert.equal(lida.conversa.cliente, 'João Silva');
  assert.equal((await api('GET', '/api/admin/conversas', null, 'tok-vend')).s, 403);
  // desmarcar: volta a não poder ler
  await api('POST', `/api/admin/conversas/${conversaId}/marcar`, { marcada: false }, 'tok-dono');
  assert.equal((await api('GET', `/api/admin/conversas/${conversaId}/mensagens`, null, 'tok-dono')).s, 403);
});

let pedidoId;
test('pagou: as mensagens automáticas entram na conversa (uma vez só)', async () => {
  const c = await api('POST', '/api/pedidos', { produtoId: 'p1', formaPagamento: 'pix' }, 'tok-cli');
  assert.equal(c.s, 201);
  pedidoId = c.j.id;
  assert.equal((await api('POST', '/api/teste/simular', { pedidoId, tipo: 'pago' }, 'tok-dono')).s, 200);
  await api('POST', '/api/teste/simular', { pedidoId, tipo: 'pago' }, 'tok-dono'); // aviso repetido
  const msgs = (await api('GET', '/api/chat/loja/501', null, 'tok-cli')).j.mensagens.filter((m) => m.chave);
  assert.deepEqual(msgs.map((m) => [m.de, m.chave]), [['sistema', 'm_prodBought'], ['vendedor', 'm_started']]);
  assert.deepEqual(msgs[0].params, { produto: 'a1', titulo: 'Análise', n: 50, pedido: pedidoId });
  // o vendedor também vê (aviso de mensagem nova)
  assert.equal((await api('GET', '/api/chat/conversas?papel=vendedor', null, 'tok-vend')).j.conversas[0].nova, false); // a última é do lado dele
  // com pedido de reembolso, o suporte lê a conversa
  await api('POST', `/api/pedidos/${pedidoId}/reembolso`, { motivo: 'teste' }, 'tok-cli');
  assert.equal((await api('GET', `/api/admin/conversas/${conversaId}/mensagens`, null, 'tok-dono')).s, 200);
  const casos = (await api('GET', '/api/admin/casos', null, 'tok-dono')).j;
  assert.equal(casos.abertos[0].conversaId, conversaId);
  // o dono nega, para o pedido voltar a "pago" e seguir o teste da entrega
  await api('POST', `/api/admin/reembolsos/${casos.abertos[0].id}`, { aprovar: false }, 'tok-dono');
});

test('entrega com arquivo anexado: só o cliente do pedido, o vendedor e o dono abrem', async () => {
  const subir = async (token, txt) => (await api('POST', '/api/prototipo/arquivos', `%PDF-1.4 ${txt}`, token, 'application/pdf')).j.id;
  const meu = await subir('tok-vend', 'relatorio');
  const alheio = await subir('tok-outro', 'outro');
  assert.equal((await api('POST', `/api/pedidos/${pedidoId}/entregue`, { arquivos: [{ id: alheio, nome: 'x.pdf' }] }, 'tok-vend')).s, 400);
  assert.equal(repo.tabelas.pedidos[pedidoId].status, 'pago'); // nada mudou
  const e = await api('POST', `/api/pedidos/${pedidoId}/entregue`, { arquivos: [{ id: meu, nome: 'analise-padaria.pdf' }] }, 'tok-vend');
  assert.equal(e.s, 200);
  assert.deepEqual(e.j.arquivos.map((a) => a.nome), ['analise-padaria.pdf']);
  // o cliente vê o arquivo no pedido
  const p = (await api('GET', '/api/pedidos', null, 'tok-cli')).j.pedidos.find((x) => x.id === pedidoId);
  assert.deepEqual(p.arquivos.map((a) => [a.id, a.nome]), [[meu, 'analise-padaria.pdf']]);
  // trava: sem link assinado não abre; o link só sai para quem pode
  assert.equal((await fetch(`${base}/_blob/${meu}`)).status, 403);
  const link = (tok) => api('GET', `/api/prototipo/arquivos/${meu}/link`, null, tok);
  assert.equal((await link(null)).s, 401);
  assert.equal((await link('tok-cli2')).s, 403);
  assert.equal((await link('tok-outro')).s, 403);
  for (const tok of ['tok-cli', 'tok-vend', 'tok-dono']) {
    const l = await link(tok);
    assert.equal(l.s, 200, tok);
    assert.equal((await fetch(base + l.j.url)).status, 200);
  }
});
