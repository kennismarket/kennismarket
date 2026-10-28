// Teste do fluxo completo contra um Asaas SIMULADO (não toca no Asaas de verdade).
const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MOCK_PORT = 4010;
const tmpDb = path.join(__dirname, 'test.db');
for (const f of [tmpDb, tmpDb + '-wal', tmpDb + '-shm']) try { fs.unlinkSync(f) } catch {}
Object.assign(process.env, {
  ASAAS_BASE_URL: `http://localhost:${MOCK_PORT}/v3`, ASAAS_API_KEY: 'test', ASAAS_WEBHOOK_TOKEN: 'whk',
  KM_API_KEY: 'site', DEFAULT_SELLER_PERCENT: '50', SPLIT_BASE: 'net', AUTO_RELEASE_DAYS: '7', DB_FILE: tmpDb,
});

// ---- Asaas simulado ----
const calls = [];
let n = 0;
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = body ? JSON.parse(body) : null;
    calls.push({ m: req.method, u: req.url, j, key: req.headers.access_token });
    const send = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/v3/accounts') return send({ id: 'acc_' + ++n, walletId: 'wal_' + n, apiKey: 'sub_key' });
    if (req.url.startsWith('/v3/customers?')) return send({ data: [] });
    if (req.url === '/v3/customers') return send({ id: 'cus_' + ++n });
    if (req.url === '/v3/payments') return send({ id: 'pay_' + ++n, invoiceUrl: 'https://sandbox/i/' + n, value: j.value });
    if (/\/pixQrCode$/.test(req.url)) return send({ encodedImage: 'BASE64', payload: '000201...', expirationDate: '2026-12-31' });
    if (/\/refund$/.test(req.url)) return send({ status: 'REFUNDED' });
    if (req.url === '/v3/transfers') return send({ id: 'tra_' + ++n, status: 'PENDING', value: j.value });
    send({ errors: [{ description: 'rota não simulada' }] }, 404);
  });
});

