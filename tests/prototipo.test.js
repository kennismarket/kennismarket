// O protótipo como página do site, e os recursos do claude.ai reproduzidos no servidor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { criarRepoMemoria } from './apoio/repo-memoria.js';

let repo, base, servidor, montarPaginaPrototipo;

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { criarApp } = await import('../server/app.js');
  ({ montarPaginaPrototipo } = await import('../server/lib/pagina-prototipo.js'));
  repo = criarRepoMemoria();
  servidor = criarApp({ repo }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
});
after(() => servidor.close());

const pedir = async (metodo, caminho, corpo, tipo = 'application/json') => {
  const r = await fetch(base + caminho, { method: metodo, headers: corpo !== undefined ? { 'Content-Type': tipo } : {}, body: corpo });
  const texto = r.headers.get('content-type')?.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { s: r.status, j: texto, h: r.headers };
};

test('a página do site é o protótipo, só com os ajustes de ligação e o ícone da aba', async () => {
  const r = await fetch(base + '/');
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /^<!doctype html><html lang="nl" translate="no"><head><link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"><link rel="icon" href="\/favicon-32\.png" sizes="32x32" type="image\/png"><script src="\/js\/ponte-claude\.js"><\/script>/);
  // o ícone é servido e é a moeda K do protótipo
  const icone = await (await fetch(base + '/favicon.svg')).text();
  assert.match(icone, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 128 128">/);
  assert.equal((await fetch(base + '/favicon-32.png')).headers.get('content-type'), 'image/png');
  // o navegador nunca oferece tradução automática
  assert.match(html, /<meta name="google" content="notranslate">/);
  assert.match(html, /const SITE_URL=location\.origin\+"\/";/);
  assert.match(html, /var RATES_URL="\/api\/rates";/);
  assert.doesNotMatch(html, /claude\.ai\/artifact/);
  // qualquer outro endereço também abre o protótipo; a ponte é servida como arquivo
  assert.match(await (await fetch(base + '/qualquer-coisa')).text(), /Kennismarket/);
  assert.match(await (await fetch(base + '/js/ponte-claude.js')).text(), /window\.claude/);
});

test('se o protótipo mudar, os ajustes que não acharem o trecho aparecem na lista', () => {
  const { faltando } = montarPaginaPrototipo('<html><head></head><body></body></html>');
  assert.deepEqual(faltando, ['links de convite', 'cotações', 'painel só para o dono', 'editor de lojas só para o dono',
    'botão do painel só para o dono', 'login do dono', 'e-mail cabe no campo de usuário', 'sair do site sai da conta de dono']);
});

test('db: coleções com versão, gravar e apagar documentos', async () => {
  const v1 = await pedir('GET', '/api/prototipo/colecoes/stores');
  assert.deepEqual(v1.j.docs, []);
  assert.equal((await pedir('GET', `/api/prototipo/colecoes/stores?versao=${v1.j.versao}`)).j.inalterado, true);

  assert.equal((await pedir('PUT', '/api/prototipo/docs/stores/s1001', JSON.stringify({ dados: { store: { id: 1001, n: 'Loja' } } }))).s, 200);
  const v2 = await pedir('GET', `/api/prototipo/colecoes/stores?versao=${v1.j.versao}`);
  assert.notEqual(v2.j.versao, v1.j.versao);
  assert.deepEqual(v2.j.docs, [{ id: 's1001', dados: { store: { id: 1001, n: 'Loja' } } }]);

  assert.equal((await pedir('DELETE', '/api/prototipo/docs/stores/s1001')).s, 200);
  assert.deepEqual((await pedir('GET', '/api/prototipo/colecoes/stores')).j.docs, []);

  assert.equal((await pedir('GET', '/api/prototipo/colecoes/outra')).s, 404);
  assert.equal((await pedir('PUT', '/api/prototipo/docs/stores/a%2Fb', JSON.stringify({ dados: {} }))).s, 400);
  assert.equal((await pedir('PUT', '/api/prototipo/docs/stores/x', JSON.stringify({ dados: [1] }))).s, 400);
});

test('assets: enviar, abrir em /_blob com proteção, recusar tipo e tamanho, apagar', async () => {
  const pdf = Buffer.from('%PDF-1.4 teste');
  const up = await pedir('POST', '/api/prototipo/arquivos', pdf, 'application/pdf');
  assert.equal(up.s, 201);
  assert.match(up.j.id, /^[0-9a-f]{32}$/);
  assert.equal(up.j.sizeBytes, pdf.length);

  const blob = await pedir('GET', `/_blob/${up.j.id}`);
  assert.equal(blob.s, 200);
  assert.equal(blob.h.get('content-type'), 'application/pdf');
  assert.deepEqual(blob.j, pdf);
  assert.match(blob.h.get('content-security-policy'), /sandbox/);
  assert.equal(blob.h.get('x-content-type-options'), 'nosniff');

  // um arquivo .json chega inteiro (não é lido como pedido em JSON)
  const js = await pedir('POST', '/api/prototipo/arquivos', '{"a":1}', 'application/json');
  assert.equal(js.s, 201);
  assert.equal((await pedir('GET', `/_blob/${js.j.id}`)).j.a, 1);

  assert.deepEqual((await pedir('POST', '/api/prototipo/arquivos', 'x', 'application/x-msdownload')).j.codigo, 'unsupported_type');
  const grande = await pedir('POST', '/api/prototipo/arquivos', Buffer.alloc(20 * 1024 * 1024 + 10), 'application/pdf');
  assert.equal(grande.s, 413);
  assert.equal(grande.j.codigo, 'too_large');

  assert.equal((await pedir('DELETE', `/api/prototipo/arquivos/${up.j.id}`)).s, 200);
  assert.equal((await pedir('GET', `/_blob/${up.j.id}`)).s, 404);
  assert.equal((await pedir('GET', '/_blob/nao-existe')).s, 404);
  assert.equal((await pedir('GET', '/_blob/..%2Fpackage.json')).s, 404);
});

test('IA do suporte desligada sem chave: o protótipo usa as respostas prontas dele', async () => {
  assert.deepEqual((await pedir('GET', '/api/prototipo/ia')).j, { disponivel: false });
  const r = await pedir('POST', '/api/prototipo/ia', JSON.stringify({ turns: [{ role: 'user', content: 'oi' }] }));
  assert.equal(r.s, 503);
  assert.equal(r.j.codigo, 'sampling_disabled');
});

test('importação: envia os arquivos, troca os ids nos documentos e grava as três coleções', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'km-import-'));
  try {
    for (const c of ['stores', 'delivfiles', 'sellers', 'arquivos']) mkdirSync(join(pasta, c));
    const antigo = 'a'.repeat(32);
    writeFileSync(join(pasta, 'arquivos', `${antigo}.pdf`), '%PDF-1.4 importado');
    writeFileSync(join(pasta, 'stores', 's2001.json'), JSON.stringify({ store: { id: 2001, n: 'Importada', logo: null }, ts: 1 }));
    writeFileSync(join(pasta, 'delivfiles', 'pf-x-en.json'), JSON.stringify({ asset: antigo, ext: 'pdf', lg: 'en', name: 'Guia.pdf' }));
    writeFileSync(join(pasta, 'sellers', 'acc-abc.json'), JSON.stringify({ acc: { token: 'abc', username: 'ana' } }));
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/importar-prototipo.mjs', pasta, base]);
    assert.match(stdout, /1 arquivos enviados/);

    const entrega = (await pedir('GET', '/api/prototipo/colecoes/delivfiles')).j.docs.find((d) => d.id === 'pf-x-en');
    assert.notEqual(entrega.dados.asset, antigo);
    assert.equal((await pedir('GET', `/_blob/${entrega.dados.asset}`)).j.toString(), '%PDF-1.4 importado');
    assert.ok((await pedir('GET', '/api/prototipo/colecoes/stores')).j.docs.some((d) => d.dados.store.n === 'Importada'));
    assert.equal((await pedir('GET', '/api/prototipo/colecoes/sellers')).j.docs[0].dados.acc.username, 'ana');
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('conta de dono: entra pelo login do site, e só ela vê e abre o painel', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /<script src="\/js\/admin-dono\.js"><\/script>/);
  assert.match(html, /function vAdmin\(\)\{if\(!window\.KM_DONO\)return kmSemAcesso\(\);/);
  assert.match(html, /function vEditStore\(\)\{if\(!window\.KM_DONO\)return kmSemAcesso\(\);/);
  assert.match(html, /\$\{window\.KM_DONO\?'<button class="btn block" data-a="go" data-v="admin">'\+tr\("accAdmin"\)\+'<\/button>':""\}/);
  assert.match(html, /function doAuth\(e\)\{e\.preventDefault\(\);if\(authMode==="entrar"&&window\.kmTalvezDono&&kmTalvezDono\(\)\)return;/);
  assert.match(html, /logout:\(\)=>\{window\.kmSairDono&&kmSairDono\(\);S\.user=null;/);
  // o aviso de demonstração e o "(demo)" do botão saíram
  assert.doesNotMatch(html, /\$\{tr\("adminDemo"\)\}/);
  assert.doesNotMatch(html, /accAdmin:"[^"]*\(demo\)"/);
  assert.match(await (await fetch(base + '/js/admin-dono.js')).text(), /kmTalvezDono/);
});

test('administração: /api/admin/eu só responde para o dono', async () => {
  const { tokens } = await repo.prepararDadosTeste();
  const eu = (token) => fetch(base + '/api/admin/eu', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  assert.equal((await eu()).status, 401);
  assert.equal((await eu(tokens.vendedor)).status, 403);
  const r = await eu(tokens.dono);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).papel, 'dono');
});

test('db: criar e apagar convites, configuração e apagar vendedores exigem dono', async () => {
  const { tokens } = await repo.prepararDadosTeste();
  const gravar = (metodo, caminho, dados, token) => fetch(base + '/api/prototipo/docs/' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: dados ? JSON.stringify({ dados }) : undefined,
  });
  const convite = { invite: { token: 'abc12345', email: 'v@ex.nl', used: false } };

  // criar convite: só o dono
  assert.equal((await gravar('PUT', 'stores/inv-abc12345', convite)).status, 401);
  assert.equal((await gravar('PUT', 'stores/inv-abc12345', convite, tokens.cliente)).status, 403);
  assert.equal((await gravar('PUT', 'stores/inv-abc12345', convite, tokens.dono)).status, 200);
  // usar o convite (marcar como usado) continua aberto: o vendedor ainda não tem login no site
  assert.equal((await gravar('PUT', 'stores/inv-abc12345', { invite: { ...convite.invite, used: true } })).status, 200);
  // apagar convite: só o dono
  assert.equal((await gravar('DELETE', 'stores/inv-abc12345')).status, 401);
  assert.equal((await gravar('DELETE', 'stores/inv-abc12345', null, tokens.dono)).status, 200);

  // configuração do suporte: só o dono
  assert.equal((await gravar('PUT', 'stores/cfg-support', { cfg: { supportEmail: 'x@ex.nl' } })).status, 401);
  assert.equal((await gravar('PUT', 'stores/cfg-support', { cfg: { supportEmail: 'x@ex.nl' } }, tokens.dono)).status, 200);

  // contas de vendedor: criar continua aberto (pelo convite); apagar, só o dono
  assert.equal((await gravar('PUT', 'sellers/acc-abc12345', { acc: { username: 'v' } })).status, 200);
  assert.equal((await gravar('DELETE', 'sellers/acc-abc12345', null, tokens.vendedor)).status, 403);
  assert.equal((await gravar('DELETE', 'sellers/acc-abc12345', null, tokens.dono)).status, 200);

  // lojas continuam abertas como no protótipo
  assert.equal((await gravar('PUT', 'stores/s4242', { store: { id: 4242 } })).status, 200);
  assert.equal((await gravar('DELETE', 'stores/s4242')).status, 200);
});
