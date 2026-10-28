// Cotações com fontes SIMULADAS (não acessa a internet).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { criarRepoMemoria } from './apoio/repo-memoria.js';

let fontes, servidor, base, repo, cot;
const estado = { bceFora: false, dia: '2026-10-27', usd: 1.12 };

before(async () => {
  fontes = http.createServer((req, res) => {
    const enviar = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/bce') {
      if (estado.bceFora) return enviar({}, 503);
      // formato em lista; o BCE não publica ARS nem UYU
      return enviar([['USD', estado.usd], ['GBP', 0.842], ['BRL', 5.66], ['CAD', 1.58], ['AUD', 1.607], ['MXN', 20.9]]
        .map(([quote, rate]) => ({ date: estado.dia, base: 'EUR', quote, rate })));
    }
    if (req.url === '/reserva') {
      return enviar({ result: 'success', time_last_update_unix: Date.parse(estado.dia) / 1000, base_code: 'EUR',
        rates: { EUR: 1, USD: 1.119, GBP: 0.84, BRL: 5.65, CAD: 1.57, AUD: 1.6, MXN: 20.8, ARS: 1713.3, UYU: 44.9 } });
    }
    enviar({}, 404);
  });
  await new Promise((r) => fontes.listen(0, r));
  const u = `http://localhost:${fontes.address().port}`;
  Object.assign(process.env, { FX_URL_BCE: `${u}/bce`, FX_URL_RESERVA: `${u}/reserva`, TAREFAS_TOKEN: 'tarefas' });
  cot = await import('../server/lib/cotacoes.js');
  const { criarApp } = await import('../server/app.js');
  repo = criarRepoMemoria();
  servidor = criarApp({ repo }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
});
after(() => { servidor.close(); if (fontes.listening) fontes.close(); });

const get = async (p) => { const r = await fetch(base + p); return { s: r.status, j: await r.json() }; };
const atualizar = () => fetch(base + '/api/tarefas/cotacoes', { method: 'POST', headers: { 'x-tarefas-token': 'tarefas' } }).then((r) => r.json());

test('lê os formatos de resposta mais comuns', () => {
  assert.deepEqual(cot.lerTaxas({ rates: { usd: 1.1, X: 0, Y: 'abc' } }), { USD: 1.1 });
  assert.deepEqual(cot.lerTaxas([{ quote: 'BRL', rate: 5.6 }]), { BRL: 5.6 });
  assert.deepEqual(cot.lerTaxas({ rates: [{ currency: 'GBP', value: 0.8 }] }), { GBP: 0.8 });
  assert.equal(cot.lerData({ date: '2026-10-27T00:00' }), '2026-10-27');
});

test('sem cotação salva, a rota avisa em vez de inventar', async () => {
  assert.equal((await get('/api/cotacoes')).s, 503);
});

test('usa o BCE e completa com a reserva o que o BCE não tem', async () => {
  const r = await atualizar();
  assert.equal(r.data, '2026-10-27');
  assert.equal(r.fontes.BRL, 'bce');
  assert.equal(r.fontes.ARS, 'exchangerate-api');
  assert.deepEqual(r.faltando, []);
  const t = (await get('/api/cotacoes')).j;
  assert.equal(t.taxas.EUR, 1);
  assert.equal(t.taxas.BRL, 5.66);
  assert.equal(t.taxas.UYU, 44.9);
});

test('BCE fora do ar: tudo vem da reserva, e o histórico de ontem continua lá', async () => {
  estado.bceFora = true; estado.dia = '2026-10-28';
  const r = await atualizar();
  assert.equal(r.fontes.BRL, 'exchangerate-api');
  assert.match(r.erros[0], /BCE/);
  estado.bceFora = false;
  assert.equal((await get('/api/cotacoes')).j.taxas.BRL, 5.65);
  assert.equal((await get('/api/cotacoes/2026-10-27')).j.taxas.BRL, 5.66);
  const h = (await get('/api/cotacoes/historico/brl?dias=10')).j.historico;
  assert.deepEqual(h.map((x) => x.data), ['2026-10-28', '2026-10-27']);
});

test('atualizar no mesmo dia substitui em vez de duplicar', async () => {
  estado.usd = 1.2;
  await atualizar();
  const h = (await get('/api/cotacoes/historico/USD')).j.historico;
  assert.equal(h.filter((x) => x.data === '2026-10-28').length, 1);
  assert.equal(h[0].taxa, 1.2);
});

test('datas e moedas inválidas são recusadas', async () => {
  assert.equal((await get('/api/cotacoes/27-10-2026')).s, 400);
  assert.equal((await get('/api/cotacoes/historico/US')).s, 400);
});

test('se nenhuma fonte responde, a tarefa acusa falha e a última cotação continua valendo', async () => {
  fontes.close(); // derruba as duas fontes
  const r = await fetch(base + '/api/tarefas/cotacoes', { method: 'POST', headers: { 'x-tarefas-token': 'tarefas' } });
  assert.equal(r.status, 502);
  assert.equal((await get('/api/cotacoes')).j.taxas.USD, 1.2);
});
