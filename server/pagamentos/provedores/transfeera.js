// Provedor TRANSFEERA — ESQUELETO.
//
// ⚠️ PENDENTE DA DOCUMENTAÇÃO DA API DA TRANSFEERA.
// Nada aqui foi inventado: não há endereços, nomes de campos nem formatos da API.
// Cada função só explica o que precisa fazer e devolve o erro "pendente" (HTTP 501).
// Quando a documentação e as credenciais chegarem, implementar cada função traduzindo
// o formato do contrato (../contrato.js) para a API da Transfeera e de volta.
import { ErroPagamento } from '../erros.js';

const pendente = (funcao, oQueFalta) =>
  new ErroPagamento('pendente', `Transfeera: "${funcao}" ainda não implementada. Falta a documentação: ${oQueFalta}`);

export function criarProvedorTransfeera(cfg) {
  return {
    nome: 'transfeera',
    // sandbox | producao (TRANSFEERA_AMBIENTE). A URL de cada ambiente vem da documentação.
    ambiente: cfg.ambiente,
    credenciaisPreenchidas: Boolean(cfg.clientId && cfg.clientSecret),

    async criarCobranca() {
      // DOC: como criar cobrança Pix e boleto com split no próprio QR Code/boleto;
      // como informar o recebedor (CPF/CNPJ + chave Pix ou dados bancários);
      // se a taxa da Transfeera pode sair só da parte do Kennismarket;
      // o que volta (código da cobrança, Pix copia e cola, imagem do QR, linha digitável).
      // Cartão: só se for confirmado (PAYMENT_CARD_ENABLED).
      throw pendente('criarCobranca', 'endpoint de cobrança com split, campos do recebedor e resposta');
    },

    async confirmarPagamento() {
      // DOC: como a Transfeera assina os avisos (cabeçalho, algoritmo, segredo = TRANSFEERA_WEBHOOK_SECRET),
      // o formato do aviso, o id único de cada evento e os tipos de evento (pago, devolvido, split concluído/falhou).
      throw pendente('confirmarPagamento', 'formato e assinatura dos webhooks');
    },

    async cadastrarRecebedor() {
      // DOC: se é preciso cadastrar o recebedor antes da cobrança (e qual código volta),
      // ou se os dados vão direto na cobrança. Quais dados são obrigatórios.
      throw pendente('cadastrarRecebedor', 'cadastro/validação de recebedor');
    },

    async consultarStatus() {
      // DOC: como consultar a situação de uma cobrança e do split dela.
      throw pendente('consultarStatus', 'consulta de cobrança e split');
    },

    async devolverPagamento() {
      // DOC: como devolver um Pix/boleto (total e parcial) saindo da conta do Kennismarket,
      // sem desfazer a parte já repassada ao vendedor.
      throw pendente('devolverPagamento', 'devolução total e parcial');
    },
  };
}
