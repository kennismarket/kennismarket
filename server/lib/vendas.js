// Resumo das vendas de uma loja (painel do dono e "Minhas vendas" do vendedor).
// Venda = pedido pago (pago, entregue, concluído, reembolso pedido). Reembolsados aparecem
// na lista com a situação, mas não entram no número nem no total.
export function resumoVendas(todas, { comLista = true } = {}) {
  const validas = todas.filter((v) => v.status !== 'reembolsado');
  return {
    vendas: validas.length,
    reembolsadas: todas.length - validas.length,
    totalKn: validas.reduce((s, v) => s + v.valor_kn, 0),
    totalCentavos: validas.reduce((s, v) => s + v.valor_centavos, 0),
    vendedorCentavos: validas.reduce((s, v) => s + (v.vendedor_centavos || 0), 0),
    ...(comLista ? {
      lista: todas.map((v) => ({ id: v.id, data: v.pago_em || v.criado_em, produto: v.produto_titulo, valorKn: v.valor_kn,
        valorCentavos: v.valor_centavos, vendedorCentavos: v.vendedor_centavos, status: v.status })),
    } : {}),
  };
}
