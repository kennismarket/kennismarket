require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const asaas = require('./asaas');
const rates = require('./rates');

const app = express();
app.use(express.json({ limit: '200kb' }));

const DEFAULT_PCT = Number(process.env.DEFAULT_SELLER_PERCENT || 50);
const SPLIT_BASE = process.env.SPLIT_BASE === 'gross' ? 'gross' : 'net';
const AUTO_DAYS = Number(process.env.AUTO_RELEASE_DAYS || 7);
const round2 = (n) => Math.round(n * 100) / 100;
const today = (plusDays = 0) => new Date(Date.now() + plusDays * 864e5).toISOString().slice(0, 10);
const now = () => new Date().toISOString();

// ---------- segurança ----------
function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
// Rotas do site: precisam do header x-api-key
function siteAuth(req, res, next) {
  if (!process.env.KM_API_KEY || !safeEqual(req.get('x-api-key'), process.env.KM_API_KEY))
    return res.status(401).json({ error: 'unauthorized' });
  next();
}
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  // Erro do Asaas: 400 se ele recusou os dados, 502 se ele falhou; nossos erros usam o próprio status
  const status = e instanceof asaas.AsaasError ? (e.status < 500 ? 400 : 502) : (e.status || 500);
  if (status >= 500) console.error(e);
  res.status(status).json({ error: e.message, details: e.body });
});

// ---------- vendedores ----------
// Cria a subconta do vendedor no Asaas e guarda o walletId.
app.post('/sellers', siteAuth, wrap(async (req, res) => {
  const b = req.body || {};
  for (const k of ['id', 'name', 'email', 'cpfCnpj', 'mobilePhone', 'incomeValue', 'address', 'addressNumber', 'province', 'postalCode'])
    if (b[k] == null || b[k] === '') return res.status(400).json({ error: `campo obrigatório: ${k}` });
  if (db.prepare('SELECT 1 FROM sellers WHERE id=?').get(b.id)) return res.status(409).json({ error: 'vendedor já existe' });
  const acc = await asaas.createSubaccount({
    name: b.name, email: b.email, cpfCnpj: b.cpfCnpj, birthDate: b.birthDate, companyType: b.companyType,
    mobilePhone: b.mobilePhone, incomeValue: b.incomeValue, address: b.address, addressNumber: b.addressNumber,
    complement: b.complement, province: b.province, postalCode: b.postalCode,
  });
  const pct = b.percent == null ? null : Number(b.percent);
  db.prepare('INSERT INTO sellers (id,name,email,cpf_cnpj,wallet_id,asaas_account,percent) VALUES (?,?,?,?,?,?,?)')
    .run(b.id, b.name, b.email, b.cpfCnpj, acc.walletId, acc.id, pct);
  // A apiKey da subconta só vem nesta resposta: guarde-a com segurança se for usar (não é necessária para o repasse).
  res.status(201).json({ id: b.id, walletId: acc.walletId, asaasAccountId: acc.id, percent: pct ?? DEFAULT_PCT });
}));

// Cadastra um vendedor que já tem conta Asaas própria (só o walletId)
app.post('/sellers/link', siteAuth, wrap(async (req, res) => {
  const b = req.body || {};
  for (const k of ['id', 'name', 'email', 'cpfCnpj', 'walletId']) if (!b[k]) return res.status(400).json({ error: `campo obrigatório: ${k}` });
  db.prepare('INSERT INTO sellers (id,name,email,cpf_cnpj,wallet_id,percent) VALUES (?,?,?,?,?,?)')
    .run(b.id, b.name, b.email, b.cpfCnpj, b.walletId, b.percent == null ? null : Number(b.percent));
  res.status(201).json({ id: b.id, walletId: b.walletId });
}));

// Vendedor recebe por chave Pix (não precisa de subconta; funciona mesmo sem CNPJ na conta principal)
app.post('/sellers/pix', siteAuth, wrap(async (req, res) => {
  const b = req.body || {};
  for (const k of ['id', 'name', 'email', 'cpfCnpj', 'pixKey', 'pixKeyType']) if (!b[k]) return res.status(400).json({ error: `campo obrigatório: ${k}` });
  if (!['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'].includes(b.pixKeyType)) return res.status(400).json({ error: 'pixKeyType: CPF, CNPJ, EMAIL, PHONE ou EVP' });
  if (db.prepare('SELECT 1 FROM sellers WHERE id=?').get(b.id)) return res.status(409).json({ error: 'vendedor já existe' });
  db.prepare('INSERT INTO sellers (id,name,email,cpf_cnpj,pix_key,pix_key_type,percent) VALUES (?,?,?,?,?,?,?)')
    .run(b.id, b.name, b.email, b.cpfCnpj, b.pixKey, b.pixKeyType, b.percent == null ? null : Number(b.percent));
  res.status(201).json({ id: b.id, payout: 'pix' });
}));

