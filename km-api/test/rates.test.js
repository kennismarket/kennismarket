// Testa as cotações com fontes SIMULADAS (não acessa a internet).
const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PORT = 4020;
const tmpDb = path.join(__dirname, 'rates-test.db');
for (const f of [tmpDb, tmpDb + '-wal', tmpDb + '-shm']) try { fs.unlinkSync(f) } catch {}
Object.assign(process.env, {
  DB_FILE: tmpDb, KM_API_KEY: 'site', ASAAS_BASE_URL: `http://localhost:${PORT}/v3`, ASAAS_API_KEY: 'test',
  FX_ECB_URL: `http://localhost:${PORT}/ecb`, FX_OPEN_URL: `http://localhost:${PORT}/open`,
});

let ecbDown = false, day = '2026-10-27', usd = 1.12;
const mock = http.createServer((req, res) => {
  const send = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url === '/ecb') {
    if (ecbDown) return send({ status: 503 }, 503);
    // formato em lista (v2); o BCE não tem ARS nem UYU
    return send([['USD', usd], ['GBP', 0.842], ['BRL', 5.66], ['CAD', 1.58], ['AUD', 1.607], ['MXN', 20.9]].map(([q, r]) => ({ date: day, base: 'EUR', quote: q, rate: r })));
  }
  if (req.url === '/open') return send({ result: 'success', time_last_update_unix: Date.parse(day) / 1000, base_code: 'EUR',
    rates: { EUR: 1, USD: 1.119, GBP: 0.84, BRL: 5.65, CAD: 1.57, AUD: 1.6, MXN: 20.8, ARS: 1713.3, UYU: 44.9 } });
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    if (req.url.startsWith('/v3/customers?')) return send({ data: [] });
    if (req.url === '/v3/customers') return send({ id: 'cus_1' });
    if (req.url === '/v3/payments') return send({ id: 'pay_1', invoiceUrl: 'https://sandbox/i/1', value: JSON.parse(body).value, _sent: JSON.parse(body) });
    send({}, 404);
  });
});

(async () => {
  await new Promise((r) => mock.listen(PORT, r));
  const rates = require('../src/rates');
  const { app } = require('../src/server');
  const db = require('../src/db');
  const srv = app.listen(0); const base = `http://localhost:${srv.address().port}`;
  const get = async (p) => { const r = await fetch(base + p); return { s: r.status, j: await r.json() } };

  // sem nada salvo: 503
  assert.strictEqual((await get('/rates')).s, 503);

  // 1) dia 27: BCE para as principais, reserva para ARS e UYU
  let r = await rates.updateRates();
  assert.strictEqual(r.date, '2026-10-27');
  assert.strictEqual(r.sources.USD, 'ecb'); assert.strictEqual(r.sources.ARS, 'exchangerate-api'); assert.deepStrictEqual(r.missing, []);
  let L = (await get('/rates')).j;
  assert.strictEqual(L.rates.BRL, 5.66); assert.strictEqual(L.rates.ARS, 1713.3); assert.strictEqual(L.rates.EUR, 1);

  // 2) dia 28: dólar muda; histórico continua com os dois dias
  day = '2026-10-28'; usd = 1.13; await rates.updateRates();
  assert.strictEqual((await get('/rates')).j.rates.USD, 1.13);
  const h = (await get('/rates/history/usd')).j.history;
  assert.deepStrictEqual(h.map((x) => [x.date, x.rate]), [['2026-10-28', 1.13], ['2026-10-27', 1.12]]);
  assert.strictEqual((await get('/rates/2026-10-27')).j.rates.USD, 1.12);   // cotação de um dia passado

  // 3) BCE fora do ar: tudo vem da reserva, nada se perde
  ecbDown = true; day = '2026-10-29'; r = await rates.updateRates();
  assert.strictEqual(r.sources.USD, 'exchangerate-api'); assert.strictEqual(r.rates.USD, 1.119);
  ecbDown = false;

  // 4) pedido em KN Coins: converte para reais com a cotação do dia e guarda a moeda que o cliente viu
  const o = await fetch(base + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'site' },
    body: JSON.stringify({ id: 'p1', sellerId: 's1', valueKn: 90, billingType: 'BOLETO', displayCurrency: 'usd', buyer: { name: 'A', email: 'a@x.com', cpfCnpj: '1' } }) });
  // (vendedor não existe → 404 antes de cobrar; cria e tenta de novo)
  assert.strictEqual(o.status, 404);
  db.prepare("INSERT INTO sellers (id,name,email,cpf_cnpj,pix_key,pix_key_type) VALUES ('s1','S','s@x.com','1','s@x.com','EMAIL')").run();
  const o2 = await (await fetch(base + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'site' },
    body: JSON.stringify({ id: 'p1', sellerId: 's1', valueKn: 90, billingType: 'BOLETO', displayCurrency: 'usd', buyer: { name: 'A', email: 'a@x.com', cpfCnpj: '1' } }) })).json();
  assert.strictEqual(o2.value, 508.5);   // 90 × 5,65 (cotação BRL do dia 29)
  const row = db.prepare("SELECT value_kn, fx_currency, fx_rate, fx_brl, fx_date FROM orders WHERE id='p1'").get();
  assert.deepStrictEqual(row, { value_kn: 90, fx_currency: 'USD', fx_rate: 1.119, fx_brl: 5.65, fx_date: '2026-10-29' });

  // leitura de formato em objeto também funciona
  assert.deepStrictEqual(rates.parseRates({ rates: { usd: '1.5', XXX: 0 } }), { USD: 1.5 });

  console.log('OK: cotações — fontes, reserva, histórico e conversão do pedido');
  srv.close(); mock.close(); db.close();
  for (const f of [tmpDb, tmpDb + '-wal', tmpDb + '-shm']) try { fs.unlinkSync(f) } catch {}
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
