// Arquivos de entrega só para quem pagou (trava ENTREGAS_SO_PAGAS ligada nestes testes).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';

let repo, base, servidor, dono, cliente, clienteId, vend, linkAssinado;

const pedir = async (metodo, caminho, { corpo, tipo = 'application/json', token } = {}) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { ...(corpo !== undefined ? { 'Content-Type': tipo } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: corpo });
  return { s: r.status, j: r.headers.get('content-type')?.includes('json') ? await r.json() : null, cache: r.headers.get('cache-control') };
};

before(async () => {
  const { criarApp } = await import('../server/app.js');
  ({ linkAssinado } = await import('../server/routes/prototipo.js'));
  repo = criarRepoMemoria();
  servidor = criarApp({ repo, limites: { desligados: true }, entregasSoPagas: true }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
  await repo.criarConta({ email: 'dono@ex.com', senha: 'segredo123', nome: 'Dono', usuario: 'dono_e', papel: 'dono' });
  dono = (await pedir('POST', '/api/contas/entrar', { corpo: JSON.stringify({ login: 'dono@ex.com', senha: 'segredo123' }) })).j.sessao.access_token;
  const c = (await pedir('POST', '/api/contas/cadastro', { corpo: JSON.stringify({ nome: 'Cli Ente', usuario: 'cli_e', senha: 'segredo123' }) })).j;
  cliente = c.sessao.access_token; clienteId = c.perfil.id;
  await repo.salvarDocPrototipo('stores', 'inv-enttok1', { invite: { token: 'enttok1', email: 'v@ex.com', exp: Date.now() + 864e5, used: false } });
  vend = (await pedir('POST', '/api/contas/vendedor/criar', { corpo: JSON.stringify({ token: 'enttok1', usuario: 'vend_e', senha: 'segredo123' }) })).j.sessao.access_token;
});
after(() => servidor.close());

test('PDF de entrega: só com link assinado, e o link só para vendedor, dono e quem pagou', async () => {
  // loja da vendedora com um produto, um PDF de entrega e um logo
  const loja = { store: { id: 7001, n: 'Loja E', c: 'ebooks', prods: [{ id: 'e1', name: ['Ebook', 'Ebook', 'E-book', 'Ebook'], price: 20 }] }, ts: 1 };
  assert.equal((await pedir('PUT', '/api/prototipo/docs/stores/s7001', { corpo: JSON.stringify({ dados: loja }), token: vend })).s, 200);
  const pdf = (await pedir('POST', '/api/prototipo/arquivos', { corpo: '%PDF-1.4 entrega', tipo: 'application/pdf', token: vend })).j.id;
  const logo = (await pedir('POST', '/api/prototipo/arquivos', { corpo: '<svg xmlns="http://www.w3.org/2000/svg"/>', tipo: 'image/svg+xml', token: vend })).j.id;
  assert.equal((await pedir('PUT', '/api/prototipo/docs/delivfiles/p-e1-pt-1', { corpo: JSON.stringify({ dados: { pkey: 'pe1', lg: 'pt', asset: pdf, name: 'ebook.pdf' } }), token: vend })).s, 200);

  // logo (não é entrega) abre direto; o PDF não
  assert.equal((await pedir('GET', `/_blob/${logo}`)).s, 200);
  assert.equal((await pedir('GET', `/_blob/${pdf}`)).s, 403);

  // quem pode pegar o link
  const link = (token) => pedir('GET', `/api/prototipo/arquivos/${pdf}/link`, { token });
  assert.equal((await link(null)).s, 401);
  assert.equal((await link(cliente)).s, 403); // ainda não pagou
  const doVendedor = await link(vend);
  assert.equal(doVendedor.s, 200);
  assert.match(doVendedor.j.url, new RegExp(`^/_blob/${pdf}\\?ate=\\d+&ass=`));
  assert.equal((await link(dono)).s, 200);
  // logo: o link é o de sempre
  assert.equal((await pedir('GET', `/api/prototipo/arquivos/${logo}/link`)).j.url, `/_blob/${logo}`);

  // o link assinado abre (sem cache compartilhado); mexido ou vencido, não
  const aberto = await pedir('GET', doVendedor.j.url);
  assert.equal(aberto.s, 200);
  assert.equal(aberto.cache, 'private, max-age=600');
  assert.equal((await pedir('GET', doVendedor.j.url.replace(/ass=./, 'ass=X'))).s, 403);
  // a assinatura de um arquivo não abre outro
  assert.equal((await pedir('GET', doVendedor.j.url.replace(`/_blob/${pdf}`, `/_blob/${logo}`))).s, 200); // logo é aberto de qualquer jeito
  await repo.salvarDocPrototipo('delivfiles', 'p-outro-pt-1', { pkey: 'pe1', asset: 'c'.repeat(32) });
  await repo.salvarArquivoPrototipo('c'.repeat(32), 'application/pdf', Buffer.from('%PDF outro'));
  assert.equal((await pedir('GET', doVendedor.j.url.replace(`/_blob/${pdf}`, `/_blob/${'c'.repeat(32)}`))).s, 403);
  assert.equal((await pedir('GET', linkAssinado(pdf, Date.now() - 11 * 60 * 1000))).s, 403);

  // o cliente paga (pedido pago do produto copiado para as tabelas): agora recebe o link
  const lojaReal = Object.values(repo.tabelas.lojas).find((l) => l.prototipo_id === 7001);
  const produto = Object.values(repo.tabelas.produtos).find((p) => p.loja_id === lojaReal.id && p.prototipo_id === 'e1');
  repo.tabelas.pedidos.pago1 = { id: 'pago1', cliente_id: clienteId, produto_id: produto.id, status: 'aguardando_pagamento' };
  assert.equal((await link(cliente)).s, 403); // pedido criado, mas ainda não pago
  repo.tabelas.pedidos.pago1.status = 'pago';
  const doCliente = await link(cliente);
  assert.equal(doCliente.s, 200);
  assert.equal((await pedir('GET', doCliente.j.url)).s, 200);
});

test('com a trava desligada (padrão), tudo continua como antes', async () => {
  const { criarApp } = await import('../server/app.js');
  const r2 = criarRepoMemoria();
  const srv = criarApp({ repo: r2, entregasSoPagas: false }).listen(0);
  try {
    const b = `http://localhost:${srv.address().port}`;
    await r2.salvarArquivoPrototipo('b'.repeat(32), 'application/pdf', Buffer.from('%PDF x'));
    await r2.salvarDocPrototipo('delivfiles', 'p-x-pt-1', { pkey: 'px', asset: 'b'.repeat(32) });
    assert.equal((await fetch(`${b}/_blob/${'b'.repeat(32)}`)).status, 200);
    assert.equal((await (await fetch(`${b}/api/prototipo/arquivos/${'b'.repeat(32)}/link`)).json()).url, `/_blob/${'b'.repeat(32)}`);
  } finally { srv.close(); }
});
