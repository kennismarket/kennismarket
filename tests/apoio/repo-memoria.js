// Banco em memória com as mesmas funções de server/lib/repo.js, para os testes.
import crypto from 'node:crypto';

const bate = (linha, condicoes = {}) => Object.entries(condicoes).every(([campo, valores]) =>
  [].concat(valores).some((v) => (v === null ? linha[campo] == null : linha[campo] === v)));

export function criarRepoMemoria() {
  const t = { usuarios: {}, lojas: {}, dadosRepasse: {}, produtos: {}, pedidos: {}, reembolsos: {}, cotacoes: [], eventos: new Set() };
  const copia = (x) => (x ? structuredClone(x) : null);
  const ultimasPorMoeda = (ate) => {
    const m = {};
    for (const c of t.cotacoes) if ((!ate || c.data <= ate) && (!m[c.moeda] || c.data > m[c.moeda].data)) m[c.moeda] = c;
    return Object.values(m).map(copia);
  };

  return {
    tabelas: t,
    async usuarioPorToken(token) { return copia(t.usuarios[token]); },
    async produto(id) { return copia(t.produtos[id]); },
    async loja(id) { return copia(t.lojas[id]); },
    async dadosRepasse(lojaId) { return copia(t.dadosRepasse[lojaId]); },

    async salvarCotacoes(linhas) {
      for (const l of linhas) {
        const i = t.cotacoes.findIndex((c) => c.data === l.data && c.moeda === l.moeda);
        if (i >= 0) t.cotacoes[i] = { ...l }; else t.cotacoes.push({ ...l });
      }
    },
    async ultimasCotacoes() { return ultimasPorMoeda(); },
    async cotacoesEm(dia) { return ultimasPorMoeda(dia); },
    async historicoCotacao(moeda, dias) {
      return t.cotacoes.filter((c) => c.moeda === moeda).sort((a, b) => b.data.localeCompare(a.data)).slice(0, dias)
        .map(({ data, taxa, fonte }) => ({ data, taxa, fonte }));
    },

    async criarPedido(campos) {
      const p = { status: 'aguardando_pagamento', repasse_status: null, repasse_tentativas: 0, valor_liquido_centavos: null, ...campos };
      t.pedidos[p.id] = p;
      return copia(p);
    },
    async pedido(id) { return copia(t.pedidos[id]); },
    async atualizarPedidos(onde, campos, condicoes) {
      const mudou = [];
      for (const p of Object.values(t.pedidos)) {
        if (Object.entries(onde).every(([k, v]) => p[k] === v) && bate(p, condicoes)) {
          Object.assign(p, campos);
          mudou.push(copia(p));
        }
      }
      return mudou;
    },
    async pedidosParaRepassar(max) {
      return Object.values(t.pedidos).filter((p) => ['pendente', 'falhou'].includes(p.repasse_status) && p.repasse_tentativas < max)
        .map((p) => ({ id: p.id }));
    },

    async eventoJaProcessado(id) { return t.eventos.has(id); },
    async registrarEvento(id) { t.eventos.add(id); },

    async criarReembolso(campos) {
      if (Object.values(t.reembolsos).some((r) => r.pedido_id === campos.pedido_id && r.status === 'em_analise')) {
        throw Object.assign(new Error('Supabase: duplicate key'), { codigo: '23505' });
      }
      const r = { id: crypto.randomUUID(), status: 'em_analise', ...campos };
      t.reembolsos[r.id] = r;
      return copia(r);
    },
    async reembolso(id) { return copia(t.reembolsos[id]); },
    async atualizarReembolso(id, campos, condicoes) {
      const r = t.reembolsos[id];
      if (!r || !bate(r, condicoes)) return [];
      Object.assign(r, campos);
      return [copia(r)];
    },
  };
}
