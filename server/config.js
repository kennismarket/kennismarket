// Lê as configurações das variáveis de ambiente. Nada de chave escrita no código.
try { process.loadEnvFile(); } catch { /* sem .env local: usa as variáveis do servidor */ }

const env = process.env;

export const config = {
  porta: Number(env.PORT) || 3000,
  supabase: {
    url: env.SUPABASE_URL || '',
    anonKey: env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  asaas: {
    ambiente: env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox',
    apiKey: env.ASAAS_API_KEY || '',
    webhookToken: env.ASAAS_WEBHOOK_TOKEN || '',
  },
  suporteEmail: 'kennismarket.support@protonmail.com',
};
