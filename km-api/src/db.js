const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const file = process.env.DB_FILE || './data/kennismarket.db';
fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
const db = new Database(file);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS sellers (
  id            TEXT PRIMARY KEY,           -- id da loja no Kennismarket
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  cpf_cnpj      TEXT NOT NULL,
  wallet_id     TEXT,                       -- walletId da subconta no Asaas (modo subconta)
  asaas_account TEXT,                       -- id da subconta no Asaas
  pix_key       TEXT,                       -- chave Pix do vendedor (modo Pix, sem subconta)
  pix_key_type  TEXT,                       -- CPF | CNPJ | EMAIL | PHONE | EVP
  percent       REAL,                       -- comissão própria (NULL = usa a padrão)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,        -- id do pedido no Kennismarket
  seller_id        TEXT NOT NULL REFERENCES sellers(id),
  buyer_email      TEXT NOT NULL,
  description      TEXT,
  value            REAL NOT NULL,           -- valor cobrado (R$)
  net_value        REAL,                    -- valor líquido recebido (após taxa do Asaas)
  billing_type     TEXT NOT NULL,
  asaas_payment    TEXT UNIQUE,
  invoice_url      TEXT,
  status           TEXT NOT NULL,           -- awaiting_payment | held | released | refunded | disputed | canceled
  delivered_at     TEXT,
  seller_percent   REAL,                    -- % congelada no momento da liberação
  seller_amount    REAL,
  platform_amount  REAL,
  transfer_id      TEXT,
  transfer_status  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,             -- id do evento do webhook (evita processar duas vezes)
  type        TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS fx_rates (
  date        TEXT NOT NULL,                -- dia da cotação (AAAA-MM-DD)
  currency    TEXT NOT NULL,                -- USD, BRL, ARS...
  rate        REAL NOT NULL,                -- 1 EUR (= 1 KN Coin) vale isto na moeda
  source      TEXT,                         -- ecb | exchangerate-api
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, currency)
);
`);

// Colunas novas em pedidos (moeda que o cliente viu e cotação usada) — adicionadas se ainda não existirem
const cols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
for (const [c, t] of [['value_kn', 'REAL'], ['fx_currency', 'TEXT'], ['fx_rate', 'REAL'], ['fx_brl', 'REAL'], ['fx_date', 'TEXT']])
  if (!cols.includes(c)) db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);

module.exports = db;
