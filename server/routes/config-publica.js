import { Router } from 'express';
import { config } from '../config.js';

export const configPublica = Router();

// Só o que o navegador pode ver. A chave "anon" do Supabase é pública por natureza;
// a segurança vem das regras de acesso (RLS) no banco.
configPublica.get('/', (_req, res) => {
  res.json({
    supabaseUrl: config.supabase.url,
    supabaseAnonKey: config.supabase.anonKey,
    suporteEmail: config.suporteEmail,
  });
});
