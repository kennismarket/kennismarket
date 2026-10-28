// Cliente mínimo da API v3 do Asaas.
// Documentação: https://docs.asaas.com
const BASES = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
};

function baseUrl() {
  return process.env.ASAAS_BASE_URL || BASES[process.env.ASAAS_ENV || 'sandbox'];
}

class AsaasError extends Error {
  constructor(status, body) {
    const msg = body && body.errors ? body.errors.map((e) => e.description).join('; ') : `HTTP ${status}`;
    super(`Asaas: ${msg}`);
    this.status = status;
    this.body = body;
  }
}

async function call(method, path, body, apiKey) {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'kennismarket-api',
      access_token: apiKey || process.env.ASAAS_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new AsaasError(res.status, data);
  return data;
}

module.exports = {
  AsaasError,
  // Subconta do vendedor (fica vinculada à conta do Kennismarket; devolve walletId e apiKey)
  createSubaccount: (d) => call('POST', '/accounts', d),
  // Cliente (comprador)
  findCustomerByEmail: (email) => call('GET', `/customers?email=${encodeURIComponent(email)}`),
  createCustomer: (d) => call('POST', '/customers', d),
  // Cobrança: billingType PIX | BOLETO | CREDIT_CARD | UNDEFINED (o cliente escolhe na fatura)
  createPayment: (d) => call('POST', '/payments', d),
  getPayment: (id) => call('GET', `/payments/${id}`),
  getPixQrCode: (id) => call('GET', `/payments/${id}/pixQrCode`),
  refundPayment: (id, d) => call('POST', `/payments/${id}/refund`, d || {}),
  // Transferência da conta principal para a conta Asaas do vendedor (walletId)
  transferToWallet: (d) => call('POST', '/transfers', d),
};
