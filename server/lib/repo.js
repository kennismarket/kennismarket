// Tudo o que o servidor lê e grava no Supabase passa por aqui.
// Os testes trocam este arquivo por uma versão em memória (tests/apoio/repo-memoria.js)
// com as mesmas funções.
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
  async dadosRepasse(lojaId) {
    return checar(await db().from('dados_repasse').select('*').eq('loja_id', lojaId).maybeSingle());
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
  async pedidosParaRepassar(maxTentativas) {
    return checar(await db().from('pedidos').select('id').in('repasse_status', ['pendente', 'falhou'])
      .lt('repasse_tentativas', maxTentativas).order('pago_em').limit(50));
  },

  // ---------- avisos do Asaas ----------
  async eventoJaProcessado(id) {
    return Boolean(checar(await db().from('eventos_asaas').select('id').eq('id', id).maybeSingle()));
  },
  async registrarEvento(id, tipo) {
    checar(await db().from('eventos_asaas').upsert({ id, tipo }, { onConflict: 'id', ignoreDuplicates: true }));
  },

  // ---------- reembolsos ----------
  async criarReembolso(campos) {
    return checar(await db().from('reembolsos').insert(campos).select().single());
  },
  async reembolso(id) {
    return checar(await db().from('reembolsos').select('*').eq('id', id).maybeSingle());
  },
  async atualizarReembolso(id, campos, condicoes) {
    return checar(await filtrar(db().from('reembolsos').update(campos).eq('id', id), condicoes).select());
  },
};
