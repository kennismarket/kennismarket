// O "contrato" do módulo de pagamento: o formato que o resto do site usa, igual para qualquer banco.
// Cada provedor (simulado, transfeera...) traduz este formato para a API dele.
// Valores sempre em CENTAVOS de real (inteiro).
//
// Recebedor (quem recebe a parte do vendedor):
//   { nome, documento, pix: { chave, tipo } | null, banco: { codigo, agencia, conta, tipoConta } | null,
//     recebedorId: string | null }   ← recebedorId = código que o banco deu no cadastro, se der
//   tipo da chave Pix: cpf | cnpj | email | telefone | aleatoria
//   tipoConta: corrente | poupanca
//
// criarCobranca({ pedidoId, valorCentavos, forma, descricao, vencimento, pagador, divisao })
//   forma: pix | boleto | cartao
//   pagador: { nome, email, documento }
//   divisao: { vendedor: { centavos, recebedor }, plataforma: { centavos } }  ← soma = valorCentavos
//   → { cobrancaId, pix?: { copiaECola, imagem?, validoAte? }, boleto?: { linhaDigitavel, link? }, linkPagamento? }
//
// confirmarPagamento({ corpoBruto, cabecalhos })   ← aviso (webhook) que o banco mandou
//   → { autentico: false }  ou  { autentico: true, eventos: [{ eventoId, tipo, cobrancaId, repasse? }] }
//   tipo: pago | devolvido | cancelado | repasse_concluido | repasse_falhou
//   repasse (opcional, junto com "pago"): processando | repassado | falhou
//
// cadastrarRecebedor(recebedor) → { recebedorId: string | null, situacao: pronto | pendente | recusado, motivo? }
//
// consultarStatus({ cobrancaId })
//   → { pagamento: aguardando | pago | devolvido | cancelado, repasse: aguardando | processando | repassado | falhou }
//
// devolverPagamento({ cobrancaId, valorCentavos, motivo }) → { devolucaoId }
import { documentoValido } from '../lib/documentos.js';
import { invalido, ErroPagamento } from './erros.js';

export const FORMAS = ['pix', 'boleto', 'cartao'];
export const TIPOS_CHAVE_PIX = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'];
export const TIPOS_CONTA = ['corrente', 'poupanca'];
export const TIPOS_EVENTO = ['pago', 'devolvido', 'cancelado', 'repasse_concluido', 'repasse_falhou'];
const SITUACOES_PAGAMENTO = ['aguardando', 'pago', 'devolvido', 'cancelado'];
const SITUACOES_REPASSE = ['aguardando', 'processando', 'repassado', 'falhou'];

const centavosOk = (v, minimo = 1) => Number.isInteger(v) && v >= minimo;
const texto = (v) => typeof v === 'string' && v.trim().length > 0;

export function validarRecebedor(r) {
  if (!r || !texto(r.nome)) throw invalido('recebedor: nome obrigatório');
  if (!documentoValido(r.documento)) throw invalido('recebedor: CPF ou CNPJ inválido');
  const temPix = Boolean(r.pix);
  const temBanco = Boolean(r.banco);
  if (!temPix && !temBanco) throw invalido('recebedor: informe chave Pix ou dados bancários');
  if (temPix && (!texto(r.pix.chave) || !TIPOS_CHAVE_PIX.includes(r.pix.tipo))) {
    throw invalido(`recebedor: chave Pix incompleta (tipo: ${TIPOS_CHAVE_PIX.join(', ')})`);
  }
  if (temBanco) {
    const b = r.banco;
    if (!/^\d{3}$/.test(b.codigo || '') || !/^\d{1,6}$/.test(b.agencia || '') || !/^[\dXx-]{2,20}$/.test(b.conta || '')
      || !TIPOS_CONTA.includes(b.tipoConta)) {
      throw invalido('recebedor: dados bancários incompletos (banco com 3 dígitos, agência, conta, tipo corrente/poupanca)');
    }
  }
}

export function validarCobranca(d, formasAtivas) {
  if (!texto(d?.pedidoId)) throw invalido('cobrança: pedidoId obrigatório');
  if (!centavosOk(d.valorCentavos)) throw invalido('cobrança: valor inválido');
  if (!formasAtivas.includes(d.forma)) throw invalido(`cobrança: forma de pagamento indisponível (${formasAtivas.join(', ')})`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.vencimento || '')) throw invalido('cobrança: vencimento no formato AAAA-MM-DD');
  if (!texto(d.pagador?.nome) || !texto(d.pagador?.email) || !documentoValido(d.pagador?.documento)) {
    throw invalido('cobrança: pagador precisa de nome, e-mail e CPF/CNPJ válido');
  }
  const v = d.divisao?.vendedor;
  const p = d.divisao?.plataforma;
  if (!centavosOk(v?.centavos, 0) || !centavosOk(p?.centavos, 0)) throw invalido('cobrança: divisão inválida');
  // Trava de segurança: a divisão tem que bater exatamente com o valor cobrado.
  if (v.centavos + p.centavos !== d.valorCentavos) throw invalido('cobrança: a divisão não soma o valor cobrado');
  validarRecebedor(v.recebedor);
}

// Confere o que o provedor devolveu. Se um provedor responder fora do contrato, é erro dele, não do site.
const fora = (funcao, motivo) => new ErroPagamento('falha', `resposta fora do contrato em ${funcao}: ${motivo}`);

export function conferirCobranca(r) {
  if (!texto(r?.cobrancaId)) throw fora('criarCobranca', 'sem cobrancaId');
  return r;
}

export function conferirAviso(r) {
  if (r?.autentico !== true) return { autentico: false };
  if (!Array.isArray(r.eventos)) throw fora('confirmarPagamento', 'sem lista de eventos');
  for (const e of r.eventos) {
    if (!texto(e.eventoId) || !texto(e.cobrancaId) || !TIPOS_EVENTO.includes(e.tipo)) throw fora('confirmarPagamento', 'evento incompleto');
    if (e.repasse != null && !SITUACOES_REPASSE.includes(e.repasse)) throw fora('confirmarPagamento', 'repasse desconhecido');
  }
  return r;
}

export function conferirRecebedor(r) {
  if (!['pronto', 'pendente', 'recusado'].includes(r?.situacao)) throw fora('cadastrarRecebedor', 'situação desconhecida');
  return { recebedorId: r.recebedorId ?? null, situacao: r.situacao, motivo: r.motivo ?? null };
}

export function conferirStatus(r) {
  if (!SITUACOES_PAGAMENTO.includes(r?.pagamento) || !SITUACOES_REPASSE.includes(r?.repasse)) throw fora('consultarStatus', 'situação desconhecida');
  return r;
}

export function conferirDevolucao(r) {
  if (!texto(r?.devolucaoId)) throw fora('devolverPagamento', 'sem devolucaoId');
  return r;
}
