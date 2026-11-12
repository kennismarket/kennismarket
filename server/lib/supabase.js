import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { conexoes } from './conexoes.js';

// Todo cliente do Supabase do servidor usa o mesmo conjunto de conexões HTTP (lib/conexoes.js):
// reaproveitadas, limitadas e com as paradas fechadas. Sem sessão guardada nem renovação sozinha.
export const opcoesCliente = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: conexoes.fetch },
};

// Cliente com a chave secreta: poderes de administrador, só pode ser usado no servidor. Um só.
export const supabaseAdmin =
  config.supabase.url && config.supabase.secretKey
    ? createClient(config.supabase.url, config.supabase.secretKey, opcoesCliente)
    : null;

// Cliente com a chave pública, para conferir senha (login). É criado a cada login porque guarda a
// sessão de quem entrou; as conexões HTTP continuam sendo as do conjunto único.
export const clienteDeLogin = () => createClient(config.supabase.url, config.supabase.publishableKey, opcoesCliente);

// Testa se a URL e a chave secreta funcionam, sem depender de nenhuma tabela.
export async function testarSupabase() {
  if (!supabaseAdmin) return { ok: false, motivo: 'URL ou chave secreta não preenchida' };
  try {
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    return error ? { ok: false, motivo: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}
