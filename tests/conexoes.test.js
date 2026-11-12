// Conexões HTTP do servidor com o Supabase (server/lib/conexoes.js): um conjunto só, reaproveitado,
// com limite de conexões simultâneas (o resto espera na fila) e as paradas fechadas.
// Um servidor HTTP local faz o papel do Supabase e conta as conexões abertas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { criarConexoes, lerLimites } from '../server/lib/conexoes.js';

const LIMITES = { maxConexoes: 3, ociosaMs: 1000, conectarMs: 2000, respostaMs: 5000, corpoMs: 5000 };

function supabaseFalso({ atraso = 0 } = {}) {
  const st = { abertas: 0, maxAbertas: 0, total: 0, fechadas: 0, pedidos: 0, caminhos: [] };
  const srv = http.createServer((req, res) => {
    st.pedidos++;
    st.caminhos.push(req.url);
    setTimeout(() => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify([{ id: 1, nome: 'Loja' }])); }, atraso);
  });
  srv.on('connection', (s) => {
    st.total++; st.abertas++; st.maxAbertas = Math.max(st.maxAbertas, st.abertas);
    s.on('close', () => { st.abertas--; st.fechadas++; });
  });
  return new Promise((ok) => srv.listen(0, () => ok({ srv, st, url: `http://localhost:${srv.address().port}` })));
}
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

test('muitas chamadas ao mesmo tempo: no máximo o limite de conexões, e todas respondem', async () => {
  const { srv, st, url } = await supabaseFalso({ atraso: 40 });
  const c = criarConexoes(LIMITES);
  try {
    const respostas = await Promise.all(Array.from({ length: 30 }, () => c.fetch(url + '/rest/v1/lojas').then((r) => r.json())));
    assert.equal(respostas.length, 30);
    assert.ok(respostas.every((r) => r[0].nome === 'Loja'));
    assert.ok(st.maxAbertas <= 3, `abriu ${st.maxAbertas} conexões ao mesmo tempo`);
    assert.equal(st.total, 3); // e reaproveitou essas 3 para as 30 chamadas (o resto esperou na fila)
  } finally { await c.fechar(); srv.close(); }
});

test('chamadas uma depois da outra reaproveitam a mesma conexão', async () => {
  const { srv, st, url } = await supabaseFalso();
  const c = criarConexoes(LIMITES);
  try {
    for (let i = 0; i < 10; i++) await (await c.fetch(url + '/rest/v1/lojas')).json();
    assert.equal(st.pedidos, 10);
    // 10 chamadas em no máximo 2 conexões (a 2ª chamada pode sair antes de a 1ª devolver a conexão)
    assert.ok(st.total <= 2, `abriu ${st.total} conexões para 10 chamadas`);
  } finally { await c.fechar(); srv.close(); }
});

test('conexão parada é fechada depois do tempo de ociosidade', async () => {
  const { srv, st, url } = await supabaseFalso();
  const c = criarConexoes(LIMITES);
  try {
    await (await c.fetch(url + '/x')).json();
    assert.equal(st.abertas, 1);
    await esperar(1600);
    assert.equal(st.abertas, 0);
    assert.equal(st.fechadas, 1);
  } finally { await c.fechar(); srv.close(); }
});

test('desligar o servidor fecha as conexões abertas', async () => {
  const { srv, st, url } = await supabaseFalso();
  const c = criarConexoes({ ...LIMITES, ociosaMs: 60_000 });
  await (await c.fetch(url + '/x')).json();
  assert.equal(st.abertas, 1);
  await c.fechar();
  await esperar(100);
  assert.equal(st.abertas, 0);
  srv.close();
});

test('o cliente do Supabase usa o conjunto de conexões (consultas, login e arquivos)', async () => {
  const { srv, st, url } = await supabaseFalso();
  const c = criarConexoes(LIMITES);
  try {
    const cliente = createClient(url, 'chave-teste', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: c.fetch } });
    const outro = createClient(url, 'chave-teste', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: c.fetch } });
    const { data, error } = await cliente.from('lojas').select('*');
    assert.equal(error, null);
    assert.equal(data[0].nome, 'Loja');
    await outro.from('produtos').select('*');
    await cliente.storage.from('prototipo').list();
    assert.ok(st.caminhos.some((p) => p.startsWith('/rest/v1/lojas')));
    assert.ok(st.caminhos.some((p) => p.startsWith('/storage/v1/')));
    assert.ok(st.total <= 2, `abriu ${st.total}`); // dois clientes, três serviços, as mesmas conexões
  } finally { await c.fechar(); srv.close(); }
});

test('limites: padrão 20 conexões e 10 s parado; dá para mudar pelas variáveis, com valores seguros', () => {
  assert.deepEqual([lerLimites({}).maxConexoes, lerLimites({}).ociosaMs], [20, 10_000]);
  assert.equal(lerLimites({ SUPABASE_MAX_CONEXOES: '50' }).maxConexoes, 50);
  assert.equal(lerLimites({ SUPABASE_MAX_CONEXOES: '0' }).maxConexoes, 20);
  assert.equal(lerLimites({ SUPABASE_MAX_CONEXOES: 'muito' }).maxConexoes, 20);
  assert.equal(lerLimites({ SUPABASE_CONEXAO_OCIOSA_MS: '5000' }).ociosaMs, 5000);
});
