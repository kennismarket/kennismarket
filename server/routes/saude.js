import { Router } from 'express';
import { config } from '../config.js';

export const saude = Router();

// Página de checagem: mostra se o servidor está de pé e o que já está configurado.
saude.get('/', (_req, res) => {
  res.json({
    ok: true,
    supabaseConfigurado: Boolean(config.supabase.url && config.supabase.serviceRoleKey),
    asaasConfigurado: Boolean(config.asaas.apiKey),
    asaasAmbiente: config.asaas.ambiente,
  });
});
