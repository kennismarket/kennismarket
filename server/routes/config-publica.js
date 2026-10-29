import { Router } from 'express';
import { config } from '../config.js';

export const configPublica = Router();

// Só o que o navegador pode ver. A chave "publishable" do Supabase é pública por natureza;
// a segurança vem das regras de acesso (RLS) no banco. A chave secreta NUNCA sai daqui.
configPublica.get('/', (_req, res) => {
  res.json({
    supabaseUrl: config.supabase.url,
    supabasePublishableKey: config.supabase.publishableKey,
    suporteEmail: config.suporteEmail,
  });
});
