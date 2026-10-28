import { config } from '../config.js';

const URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
};

// Chamada genérica à API do Asaas. As funções de cobrança e split entram na etapa 3.
export async function asaas(caminho, { metodo = 'GET', corpo } = {}) {
  if (!config.asaas.apiKey) throw new Error('ASAAS_API_KEY não configurada');
  const resp = await fetch(URLS[config.asaas.ambiente] + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', access_token: config.asaas.apiKey },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Asaas ${resp.status}: ${JSON.stringify(dados.errors || dados)}`);
  return dados;
}
