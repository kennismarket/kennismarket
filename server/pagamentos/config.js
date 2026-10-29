// Configurações de pagamento. Só o módulo de pagamento lê estas variáveis.
import crypto from 'node:crypto';

const env = process.env;
const limpo = (v) => (v || '').trim();

export function lerConfigPagamentos() {
  return {
    // Qual banco usar: "simulado" (testes, sem dinheiro) ou "transfeera".
    provedor: limpo(env.PAYMENT_PROVIDER).toLowerCase() || 'simulado',
    // Cartão de crédito ainda não confirmado: desligado até "true".
    cartaoAtivo: limpo(env.PAYMENT_CARD_ENABLED).toLowerCase() === 'true',
    transfeera: {
      // Qualquer valor diferente de "producao" usa o sandbox (sem dinheiro de verdade).
      ambiente: limpo(env.TRANSFEERA_AMBIENTE).toLowerCase() === 'producao' ? 'producao' : 'sandbox',
      // ⚠️ NOMES PROVISÓRIOS: confirmar com a documentação da Transfeera quais credenciais ela usa.
      clientId: limpo(env.TRANSFEERA_CLIENT_ID),
      clientSecret: limpo(env.TRANSFEERA_CLIENT_SECRET),
      webhookSecret: limpo(env.TRANSFEERA_WEBHOOK_SECRET),
    },
    simulado: {
      // Senha que assina os avisos de mentira. Se não for definida, cada vez que o servidor liga
      // é sorteada uma nova (ninguém de fora consegue forjar um aviso).
      segredo: limpo(env.PAYMENT_SIMULADO_SEGREDO) || crypto.randomBytes(32).toString('hex'),
    },
  };
}
