// Regras de dinheiro. Valores em reais são sempre em CENTAVOS (número inteiro),
// para nunca ter erro de arredondamento com casas decimais.

// Decisão dos donos: toda venda é dividida 50/50 entre vendedor e Kennismarket.
export const PORCENTAGEM_VENDEDOR = 50;

// 1 KN Coin = 1 euro. O preço em reais usa a cotação do euro do dia.
export function knParaCentavos(kn, cotacaoBrl) {
  if (!Number.isInteger(kn) || kn <= 0) throw new Error('Valor em KN inválido');
  const taxa = Number(cotacaoBrl);
  if (!(taxa > 0) || !Number.isFinite(taxa)) throw new Error('Cotação inválida');
  return Math.round(kn * taxa * 100);
}

// Divide o valor que sobrou depois da taxa do Asaas.
// O centavo quebrado fica com o vendedor, e a soma bate exatamente com o total.
export function dividirVenda(baseCentavos) {
  if (!Number.isInteger(baseCentavos) || baseCentavos <= 0) throw new Error('Valor inválido');
  const plataforma = Math.floor((baseCentavos * (100 - PORCENTAGEM_VENDEDOR)) / 100);
  return { vendedor: baseCentavos - plataforma, plataforma };
}

// O Asaas trabalha com reais em número decimal (ex.: 99.01).
export const centavosParaReais = (c) => Math.round(c) / 100;
export const reaisParaCentavos = (r) => Math.round(Number(r) * 100);

export function formatarReais(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
