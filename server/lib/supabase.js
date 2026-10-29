import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// Cliente com a chave secreta: poderes de administrador, só pode ser usado no servidor.
export const supabaseAdmin =
  config.supabase.url && config.supabase.secretKey
    ? createClient(config.supabase.url, config.supabase.secretKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

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
