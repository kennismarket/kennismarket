// Memória curta na frente do banco (server/lib/cache-repo.js): conta quantos pedidos chegam ao "banco".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comCache, vencimentoDoToken } from '../server/lib/cache-repo.js';
import { criarRepoMemoriaSemCache } from './apoio/repo-memoria.js';

function bancoContando() {
  const n = { usuario: 0, docs: 0 };
  const docs = { stores: [{ id: 's1', dados: { store: { id: 1, n: 'A' } } }] };
  let atraso = null;
  const banco = {
    async usuarioPorToken(token) { n.usuario++; return token.startsWith('ok') ? { id: token.split('-')[1], nome: 'X', papel: 'cliente' } : null; },
    async listarDocsPrototipo(c) { n.docs++; if (atraso) await atraso; return structuredClone(docs[c] || []); },
    async salvarDocPrototipo(c, id, dados) { (docs[c] ||= []).push({ id, dados }); },
    async apagarDocPrototipo() {},
    async banirConta() {},
    async trocarSenha() {},
    outraCoisa: () => 'direto',
  };
  return { banco, n, docs, segurar: (p) => { atraso = p; } };
}
const jwt = (exp) => `x.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.y`;

test('quem é a pessoa: pergunta ao banco uma vez por minuto, não a cada conferência', async () => {
  let agora = 0;
  const { banco, n } = bancoContando();
  const repo = comCache(banco, { agora: () => agora });
  for (let i = 0; i < 12; i++) { assert.equal((await repo.usuarioPorToken('ok-a')).id, 'a'); agora += 5000; } // 1 minuto conferindo a cada 5 s
  assert.equal(n.usuario, 1);
  agora += 1000;
  await repo.usuarioPorToken('ok-a');
  assert.equal(n.usuario, 2); // passou de 1 minuto: pergunta de novo
  // login que não existe não é guardado
  await repo.usuarioPorToken('ruim'); await repo.usuarioPorToken('ruim');
  assert.equal(n.usuario, 4);
  // cada um recebe uma cópia
  const u = await repo.usuarioPorToken('ok-a'); u.papel = 'dono';
  assert.equal((await repo.usuarioPorToken('ok-a')).papel, 'cliente');
});

test('a memória nunca passa do vencimento do próprio login', async () => {
  let agora = 1_000_000;
  const { banco, n } = bancoContando();
  const repo = comCache(banco, { agora: () => agora });
  const banco2 = { ...banco, usuarioPorToken: async (t) => { n.usuario++; return { id: 'b', token: t }; } };
  const r2 = comCache(banco2, { agora: () => agora });
  const token = jwt((agora + 10_000) / 1000); // vence em 10 s
  assert.equal(vencimentoDoToken(token), agora + 10_000);
  await r2.usuarioPorToken(token); agora += 9_000; await r2.usuarioPorToken(token);
  assert.equal(n.usuario, 1);
  agora += 2_000; await r2.usuarioPorToken(token);
  assert.equal(n.usuario, 2); // venceu: não usa a memória
  assert.ok(repo);
});

test('banir, nova senha etc. apagam a memória daquela conta na hora (as outras continuam)', async () => {
  const { banco, n } = bancoContando();
  const repo = comCache(banco);
  await repo.usuarioPorToken('ok-a'); await repo.usuarioPorToken('ok-b');
  await repo.banirConta('a', true);
  await repo.usuarioPorToken('ok-a'); await repo.usuarioPorToken('ok-b');
  assert.equal(n.usuario, 3); // só a conta "a" foi perguntada de novo
  await repo.trocarSenha('b', 'nova');
  await repo.usuarioPorToken('ok-b');
  assert.equal(n.usuario, 4);
});

test('listas: guardadas até alguém gravar naquela coleção (ou 30 s)', async () => {
  let agora = 0;
  const { banco, n } = bancoContando();
  const repo = comCache(banco, { agora: () => agora });
  for (let i = 0; i < 6; i++) { await repo.listarDocsPrototipo('stores'); agora += 5000; }
  assert.equal(n.docs, 1); // 6 conferências, 1 leitura
  await repo.listarDocsPrototipo('sellers');
  assert.equal(n.docs, 2);
  await repo.salvarDocPrototipo('stores', 's2', { store: { id: 2, n: 'B' } });
  const depois = await repo.listarDocsPrototipo('stores');
  assert.equal(n.docs, 3);
  assert.equal(depois.length, 2); // a gravação aparece na hora
  await repo.listarDocsPrototipo('sellers');
  assert.equal(n.docs, 3); // a outra coleção continua guardada
  agora += 31_000;
  await repo.listarDocsPrototipo('stores');
  assert.equal(n.docs, 4); // 30 s: lê de novo (mudanças feitas por fora)
  // cópias: mexer no que recebeu não muda a memória
  const l = await repo.listarDocsPrototipo('stores'); l[0].dados.store.n = 'mexido';
  assert.equal((await repo.listarDocsPrototipo('stores'))[0].dados.store.n, 'A');
});

test('leitura que estava a caminho quando alguém gravou não volta para a memória', async () => {
  const { banco, n, segurar } = bancoContando();
  const repo = comCache(banco);
  let soltar; segurar(new Promise((ok) => { soltar = ok; }));
  const lenta = repo.listarDocsPrototipo('stores'); // começa a ler (lista antiga)
  await repo.salvarDocPrototipo('stores', 's9', { store: { id: 9 } }); // alguém grava no meio
  segurar(null); soltar(); await lenta;
  const agora = await repo.listarDocsPrototipo('stores');
  assert.equal(n.docs, 2); // leu de novo, em vez de usar a lista antiga
  assert.ok(agora.some((d) => d.id === 's9'));
});

test('o resto passa direto, e pôr memória duas vezes não muda nada', () => {
  const { banco } = bancoContando();
  const repo = comCache(banco);
  assert.equal(repo.outraCoisa(), 'direto');
  assert.equal(comCache(repo), repo);
});

test('no site: login + 1 minuto de conferências = 1 pergunta de quem é e no máximo 1 leitura da lista', async () => {
  const { criarApp } = await import('../server/app.js');
  const base0 = criarRepoMemoriaSemCache();
  const n = { usuario: 0, docs: 0 };
  const u0 = base0.usuarioPorToken; base0.usuarioPorToken = (t) => { n.usuario++; return u0(t); };
  const l0 = base0.listarDocsPrototipo; base0.listarDocsPrototipo = (c) => { if (c === 'stores') n.docs++; return l0(c); };
  await base0.criarConta({ email: 'c@ex.com', senha: 'segredo123', nome: 'Cli Ente', usuario: 'cli_cache', papel: 'cliente' });
  const srv = criarApp({ repo: base0, limites: { desligados: true } }).listen(0);
  const base = `http://localhost:${srv.address().port}`;
  try {
    n.usuario = 0; n.docs = 0;
    const token = (await (await fetch(`${base}/api/contas/entrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'cli_cache', senha: 'segredo123' }) })).json()).sessao.access_token;
    let versao = '';
    for (let i = 0; i < 12; i++) {
      const r = await (await fetch(`${base}/api/prototipo/colecoes/stores?versao=${encodeURIComponent(versao)}`, { headers: { Authorization: `Bearer ${token}` } })).json();
      versao = r.versao;
    }
    assert.equal(n.usuario, 1); // só no login; as 12 conferências usaram a memória
    assert.ok(n.docs <= 1);
  } finally { srv.close(); }
});
