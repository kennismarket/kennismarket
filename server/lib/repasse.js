// Repasse da parte do vendedor: assim que o dinheiro cai na conta do Kennismarket,
// a metade do vendedor vai por Pix para a chave dele (decisão dos donos: ele recebe
// antes da confirmação do cliente; golpe é resolvido direto com o cliente e o vendedor é banido).
import { asaas as asaasPadrao, AsaasError } from './asaas.js';
import { centavosParaReais, dividirVenda } from './dinheiro.js';

export const MAX_TENTATIVAS = 5;

export async function repassar(repo, pedidoId, { asaas = asaasPadrao } = {}) {
  const atual = await repo.pedido(pedidoId);
  if (!atual) throw Object.assign(new Error('pedido não encontrado'), { status: 404 });

  // Trava: só um processo consegue passar o repasse de "pendente/falhou" para "enviando".
  const [p] = await repo.atualizarPedidos(
    { id: pedidoId },
    { repasse_status: 'enviando', repasse_tentativas: atual.repasse_tentativas + 1, repasse_erro: null },
    { repasse_status: ['pendente', 'falhou'] },
  );
  if (!p) {
    throw Object.assign(new Error(`repasse está "${atual.repasse_status ?? 'sem pagamento'}"`), { status: 409 });
  }

  let transferencia = null;
  try {
    const loja = await repo.loja(p.loja_id);
    const destino = await repo.dadosRepasse(p.loja_id);
    if (!destino) throw new Error('loja sem chave Pix cadastrada');
    if (loja?.banida) throw new Error('loja banida: repasse bloqueado');

    const base = p.valor_liquido_centavos ?? p.valor_centavos;
    const { vendedor, plataforma } = dividirVenda(base);
    const corpo = destino.asaas_wallet_id
      ? { value: centavosParaReais(vendedor), walletId: destino.asaas_wallet_id, externalReference: p.id }
      : {
          value: centavosParaReais(vendedor),
          pixAddressKey: destino.pix_chave,
          pixAddressKeyType: destino.pix_tipo,
          description: `Kennismarket · pedido ${p.id}`.slice(0, 140),
          externalReference: p.id,
        };
    try {
      transferencia = await asaas.transferir(corpo);
    } catch (e) {
      // Só é seguro tentar de novo quando o Asaas RECUSOU (erro 4xx). Se a resposta se perdeu
      // (internet, demora, erro 5xx), a transferência pode ter sido feita: o pedido fica
      // "enviando" para o suporte conferir no painel do Asaas, e nunca é pago duas vezes.
      if (!(e instanceof AsaasError && e.status < 500)) e.ambiguo = true;
      throw e;
    }
    const [feito] = await repo.atualizarPedidos(
      { id: p.id },
      { repasse_status: 'enviado', repasse_id: transferencia.id, vendedor_centavos: vendedor, plataforma_centavos: plataforma },
      { repasse_status: ['enviando'] },
    );
    return feito;
  } catch (e) {
    if (transferencia || e.ambiguo) {
      await repo.atualizarPedidos({ id: p.id }, {
        repasse_id: transferencia?.id ?? null,
        repasse_erro: `CONFERIR NO ASAAS antes de tentar de novo: ${e.message}`.slice(0, 500),
      }, { repasse_status: ['enviando'] }).catch(() => {});
    } else {
      await repo.atualizarPedidos({ id: p.id }, { repasse_status: 'falhou', repasse_erro: e.message.slice(0, 500) },
        { repasse_status: ['enviando'] });
    }
    throw e;
  }
}

// Tarefa de hora em hora: tenta de novo os repasses pendentes ou que falharam.
export async function repassarPendentes(repo, opcoes) {
  const fila = await repo.pedidosParaRepassar(MAX_TENTATIVAS);
  const resultado = { enviados: [], falharam: [] };
  for (const { id } of fila) {
    try {
      await repassar(repo, id, opcoes);
      resultado.enviados.push(id);
    } catch (e) {
      resultado.falharam.push({ id, erro: e.message });
    }
  }
  return resultado;
}
