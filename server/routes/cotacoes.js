import { Router } from 'express';
import { garantirCotacoes, montarTabela } from '../lib/cotacoes.js';
import { erro, rota } from '../lib/seguranca.js';

// Cotações públicas (só leitura): o site lê daqui, nunca direto da fonte externa.
export function rotasCotacoes({ repo }) {
  const r = Router();
  r.use((_req, res, next) => { res.set('Cache-Control', 'public, max-age=900'); next(); });

  r.get('/', rota(async (_req, res) => {
    const t = montarTabela(await garantirCotacoes(repo));
    if (!t.data) throw erro(503, 'ainda sem cotações salvas');
    res.json(t);
  }));

  r.get('/historico/:moeda', rota(async (req, res) => {
    const moeda = req.params.moeda.toUpperCase();
    if (!/^[A-Z]{3}$/.test(moeda)) throw erro(400, 'moeda inválida');
    const dias = Math.min(365, Math.max(1, Number(req.query.dias) || 30));
    res.json({ base: 'EUR', moeda, historico: await repo.historicoCotacao(moeda, dias) });
  }));

  r.get('/:data', rota(async (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.data)) throw erro(400, 'data no formato AAAA-MM-DD');
    res.json(montarTabela(await repo.cotacoesEm(req.params.data), req.params.data));
  }));

  return r;
}

// Mesmas cotações, no formato que o protótipo lê (RATES_URL): { base, date, rates }.
// Público e só leitura, então pode ser lido de qualquer site (CORS aberto).
export function rotaRatesPrototipo({ repo }) {
  const r = Router();
  r.get('/', rota(async (_req, res) => {
    res.set({ 'Cache-Control': 'public, max-age=900', 'Access-Control-Allow-Origin': '*' });
    const t = montarTabela(await garantirCotacoes(repo));
    if (!t.data) throw erro(503, 'ainda sem cotações salvas');
    res.json({ base: t.base, date: t.data, rates: t.taxas });
  }));
  return r;
}
