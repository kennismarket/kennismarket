// Tradução entre os dados de recebimento do vendedor no banco de dados (tabela dados_recebimento)
// e o formato "recebedor" do módulo de pagamento.
import { soDigitos } from './documentos.js';

// O que o vendedor manda no cadastro → recebedor do módulo de pagamento.
export function recebedorDoCadastro(corpo = {}) {
  const pix = corpo.pix?.chave || corpo.pix?.tipo
    ? { chave: String(corpo.pix.chave || '').trim(), tipo: String(corpo.pix.tipo || '').toLowerCase() }
    : null;
  const banco = corpo.banco
    ? {
        codigo: soDigitos(corpo.banco.codigo),
        agencia: soDigitos(corpo.banco.agencia),
        conta: String(corpo.banco.conta || '').replace(/[^\dXx-]/g, ''),
        tipoConta: String(corpo.banco.tipoConta || '').toLowerCase(),
      }
    : null;
  return { nome: String(corpo.nome || '').trim(), documento: soDigitos(corpo.cpfCnpj), pix, banco, recebedorId: null };
}

// Linha da tabela → recebedor do módulo de pagamento.
export function recebedorDaLinha(l) {
  return {
    nome: l.nome,
    documento: l.cpf_cnpj,
    pix: l.pix_chave ? { chave: l.pix_chave, tipo: l.pix_tipo } : null,
    banco: l.banco_codigo ? { codigo: l.banco_codigo, agencia: l.agencia, conta: l.conta, tipoConta: l.conta_tipo } : null,
    recebedorId: l.provedor_recebedor_id || null,
  };
}

// Recebedor + resposta do banco → linha da tabela.
export function linhaDoRecebedor(lojaId, r, provedor, resposta) {
  return {
    loja_id: lojaId,
    nome: r.nome,
    cpf_cnpj: r.documento,
    pix_chave: r.pix?.chave ?? null,
    pix_tipo: r.pix?.tipo ?? null,
    banco_codigo: r.banco?.codigo ?? null,
    agencia: r.banco?.agencia ?? null,
    conta: r.banco?.conta ?? null,
    conta_tipo: r.banco?.tipoConta ?? null,
    provedor,
    provedor_recebedor_id: resposta.recebedorId,
    situacao: resposta.situacao,
    atualizado_em: new Date().toISOString(),
  };
}
