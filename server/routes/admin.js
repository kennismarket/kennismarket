import { Router } from 'express';
import { debitoDoVendedor } from '../lib/dinheiro.js';
import { erro, exigirDono, exigirUsuario, rota } from '../lib/seguranca.js';

// Ações do suporte (só os donos).
export function rotasAdmin({ repo, pagamentos }) {
  const r = Router();
  r.use(exigirUsuario(repo, pagamentos), exigirDono);

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
