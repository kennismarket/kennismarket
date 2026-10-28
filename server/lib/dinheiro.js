// Regras de dinheiro. Todos os valores são em CENTAVOS (número inteiro),
// para nunca ter erro de arredondamento com casas decimais.

// Quanto vale 1 KN Coin em centavos de real. PROVISÓRIO: 1 KN = R$ 1,00,
// aguardando confirmação dos donos.
export const CENTAVOS_POR_KN = 100;

// Taxa do Kennismarket, em porcentagem, por tipo de vendedor.
export const TAXAS = {
  inscricao: 15, // abriu a loja normalmente
  convite: 50,   // entrou por link de convite (acordo 50/50)
};

export function knParaCentavos(kn) {
  if (!Number.isInteger(kn) || kn <= 0) throw new Error('Valor em KN inválido');
  return kn * CENTAVOS_POR_KN;
}

// Divide um pagamento entre vendedor e Kennismarket.
// O arredondamento sempre favorece o vendedor, e a soma bate exatamente com o total.
export function dividirVenda(totalCentavos, origemVendedor) {
  if (!Number.isInteger(totalCentavos) || totalCentavos <= 0) {
    throw new Error('Total inválido');
  }
  const taxa = TAXAS[origemVendedor];
  if (taxa === undefined) throw new Error(`Origem de vendedor desconhecida: ${origemVendedor}`);
  const plataforma = Math.floor((totalCentavos * taxa) / 100);
  return { vendedor: totalCentavos - plataforma, plataforma, taxa };
}

export function formatarReais(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