// Muda a comissão de uma loja (null = volta para a padrão)
app.patch('/sellers/:id', siteAuth, wrap(async (req, res) => {
  const s = db.prepare('SELECT * FROM sellers WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'vendedor não encontrado' });
  const p = req.body.percent;
  if (p !== null && !(Number(p) >= 0 && Number(p) <= 100)) return res.status(400).json({ error: 'percent entre 0 e 100' });
  db.prepare('UPDATE sellers SET percent=? WHERE id=?').run(p === null ? null : Number(p), s.id);
  res.json({ id: s.id, percent: p === null ? DEFAULT_PCT : Number(p) });
}));

// ---------- pedidos ----------
async function ensureCustomer(buyer) {
  const found = await asaas.findCustomerByEmail(buyer.email);
  if (found && found.data && found.data.length) return found.data[0].id;
  const c = await asaas.createCustomer({ name: buyer.name, email: buyer.email, cpfCnpj: buyer.cpfCnpj, mobilePhone: buyer.mobilePhone });
  return c.id;
}

// Cria a cobrança do pedido. O dinheiro cai na conta do Kennismarket e fica na garantia.
app.post('/orders', siteAuth, wrap(async (req, res) => {
  const b = req.body || {};
  for (const k of ['id', 'sellerId', 'billingType']) if (b[k] == null || b[k] === '') return res.status(400).json({ error: `campo obrigatório: ${k}` });
  if (b.value == null && b.valueKn == null) return res.status(400).json({ error: 'informe value (R$) ou valueKn (KN Coins)' });
  // Cotação do dia: converte KN Coins (= EUR) para reais e guarda a moeda que o cliente viu
  const fx = rates.latest();
  if (b.valueKn != null && !fx.rates.BRL) return res.status(503).json({ error: 'sem cotação de BRL salva ainda' });
  const dispCur = b.displayCurrency ? String(b.displayCurrency).toUpperCase() : null;
  if (!b.buyer || !b.buyer.name || !b.buyer.email || !b.buyer.cpfCnpj) return res.status(400).json({ error: 'buyer {name,email,cpfCnpj} obrigatório' });
  if (!['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'].includes(b.billingType)) return res.status(400).json({ error: 'billingType inválido' });
  const valueKn = b.valueKn != null ? round2(Number(b.valueKn)) : null;
  const value = valueKn != null ? round2(valueKn * fx.rates.BRL) : round2(Number(b.value));
  if (!(value > 0)) return res.status(400).json({ error: 'value inválido' });
  const seller = db.prepare('SELECT * FROM sellers WHERE id=?').get(b.sellerId);
  if (!seller) return res.status(404).json({ error: 'vendedor não encontrado' });
  if (db.prepare('SELECT 1 FROM orders WHERE id=?').get(b.id)) return res.status(409).json({ error: 'pedido já existe' });

  const customer = await ensureCustomer(b.buyer);
  const pay = await asaas.createPayment({
    customer, billingType: b.billingType, value,
    dueDate: today(b.billingType === 'BOLETO' ? 3 : 1),
    description: (b.description || `Pedido ${b.id} · Kennismarket`).slice(0, 500),
    externalReference: b.id,
  });
  db.prepare(`INSERT INTO orders (id,seller_id,buyer_email,description,value,billing_type,asaas_payment,invoice_url,status,value_kn,fx_currency,fx_rate,fx_brl,fx_date)
              VALUES (?,?,?,?,?,?,?,?,'awaiting_payment',?,?,?,?,?)`)
    .run(b.id, seller.id, b.buyer.email, b.description || null, value, b.billingType, pay.id, pay.invoiceUrl,
      valueKn, dispCur, dispCur ? (fx.rates[dispCur] || null) : null, fx.rates.BRL || null, fx.date);

  const out = { id: b.id, status: 'awaiting_payment', value, valueKn, ratesDate: fx.date, paymentId: pay.id, invoiceUrl: pay.invoiceUrl, bankSlipUrl: pay.bankSlipUrl || null };
  if (b.billingType === 'PIX') {
    const qr = await asaas.getPixQrCode(pay.id);
    out.pix = { qrCodeImage: qr.encodedImage, copyPaste: qr.payload, expiresAt: qr.expirationDate };
  }
  res.status(201).json(out);
}));

app.get('/orders/:id', siteAuth, wrap(async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'pedido não encontrado' });
  res.json(o);
}));

