import { Router } from 'express';
import { centavosParaReais } from '../lib/dinheiro.js';
import { repassar } from '../lib/repasse.js';
import { erro, exigirDono, exigirUsuario, rota } from '../lib/seguranca.js';

// Ações do suporte (só os donos).
export function rotasAdmin({ repo, asaas }) {
  const r = Router();
  r.use(exigirUsuario(repo), exigirDono);

  // Decide um pedido de reembolso. Aprovado = devolve em dinheiro pelo Asaas.
  r.post('/reembolsos/:id', rota(async (req, res) => {
    const { aprovar, valorCentavos } = req.body || {};
    if (typeof aprovar !== 'boolean') throw erro(400, 'informe aprovar: true ou false');
    if (valorCentavos != null && !(Number.isInteger(valorCentavos) && valorCentavos > 0)) throw erro(400, 'valorCentavos inválido');

    const rb = await repo.reembolso(req.params.id);
    if (!rb) throw erro(404, 'pedido de reembolso não encontrado');
    const p = await repo.pedido(rb.pedido_id);
    if (valorCentavos != null && valorCentavos > p.valor_centavos) throw erro(400, 'valor maior que o pago');

    // Trava: só uma decisão por pedido de reembolso.
    const [travado] = await repo.atualizarReembolso(rb.id,
      { status: aprovar ? 'aprovado' : 'negado', decidido_por: req.usuario.id, decidido_em: new Date().toISOString(), valor_centavos: valorCentavos ?? null },
      { status: ['em_analise'] });
    if (!travado) throw erro(409, `já decidido: ${rb.status}`);

    if (!aprovar) {
      await repo.atualizarPedidos({ id: p.id }, { status: rb.status_anterior }, { status: ['reembolso_solicitado'] });
      return res.json(travado);
    }
    try {
      await asaas.reembolsar(p.asaas_cobranca_id, {
        ...(valorCentavos ? { value: centavosParaReais(valorCentavos) } : {}),
        description: 'Reembolso aprovado pelo suporte Kennismarket',
      });
    } catch (e) {
      // Asaas recusou: volta para análise para tentar de novo.
      await repo.atualizarReembolso(rb.id, { status: 'em_analise', decidido_por: null, decidido_em: null }, { status: ['aprovado'] });
      throw e;
    }
    await repo.atualizarPedidos({ id: p.id }, { status: 'reembolsado' }, { status: ['reembolso_solicitado'] });
    res.json(travado);
  }));

  // Repasse travado ou que falhou demais:
  // - "tentar_de_novo": só depois de conferir no painel do Asaas que o dinheiro NÃO saiu;
  // - "marcar_enviado": conferiu e o dinheiro saiu (informe o id da transferência).
  r.post('/pedidos/:id/repasse', rota(async (req, res) => {
    const { acao, repasseId } = req.body || {};
    const p = await repo.pedido(req.params.id);
    if (!p) throw erro(404, 'pedido não encontrado');
    if (acao === 'tentar_de_novo') {
      const [ok] = await repo.atualizarPedidos({ id: p.id }, { repasse_status: 'falhou', repasse_tentativas: 0 },
        { repasse_status: ['enviando', 'falhou'] });
      if (!ok) throw erro(409, `repasse está "${p.repasse_status}"`);
      return res.json(await repassar(repo, p.id, { asaas }));
    }
    if (acao === 'marcar_enviado') {
      if (!repasseId) throw erro(400, 'informe repasseId');
      const [ok] = await repo.atualizarPedidos({ id: p.id }, { repasse_status: 'enviado', repasse_id: String(repasseId), repasse_erro: null },
        { repasse_status: ['enviando', 'falhou'] });
      if (!ok) throw erro(409, `repasse está "${p.repasse_status}"`);
      return res.json(ok);
    }
    throw erro(400, 'acao: tentar_de_novo ou marcar_enviado');
  }));

  return r;
}
