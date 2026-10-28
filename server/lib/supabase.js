import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// Cliente com poderes de administrador: só usar no servidor.
export const supabaseAdmin =
  config.supabase.url && config.supabase.serviceRoleKey
    ? createClient(config.supabase.url, config.supabase.serviceRoleKey, { auth: { persistSession: false } })
    : null;
