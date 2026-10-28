// Cotações diárias das moedas (base: 1 EUR = 1 KN Coin).
// Fonte 1: Frankfurter (dados oficiais, BCE) para as moedas principais.
// Fonte 2: ExchangeRate-API (acesso aberto) para o que o BCE não publica (ARS, UYU) e como reserva.
// Guarda um registro por dia e por moeda: o histórico nunca é apagado.
const db = require('./db');

const CURRENCIES = (process.env.FX_CURRENCIES || 'USD,GBP,BRL,CAD,AUD,MXN,ARS,UYU')
  .split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
const ECB_URL = process.env.FX_ECB_URL || 'https://api.frankfurter.dev/v2/rates?base=EUR&providers=ecb';
const OPEN_URL = process.env.FX_OPEN_URL || 'https://open.er-api.com/v6/latest/EUR';
const FX_HOUR_UTC = Number(process.env.FX_HOUR_UTC || 16); // o BCE publica por volta das 16h (horário europeu)

// Aceita os formatos mais comuns de resposta: {rates:{USD:1.1}}, {rates:[{quote,rate}]} ou [{quote,rate}]
function parseRates(json) {
  const out = {};
  const put = (code, v) => { const n = Number(v); if (code && n > 0 && Number.isFinite(n)) out[String(code).toUpperCase()] = n; };
  const list = Array.isArray(json) ? json : Array.isArray(json && json.rates) ? json.rates : null;
  if (list) list.forEach((r) => put(r.quote || r.currency || r.code || r.symbol, r.rate ?? r.value ?? r.mid));
  else if (json && json.rates && typeof json.rates === 'object') Object.entries(json.rates).forEach(([k, v]) => put(k, v));
  return out;
}
function rateDate(json) {
  if (!json) return null;
  if (typeof json.date === 'string') return json.date.slice(0, 10);
  if (Array.isArray(json) && json[0] && json[0].date) return String(json[0].date).slice(0, 10);
  if (json.time_last_update_unix) return new Date(json.time_last_update_unix * 1000).toISOString().slice(0, 10);
  return null;
}
async function getJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  return r.json();
}

const insert = db.prepare(`INSERT INTO fx_rates (date, currency, rate, source) VALUES (?,?,?,?)
  ON CONFLICT(date, currency) DO UPDATE SET rate=excluded.rate, source=excluded.source, fetched_at=datetime('now')`);

// Busca as cotações do dia e salva. Devolve {date, rates, sources, missing}.
async function updateRates() {
  const today = new Date().toISOString().slice(0, 10);
  const got = {}, sources = {};
  let date = null;
  try {
    const j = await getJson(ECB_URL); const r = parseRates(j); date = rateDate(j);
    for (const c of CURRENCIES) if (r[c]) { got[c] = r[c]; sources[c] = 'ecb'; }
  } catch (e) { console.error('cotação BCE falhou:', e.message); }
  const missing0 = CURRENCIES.filter((c) => !got[c]);
  if (missing0.length) {
    try {
      const j = await getJson(OPEN_URL); const r = parseRates(j); date = date || rateDate(j);
      for (const c of missing0) if (r[c]) { got[c] = r[c]; sources[c] = 'exchangerate-api'; }
    } catch (e) { console.error('cotação reserva falhou:', e.message); }
  }
  const d = date || today;
  const save = db.transaction(() => { for (const [c, v] of Object.entries(got)) insert.run(d, c, v, sources[c]); });
  save();
  const missing = CURRENCIES.filter((c) => !got[c]);
  if (missing.length) console.error('sem cotação hoje para:', missing.join(', '), '(o site segue usando a última salva)');
  return { date: d, rates: got, sources, missing };
}

// Última cotação salva de cada moeda (mesmo que alguma fonte tenha falhado hoje)
function latest() {
  const rows = db.prepare(`SELECT f.currency, f.rate, f.date, f.source FROM fx_rates f
    JOIN (SELECT currency, MAX(date) d FROM fx_rates GROUP BY currency) m ON m.currency=f.currency AND m.d=f.date`).all();
  const rates = { EUR: 1 }, dates = {}, sources = {};
  let date = null;
  for (const r of rows) { rates[r.currency] = r.rate; dates[r.currency] = r.date; sources[r.currency] = r.source; if (!date || r.date > date) date = r.date; }
  return { base: 'EUR', date, rates, dates, sources };
}
// Cotação válida em uma data (a mais recente até aquele dia)
function onDate(day) {
  const rows = db.prepare(`SELECT f.currency, f.rate, f.date, f.source FROM fx_rates f
    JOIN (SELECT currency, MAX(date) d FROM fx_rates WHERE date<=? GROUP BY currency) m ON m.currency=f.currency AND m.d=f.date`).all(day);
  const rates = { EUR: 1 }, dates = {};
  for (const r of rows) { rates[r.currency] = r.rate; dates[r.currency] = r.date; }
  return { base: 'EUR', date: day, rates, dates };
}
function history(currency, days = 30) {
  return db.prepare(`SELECT date, rate, source FROM fx_rates WHERE currency=? ORDER BY date DESC LIMIT ?`).all(currency.toUpperCase(), days);
}

// Roda uma vez por dia depois do horário de publicação do BCE (e ao ligar, se ainda não houver cotação de hoje)
function schedule() {
  let lastKey = null;
  const tick = async () => {
    const now = new Date(), day = now.toISOString().slice(0, 10), after = now.getUTCHours() >= FX_HOUR_UTC;
    const key = day + (after ? 'b' : 'a');
    if (key === lastKey) return;
    const fetchedToday = db.prepare('SELECT 1 FROM fx_rates WHERE fetched_at >= ? LIMIT 1').get(day);
    if (!after && fetchedToday) return;          // antes do horário do BCE: só busca se ainda não tem nada de hoje
    lastKey = key;
    try { const r = await updateRates(); console.log('cotações atualizadas', r.date, Object.keys(r.rates).length, 'moedas'); }
    catch (e) { lastKey = null; console.error('atualização de cotações falhou', e.message); }
  };
  tick();
  return setInterval(tick, 30 * 60 * 1000); // confere a cada 30 min
}

module.exports = { updateRates, latest, onDate, history, schedule, parseRates, CURRENCIES };
