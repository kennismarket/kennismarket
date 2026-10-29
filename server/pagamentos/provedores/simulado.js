// Provedor SIMULADO: finge ser um banco, sem dinheiro de verdade.
// Serve para testar o fluxo inteiro do site antes de ter as credenciais da Transfeera.
// As cobranças ficam na memória do servidor: se ele reiniciar (ou dormir, no Render), elas somem.
import crypto from 'node:crypto';
import { ErroPagamento } from '../erros.js';

const CABECALHO_ASSINATURA = 'x-simulado-assinatura';

export function criarProvedorSimulado({ segredo }) {
  const cobrancas = new Map();
  const falhas = {}; // para os testes: falhas.devolverPagamento = new ErroPagamento(...)
  let n = 0;
  const novoId = (prefixo) => `${prefixo}_sim_${Date.now().toString(36)}${(++n).toString(36)}`;
  const assinar = (corpo) => crypto.createHmac('sha256', segredo).update(corpo).digest('hex');

  function falharSePedido(funcao) {
    const f = falhas[funcao];
    if (f) { delete falhas[funcao]; throw f; }
  }
  function buscar(cobrancaId) {
    const c = cobrancas.get(cobrancaId);
    if (!c) throw new ErroPagamento('recusado', 'cobrança não encontrada no simulador (o servidor pode ter reiniciado)');
    return c;
  }

  return {
    nome: 'simulado',

    async criarCobranca(d) {
      falharSePedido('criarCobranca');
      const cobrancaId = novoId('cob');
      cobrancas.set(cobrancaId, { ...d, pagamento: 'aguardando', repasse: 'aguardando', devolvidoCentavos: 0 });
      const r = { cobrancaId };
      if (d.forma === 'pix') r.pix = { copiaECola: `PIX-SIMULADO-${cobrancaId}-${d.valorCentavos}`, imagem: null, validoAte: d.vencimento };
      if (d.forma === 'boleto') r.boleto = { linhaDigitavel: `00000.00000 00000.000000 00000.000000 0 ${String(d.valorCentavos).padStart(14, '0')}` };
      if (d.forma === 'cartao') r.linkPagamento = `https://simulado.invalid/cartao/${cobrancaId}`;
      return r;
    },

    // Confere a assinatura do aviso: só aceita o que foi assinado com o segredo deste servidor.
    async confirmarPagamento({ corpoBruto, cabecalhos }) {
      const recebida = String(cabecalhos[CABECALHO_ASSINATURA] || '');
      const esperada = assinar(corpoBruto);
      const ok = recebida.length === esperada.length && crypto.timingSafeEqual(Buffer.from(recebida), Buffer.from(esperada));
      if (!ok) return { autentico: false };
      const ev = JSON.parse(corpoBruto.toString('utf8'));
      return { autentico: true, eventos: [ev] };
    },

    async cadastrarRecebedor(r) {
      falharSePedido('cadastrarRecebedor');
      const id = crypto.createHash('sha256').update(`${r.documento}|${r.pix?.chave || ''}|${r.banco?.conta || ''}`).digest('hex').slice(0, 12);
      return { recebedorId: `rec_sim_${id}`, situacao: 'pronto' };
    },

    async consultarStatus({ cobrancaId }) {
      const c = buscar(cobrancaId);
      return { pagamento: c.pagamento, repasse: c.repasse };
    },

    async devolverPagamento({ cobrancaId, valorCentavos }) {
      falharSePedido('devolverPagamento');
      const c = buscar(cobrancaId);
      if (c.pagamento !== 'pago') throw new ErroPagamento('recusado', `não dá para devolver: pagamento está "${c.pagamento}"`);
      if (c.devolvidoCentavos + valorCentavos > c.valorCentavos) throw new ErroPagamento('recusado', 'devolução maior que o valor pago');
      c.devolvidoCentavos += valorCentavos;
      if (c.devolvidoCentavos === c.valorCentavos) c.pagamento = 'devolvido';
      return { devolucaoId: novoId('dev') };
    },

    // Só existe no simulado: monta um aviso assinado, como o banco mandaria.
    // tipo "pago" já vem com o split feito (repasse "repassado"), como no split instantâneo.
    simulador: {
      falhas,
      gerarAviso(cobrancaId, tipo = 'pago') {
        const c = buscar(cobrancaId);
        if (tipo === 'pago') { c.pagamento = 'pago'; c.repasse = 'repassado'; }
        if (tipo === 'cancelado') c.pagamento = 'cancelado';
        const ev = { eventoId: novoId('evt'), tipo, cobrancaId, ...(tipo === 'pago' ? { repasse: 'repassado' } : {}) };
        const corpoBruto = Buffer.from(JSON.stringify(ev));
        return { corpoBruto, cabecalhos: { [CABECALHO_ASSINATURA]: assinar(corpoBruto), 'content-type': 'application/json' } };
      },
    },
  };
}
