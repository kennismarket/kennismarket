import crypto from 'node:crypto';
import { Router } from 'express';
import { debitoDoVendedor } from '../lib/dinheiro.js';
import { DIAS_CONFIRMACAO_AUTOMATICA } from '../lib/pedidos.js';
import { avisarPagamento, conversaParaTela, mensagemParaTela } from '../lib/chat.js';
import { espelharLoja, espelharTodas } from '../lib/espelho-lojas.js';
import { resumoFaturamento } from '../lib/vendas.js';
import { donasDasLojas, idDaLoja } from '../lib/lojas-prototipo.js';
import { erro, exigirDono, exigirUsuario, rota } from '../lib/seguranca.js';

// Ações do suporte (só os donos).
export function rotasAdmin({ repo, pagamentos, mudouPrototipo = () => {} }) {
  const r = Router();
  r.use(exigirUsuario(repo, pagamentos), exigirDono);

  // Confere o login do dono (a tela de login da administração usa isto).
  r.get('/eu', (req, res) => res.json({ email: req.usuario.email, nome: req.usuario.nome, papel: req.usuario.papel }));

  // Copia de novo todas as lojas do protótipo para as tabelas reais (o servidor já faz isso
  // sozinho a cada gravação e ao ligar; isto serve para conferir ou consertar).
  r.post('/lojas/copiar', rota(async (_req, res) => res.json(await espelharTodas(repo))));

  // ---------- vendedores (seção "Contas" do painel do dono) ----------
  // Cada vendedor com a loja, o número de vendas e o total vendido; ?vendas=1 traz cada venda.
  // Venda = pedido pago (inclui entregue, concluído e com reembolso pedido). Reembolsados aparecem
  // na lista com a situação, mas não entram no número nem no total.
  r.get('/vendedores', rota(async (req, res) => {
    const [vendedores, lojas] = await Promise.all([repo.listarVendedores(), repo.lojasComVendedor()]);
    const lojasDe = {};
    for (const l of lojas) (lojasDe[l.vendedor_id] ||= []).push(l);
    const ids = lojas.map((l) => l.id);
    const [vendas, debitos] = await Promise.all([repo.vendasDasLojas(ids), repo.listarDebitos({ lojaIds: ids })]);
    const nomeDaLoja = Object.fromEntries(lojas.map((l) => [l.id, l.nome]));
    const produtoDe = (pedidoId) => vendas.find((v) => v.id === pedidoId)?.produto_titulo || '';
    const comVendas = req.query.vendas === '1';
    const daLoja = (l) => ({ nome: l.nome, prototipoId: l.prototipo_id, porcentagem: l.porcentagem_vendedor, publicada: l.publicada, banida: l.banida });
    const lista = vendedores.map((p) => {
      const suas = lojasDe[p.id] || [];
      const sIds = suas.map((l) => l.id);
      return {
        id: p.id, nome: p.nome, usuario: p.usuario, email: p.email.endsWith('.invalid') ? '' : p.email, banida: p.banida,
        loja: suas[0] ? daLoja(suas[0]) : null,
        lojas: suas.map(daLoja),
        ...resumoFaturamento(vendas.filter((v) => sIds.includes(v.loja_id)).map((v) => ({ ...v, loja_nome: nomeDaLoja[v.loja_id] || '' })),
          debitos.filter((d) => sIds.includes(d.loja_id)), { comLista: comVendas, produtoDe }),
      };
    }).sort((a, b) => b.totalCentavos - a.totalCentavos || String(a.nome).localeCompare(String(b.nome)));
    res.json({ vendedores: lista });
  }));

  // ---------- contas (seção "Contas" do painel do dono) ----------
  // Busca por nome, usuário ou e-mail. O e-mail interno (sem e-mail) não aparece.
  r.get('/contas', rota(async (req, res) => {
    const termo = String(req.query.q || '').trim();
    if (termo.length < 2) throw erro(400, 'digite pelo menos 2 letras');
    const contas = await repo.buscarContas(termo);
    res.json({ contas: contas.map((c) => ({ ...c, email: c.email.endsWith('.invalid') ? '' : c.email })) });
  }));
  const contaAlvo = async (req) => {
    const p = await repo.perfil(req.params.id);
    if (!p) throw erro(404, 'conta não encontrada');
    if (p.papel === 'dono') throw erro(403, 'contas de dono não são alteradas por aqui');
    return p;
  };
  // Senha temporária, mostrada uma vez para o dono passar ao cliente (que troca em "Minha conta").
  r.post('/contas/:id/senha', rota(async (req, res) => {
    await contaAlvo(req);
    const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
    const senha = Array.from(crypto.randomBytes(12), (b) => letras[b % letras.length]).join('');
    await repo.trocarSenha(req.params.id, senha);
    res.json({ senha });
  }));
  // Banir: a conta não entra mais, e quem estava logado perde o acesso na hora.
  // Vendedor banido: a loja dele sai do catálogo e não pode ser editada (loja banida não vende);
  // desbanir devolve a loja ao catálogo.
  r.post('/contas/:id/banir', rota(async (req, res) => {
    const alvo = await contaAlvo(req);
    const banir = req.body?.banir;
    if (typeof banir !== 'boolean') throw erro(400, 'informe banir: true ou false');
    await repo.banirConta(req.params.id, banir);
    const lojas = [];
    if (alvo.papel === 'vendedor') {
      const donas = await donasDasLojas(repo);
      for (const d of await repo.listarDocsPrototipo('stores')) {
        const id = idDaLoja(d.id);
        if (id == null || donas[id] !== req.params.id || !d.dados?.store) continue;
        await repo.salvarDocPrototipo('stores', d.id, { ...d.dados, store: { ...d.dados.store, pub: !banir }, contaDona: req.params.id, banida: banir, ts: Date.now() });
        lojas.push(id);
      }
      if (lojas.length) mudouPrototipo('stores');
      // a cópia da loja no documento do vendedor também sai do catálogo (e o documento trava)
      let vendedores = 0;
      for (const d of await repo.listarDocsPrototipo('sellers')) {
        const acc = d.dados?.acc;
        if (acc?.userId !== req.params.id) continue;
        const novo = { ...acc, banida: banir, ...(acc.store ? { store: { ...acc.store, pub: !banir } } : {}) };
        await repo.salvarDocPrototipo('sellers', d.id, { ...d.dados, acc: novo, ts: Date.now() });
        if (acc.store?.id != null && !lojas.includes(acc.store.id)) lojas.push(acc.store.id);
        vendedores++;
      }
      if (vendedores) mudouPrototipo('sellers');
      for (const id of lojas) await espelharLoja(repo, id);
    }
    res.json({ ok: true, banida: banir, lojas });
  }));

  // Decide um pedido de reembolso. Aprovado = devolve em dinheiro, saindo do caixa do Kennismarket,
  // e anota o débito do vendedor (a parte dele que já tinha sido repassada).
  r.post('/reembolsos/:id', rota(async (req, res) => {
    const { aprovar, valorCentavos } = req.body || {};
    if (typeof aprovar !== 'boolean') throw erro(400, 'informe aprovar: true ou false');
    if (valorCentavos != null && !(Number.isInteger(valorCentavos) && valorCentavos > 0)) throw erro(400, 'valorCentavos inválido');

    const rb = await repo.reembolso(req.params.id);
    if (!rb) throw erro(404, 'pedido de reembolso não encontrado');
    const p = await repo.pedido(rb.pedido_id);
    const valor = valorCentavos ?? p.valor_centavos;
    if (valor > p.valor_centavos) throw erro(400, 'valor maior que o pago');
    if (aprovar && p.provedor !== pagamentos.provedor) throw erro(409, `pedido pago pelo provedor "${p.provedor}", e o site está usando "${pagamentos.provedor}"`);

    // Trava: só uma decisão por pedido de reembolso.
    const [travado] = await repo.atualizarReembolso(rb.id,
      { status: aprovar ? 'aprovado' : 'negado', decidido_por: req.usuario.id, decidido_em: new Date().toISOString(), valor_centavos: aprovar ? valor : null },
      { status: ['em_analise'] });
    if (!travado) throw erro(409, `já decidido: ${rb.status}`);

    if (!aprovar) {
      await repo.atualizarPedidos({ id: p.id }, { status: rb.status_anterior }, { status: ['reembolso_solicitado'] });
      return res.json({ reembolso: travado, debito: null });
    }

    let devolucao;
    try {
      devolucao = await pagamentos.devolverPagamento({ cobrancaId: p.cobranca_id, valorCentavos: valor, motivo: 'Reembolso aprovado pelo suporte Kennismarket' });
    } catch (e) {
      // O banco recusou: volta para análise para tentar de novo.
      await repo.atualizarReembolso(rb.id, { status: 'em_analise', decidido_por: null, decidido_em: null, valor_centavos: null }, { status: ['aprovado'] });
      throw e;
    }
    const [reembolso] = await repo.atualizarReembolso(rb.id, { devolucao_id: devolucao.devolucaoId }, { status: ['aprovado'] });
    await repo.atualizarPedidos({ id: p.id }, { status: 'reembolsado' }, { status: ['reembolso_solicitado'] });

    // O dinheiro já voltou ao cliente; anotar o débito não pode desfazer isso.
    let debito = null;
    let aviso = null;
    const devido = debitoDoVendedor(p, valor);
    if (devido > 0) {
      try {
        debito = await repo.criarDebito({ loja_id: p.loja_id, pedido_id: p.id, reembolso_id: rb.id, valor_centavos: devido });
      } catch (e) {
        console.error('débito do vendedor não anotado', rb.id, e);
        aviso = `reembolso feito, mas o débito de ${devido} centavos do vendedor NÃO foi anotado: anote à mão`;
      }
    }
    res.json({ reembolso, debito, ...(aviso ? { aviso } : {}) });
  }));

  // Painel do dono → Casos de suporte: pedidos de reembolso reais (em análise e os últimos
  // decididos) e os débitos dos vendedores, com a loja, o produto e o cliente de cada pedido.
  r.get('/casos', rota(async (_req, res) => {
    const [abertos, decididos, debitos] = await Promise.all([
      repo.listarReembolsos({ status: ['em_analise'], limite: 200 }),
      repo.listarReembolsos({ status: ['aprovado', 'negado'], limite: 20 }),
      repo.listarDebitos(),
    ]);
    const ids = [...new Set([...abertos, ...decididos, ...debitos].map((x) => x.pedido_id))];
    const pedidos = Object.fromEntries((await repo.listarPedidos({ ids })).map((p) => [p.id, p]));
    const pedidoDe = (id) => {
      const p = pedidos[id];
      return p ? {
        id: p.id, status: p.status, valorKn: p.valor_kn, valorCentavos: p.valor_centavos, vendedorCentavos: p.vendedor_centavos,
        porcentagemVendedor: 100 - (p.taxa_percentual ?? 50), loja: { nome: p.loja_nome, prototipoId: p.loja_prototipo_id },
        produto: p.produto_titulo, cliente: p.cliente_nome, pagoEm: p.pago_em || null, entregueEm: p.entregue_em || null,
      } : null;
    };
    // a conversa do cliente com a loja (o suporte lê nos chamados)
    const conversaDoPedido = {};
    await Promise.all(ids.map(async (id) => {
      const p = pedidos[id];
      if (p) conversaDoPedido[id] = (await repo.conversaPor(p.loja_id, p.cliente_id))?.id || null;
    }));
    const caso = (rb) => ({ id: rb.id, conversaId: conversaDoPedido[rb.pedido_id] || null, status: rb.status, motivo: rb.motivo, statusAnterior: rb.status_anterior, criadoEm: rb.criado_em || null,
      decididoEm: rb.decidido_em || null, valorCentavos: rb.valor_centavos ?? null, pedido: pedidoDe(rb.pedido_id) });
    res.json({
      abertos: abertos.map(caso),
      decididos: decididos.map(caso),
      debitos: debitos.map((d) => ({ id: d.id, valorCentavos: d.valor_centavos, situacao: d.situacao, criadoEm: d.criado_em || null, resolvidoEm: d.resolvido_em || null, observacao: d.observacao || null, pedido: pedidoDe(d.pedido_id) })),
      diasConfirmacao: DIAS_CONFIRMACAO_AUTOMATICA,
    });
  }));

  // ---------- conversas (etapa 5) ----------
  // Decisão dos donos: o suporte lê uma conversa só quando ela foi marcada (contato por fora ou
  // golpe) ou quando há pedido de reembolso daquele cliente naquela loja.
  async function podeLer(c) {
    if (c.marcada_em) return true;
    const pedidos = await repo.listarPedidos({ clienteId: c.cliente_id, lojaId: c.loja_id });
    return (await repo.listarReembolsos({ pedidoIds: pedidos.map((p) => p.id), limite: 1 })).length > 0;
  }
  r.get('/conversas', rota(async (_req, res) => {
    const lista = await repo.listarConversas({ marcadas: true });
    res.json({ conversas: lista.map((c) => ({ ...conversaParaTela(c, 'vendedor'), cliente: c.cliente_nome, nova: false })) });
  }));
  r.get('/conversas/:id/mensagens', rota(async (req, res) => {
    const c = await repo.conversa(req.params.id);
    if (!c) throw erro(404, 'conversa não encontrada');
    if (!(await podeLer(c))) throw erro(403, 'o suporte só lê conversas marcadas ou com pedido de reembolso');
    const [info] = (await repo.listarConversas({ lojaIds: [c.loja_id] })).filter((x) => x.id === c.id);
    res.json({ conversa: { ...conversaParaTela(info || c, 'vendedor'), cliente: info?.cliente_nome || '' },
      mensagens: (await repo.mensagensDaConversa(c.id, { limite: 500 })).map(mensagemParaTela) });
  }));
  // Tira (ou põe de volta) a marcação de uma conversa.
  r.post('/conversas/:id/marcar', rota(async (req, res) => {
    if (typeof req.body?.marcada !== 'boolean') throw erro(400, 'informe marcada: true ou false');
    if (!(await repo.conversa(req.params.id))) throw erro(404, 'conversa não encontrada');
    const c = await repo.atualizarConversa(req.params.id, req.body.marcada
      ? { marcada_em: new Date().toISOString(), marcada_motivo: 'suporte' } : { marcada_em: null, marcada_motivo: null });
    res.json({ marcada: Boolean(c.marcada_em) });
  }));

  // Débitos de vendedores (anotados nos reembolsos). ?situacao=aberto para só os em aberto.
  r.get('/debitos', rota(async (req, res) => {
    res.json(await repo.listarDebitos({ situacao: req.query.situacao || undefined }));
  }));

  // Marca um débito de vendedor como quitado (pagou por fora), perdoado, ou de volta em aberto.
  r.post('/debitos/:id', rota(async (req, res) => {
    const { situacao, observacao } = req.body || {};
    if (!['aberto', 'quitado', 'perdoado'].includes(situacao)) throw erro(400, 'situacao: aberto, quitado ou perdoado');
    if (!(await repo.debito(req.params.id))) throw erro(404, 'débito não encontrado');
    const campos = { situacao, resolvido_em: situacao === 'aberto' ? null : new Date().toISOString() };
    if (observacao !== undefined) campos.observacao = String(observacao || '').trim().slice(0, 500) || null;
    res.json(await repo.atualizarDebito(req.params.id, campos));
  }));

  // Pergunta ao banco a situação da cobrança e do split, e corrige o pedido se algum aviso se perdeu.
  r.post('/pedidos/:id/atualizar-status', rota(async (req, res) => {
    const p = await repo.pedido(req.params.id);
    if (!p) throw erro(404, 'pedido não encontrado');
    if (!p.cobranca_id) throw erro(409, 'pedido sem cobrança');
    if (p.provedor !== pagamentos.provedor) throw erro(409, `pedido do provedor "${p.provedor}"`);
    const s = await pagamentos.consultarStatus({ cobrancaId: p.cobranca_id });
    const onde = { id: p.id };
    const agora = new Date().toISOString();
    if (s.pagamento === 'pago') {
      for (const p2 of await repo.atualizarPedidos(onde, { status: 'pago', pago_em: agora }, { status: ['aguardando_pagamento'] })) await avisarPagamento(repo, p2);
    }
    if (s.pagamento === 'cancelado') await repo.atualizarPedidos(onde, { status: 'cancelado' }, { status: ['aguardando_pagamento'] });
    if (s.pagamento === 'devolvido') {
      await repo.atualizarPedidos(onde, { status: 'reembolsado' }, { status: ['pago', 'entregue', 'concluido', 'reembolso_solicitado', 'contestado'] });
    }
    if (s.repasse !== 'aguardando') await repo.atualizarPedidos(onde, { repasse_status: s.repasse }, { repasse_status: ['aguardando', 'processando', 'falhou'] });
    res.json({ banco: s, pedido: await repo.pedido(p.id) });
  }));

  return r;
}
