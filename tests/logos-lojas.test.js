// Logos oficiais das lojas que já existiam (server/lib/logos-lojas.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepoMemoria } from './apoio/repo-memoria.js';
import { aplicarLogosOficiais, lerLogosOficiais, DOC_REGISTRO } from '../server/lib/logos-lojas.js';

const doc = async (repo, c, id) => (await repo.listarDocsPrototipo(c)).find((d) => d.id === id)?.dados;

test('os arquivos da pasta: 40 lojas, um SVG simples (sem script, link nem imagem de fora) para cada', () => {
  const logos = lerLogosOficiais();
  assert.equal(logos.length, 40);
  assert.equal(new Set(logos.map((l) => l.loja)).size, 40);
  for (const l of logos) {
    assert.match(l.loja, /^s\d+$/);
    assert.match(l.id, /^[0-9a-f]{32}$/);
    const svg = l.svg.toString('utf8');
    assert.match(svg, /^<svg /);
    assert.doesNotMatch(svg, /<script|<image|<foreignObject|href=|\son[a-z]+=/i, l.loja);
  }
});

test('troca a logo da loja e da cópia do vendedor, uma vez só, e não desfaz a troca feita depois pelo editor', async () => {
  const repo = criarRepoMemoria();
  const logos = [
    { loja: 's300001', svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), id: 'a'.repeat(32) },
    { loja: 's1001', svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'), id: 'b'.repeat(32) },
    { loja: 's999', svg: Buffer.from('<svg/>'), id: 'c'.repeat(32) },
  ];
  await repo.salvarDocPrototipo('stores', 's300001', { store: { id: 300001, n: 'Compass', glogo: { L: 1 } }, ts: 1 });
  await repo.salvarDocPrototipo('stores', 's1001', { store: { id: 1001, n: 'Bord', logo: 'd'.repeat(32) }, contaDona: 'u1', ts: 1 });
  await repo.salvarDocPrototipo('sellers', 'acc-tok', { acc: { userId: 'u1', storeId: 1001, store: { id: 1001, n: 'Bord', logo: 'd'.repeat(32) } } });
  const mudou = [];

  const r = await aplicarLogosOficiais(repo, { logos, mudou: (c) => mudou.push(c) });
  assert.deepEqual(r.aplicadas, ['s300001', 's1001']);
  assert.deepEqual(r.semLoja, ['s999']);
  assert.deepEqual(mudou.sort(), ['sellers', 'stores']);

  const compass = (await doc(repo, 'stores', 's300001')).store;
  assert.equal(compass.logo, 'a'.repeat(32));
  assert.equal(compass.glogo, null);
  assert.equal(compass.n, 'Compass');
  assert.equal((await doc(repo, 'stores', 's1001')).contaDona, 'u1');
  assert.equal((await doc(repo, 'stores', 's1001')).store.logo, 'b'.repeat(32));
  assert.equal((await doc(repo, 'sellers', 'acc-tok')).acc.store.logo, 'b'.repeat(32));
  const arquivo = await repo.lerArquivoPrototipo('a'.repeat(32));
  assert.equal(arquivo.tipo, 'image/svg+xml');
  assert.deepEqual((await doc(repo, 'stores', DOC_REGISTRO)).aplicadas, { s300001: 'a'.repeat(32), s1001: 'b'.repeat(32) });

  // depois o vendedor troca a logo no editor: ligar o servidor de novo não desfaz
  await repo.salvarDocPrototipo('stores', 's1001', { store: { id: 1001, n: 'Bord', logo: 'e'.repeat(32) }, contaDona: 'u1', ts: 2 });
  const r2 = await aplicarLogosOficiais(repo, { logos });
  assert.deepEqual(r2.aplicadas, []);
  assert.equal(r2.jaFeitas, 2);
  assert.equal((await doc(repo, 'stores', 's1001')).store.logo, 'e'.repeat(32));

  // um arquivo novo para a loja (id diferente) é aplicado de novo
  const r3 = await aplicarLogosOficiais(repo, { logos: [{ ...logos[0], svg: Buffer.from('<svg/>'), id: 'f'.repeat(32) }] });
  assert.deepEqual(r3.aplicadas, ['s300001']);
  assert.equal((await doc(repo, 'stores', 's300001')).store.logo, 'f'.repeat(32));
});

test('o documento de registro não aparece como loja nem quebra a cópia nas tabelas', async () => {
  const { espelharTodas } = await import('../server/lib/espelho-lojas.js');
  const repo = criarRepoMemoria();
  await repo.salvarDocPrototipo('stores', 's300001', { store: { id: 300001, n: 'Compass', prods: [] }, ts: 1 });
  await aplicarLogosOficiais(repo, { logos: [{ loja: 's300001', svg: Buffer.from('<svg/>'), id: 'a'.repeat(32) }] });
  const r = await espelharTodas(repo);
  assert.deepEqual(r.erros, []);
});
