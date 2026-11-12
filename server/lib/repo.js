// Tudo o que o servidor lê e grava no Supabase passa por aqui.
// Os testes trocam este arquivo por uma versão em memória (tests/apoio/repo-memoria.js)
// com as mesmas funções.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { clienteDeLogin, supabaseAdmin } from './supabase.js';

const PASTA = 'prototipo'; // pasta do Storage com os arquivos do protótipo
// Situações de pedido em que o cliente já pagou (e pode receber os arquivos de entrega).
export const STATUS_PAGOS = ['pago', 'entregue', 'concluido', 'reembolso_solicitado'];

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

// Todos os logins do Supabase Auth (de 1000 em 1000; até 10 mil contas).
async function todosOsLogins() {
  const logins = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const { users } = checar(await db().auth.admin.listUsers({ page: pagina, perPage: 1000 }));
    logins.push(...users);
    if (users.length < 1000) break;
  }
  return logins;
}

export const repo = {
  async usuarioPorToken(token) {
    const { data, error } = await db().auth.getUser(token);
    if (error || !data?.user) return null;
    if (data.user.banned_until && Date.parse(data.user.banned_until) > Date.now()) return null; // conta banida perde o acesso na hora
    const perfil = checar(await db().from('perfis').select('nome, papel, usuario').eq('id', data.user.id).maybeSingle());
    return { id: data.user.id, email: data.user.email, nome: perfil?.nome || data.user.email, papel: perfil?.papel || 'cliente', usuario: perfil?.usuario || null };
  },

  // ---------- contas (login real) ----------
  async perfilPorUsuario(usuario) {
    return checar(await db().from('perfis').select('id, nome, papel, usuario').eq('usuario', usuario).maybeSingle());
  },
  async perfil(id) {
    return checar(await db().from('perfis').select('id, nome, papel, usuario').eq('id', id).maybeSingle());
  },
  async emailDaConta(id) {
    const { data, error } = await db().auth.admin.getUserById(id);
    return error ? null : data?.user?.email || null;
  },
  // Cria o login (já confirmado: sem e-mail de confirmação por enquanto) e o perfil.
  // Erros conhecidos: codigo 'email_em_uso' ou 'usuario_em_uso'.
  async criarConta({ email, senha, nome, usuario, papel }) {
    const { data, error } = await db().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome, usuario } });
    if (error) {
      const jaExiste = error.status === 422 || /already|registered|exists/i.test(error.message);
      throw Object.assign(new Error(jaExiste ? 'e-mail já cadastrado' : `Supabase: ${error.message}`), { status: jaExiste ? 409 : 502, codigo: jaExiste ? 'email_em_uso' : undefined });
    }
    const { error: e2 } = await db().from('perfis').insert({ id: data.user.id, nome, usuario, papel });
    if (e2) {
      await db().auth.admin.deleteUser(data.user.id); // não deixa login sem perfil
      const repetido = e2.code === '23505';
      throw Object.assign(new Error(repetido ? 'nome de usuário em uso' : `Supabase: ${e2.message}`), { status: repetido ? 409 : 502, codigo: repetido ? 'usuario_em_uso' : undefined });
    }
    return { id: data.user.id };
  },
  // Confere e-mail e senha. Devolve a sessão (tokens), { banida: true } ou null se não baterem.
  async entrarComSenha(email, senha) {
    if (!config.supabase.publishableKey) throw Object.assign(new Error('SUPABASE_PUBLISHABLE_KEY não configurada'), { status: 503 });
    const anon = clienteDeLogin();
    const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
    if (error && (error.code === 'user_banned' || /banned/i.test(error.message))) return { banida: true };
    if (error || !data?.session) return null;
    const s = data.session;
    return { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in };
  },
  async trocarSenha(id, senha) {
    checar(await db().auth.admin.updateUserById(id, { password: senha }));
  },
  // Nome e nome de usuário do perfil. Usuário repetido: codigo 'usuario_em_uso'.
  async atualizarPerfil(id, { nome, usuario }) {
    const { error } = await db().from('perfis').update({ nome, usuario }).eq('id', id);
    if (error) {
      const repetido = error.code === '23505';
      throw Object.assign(new Error(repetido ? 'nome de usuário em uso' : `Supabase: ${error.message}`), { status: repetido ? 409 : 502, codigo: repetido ? 'usuario_em_uso' : undefined });
    }
  },
  // ---------- contas: painel do dono e excluir conta ----------
  // Busca por nome, usuário ou e-mail (até 30). Lê os logins de uma vez: serve até alguns
  // milhares de contas; depois disso, trocar por uma busca no banco.
  async buscarContas(termo) {
    const t = termo.toLowerCase();
    const logins = await todosOsLogins();
    const perfis = checar(await db().from('perfis').select('id, nome, papel, usuario'));
    const porId = Object.fromEntries(perfis.map((p) => [p.id, p]));
    return logins
      .map((u) => ({ ...(porId[u.id] || { id: u.id, nome: '', papel: 'cliente', usuario: null }), id: u.id, email: u.email || '',
        banida: Boolean(u.banned_until && Date.parse(u.banned_until) > Date.now()), criadaEm: u.created_at }))
      .filter((c) => [c.nome, c.usuario, c.email].some((x) => x && x.toLowerCase().includes(t)))
      .slice(0, 30);
  },
  // Painel do dono → Vendedores: todas as contas de vendedor, a loja de cada uma e as vendas.
  async listarVendedores() {
    const perfis = checar(await db().from('perfis').select('id, nome, usuario').eq('papel', 'vendedor'));
    const logins = Object.fromEntries((await todosOsLogins()).map((u) => [u.id, u]));
    return perfis.map((p) => {
      const u = logins[p.id] || {};
      return { ...p, email: u.email || '', banida: Boolean(u.banned_until && Date.parse(u.banned_until) > Date.now()), criadaEm: u.created_at || null };
    });
  },
  // Todas as lojas de uma conta (o faturamento soma todas).
  async lojasDoVendedor(vendedorId) {
    return checar(await db().from('lojas').select('*').eq('vendedor_id', vendedorId).order('criada_em', { ascending: true }));
  },
  async lojasComVendedor() {
    return checar(await db().from('lojas').select('id, nome, prototipo_id, porcentagem_vendedor, vendedor_id, publicada, banida').not('vendedor_id', 'is', null));
  },
  // Vendas (pedidos pagos, e os reembolsados) das lojas, da mais nova para a mais antiga.
  async vendasDasLojas(lojaIds) {
    if (!lojaIds.length) return [];
    const linhas = checar(await db().from('pedidos')
      .select('id, loja_id, valor_kn, valor_centavos, vendedor_centavos, status, repasse_status, criado_em, pago_em, produto:produtos(titulo)')
      .in('loja_id', lojaIds).in('status', [...STATUS_PAGOS, 'reembolsado']).order('criado_em', { ascending: false }).limit(5000));
    return linhas.map(({ produto, ...v }) => ({ ...v, produto_titulo: produto?.titulo || '' }));
  },
  async banirConta(id, banir) {
    checar(await db().auth.admin.updateUserById(id, { ban_duration: banir ? '876000h' : 'none' }));
  },
  // Apaga o login e o perfil. Se a conta tem registros que precisam ficar (pedidos, por
  // exemplo), apaga os dados pessoais e desliga o login, em vez de apagar.
  async excluirConta(id) {
    const { error } = await db().auth.admin.deleteUser(id);
    if (!error) return { apagada: true };
    checar(await db().from('perfis').update({ nome: 'Conta excluída', usuario: null }).eq('id', id));
    checar(await db().auth.admin.updateUserById(id, {
      email: `excluida.${crypto.randomBytes(6).toString('hex')}@sem-email.kennismarket.invalid`, email_confirm: true,
      password: crypto.randomBytes(24).toString('base64url'), ban_duration: '876000h', user_metadata: {},
    }));
    return { apagada: false };
  },
  // Troca o e-mail do login (já confirmado). E-mail de outra conta: codigo 'email_em_uso'.
  async trocarEmail(id, email) {
    const { error } = await db().auth.admin.updateUserById(id, { email, email_confirm: true });
    if (error) {
      const jaExiste = error.status === 422 || /already|registered|exists/i.test(error.message);
      throw Object.assign(new Error(jaExiste ? 'e-mail já cadastrado' : `Supabase: ${error.message}`), { status: jaExiste ? 409 : 502, codigo: jaExiste ? 'email_em_uso' : undefined });
    }
  },

  // ---------- lojas e produtos ----------
  async produto(id) {
    return checar(await db().from('produtos').select('*').eq('id', id).maybeSingle());
  },
  async loja(id) {
    return checar(await db().from('lojas').select('*').eq('id', id).maybeSingle());
  },
  // A primeira loja do vendedor (a conta pode ter até 10; ver lojasDoVendedor).
  async lojaDoVendedor(vendedorId) {
    return checar(await db().from('lojas').select('*').eq('vendedor_id', vendedorId).order('criada_em', { ascending: true }).limit(1).maybeSingle());
  },
  // ---------- cópia das lojas do protótipo nas tabelas reais (server/lib/espelho-lojas.js) ----------
  async lojaPorPrototipo(prototipoId) {
    return checar(await db().from('lojas').select('*').eq('prototipo_id', prototipoId).maybeSingle());
  },
  async produtoPorPrototipo(lojaId, prototipoId) {
    return checar(await db().from('produtos').select('*').eq('loja_id', lojaId).eq('prototipo_id', prototipoId).maybeSingle());
  },
  // Cria ou atualiza a loja e os produtos dela; produtos que sumiram ficam inativos.
  async salvarLojaEspelho(loja, produtos) {
    const l = checar(await db().from('lojas').upsert({ ...loja, slug: `loja-p${loja.prototipo_id}` }, { onConflict: 'prototipo_id' }).select().single());
    if (produtos.length) {
      checar(await db().from('produtos').upsert(produtos.map((p) => ({ ...p, loja_id: l.id, ativo: true })), { onConflict: 'loja_id,prototipo_id' }));
    }
    const ids = produtos.map((p) => p.prototipo_id);
    let q = db().from('produtos').update({ ativo: false }).eq('loja_id', l.id);
    if (ids.length) q = q.not('prototipo_id', 'in', `(${ids.map((i) => `"${String(i).replace(/"/g, '')}"`).join(',')})`);
    checar(await q);
    return l;
  },
  async desativarLojaEspelho(prototipoId) {
    const l = checar(await db().from('lojas').update({ publicada: false }).eq('prototipo_id', prototipoId).select().maybeSingle());
    if (l) checar(await db().from('produtos').update({ ativo: false }).eq('loja_id', l.id));
  },
  // Pedidos pagos de um cliente para um produto (libera os arquivos de entrega).
  async clientePagouProduto(clienteId, produtoId) {
    const linhas = checar(await db().from('pedidos').select('id').eq('cliente_id', clienteId).eq('produto_id', produtoId)
      .in('status', STATUS_PAGOS).limit(1));
    return linhas.length > 0;
  },

  async dadosRecebimento(lojaId) {
    return checar(await db().from('dados_recebimento').select('*').eq('loja_id', lojaId).maybeSingle());
  },
  async salvarDadosRecebimento(linha) {
    return checar(await db().from('dados_recebimento').upsert(linha, { onConflict: 'loja_id' }).select().single());
  },
  // Trocas de chave Pix (migração 0009): o painel do dono mostra as recentes.
  async registrarTrocaRecebimento(linha) {
    checar(await db().from('trocas_recebimento').insert(linha));
  },
  async listarTrocasRecebimento({ desde, limite = 50 } = {}) {
    let q = db().from('trocas_recebimento').select('*').order('em', { ascending: false }).limit(limite);
    if (desde) q = q.gte('em', desde);
    return checar(await q);
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

  // Pedidos com a loja, o produto e o nome do cliente (telas de pedidos, etapa 4).
  // Filtros: clienteId, lojaId, ids, status (lista). Do mais novo para o mais antigo.
  async listarPedidos({ clienteId, lojaId, ids, status } = {}) {
    let q = db().from('pedidos')
      .select('*, loja:lojas(nome, prototipo_id, vendedor_id), produto:produtos(titulo, prototipo_id), cliente:perfis(nome)')
      .order('criado_em', { ascending: false }).limit(500);
    if (clienteId) q = q.eq('cliente_id', clienteId);
    if (lojaId) q = q.eq('loja_id', lojaId);
    if (ids) { if (!ids.length) return []; q = q.in('id', ids); }
    if (status) q = q.in('status', status);
    return checar(await q).map(({ loja, produto, cliente, ...p }) => ({
      ...p, loja_nome: loja?.nome || '', loja_prototipo_id: loja?.prototipo_id ?? null, loja_vendedor_id: loja?.vendedor_id ?? null,
      produto_titulo: produto?.titulo || '', produto_prototipo_id: produto?.prototipo_id ?? null, cliente_nome: cliente?.nome || '',
    }));
  },
  // Confirmação automática: pedidos entregues antes de "limite" (data ISO) viram concluídos.
  async concluirEntreguesAntes(limite) {
    const agora = new Date().toISOString();
    return checar(await db().from('pedidos').update({ status: 'concluido', concluido_em: agora, atualizado_em: agora })
      .eq('status', 'entregue').lt('entregue_em', limite).select('id'));
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
  // Pedidos de reembolso, do mais novo para o mais antigo. status: lista (vazio = todos).
  async listarReembolsos({ status, pedidoIds, limite = 100 } = {}) {
    let q = db().from('reembolsos').select('*').order('criado_em', { ascending: false }).limit(limite);
    if (status) q = q.in('status', status);
    if (pedidoIds) { if (!pedidoIds.length) return []; q = q.in('pedido_id', pedidoIds); }
    return checar(await q);
  },
  async criarDebito(campos) {
    return checar(await db().from('debitos_vendedor').insert(campos).select().single());
  },
  async listarDebitos({ situacao, pedidoId, lojaIds } = {}) {
    let q = db().from('debitos_vendedor').select('*').order('criado_em', { ascending: false }).limit(1000);
    if (situacao) q = q.eq('situacao', situacao);
    if (pedidoId) q = q.eq('pedido_id', pedidoId);
    if (lojaIds) { if (!lojaIds.length) return []; q = q.in('loja_id', lojaIds); }
    return checar(await q);
  },
  async debito(id) {
    return checar(await db().from('debitos_vendedor').select('*').eq('id', id).maybeSingle());
  },
  async atualizarDebito(id, campos) {
    return checar(await db().from('debitos_vendedor').update(campos).eq('id', id).select().maybeSingle());
  },

  // ---------- chat (etapa 5) ----------
  async conversa(id) {
    return checar(await db().from('conversas').select('*').eq('id', id).maybeSingle());
  },
  async conversaPor(lojaId, clienteId) {
    return checar(await db().from('conversas').select('*').eq('loja_id', lojaId).eq('cliente_id', clienteId).maybeSingle());
  },
  // Cria a conversa do cliente com a loja (ou devolve a que já existe).
  async abrirConversa(lojaId, clienteId) {
    checar(await db().from('conversas').upsert({ loja_id: lojaId, cliente_id: clienteId }, { onConflict: 'loja_id,cliente_id', ignoreDuplicates: true }));
    return this.conversaPor(lojaId, clienteId);
  },
  // Conversas com a loja e o nome do cliente. Filtros: clienteId, lojaIds, marcadas. Da mais recente para a mais antiga.
  async listarConversas({ clienteId, lojaIds, marcadas } = {}) {
    let q = db().from('conversas').select('*, loja:lojas(nome, prototipo_id, vendedor_id), cliente:perfis(nome)')
      .order('ultima_em', { ascending: false, nullsFirst: false }).limit(500);
    if (clienteId) q = q.eq('cliente_id', clienteId);
    if (lojaIds) { if (!lojaIds.length) return []; q = q.in('loja_id', lojaIds); }
    if (marcadas) q = q.not('marcada_em', 'is', null);
    return checar(await q).map(({ loja, cliente, ...c }) => ({
      ...c, loja_nome: loja?.nome || '', loja_prototipo_id: loja?.prototipo_id ?? null, loja_vendedor_id: loja?.vendedor_id ?? null, cliente_nome: cliente?.nome || '',
    }));
  },
  // Mensagens depois do id "depois" (em ordem); sem "depois", as últimas "limite".
  async mensagensDaConversa(conversaId, { depois = 0, limite = 200 } = {}) {
    if (depois > 0) {
      return checar(await db().from('mensagens').select('*').eq('conversa_id', conversaId).gt('id', depois).order('id', { ascending: true }).limit(limite));
    }
    return checar(await db().from('mensagens').select('*').eq('conversa_id', conversaId).order('id', { ascending: false }).limit(limite)).reverse();
  },
  // Grava a mensagem e atualiza a "última mensagem" da conversa.
  async criarMensagem(campos) {
    const m = checar(await db().from('mensagens').insert(campos).select().single());
    checar(await db().from('conversas').update({ ultima_em: m.enviada_em, ultima_previa: (m.texto || '').slice(0, 140), ultima_de: m.de }).eq('id', m.conversa_id));
    return m;
  },
  async atualizarConversa(id, campos) {
    return checar(await db().from('conversas').update(campos).eq('id', id).select().maybeSingle());
  },
  // ---------- arquivos anexados na entrega (etapa 5) ----------
  async salvarArquivosEntrega(linhas) {
    if (!linhas.length) return [];
    return checar(await db().from('entrega_arquivos').upsert(linhas, { onConflict: 'pedido_id,arquivo_id', ignoreDuplicates: true }).select());
  },
  async arquivosDasEntregas(pedidoIds) {
    if (!pedidoIds.length) return [];
    return checar(await db().from('entrega_arquivos').select('*').in('pedido_id', pedidoIds).order('id', { ascending: true }));
  },
  async pedidosDoArquivoEntrega(arquivoId) {
    return checar(await db().from('entrega_arquivos').select('pedido_id').eq('arquivo_id', arquivoId));
  },
  async infoArquivoPrototipo(id) {
    return checar(await db().from('prototipo_arquivos').select('id, tipo, tamanho, enviado_por').eq('id', id).maybeSingle());
  },

  // ---------- protótipo (versão de testes): documentos e arquivos, como no claude.ai ----------
  async listarDocsPrototipo(colecao) {
    const linhas = checar(await db().from('prototipo_docs').select('id, dados').eq('colecao', colecao).limit(5000));
    return linhas.map((l) => ({ id: l.id, dados: l.dados }));
  },
  async salvarDocPrototipo(colecao, id, dados) {
    checar(await db().from('prototipo_docs').upsert({ colecao, id, dados, atualizado_em: new Date().toISOString() }, { onConflict: 'colecao,id' }));
  },
  async apagarDocPrototipo(colecao, id) {
    checar(await db().from('prototipo_docs').delete().eq('colecao', colecao).eq('id', id));
  },
  async espacoUsadoPrototipo() {
    const linhas = checar(await db().from('prototipo_arquivos').select('tamanho').limit(10000));
    return linhas.reduce((t, l) => t + l.tamanho, 0);
  },
  async salvarArquivoPrototipo(id, tipo, conteudo, enviadoPor = null) {
    const { error } = await db().storage.from(PASTA).upload(id, conteudo, { contentType: tipo, upsert: true });
    if (error) throw Object.assign(new Error(`Storage: ${error.message}`), { status: 502 });
    checar(await db().from('prototipo_arquivos').upsert({ id, tipo, tamanho: conteudo.length, enviado_por: enviadoPor }));
  },
  async quemEnviouArquivoPrototipo(id) {
    return checar(await db().from('prototipo_arquivos').select('enviado_por').eq('id', id).maybeSingle())?.enviado_por || null;
  },
  async lerArquivoPrototipo(id) {
    const info = checar(await db().from('prototipo_arquivos').select('tipo').eq('id', id).maybeSingle());
    if (!info) return null;
    const { data, error } = await db().storage.from(PASTA).download(id);
    if (error || !data) return null;
    return { tipo: info.tipo, conteudo: Buffer.from(await data.arrayBuffer()) };
  },
  async apagarArquivoPrototipo(id) {
    await db().storage.from(PASTA).remove([id]);
    checar(await db().from('prototipo_arquivos').delete().eq('id', id));
  },

  // ---------- dados de teste (só para a página /teste/pagamentos, com o provedor simulado) ----------
  // Cria (ou reaproveita) três contas de teste, uma loja e um produto, e devolve os tokens de login.
  async prepararDadosTeste() {
    if (!config.supabase.publishableKey) throw Object.assign(new Error('SUPABASE_PUBLISHABLE_KEY não configurada'), { status: 503 });
    const contas = { cliente: 'Cliente de Teste', vendedor: 'Vendedora de Teste', dono: 'Dono de Teste' };
    const anon = clienteDeLogin();
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
    }, { onConflict: 'slug' }).select().single());
    let produto = checar(await db().from('produtos').select('*').eq('loja_id', loja.id).eq('titulo', 'Mentoria de teste').maybeSingle());
    if (!produto) {
      produto = checar(await db().from('produtos').insert({
        loja_id: loja.id, categoria: 'mentoria', titulo: 'Mentoria de teste', descricao: 'Produto inventado.', preco_kn: 100,
      }).select().single());
    }
    return { tokens, lojaId: loja.id, produtoId: produto.id };
  },
};
