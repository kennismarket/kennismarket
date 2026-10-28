// Cotações diárias (base: 1 EUR = 1 KN Coin), trazidas da km-api.
// Fonte 1: Frankfurter (dados oficiais do Banco Central Europeu).
// Fonte 2: ExchangeRate-API (acesso aberto), para o que o BCE não publica (ARS, UYU) e como reserva.
// A atualização é disparada uma vez por dia pela tarefa agendada no GitHub.

export const MOEDAS = (process.env.FX_MOEDAS || 'USD,GBP,BRL,CAD,AUD,MXN,ARS,UYU')
  .split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
const URL_BCE = process.env.FX_URL_BCE || 'https://api.frankfurter.dev/v2/rates?base=EUR&providers=ecb';
const URL_RESERVA = process.env.FX_URL_RESERVA || 'https://open.er-api.com/v6/latest/EUR';

// Aceita os formatos mais comuns: {rates:{USD:1.1}}, {rates:[{quote,rate}]} ou [{quote,rate}]
export function lerTaxas(json) {
  const out = {};
  const por = (codigo, v) => {
    const n = Number(v);
    if (codigo && n > 0 && Number.isFinite(n)) out[String(codigo).toUpperCase()] = n;
  };
  const lista = Array.isArray(json) ? json : Array.isArray(json?.rates) ? json.rates : null;
  if (lista) lista.forEach((r) => por(r.quote || r.currency || r.code || r.symbol, r.rate ?? r.value ?? r.mid));
  else if (json?.rates && typeof json.rates === 'object') Object.entries(json.rates).forEach(([k, v]) => por(k, v));
  return out;
}

export function lerData(json) {
  if (!json) return null;
  if (typeof json.date === 'string') return json.date.slice(0, 10);
  if (Array.isArray(json) && json[0]?.date) return String(json[0].date).slice(0, 10);
  if (json.time_last_update_unix) return new Date(json.time_last_update_unix * 1000).toISOString().slice(0, 10);
  return null;
}

async function buscarJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  return r.json();
}

// Busca as cotações do dia e salva. Se as duas fontes falharem, nada é apagado:
// o site continua usando a última cotação salva.
export async function atualizarCotacoes(repo) {
  const obtidas = {};
  const fontes = {};
  let data = null;
  const erros = [];
  try {
    const j = await buscarJson(URL_BCE);
    const t = lerTaxas(j);
    data = lerData(j);
    for (const m of MOEDAS) if (t[m]) { obtidas[m] = t[m]; fontes[m] = 'bce'; }
  } catch (e) { erros.push(`BCE: ${e.message}`); }

  const faltando = MOEDAS.filter((m) => !obtidas[m]);
  if (faltando.length) {
    try {
      const j = await buscarJson(URL_RESERVA);
      const t = lerTaxas(j);
      data = data || lerData(j);
      for (const m of faltando) if (t[m]) { obtidas[m] = t[m]; fontes[m] = 'exchangerate-api'; }
    } catch (e) { erros.push(`reserva: ${e.message}`); }
  }

  const dia = data || new Date().toISOString().slice(0, 10);
  const linhas = Object.entries(obtidas).map(([moeda, taxa]) => ({ data: dia, moeda, taxa, fonte: fontes[moeda] }));
  if (linhas.length) await repo.salvarCotacoes(linhas);
  return { data: dia, taxas: obtidas, fontes, faltando: MOEDAS.filter((m) => !obtidas[m]), erros };
}

// Junta as linhas do banco no formato que o site usa: { base, data, taxas: { EUR: 1, BRL: 6.1, ... } }
export function montarTabela(linhas, dataPedida = null) {
  const taxas = { EUR: 1 };
  const datas = {};
  let data = null;
  for (const l of linhas) {
    taxas[l.moeda] = Number(l.taxa);
    datas[l.moeda] = l.data;
    if (!data || l.data > data) data = l.data;
  }
  return { base: 'EUR', data: dataPedida || data, taxas, datas };
}
