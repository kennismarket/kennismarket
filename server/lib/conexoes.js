// Conexões do servidor com o Supabase (12/11/2026).
//
// Como o site fala com o banco: NUNCA direto com o Postgres. Todas as chamadas passam pelo
// @supabase/supabase-js, que conversa com o Supabase por HTTP (banco = PostgREST, login = Auth,
// arquivos = Storage). Quem abre e reaproveita as conexões com o Postgres é o próprio Supabase, com
// um número fixo delas: o site não consegue esgotar as conexões do banco. Por isso não há PgBouncer,
// Prisma Accelerate nem DATABASE_URL aqui, e não devem ser adicionados (abririam conexões diretas).
// E o site roda como um servidor que fica ligado (Render, depois Hostinger), não em funções serverless.
//
// O que este arquivo controla são as conexões HTTP do servidor até o Supabase:
// - um único conjunto (pool) para o servidor inteiro, reaproveitado por todas as chamadas;
// - no máximo MAX_CONEXOES ao mesmo tempo; o que passar disso espera na fila (não derruba nada);
// - conexão parada há OCIOSA_MS é fechada;
// - chamada que demora demais desiste (não prende uma conexão para sempre).
import { Agent, fetch as fetchUndici } from 'undici';

const numero = (v, padrao, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : padrao;
};

export function lerLimites(env = process.env) {
  return {
    // conexões simultâneas com o Supabase (por endereço). O plano grátis aguenta bem 20.
    maxConexoes: numero(env.SUPABASE_MAX_CONEXOES, 20, 1, 200),
    // conexão parada é fechada depois deste tempo
    ociosaMs: numero(env.SUPABASE_CONEXAO_OCIOSA_MS, 10_000, 1_000, 120_000),
    conectarMs: 10_000, // tempo para abrir a conexão
    respostaMs: 30_000, // tempo para começar a responder
    corpoMs: 60_000, // tempo entre pedaços da resposta (arquivos de até 20 MB)
  };
}

// Cria o pool e um fetch que sempre usa ele (passado ao supabase-js em "global.fetch").
export function criarConexoes(limites = lerLimites()) {
  const agente = new Agent({
    connections: limites.maxConexoes,
    pipelining: 1,
    keepAliveTimeout: limites.ociosaMs,
    keepAliveMaxTimeout: limites.ociosaMs,
    connectTimeout: limites.conectarMs,
    headersTimeout: limites.respostaMs,
    bodyTimeout: limites.corpoMs,
  });
  const fetch = (url, opcoes = {}) => fetchUndici(url, { ...opcoes, dispatcher: agente });
  return { fetch, agente, limites, fechar: () => agente.close() };
}

// O pool do servidor (um só).
export const conexoes = criarConexoes();
