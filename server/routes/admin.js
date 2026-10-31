import crypto from 'node:crypto';
import { Router } from 'express';
import { debitoDoVendedor } from '../lib/dinheiro.js';
import { espelharLoja, espelharTodas } from '../lib/espelho-lojas.js';
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

  // Débitos de vendedores (anotados nos reembolsos). ?situacao=aberto para só os em aberto.
  r.get('/debitos', rota(async (req, res) => {
    res.json(await repo.listarDebitos({ situacao: req.query.situacao || undefined }));
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
    if (s.pagamento === 'pago') await repo.atualizarPedidos(onde, { status: 'pago', pago_em: agora }, { status: ['aguardando_pagamento'] });
    if (s.pagamento === 'cancelado') await repo.atualizarPedidos(onde, { status: 'cancelado' }, { status: ['aguardando_pagamento'] });
    if (s.pagamento === 'devolvido') {
      await repo.atualizarPedidos(onde, { status: 'reembolsado' }, { status: ['pago', 'entregue', 'concluido', 'reembolso_solicitado', 'contestado'] });
    }
    if (s.repasse !== 'aguardando') await repo.atualizarPedidos(onde, { repasse_status: s.repasse }, { repasse_status: ['aguardando', 'processando', 'falhou'] });
    res.json({ banco: s, pedido: await repo.pedido(p.id) });
  }));

  return r;
}
