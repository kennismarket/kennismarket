// Tudo o que o servidor lê e grava no Supabase passa por aqui.
// Os testes trocam este arquivo por uma versão em memória (tests/apoio/repo-memoria.js)
// com as mesmas funções.
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { supabaseAdmin } from './supabase.js';

function db() {
  if (!supabaseAdmin) throw Object.assign(new Error('Supabase não configurado'), { status: 503 });
  return supabaseAdmin;
}

function checar({ data, error }) {
  if (error) throw Object.assign(new Error(`Supabase: ${error.message}`), { codigo: error.code });
  return data;
}

// Condições do tipo { status: ['pago', 'entregue'] }. Um null na lista quer dizer "vazio".
function filtrar(q, condicoes = {}) {
  for (const [campo, valores] of Object.entries(condicoes)) {
    const lista = [].concat(valores);
    const semNull = lista.filter((v) => v !== null);
    if (lista.includes(null)) {
      q = q.or([`${campo}.is.null`, ...semNull.map((v) => `${campo}.eq.${v}`)].join(','));
    } else {
      q = q.in(campo, semNull);
    }
  }
  return q;
}

export const repo = {
  async usuarioPorToken(token) {
    const { data, error } = await db().auth.getUser(token);
    if (error || !data?.user) return null;
    const perfil = checar(await db().from('perfis').select('nome, papel').eq('id', data.user.id).maybeSingle());
    return { id: data.user.id, email: data.user.email, nome: perfil?.nome || data.user.email, papel: perfil?.papel || 'cliente' };
  },

  // ---------- lojas e produtos ----------
  async produto(id) {
    return checar(await db().from('produtos').select('*').eq('id', id).maybeSingle());
  },
  async loja(id) {
    return checar(await db().from('lojas').select('*').eq('id', id).maybeSingle());
  },
  async lojaDoVendedor(vendedorId) {
    return checar(await db().from('lojas').select('*').eq('vendedor_id', vendedorId).maybeSingle());
  },
  async dadosRecebimento(lojaId) {
    return checar(await db().from('dados_recebimento').select('*').eq('loja_id', lojaId).maybeSingle());
  },
  async salvarDadosRecebimento(linha) {
    return checar(await db().from('dados_recebimento').upsert(linha, { onConflict: 'loja_id' }).select().single());
  },

  // ---------- cotações ----------
  async salvarCotacoes(linhas) {
    const agora = new Date().toISOString();
    checar(await db().from('cotacoes').upsert(linhas.map((l) => ({ ...l, buscada_em: agora })), { onConflict: 'data,moeda' }));
  },
  async ultimasCotacoes() {
    return checar(await db().from('cotacoes_atuais').select('*'));
  },
  async cotacoesEm(dia) {
    return checar(await db().rpc('cotacoes_em', { dia }));
  },
  async historicoCotacao(moeda, dias) {
    return checar(await db().from('cotacoes').select('data, taxa, fonte').eq('moeda', moeda)
      .order('data', { ascending: false }).limit(dias));
  },

  // ---------- pedidos ----------
  async criarPedido(campos) {
    return checar(await db().from('pedidos').insert(campos).select().single());
  },
  async pedido(id) {
    return checar(await db().from('pedidos').select('*').eq('id', id).maybeSingle());
  },
  // Atualiza só se as condições baterem. Devolve as linhas que mudaram (lista vazia = nada mudou).
  // Como é um único comando no banco, dois avisos ao mesmo tempo nunca mudam o mesmo pedido duas vezes.
  async atualizarPedidos(onde, campos, condicoes) {
    let q = db().from('pedidos').update({ ...campos, atualizado_em: new Date().toISOString() });
    for (const [k, v] of Object.entries(onde)) q = q.eq(k, v);
    return checar(await filtrar(q, condicoes).select());
  },

  // ---------- avisos do banco de pagamento ----------
  async eventoJaProcessado(provedor, id) {
    return Boolean(checar(await db().from('eventos_pagamento').select('id').eq('provedor', provedor).eq('id', id).maybeSingle()));
  },
  async registrarEvento(provedor, id, tipo) {
    checar(await db().from('eventos_pagamento').upsert({ provedor, id, tipo }, { onConflict: 'provedor,id', ignoreDuplicates: true }));
  },

  // ---------- reembolsos e débitos ----------
  async criarReembolso(campos) {
    return checar(await db().from('reembolsos').insert(campos).select().single());
  },
  async reembolso(id) {
    return checar(await db().from('reembolsos').select('*').eq('id', id).maybeSingle());
  },
  async atualizarReembolso(id, campos, condicoes) {
    return checar(await filtrar(db().from('reembolsos').update(campos).eq('id', id), condicoes).select());
  },
  async criarDebito(campos) {
    return checar(await db().from('debitos_vendedor').insert(campos).select().single());
  },
  async listarDebitos({ situacao, pedidoId } = {}) {
    let q = db().from('debitos_vendedor').select('*').order('criado_em', { ascending: false }).limit(200);
    if (situacao) q = q.eq('situacao', situacao);
    if (pedidoId) q = q.eq('pedido_id', pedidoId);
    return checar(await q);
  },

  // ---------- dados de teste (só para a página /teste/pagamentos, com o provedor simulado) ----------
  // Cria (ou reaproveita) três contas de teste, uma loja e um produto, e devolve os tokens de login.
  async prepararDadosTeste() {
    if (!config.supabase.publishableKey) throw Object.assign(new Error('SUPABASE_PUBLISHABLE_KEY não configurada'), { status: 503 });
    const contas = { cliente: 'Cliente de Teste', vendedor: 'Vendedora de Teste', dono: 'Dono de Teste' };
    const anon = createClient(config.supabase.url, config.supabase.publishableKey, { auth: { persistSession: false } });
    const existentes = checar(await db().auth.admin.listUsers({ page: 1, perPage: 1000 })).users;
    const tokens = {};
    const ids = {};
    for (const [papel, nome] of Object.entries(contas)) {
      const email = `${papel}@teste.kennismarket.invalid`;
      const senha = crypto.randomBytes(24).toString('base64url'); // nova a cada preparo; ninguém precisa saber
      let u = existentes.find((x) => x.email === email);
      if (u) checar(await db().auth.admin.updateUserById(u.id, { password: senha }));
      else u = checar(await db().auth.admin.createUser({ email, password: senha, email_confirm: true })).user;
      checar(await db().from('perfis').upsert({ id: u.id, nome, papel }));
      const sessao = checar(await anon.auth.signInWithPassword({ email, password: senha }));
      tokens[papel] = sessao.session.access_token;
      ids[papel] = u.id;
    }
    const loja = checar(await db().from('lojas').upsert({
      vendedor_id: ids.vendedor, nome: 'Loja de Teste', slug: 'loja-de-teste', descricao: 'Loja inventada para testar pagamentos.', publicada: true, banida: false,
    }, { onConflict: 'vendedor_id' }).select().single());
    let produto = checar(await db().from('produtos').select('*').eq('loja_id', loja.id).eq('titulo', 'Mentoria de teste').maybeSingle());
    if (!produto) {
      produto = checar(await db().from('produtos').insert({
        loja_id: loja.id, categoria: 'mentoria', titulo: 'Mentoria de teste', descricao: 'Produto inventado.', preco_kn: 100,
      }).select().single());
    }
    return { tokens, lojaId: loja.id, produtoId: produto.id };
  },
};
