import { Router } from 'express';

// O banco de pagamento chama este endereço sozinho a cada pagamento, devolução ou split.
// Endereço para cadastrar no banco: https://SEU-SITE/api/webhooks/pagamento
// Quem confere se o aviso veio mesmo do banco é o módulo de pagamento (confirmarPagamento).
export function rotaWebhookPagamento(deps) {
  const r = Router();
  r.post('/', async (req, res) => {
    const { status, corpo } = await processarAviso(deps, {
      corpoBruto: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      cabecalhos: req.headers,
    });
    res.status(status).json(corpo);
  });
  return r;
}

// Também usado pela página de teste para entregar os avisos do provedor simulado.
export async function processarAviso({ repo, pagamentos }, { corpoBruto, cabecalhos }) {
  try {
    const aviso = await pagamentos.confirmarPagamento({ corpoBruto, cabecalhos });
    if (!aviso.autentico) return { status: 401, corpo: { erro: 'aviso não autenticado' } };
    const resultado = [];
    for (const ev of aviso.eventos) {
      if (await repo.eventoJaProcessado(pagamentos.provedor, ev.eventoId)) {
        resultado.push({ eventoId: ev.eventoId, duplicado: true });
        continue;
      }
      await aplicar(repo, pagamentos.provedor, ev);
      // Só marca como processado no fim: se algo falhar, o banco manda de novo e tudo
      // pode rodar outra vez sem efeito duplicado (todas as mudanças são condicionais).
      await repo.registrarEvento(pagamentos.provedor, ev.eventoId, ev.tipo);
      resultado.push({ eventoId: ev.eventoId, tipo: ev.tipo });
    }
    return { status: 200, corpo: { ok: true, eventos: resultado } };
  } catch (e) {
    console.error('aviso de pagamento', e);
    // 5xx faz o banco tentar de novo mais tarde.
    return { status: e.status === 501 ? 503 : 500, corpo: { erro: 'falha ao processar o aviso' } };
  }
}

const PAGOS = ['pago', 'entregue', 'concluido', 'reembolso_solicitado', 'contestado'];

async function aplicar(repo, provedor, ev) {
  const onde = { cobranca_id: ev.cobrancaId, provedor };
  const agora = new Date().toISOString();
  switch (ev.tipo) {
    // Pagamento confirmado: o cliente já pode ser atendido. No split instantâneo,
    // a parte do vendedor vai junto; o aviso pode já dizer se o repasse foi feito.
    case 'pago': {
      const mudou = await repo.atualizarPedidos(onde,
        { status: 'pago', pago_em: agora, repasse_status: ev.repasse ?? 'processando' },
        { status: ['aguardando_pagamento'] });
      if (!mudou.length && ev.repasse) {
        await repo.atualizarPedidos(onde, { repasse_status: ev.repasse }, { repasse_status: ['aguardando', 'processando'] });
      }
      break;
    }
    case 'repasse_concluido':
      await repo.atualizarPedidos(onde, { repasse_status: 'repassado', repasse_erro: null },
        { repasse_status: ['aguardando', 'processando', 'falhou'] });
      break;
    case 'repasse_falhou':
      await repo.atualizarPedidos(onde, { repasse_status: 'falhou', repasse_erro: 'o banco avisou que o split falhou' },
        { repasse_status: ['aguardando', 'processando'] });
      break;
    case 'devolvido':
      await repo.atualizarPedidos(onde, { status: 'reembolsado' }, { status: PAGOS });
      break;
    case 'cancelado':
      await repo.atualizarPedidos(onde, { status: 'cancelado' }, { status: ['aguardando_pagamento'] });
      break;
  }
}