// O vendedor entregou: começa a contar o prazo da liberação automática
app.post('/orders/:id/delivered', siteAuth, wrap(async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'pedido não encontrado' });
  if (o.status !== 'held') return res.status(409).json({ error: `pedido está ${o.status}` });
  db.prepare('UPDATE orders SET delivered_at=?, updated_at=? WHERE id=?').run(now(), now(), o.id);
  res.json({ id: o.id, deliveredAt: now(), autoReleaseInDays: AUTO_DAYS });
}));

// Repassa a parte do vendedor (cliente confirmou, suporte decidiu ou prazo acabou)
async function release(orderId) {
  // Trava o pedido para não repassar duas vezes
  const lock = db.prepare(`UPDATE orders SET status='releasing', updated_at=? WHERE id=? AND status='held'`).run(now(), orderId);
  if (!lock.changes) {
    const o = db.prepare('SELECT status FROM orders WHERE id=?').get(orderId);
    const e = new Error(o ? `pedido está ${o.status}` : 'pedido não encontrado'); e.status = o ? 409 : 404; throw e;
  }
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  const s = db.prepare('SELECT * FROM sellers WHERE id=?').get(o.seller_id);
  const pct = s.percent == null ? DEFAULT_PCT : s.percent;
  const base = SPLIT_BASE === 'net' && o.net_value != null ? o.net_value : o.value;
  const sellerAmount = round2(base * pct / 100);
  const platformAmount = round2(base - sellerAmount);
  try {
    let t = { id: null, status: 'SKIPPED' };
    if (sellerAmount > 0) t = s.wallet_id
      ? await asaas.transferToWallet({ value: sellerAmount, walletId: s.wallet_id, externalReference: o.id })
      : await asaas.transferToWallet({ value: sellerAmount, pixAddressKey: s.pix_key, pixAddressKeyType: s.pix_key_type,
          description: `Kennismarket · pedido ${o.id}`.slice(0, 140), externalReference: o.id });
    db.prepare(`UPDATE orders SET status='released', seller_percent=?, seller_amount=?, platform_amount=?, transfer_id=?, transfer_status=?, updated_at=? WHERE id=?`)
      .run(pct, sellerAmount, platformAmount, t.id, t.status || 'PENDING', now(), o.id);
    return { id: o.id, status: 'released', sellerPercent: pct, sellerAmount, platformAmount, transferId: t.id };
  } catch (e) {
    db.prepare(`UPDATE orders SET status='held', transfer_status='FAILED', updated_at=? WHERE id=?`).run(now(), o.id);
    throw e;
  }
}
app.post('/orders/:id/release', siteAuth, wrap(async (req, res) => res.json(await release(req.params.id))));

// Cliente abriu chamado: bloqueia a liberação automática
app.post('/orders/:id/dispute', siteAuth, wrap(async (req, res) => {
  const r = db.prepare(`UPDATE orders SET status='disputed', updated_at=? WHERE id=? AND status='held'`).run(now(), req.params.id);
  if (!r.changes) return res.status(409).json({ error: 'só pedidos na garantia podem ir para disputa' });
  res.json({ id: req.params.id, status: 'disputed' });
}));
// Suporte decidiu a favor do vendedor: volta para a garantia (e pode liberar em seguida)
app.post('/orders/:id/resolve', siteAuth, wrap(async (req, res) => {
  const r = db.prepare(`UPDATE orders SET status='held', updated_at=? WHERE id=? AND status='disputed'`).run(now(), req.params.id);
  if (!r.changes) return res.status(409).json({ error: 'pedido não está em disputa' });
  res.json(req.body && req.body.release ? await release(req.params.id) : { id: req.params.id, status: 'held' });
}));

// Reembolso (só antes de o dinheiro ir para o vendedor). value opcional = reembolso parcial.
app.post('/orders/:id/refund', siteAuth, wrap(async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'pedido não encontrado' });
  if (!['held', 'disputed'].includes(o.status)) return res.status(409).json({ error: `não dá para reembolsar um pedido ${o.status} pela API` });
  const value = req.body && req.body.value ? round2(Number(req.body.value)) : undefined;
  await asaas.refundPayment(o.asaas_payment, value ? { value, description: req.body.reason } : { description: req.body && req.body.reason });
  db.prepare(`UPDATE orders SET status='refunded', updated_at=? WHERE id=?`).run(now(), o.id);
  res.json({ id: o.id, status: 'refunded', value: value || o.value });
}));

