// MÓDULO DE PAGAMENTO — a única parte do site que fala com o banco.
// O resto do site (pedidos, reembolsos, suporte, cadastro do vendedor) só usa as funções daqui,
// no formato do contrato (./contrato.js). Para trocar de banco: PAYMENT_PROVIDER, sem mexer no resto.
import { lerConfigPagamentos } from './config.js';
import {
  FORMAS, validarCobranca, validarRecebedor,
  conferirCobranca, conferirAviso, conferirRecebedor, conferirStatus, conferirDevolucao,
} from './contrato.js';
import { invalido } from './erros.js';
import { criarProvedorSimulado } from './provedores/simulado.js';
import { criarProvedorTransfeera } from './provedores/transfeera.js';

export { ErroPagamento } from './erros.js';
export { FORMAS, TIPOS_CHAVE_PIX, TIPOS_CONTA } from './contrato.js';

const PROVEDORES = {
  simulado: (cfg) => criarProvedorSimulado(cfg.simulado),
  transfeera: (cfg) => criarProvedorTransfeera(cfg.transfeera),
};

export function criarPagamentos(cfg = lerConfigPagamentos()) {
  const fabrica = PROVEDORES[cfg.provedor];
  if (!fabrica) throw new Error(`PAYMENT_PROVIDER desconhecido: "${cfg.provedor}". Use: ${Object.keys(PROVEDORES).join(', ')}`);
  const p = fabrica(cfg);
  const formas = FORMAS.filter((f) => f !== 'cartao' || cfg.cartaoAtivo);

  return {
    provedor: p.nome,
    formas,
    // Para a página de saúde: nunca mostra credenciais, só o que está preenchido.
    situacao() {
      return {
        provedor: p.nome,
        formas,
        ...(p.nome === 'transfeera' ? { ambiente: p.ambiente, credenciais: p.credenciaisPreenchidas ? 'preenchidas' : 'NÃO PREENCHIDAS', implementado: false } : {}),
      };
    },

    // Avisos para o log quando o servidor liga.
    avisos() {
      if (p.nome === 'simulado') return ['Pagamentos SIMULADOS (PAYMENT_PROVIDER=simulado): nenhum dinheiro de verdade. Página de teste em /teste/pagamentos.'];
      if (p.nome === 'transfeera') return [`Transfeera (${p.ambiente}): provedor ainda não implementado, aguardando a documentação da API.`];
      return [];
    },

    async criarCobranca(dados) {
      validarCobranca(dados, formas);
      return conferirCobranca(await p.criarCobranca(dados));
    },
    async confirmarPagamento({ corpoBruto, cabecalhos }) {
      if (!Buffer.isBuffer(corpoBruto)) throw invalido('aviso sem corpo');
      return conferirAviso(await p.confirmarPagamento({ corpoBruto, cabecalhos }));
    },
    async cadastrarRecebedor(recebedor) {
      validarRecebedor(recebedor);
      return conferirRecebedor(await p.cadastrarRecebedor(recebedor));
    },
    async consultarStatus({ cobrancaId }) {
      if (!cobrancaId) throw invalido('cobrancaId obrigatório');
      return conferirStatus(await p.consultarStatus({ cobrancaId }));
    },
    async devolverPagamento({ cobrancaId, valorCentavos, motivo }) {
      if (!cobrancaId) throw invalido('cobrancaId obrigatório');
      if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) throw invalido('valor da devolução inválido');
      return conferirDevolucao(await p.devolverPagamento({ cobrancaId, valorCentavos, motivo: String(motivo || '').slice(0, 140) }));
    },

    // Só existe com o provedor simulado (página de teste e testes automáticos).
    simulador: p.simulador || null,
  };
}