(async () => {
  await new Promise((r) => mock.listen(MOCK_PORT, r));
  const { app, autoRelease } = require('../src/server');
  const srv = app.listen(0);
  const base = `http://localhost:${srv.address().port}`;
  const api = async (m, p, b, h = { 'x-api-key': 'site' }) => {
    const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined });
    return { s: r.status, j: await r.json().catch(() => null) };
  };
  const hook = (ev) => api('POST', '/webhooks/asaas', ev, { 'asaas-access-token': 'whk' });
  const db = require('../src/db');

  // sem chave -> 401
  assert.strictEqual((await api('POST', '/sellers', {}, {})).s, 401);

  // 1) vendedor com comissão própria de 60%
  const sel = await api('POST', '/sellers', { id: 'loja1', name: 'Ana Souza', email: 'ana@x.com', cpfCnpj: '12345678909', birthDate: '1995-05-10', mobilePhone: '54999999999', incomeValue: 3000, address: 'Rua A', addressNumber: '10', province: 'Centro', postalCode: '95000000', percent: 60 });
  assert.strictEqual(sel.s, 201); assert.strictEqual(sel.j.walletId, 'wal_1');

  // 2) pedido Pix de R$ 100
  const ord = await api('POST', '/orders', { id: 'ped1', sellerId: 'loja1', value: 100, billingType: 'PIX', buyer: { name: 'João', email: 'joao@x.com', cpfCnpj: '98765432100' } });
  assert.strictEqual(ord.s, 201); assert.ok(ord.j.pix.copyPaste); assert.strictEqual(ord.j.status, 'awaiting_payment');
  const payId = ord.j.paymentId;

  // não dá para liberar antes de pagar
  assert.strictEqual((await api('POST', '/orders/ped1/release')).s, 409);

  // webhook com token errado -> 401
  assert.strictEqual((await api('POST', '/webhooks/asaas', { event: 'PAYMENT_RECEIVED', payment: { id: payId } }, { 'asaas-access-token': 'x' })).s, 401);

  // 3) Asaas avisa que recebeu (líquido R$ 99,01 após taxa)
  assert.strictEqual((await hook({ id: 'evt1', event: 'PAYMENT_RECEIVED', payment: { id: payId, netValue: 99.01 } })).s, 200);
  // evento repetido é ignorado
  assert.strictEqual((await hook({ id: 'evt1', event: 'PAYMENT_RECEIVED', payment: { id: payId, netValue: 99.01 } })).j.duplicate, true);
  assert.strictEqual((await api('GET', '/orders/ped1')).j.status, 'held');

  // 4) entregue + cliente confirma -> repasse de 60% de 99,01 = 59,41
  assert.strictEqual((await api('POST', '/orders/ped1/delivered')).s, 200);
  const rel = await api('POST', '/orders/ped1/release');
  assert.strictEqual(rel.s, 200); assert.strictEqual(rel.j.sellerAmount, 59.41); assert.strictEqual(rel.j.platformAmount, 39.6);
  const tr = calls.find((c) => c.u === '/v3/transfers');
  assert.deepStrictEqual({ v: tr.j.value, w: tr.j.walletId, r: tr.j.externalReference }, { v: 59.41, w: 'wal_1', r: 'ped1' });
  // não libera duas vezes
  assert.strictEqual((await api('POST', '/orders/ped1/release')).s, 409);
  // transferência concluída
  await hook({ id: 'evt2', event: 'TRANSFER_DONE', transfer: { id: rel.j.transferId } });
  assert.strictEqual((await api('GET', '/orders/ped1')).j.transfer_status, 'DONE');

  // 5) segundo pedido: disputa -> reembolso
  const o2 = await api('POST', '/orders', { id: 'ped2', sellerId: 'loja1', value: 50, billingType: 'CREDIT_CARD', buyer: { name: 'João', email: 'joao@x.com', cpfCnpj: '98765432100' } });
  await hook({ id: 'evt3', event: 'PAYMENT_CONFIRMED', payment: { id: o2.j.paymentId, netValue: 47.5 } });
  assert.strictEqual((await api('POST', '/orders/ped2/dispute')).j.status, 'disputed');
  assert.strictEqual((await api('POST', '/orders/ped2/release')).s, 409); // disputa bloqueia
  assert.strictEqual((await api('POST', '/orders/ped2/refund', { reason: 'entrega diferente' })).j.status, 'refunded');

  // 6) terceiro pedido: liberação automática após 7 dias (comissão padrão 50% após trocar)
  await api('PATCH', '/sellers/loja1', { percent: null });
  const o3 = await api('POST', '/orders', { id: 'ped3', sellerId: 'loja1', value: 20, billingType: 'BOLETO', buyer: { name: 'João', email: 'joao@x.com', cpfCnpj: '98765432100' } });
  await hook({ id: 'evt4', event: 'PAYMENT_RECEIVED', payment: { id: o3.j.paymentId, netValue: 18.01 } });
  await api('POST', '/orders/ped3/delivered');
  db.prepare("UPDATE orders SET delivered_at=? WHERE id='ped3'").run(new Date(Date.now() - 8 * 864e5).toISOString());
  await autoRelease();
  const o3b = (await api('GET', '/orders/ped3')).j;
  assert.strictEqual(o3b.status, 'released'); assert.strictEqual(o3b.seller_amount, 9.01);

  // 7) vendedor que recebe por chave Pix (sem subconta)
  assert.strictEqual((await api('POST', '/sellers/pix', { id: 'loja2', name: 'Bia', email: 'bia@x.com', cpfCnpj: '11122233344', pixKey: 'bia@x.com', pixKeyType: 'EMAIL', percent: 70 })).s, 201);
  const o4 = await api('POST', '/orders', { id: 'ped4', sellerId: 'loja2', value: 10, billingType: 'PIX', buyer: { name: 'João', email: 'joao@x.com', cpfCnpj: '98765432100' } });
  await hook({ id: 'evt5', event: 'PAYMENT_RECEIVED', payment: { id: o4.j.paymentId, netValue: 9.01 } });
  const r4 = await api('POST', '/orders/ped4/release');
  assert.strictEqual(r4.j.sellerAmount, 6.31);
  const tr4 = calls.filter((c) => c.u === '/v3/transfers').pop();
  assert.deepStrictEqual({ k: tr4.j.pixAddressKey, t: tr4.j.pixAddressKeyType, v: tr4.j.value }, { k: 'bia@x.com', t: 'EMAIL', v: 6.31 });
  // transferência falhou -> volta para a garantia para tentar de novo
  await hook({ id: 'evt6', event: 'TRANSFER_FAILED', transfer: { id: r4.j.transferId } });
  assert.strictEqual((await api('GET', '/orders/ped4')).j.status, 'held');

  // todas as chamadas ao Asaas levaram a chave
  assert.ok(calls.every((c) => c.key === 'test'));
  console.log('OK: todos os testes passaram (' + calls.length + ' chamadas ao Asaas simulado)');
  srv.close(); mock.close(); db.close();
  for (const f of [tmpDb, tmpDb + '-wal', tmpDb + '-shm']) try { fs.unlinkSync(f) } catch {}
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
