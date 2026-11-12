// Itens médios do relatório de segurança (11/11/2026): 5 (simular pagamento só o dono, ver fluxo.test.js),
// 6 (chave Pix pede senha e fica registrada), 7 (trava por conta) e 8 (proteções do navegador).
// O item 4 (nada gravado direto no banco pelo navegador) é testado em tests/sql/verificacoes.sql.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';
import { criarTravaContas } from '../server/lib/trava-contas.js';

let repo, base, servidor, dono, ana;
const pedir = async (metodo, caminho, corpo, token, extras = {}) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extras }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { s: r.status, j: await r.json().catch(() => null), h: r.headers };
};
const entrar = (login, senha) => pedir('POST', '/api/contas/entrar', { login, senha });

before(async () => {
  const { criarApp } = await import('../server/app.js');
  repo = criarRepoMemoria();
  servidor = criarApp({ repo, limites: { desligados: true } }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
  await repo.criarConta({ email: 'dono@ex.com', senha: 'segredo123', nome: 'Dono', usuario: 'dono_m', papel: 'dono' });
  dono = (await entrar('dono@ex.com', 'segredo123')).j.sessao.access_token;
  await repo.salvarDocPrototipo('stores', 'inv-anamed1', { invite: { token: 'anamed1', email: 'ana@ex.com', exp: Date.now() + 864e5, used: false } });
  ana = (await pedir('POST', '/api/contas/vendedor/criar', { token: 'anamed1', usuario: 'ana_med', senha: 'senhaDaAna1' })).j.sessao.access_token;
  for (const id of [8101, 8102]) {
    await pedir('PUT', `/api/prototipo/docs/stores/s${id}`, { dados: { store: { id, n: `Loja ${id}`, prods: [{ id: `q${id}`, name: ['P'], price: 10 }] }, ts: 1 } }, ana);
  }
});
after(() => servidor.close());

const pix = (chave, extra = {}) => ({ nome: 'Ana Souza', cpfCnpj: '52998224725', pix: { tipo: 'email', chave }, ...extra });

test('6: chave Pix nova pede a senha; a mesma chave (ou a de outra loja da conta) não', async () => {
  const salvar = (loja, corpo) => pedir('PUT', `/api/loja/recebimento?loja=${loja}`, corpo, ana);
  let r = await salvar(8101, pix('ana@ex.com'));
  assert.equal(r.s, 400);
  assert.equal(r.j.codigo, 'senha_obrigatoria');
  r = await salvar(8101, pix('ana@ex.com', { senha: 'errada' }));
  assert.equal(r.s, 401);
  assert.equal(r.j.codigo, 'senha_errada');
  assert.equal((await salvar(8101, pix('ana@ex.com', { senha: 'senhaDaAna1' }))).s, 200);
  // confirmar de novo os mesmos dados (só o nome muda) não pede senha
  assert.equal((await salvar(8101, { ...pix('ana@ex.com'), nome: 'Ana S.' })).s, 200);
  // a outra loja usa a mesma chave da conta: não pede senha
  assert.equal((await salvar(8102, pix('ana@ex.com'))).s, 200);
  // a primeira chave da conta não aparece como troca
  assert.deepEqual((await pedir('GET', '/api/admin/casos', null, dono)).j.trocasPix, []);
});

test('6: trocar a chave fica registrado e aparece no painel do dono (sem a chave inteira)', async () => {
  const r = await pedir('PUT', '/api/loja/recebimento?loja=8101', pix('golpista@mal.com', { senha: 'senhaDaAna1' }), ana);
  assert.equal(r.s, 200);
  const casos = (await pedir('GET', '/api/admin/casos', null, dono)).j;
  assert.equal(casos.trocasPix.length, 1);
  const tr = casos.trocasPix[0];
  assert.equal(tr.loja.nome, 'Loja 8101');
  assert.equal(tr.vendedor, 'ana_med');
  assert.equal(tr.antes, 'pix email an•••@ex.com');
  assert.equal(tr.depois, 'pix email go•••@mal.com');
  assert.equal(JSON.stringify(casos.trocasPix).includes('golpista'), false);
  // só o dono vê
  assert.equal((await pedir('GET', '/api/admin/casos', null, ana)).s, 403);
});

test('7: 10 senhas erradas travam aquela conta por 15 minutos (até a certa); outras contas seguem', async () => {
  await repo.criarConta({ email: 'alvo@ex.com', senha: 'senhaCerta1', nome: 'Alvo X', usuario: 'alvo', papel: 'cliente' });
  await repo.criarConta({ email: 'outra@ex.com', senha: 'senhaCerta2', nome: 'Outra X', usuario: 'outra', papel: 'cliente' });
  // erros pelo usuário E pelo e-mail contam juntos (é a mesma conta)
  for (let i = 0; i < 5; i++) assert.equal((await entrar('alvo', `errada${i}`)).s, 401);
  for (let i = 0; i < 5; i++) assert.equal((await entrar('alvo@ex.com', `errada${i}`)).s, 401);
  const travada = await entrar('alvo', 'senhaCerta1');
  assert.equal(travada.s, 429);
  assert.equal(travada.j.codigo, 'conta_travada');
  assert.equal((await entrar('outra', 'senhaCerta2')).s, 200);
});

test('7: acertar a senha zera a contagem; troca de senha e Pix também contam', async () => {
  await repo.criarConta({ email: 'zera@ex.com', senha: 'senhaCerta1', nome: 'Zera X', usuario: 'zera', papel: 'cliente' });
  for (let i = 0; i < 9; i++) await entrar('zera', 'errada');
  const ok = await entrar('zera', 'senhaCerta1');
  assert.equal(ok.s, 200);
  for (let i = 0; i < 9; i++) assert.equal((await entrar('zera', 'errada')).s, 401); // recomeçou do zero
  // troca de senha com a senha atual errada conta na mesma trava
  assert.equal((await pedir('PUT', '/api/contas/senha', { atual: 'errada', nova: 'outraSenha1' }, ok.j.sessao.access_token)).s, 401);
  assert.equal((await entrar('zera', 'senhaCerta1')).s, 429);
});

test('7: o relógio da trava (15 minutos)', () => {
  let agora = 0;
  const trava = criarTravaContas({ agora: () => agora });
  for (let i = 0; i < 9; i++) trava.errou('x@ex.com');
  assert.equal(trava.travada('x@ex.com'), 0);
  trava.errou('X@EX.COM'); // maiúsculas: a mesma conta
  assert.equal(trava.travada('x@ex.com'), 15 * 60 * 1000);
  agora += 15 * 60 * 1000 + 1;
  assert.equal(trava.travada('x@ex.com'), 0);
  // erros espalhados por mais de 15 minutos não travam
  for (let i = 0; i < 9; i++) trava.errou('y@ex.com');
  agora += 16 * 60 * 1000;
  trava.errou('y@ex.com');
  assert.equal(trava.travada('y@ex.com'), 0);
});

test('8: proteções do navegador na página, na API e nos arquivos', async () => {
  const pagina = await fetch(base + '/');
  assert.equal(pagina.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(pagina.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(pagina.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(pagina.headers.get('permissions-policy'), /camera=\(\)/);
  // regra de código LIGADA (bloqueia) desde 12/11/2026
  const csp = pagina.headers.get('content-security-policy');
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /https:\/\/cdnjs\.cloudflare\.com/);
  assert.match(csp, /report-uri \/api\/csp/);
  assert.equal(pagina.headers.get('content-security-policy-report-only'), null);
  // HTTPS: o navegador passa a usar sempre (atrás do Render, que avisa que a conexão é https)
  assert.equal(pagina.headers.get('strict-transport-security'), null);
  const segura = await fetch(base + '/', { headers: { 'X-Forwarded-Proto': 'https' } });
  assert.match(segura.headers.get('strict-transport-security'), /max-age=31536000/);
  // API também leva as proteções
  assert.equal((await pedir('GET', '/api/vivo')).h.get('x-frame-options'), 'SAMEORIGIN');
  // o navegador conta o que bloquearia
  const rel = await fetch(base + '/api/csp', { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'https://mal.example' } }) });
  assert.equal(rel.status, 204);
});

test('8: interruptor CSP_MODO no Render: ligado (padrão), observar ou desligado', async () => {
  const { cabecalhoCsp } = await import('../server/lib/cabecalhos.js');
  assert.equal(cabecalhoCsp(undefined), 'Content-Security-Policy');
  assert.equal(cabecalhoCsp('qualquer'), 'Content-Security-Policy');
  assert.equal(cabecalhoCsp(' Observar '), 'Content-Security-Policy-Report-Only');
  assert.equal(cabecalhoCsp('desligado'), null);
});
