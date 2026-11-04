// Resumo das vendas e do faturamento (painel do dono, "Faturamento da conta" e "Faturamento da loja").
// Venda = pedido pago (pago, entregue, concluído, reembolso pedido). Reembolsados aparecem
// na lista com a situação, mas não entram no número nem no total.
//
// Repasse (split instantâneo): a parte do vendedor vai para a chave Pix dele junto com o pagamento.
// - recebido: a parte do vendedor nas vendas com repasse feito (inclui as reembolsadas depois:
//   ele recebeu; o reembolso virou débito);
// - processando: pago, mas o banco ainda não confirmou o repasse;
// - a receber: o banco avisou que o repasse falhou (o Kennismarket deve ao vendedor).
export function resumoVendas(todas, { comLista = true } = {}) {
  const validas = todas.filter((v) => v.status !== 'reembolsado');
  const parte = (filtro) => todas.filter(filtro).reduce((s, v) => s + (v.vendedor_centavos || 0), 0);
  return {
    vendas: validas.length,
    reembolsadas: todas.length - validas.length,
    totalKn: validas.reduce((s, v) => s + v.valor_kn, 0),
    totalCentavos: validas.reduce((s, v) => s + v.valor_centavos, 0),
    vendedorCentavos: validas.reduce((s, v) => s + (v.vendedor_centavos || 0), 0),
    recebidoCentavos: parte((v) => v.repasse_status === 'repassado'),
    processandoCentavos: parte((v) => v.repasse_status === 'aguardando' || v.repasse_status === 'processando'),
    aReceberCentavos: parte((v) => v.repasse_status === 'falhou'),
    ...(comLista ? {
      lista: todas.map((v) => ({ id: v.id, data: v.pago_em || v.criado_em, produto: v.produto_titulo, valorKn: v.valor_kn,
        valorCentavos: v.valor_centavos, vendedorCentavos: v.vendedor_centavos, status: v.status, repasse: v.repasse_status || null,
        ...(v.loja_nome !== undefined ? { loja: v.loja_nome } : {}) })),
    } : {}),
  };
}

// Débitos do vendedor (reembolsos aprovados): só os em aberto contam no saldo.
export function resumoDebitos(debitos, { comLista = true, produtoDe = () => '' } = {}) {
  const abertos = debitos.filter((d) => d.situacao === 'aberto');
  return {
    debitoAbertoCentavos: abertos.reduce((s, d) => s + d.valor_centavos, 0),
    ...(comLista ? {
      debitos: debitos.map((d) => ({ id: d.id, valorCentavos: d.valor_centavos, situacao: d.situacao, data: d.criado_em || null,
        resolvidoEm: d.resolvido_em || null, produto: produtoDe(d.pedido_id) })),
    } : {}),
  };
}

// Faturamento = vendas + repasse + débitos. Saldo = recebido + a receber − débitos em aberto.
export function resumoFaturamento(vendas, debitos, opcoes = {}) {
  const r = { ...resumoVendas(vendas, opcoes), ...resumoDebitos(debitos, opcoes) };
  r.saldoCentavos = r.recebidoCentavos + r.aReceberCentavos - r.debitoAbertoCentavos;
  return r;
}
