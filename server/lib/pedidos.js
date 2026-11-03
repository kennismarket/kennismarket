// Pedidos depois do pagamento (etapa 4): confirmação automática e o formato que as telas recebem.

// Decisão dos donos (recomendação do plano): se o cliente não confirmar o recebimento, o pedido
// vira "concluído" sozinho 7 dias depois de "entregue". Mesmo concluído, o cliente ainda pode
// pedir reembolso (o suporte analisa).
export const DIAS_CONFIRMACAO_AUTOMATICA = 7;

// Situações que aparecem nas telas de pedidos (pagos em diante).
export const STATUS_DEPOIS_DE_PAGO = ['pago', 'entregue', 'concluido', 'reembolso_solicitado', 'reembolsado'];

// Conclui os pedidos entregues há mais de 7 dias. Roda pela tarefa diária do GitHub e também
// antes de cada lista de pedidos (o servidor grátis dorme, então não dá para contar só com a tarefa).
export async function concluirEntreguesVencidos(repo, agora = Date.now()) {
  const limite = new Date(agora - DIAS_CONFIRMACAO_AUTOMATICA * 864e5).toISOString();
  return (await repo.concluirEntreguesAntes(limite)).length;
}

// Data em que o pedido entregue vira concluído sozinho (para a tela mostrar).
export const concluiAutomaticoEm = (p) => (p.status === 'entregue' && p.entregue_em
  ? new Date(Date.parse(p.entregue_em) + DIAS_CONFIRMACAO_AUTOMATICA * 864e5).toISOString() : null);

// O que o cliente e o vendedor veem de um pedido (sem dados de cobrança nem do outro lado).
// reembolso: o pedido de reembolso mais recente desse pedido (se houver).
export function pedidoParaTela(p, { comCliente = false, reembolso = null } = {}) {
  return {
    id: p.id,
    status: p.status,
    loja: { nome: p.loja_nome, prototipoId: p.loja_prototipo_id },
    produto: { titulo: p.produto_titulo, prototipoId: p.produto_prototipo_id },
    valorKn: p.valor_kn,
    valorCentavos: p.valor_centavos,
    criadoEm: p.criado_em || null,
    pagoEm: p.pago_em || null,
    entregueEm: p.entregue_em || null,
    concluidoEm: p.concluido_em || null,
    concluiSozinhoEm: concluiAutomaticoEm(p),
    reembolso: reembolso && { status: reembolso.status, valorCentavos: reembolso.valor_centavos ?? null, decididoEm: reembolso.decidido_em || null },
    ...(comCliente ? { cliente: (p.cliente_nome || '').split(' ')[0] || '', vendedorCentavos: p.vendedor_centavos } : {}),
  };
}

// { pedidoId: reembolso mais recente }
export function ultimoReembolsoPorPedido(reembolsos) {
  const m = {};
  for (const r of reembolsos) if (!m[r.pedido_id] || String(r.criado_em) > String(m[r.pedido_id].criado_em)) m[r.pedido_id] = r;
  return m;
}
