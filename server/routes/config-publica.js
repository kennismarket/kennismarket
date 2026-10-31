import { Router } from 'express';
import { config } from '../config.js';

// Só o que o navegador pode ver. A chave "publishable" do Supabase é pública por natureza;
// a segurança vem das regras de acesso (RLS) no banco. A chave secreta NUNCA sai daqui.
// entregasSoPagas: a mesma trava que o servidor usa (os testes podem ligar sem a variável).
export function rotaConfigPublica({ entregasSoPagas = config.entregasSoPagas } = {}) {
  const r = Router();
  r.get('/', (_req, res) => {
    res.json({
      supabaseUrl: config.supabase.url,
      supabasePublishableKey: config.supabase.publishableKey,
      suporteEmail: config.suporteEmail,
      entregasSoPagas,
    });
  });
  return r;
}
