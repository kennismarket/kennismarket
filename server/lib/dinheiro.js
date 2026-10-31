// Regras de dinheiro. Valores em reais são sempre em CENTAVOS (número inteiro),
// para nunca ter erro de arredondamento com casas decimais.

// Decisão dos donos: a venda é dividida entre vendedor e Kennismarket sobre o valor cheio
// cobrado do cliente; padrão 50/50, e o dono ajusta por loja (10% a 90% para o vendedor).
// A taxa do banco sai da parte do Kennismarket.
export const PORCENTAGEM_VENDEDOR = 50;
export const PORCENTAGEM_PLATAFORMA = 100 - PORCENTAGEM_VENDEDOR;
export const PORCENTAGEM_VENDEDOR_MIN = 10;
export const PORCENTAGEM_VENDEDOR_MAX = 90;

// 1 KN Coin = 1 euro. O preço em reais usa a cotação do euro do dia.
export function knParaCentavos(kn, cotacaoBrl) {
  if (!Number.isInteger(kn) || kn <= 0) throw new Error('Valor em KN inválido');
  const taxa = Number(cotacaoBrl);
  if (!(taxa > 0) || !Number.isFinite(taxa)) throw new Error('Cotação inválida');
  return Math.round(kn * taxa * 100);
}

// O centavo quebrado fica com o vendedor, e a soma bate exatamente com o total.
export function dividirVenda(totalCentavos, porcentagemVendedor = PORCENTAGEM_VENDEDOR) {
  if (!Number.isInteger(totalCentavos) || totalCentavos <= 0) throw new Error('Valor inválido');
  const pv = Number(porcentagemVendedor);
  if (!Number.isInteger(pv) || pv < PORCENTAGEM_VENDEDOR_MIN || pv > PORCENTAGEM_VENDEDOR_MAX) throw new Error('Porcentagem do vendedor inválida');
  const plataforma = Math.floor((totalCentavos * (100 - pv)) / 100);
  return { vendedor: totalCentavos - plataforma, plataforma };
}

// Num reembolso aprovado, o Kennismarket devolve ao cliente, mas o vendedor já recebeu a parte dele.
// O débito do vendedor é a parte dele proporcional ao valor devolvido (total: a parte inteira).
export function debitoDoVendedor(pedido, devolvidoCentavos) {
  if (devolvidoCentavos >= pedido.valor_centavos) return pedido.vendedor_centavos;
  return Math.round((devolvidoCentavos * pedido.vendedor_centavos) / pedido.valor_centavos);
}

export function formatarReais(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
