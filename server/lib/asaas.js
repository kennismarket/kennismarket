// Cliente mínimo da API v3 do Asaas. Documentação: https://docs.asaas.com
// Os valores que o Asaas recebe e devolve são em REAIS (com casas decimais);
// a conversão de/para centavos fica em quem chama.
import { config } from '../config.js';

const URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
};

export class AsaasError extends Error {
  constructor(status, corpo) {
    const msg = corpo?.errors ? corpo.errors.map((e) => e.description).join('; ') : `HTTP ${status}`;
    super(`Asaas: ${msg}`);
    this.status = status;
    this.corpo = corpo;
  }
}

async function chamar(metodo, caminho, corpo) {
  if (!config.asaas.apiKey) throw new Error('ASAAS_API_KEY não configurada');
  // ASAAS_BASE_URL só existe para os testes apontarem para um Asaas simulado.
  const base = process.env.ASAAS_BASE_URL || URLS[config.asaas.ambiente];
  const resp = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'kennismarket', access_token: config.asaas.apiKey },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const texto = await resp.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { bruto: texto }; }
  if (!resp.ok) throw new AsaasError(resp.status, dados);
  return dados;
}

export const asaas = {
  buscarClientePorEmail: (email) => chamar('GET', `/customers?email=${encodeURIComponent(email)}`),
  criarCliente: (d) => chamar('POST', '/customers', d),
  // billingType: PIX | BOLETO | CREDIT_CARD | UNDEFINED (o cliente escolhe na página do Asaas)
  criarCobranca: (d) => chamar('POST', '/payments', d),
  qrCodePix: (id) => chamar('GET', `/payments/${id}/pixQrCode`),
  reembolsar: (id, d) => chamar('POST', `/payments/${id}/refund`, d || {}),
  // Transferência para o vendedor: por chave Pix ou para uma conta Asaas (walletId)
  transferir: (d) => chamar('POST', '/transfers', d),
};
