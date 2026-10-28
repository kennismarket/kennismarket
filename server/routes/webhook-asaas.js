import { Router } from 'express';
import { config } from '../config.js';
import { reaisParaCentavos } from '../lib/dinheiro.js';
import { repassar } from '../lib/repasse.js';
import { iguais } from '../lib/seguranca.js';

// O Asaas chama este endereço sozinho a cada pagamento ou transferência.
// Cadastro no Asaas: Integrações → Webhooks → URL https://SEU-SITE/api/webhooks/asaas
export function rotaWebhookAsaas({ repo, asaas }) {
  const r = Router();

  r.post('/', async (req, res) => {
    if (!iguais(req.get('asaas-access-token'), config.asaas.webhookToken)) return res.status(401).end();
    const ev = req.body || {};
    try {
      if (ev.id && await repo.eventoJaProcessado(ev.id)) return res.json({ ok: true, duplicado: true });
      await processar(repo, asaas, ev);
      // Só marca como processado no fim: se algo falhar, o Asaas manda de novo e tudo
      // acima pode rodar outra vez sem efeito duplicado (todas as mudanças são condicionais).
      if (ev.id) await repo.registrarEvento(ev.id, ev.event || '?');
      res.json({ ok: true });
    } catch (e) {
      console.error('webhook Asaas', ev.event, e);
      res.status(500).end();
    }
  });

  return r;
}

async function processar(repo, asaas, ev) {
  const agora = new Date().toISOString();
  const pg = ev.payment;
  if (pg?.id) {
    const onde = { asaas_cobranca_id: pg.id };
    switch (ev.event) {
      // Cartão aprovado: o cliente já pode ser atendido, mas o dinheiro ainda não caiu.
      case 'PAYMENT_CONFIRMED':
        await repo.atualizarPedidos(onde, { status: 'pago', pago_em: agora, repasse_status: 'aguardando_dinheiro' },
          { status: ['aguardando_pagamento'] });
        break;
      // Dinheiro na conta (Pix e boleto na hora; cartão uns 30 dias depois): paga o vendedor.
      case 'PAYMENT_RECEIVED': {
        await repo.atualizarPedidos(onde, { status: 'pago', pago_em: agora }, { status: ['aguardando_pagamento'] });
        const liquido = pg.netValue != null ? reaisParaCentavos(pg.netValue) : null;
        const prontos = await repo.atualizarPedidos(onde,
          { repasse_status: 'pendente', ...(liquido ? { valor_liquido_centavos: liquido } : {}) },
          { repasse_status: [null, 'aguardando_dinheiro'], status: ['pago', 'entregue', 'concluido', 'reembolso_solicitado'] });
        for (const p of prontos) {
          // Se o repasse falhar aqui, a tarefa de hora em hora tenta de novo.
          await repassar(repo, p.id, { asaas }).catch((e) => console.error('repasse', p.id, e.message));
        }
        break;
      }
      case 'PAYMENT_REFUNDED':
        await repo.atualizarPedidos(onde, { status: 'reembolsado' },
          { status: ['pago', 'entregue', 'concluido', 'reembolso_solicitado', 'contestado'] });
        break;
      case 'PAYMENT_DELETED':
        await repo.atualizarPedidos(onde, { status: 'cancelado' }, { status: ['aguardando_pagamento'] });
        break;
      case 'PAYMENT_CHARGEBACK_REQUESTED':
        await repo.atualizarPedidos(onde, { status: 'contestado' },
          { status: ['pago', 'entregue', 'concluido', 'reembolso_solicitado'] });
        break;
    }
  }

  const tr = ev.transfer;
  if (tr?.id) {
    const onde = { repasse_id: tr.id };
    if (ev.event === 'TRANSFER_DONE') {
      await repo.atualizarPedidos(onde, { repasse_status: 'concluido' }, { repasse_status: ['enviado'] });
    } else if (ev.event === 'TRANSFER_FAILED' || ev.event === 'TRANSFER_CANCELLED') {
      // O Asaas confirmou que o dinheiro NÃO saiu: é seguro tentar de novo.
      await repo.atualizarPedidos(onde, { repasse_status: 'falhou', repasse_erro: `Asaas: ${ev.event}` },
        { repasse_status: ['enviado'] });
    }
  }
}
