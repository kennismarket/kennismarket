// Lê as configurações das variáveis de ambiente. Nada de chave escrita no código.
try { process.loadEnvFile(); } catch { /* sem .env local: usa as variáveis do servidor */ }

const env = process.env;
const limpo = (v) => (v || '').trim();

// Diz se uma chave do Supabase é secreta (formato novo "sb_secret_" ou o antigo "service_role").
export function chaveEhSecreta(chave) {
  if (chave.startsWith('sb_secret_')) return true;
  const partes = chave.split('.');
  if (partes.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString()).role === 'service_role';
  } catch {
    return false;
  }
}

const supabase = {
  url: limpo(env.SUPABASE_URL).replace(/\/+$/, ''),
  // Aceita também os nomes antigos (ANON / SERVICE_ROLE), caso o projeto use as chaves antigas.
  publishableKey: limpo(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY),
  secretKey: limpo(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY),
};

// Proteção: a chave pública vai para o navegador. Se alguém colar a secreta nesse campo,
// ela é descartada para nunca vazar.
export const avisos = [];
if (supabase.publishableKey && chaveEhSecreta(supabase.publishableKey)) {
  supabase.publishableKey = '';
  avisos.push('SUPABASE_PUBLISHABLE_KEY recebeu uma chave SECRETA. Ela foi ignorada. Coloque ali a chave "publishable".');
}
if (supabase.secretKey && !chaveEhSecreta(supabase.secretKey)) {
  avisos.push('SUPABASE_SECRET_KEY não parece ser uma chave secreta. Confira se não trocou as chaves.');
}
if (supabase.url && !/^https:\/\/.+/.test(supabase.url)) {
  avisos.push('SUPABASE_URL deve começar com https:// (ex.: https://abcdefgh.supabase.co).');
}

export const config = {
  porta: Number(env.PORT) || 3000,
  supabase,
  asaas: {
    ambiente: env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox',
    apiKey: limpo(env.ASAAS_API_KEY),
    webhookToken: limpo(env.ASAAS_WEBHOOK_TOKEN),
  },
  // Senha que a tarefa agendada do GitHub manda para disparar cotações e repasses.
  tarefasToken: limpo(env.TAREFAS_TOKEN),
  suporteEmail: 'kennismarket.support@protonmail.com',
};
