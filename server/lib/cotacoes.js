// Cotações diárias (base: 1 EUR = 1 KN Coin), trazidas da km-api.
// Fonte 1: Frankfurter (dados oficiais do Banco Central Europeu).
// Fonte 2: ExchangeRate-API (acesso aberto), para o que o BCE não publica (ARS, UYU) e como reserva.
// A atualização é disparada uma vez por dia pela tarefa agendada no GitHub. Se a tarefa
// falhar ou não estiver configurada, o próprio site busca quando alguém pede as cotações
// e elas estão faltando ou velhas (garantirCotacoes).

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

// Antes de responder as cotações: se não há nenhuma salva, ou a última é de antes de ontem,
// busca de novo. Tenta no máximo a cada 6 horas (a cada minuto enquanto não houver nenhuma),
// uma busca por vez, e espera no máximo 8 segundos: se demorar, responde com o que tem.
const tentativas = new WeakMap(); // repo → { em, buscando }
export async function garantirCotacoes(repo, agora = Date.now()) {
  const linhas = await repo.ultimasCotacoes();
  const ultima = montarTabela(linhas).data;
  const anteontem = new Date(agora - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (ultima && ultima >= anteontem) return linhas;
  const t = tentativas.get(repo) || { em: 0, buscando: null };
  tentativas.set(repo, t);
  if (!t.buscando && agora - t.em >= (ultima ? 6 * 3600 * 1000 : 60 * 1000)) {
    t.em = agora;
    t.buscando = atualizarCotacoes(repo)
      .then((r) => { if (r.erros.length) console.error('cotações:', r.erros.join(' | ')); })
      .catch((e) => console.error('cotações:', e.message))
      .finally(() => { t.buscando = null; });
  }
  if (t.buscando) await Promise.race([t.buscando, new Promise((ok) => setTimeout(ok, 8000).unref())]);
  return repo.ultimasCotacoes();
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
