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
  assert.match(html, /^<!doctype html><html><head><link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"><link rel="icon" href="\/favicon-32\.png" sizes="32x32" type="image\/png"><script src="\/js\/ponte-claude\.js"><\/script>/);
  // o ícone é servido e é a moeda K do protótipo
  const icone = await (await fetch(base + '/favicon.svg')).text();
  assert.match(icone, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 128 128">/);
  assert.equal((await fetch(base + '/favicon-32.png')).headers.get('content-type'), 'image/png');
  assert.match(html, /const SITE_URL=location\.origin\+"\/";/);
  assert.match(html, /var RATES_URL="\/api\/rates";/);
  assert.doesNotMatch(html, /claude\.ai\/artifact/);
  // qualquer outro endereço também abre o protótipo; a ponte é servida como arquivo
  assert.match(await (await fetch(base + '/qualquer-coisa')).text(), /Kennismarket/);
  assert.match(await (await fetch(base + '/js/ponte-claude.js')).text(), /window\.claude/);
});

test('se o protótipo mudar, os ajustes que não acharem o trecho aparecem na lista', () => {
  const { faltando } = montarPaginaPrototipo('<html><head></head><body></body></html>');
  assert.deepEqual(faltando, ['links de convite', 'cotações']);
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
