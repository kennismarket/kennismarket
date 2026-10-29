// Erro único do módulo de pagamento. O resto do site só conhece este erro,
// nunca os erros específicos de cada banco.
export class ErroPagamento extends Error {
  // tipo: 'recusado'  → o banco recusou os dados (ex.: chave Pix inválida) — status 400
  //       'falha'     → o banco não respondeu ou deu erro do lado dele — status 502
  //       'pendente'  → função ainda não implementada (falta a documentação) — status 501
  //       'invalido'  → o site mandou dados errados para o módulo — status 400
  constructor(tipo, mensagem, detalhes) {
    super(mensagem);
    this.tipo = tipo;
    this.detalhes = detalhes;
    this.status = { recusado: 400, falha: 502, pendente: 501, invalido: 400 }[tipo] ?? 500;
  }
}

export const invalido = (msg) => new ErroPagamento('invalido', msg);