// ---------- webhook do Asaas ----------
app.post('/webhooks/asaas', (req, res) => {
  if (!process.env.ASAAS_WEBHOOK_TOKEN || !safeEqual(req.get('asaas-access-token'), process.env.ASAAS_WEBHOOK_TOKEN))
    return res.status(401).end();
  const ev = req.body || {};
  try {
    if (ev.id) {
      const seen = db.prepare('INSERT OR IGNORE INTO events (id,type) VALUES (?,?)').run(ev.id, ev.event);
      if (!seen.changes) return res.json({ ok: true, duplicate: true });
    }
    const p = ev.payment;
    if (p && p.id) {
      if (ev.event === 'PAYMENT_RECEIVED' || ev.event === 'PAYMENT_CONFIRMED')
        db.prepare(`UPDATE orders SET status='held', net_value=?, updated_at=? WHERE asaas_payment=? AND status='awaiting_payment'`)
          .run(p.netValue != null ? p.netValue : null, now(), p.id);
      else if (ev.event === 'PAYMENT_REFUNDED')
        db.prepare(`UPDATE orders SET status='refunded', updated_at=? WHERE asaas_payment=?`).run(now(), p.id);
      else if (ev.event === 'PAYMENT_DELETED')
        db.prepare(`UPDATE orders SET status='canceled', updated_at=? WHERE asaas_payment=? AND status='awaiting_payment'`).run(now(), p.id);
      else if (ev.event === 'PAYMENT_CHARGEBACK_REQUESTED')
        db.prepare(`UPDATE orders SET status='disputed', updated_at=? WHERE asaas_payment=? AND status='held'`).run(now(), p.id);
    }
    const t = ev.transfer;
    if (t && t.id) {
      const st = { TRANSFER_DONE: 'DONE', TRANSFER_FAILED: 'FAILED', TRANSFER_CANCELLED: 'CANCELLED', TRANSFER_PENDING: 'PENDING' }[ev.event];
      if (st) db.prepare('UPDATE orders SET transfer_status=?, updated_at=? WHERE transfer_id=?').run(st, now(), t.id);
      // Transferência falhou: o pedido volta para a garantia para tentar de novo
      if (st === 'FAILED' || st === 'CANCELLED')
        db.prepare(`UPDATE orders SET status='held', updated_at=? WHERE transfer_id=? AND status='released'`).run(now(), t.id);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).end(); // o Asaas tenta de novo
  }
});

// ---------- liberação automática ----------
async function autoRelease() {
  const limit = new Date(Date.now() - AUTO_DAYS * 864e5).toISOString();
  const due = db.prepare(`SELECT id FROM orders WHERE status='held' AND delivered_at IS NOT NULL AND delivered_at <= ?`).all(limit);
  for (const { id } of due) {
    try { await release(id); console.log('liberado automaticamente', id); } catch (e) { console.error('falha ao liberar', id, e.message); }
  }
}

// ---------- cotações ----------
// Públicas (só leitura): o site lê daqui, nunca direto da fonte externa.
function cors(req, res, next) { res.set('Access-Control-Allow-Origin', process.env.SITE_ORIGIN || '*'); res.set('Cache-Control', 'public, max-age=900'); next(); }
app.get('/rates', cors, (req, res) => {
  const r = rates.latest();
  if (!r.date) return res.status(503).json({ error: 'ainda sem cotações salvas' });
  res.json(r);
});
app.get('/rates/history/:currency', cors, (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  res.json({ base: 'EUR', currency: req.params.currency.toUpperCase(), history: rates.history(req.params.currency, days) });
});
app.get('/rates/:date', cors, (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ error: 'data no formato AAAA-MM-DD' });
  res.json(rates.onDate(req.params.date));
});
// Força uma atualização agora (só o site/servidor)
app.post('/rates/refresh', siteAuth, wrap(async (req, res) => res.json(await rates.updateRates())));

app.get('/health', (req, res) => res.json({ ok: true, env: process.env.ASAAS_ENV || 'sandbox' }));

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Kennismarket API em http://localhost:${port}`));
  setInterval(autoRelease, 60 * 60 * 1000); // de hora em hora
  autoRelease();
  rates.schedule(); // cotações: uma vez por dia
}

module.exports = { app, release, autoRelease };
