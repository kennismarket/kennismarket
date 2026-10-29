import { Router } from 'express';
import { config, avisos } from '../config.js';
import { testarSupabase } from '../lib/supabase.js';

export const saude = Router();

// Página de checagem: mostra o que está configurado e testa a conexão com o Supabase.
// Nunca mostra as chaves, só se estão preenchidas.
saude.get('/', async (_req, res) => {
  const { url, publishableKey, secretKey } = config.supabase;
  res.json({
    ok: true,
    supabase: {
      url: url || 'NÃO PREENCHIDA',
      chavePublica: publishableKey ? 'preenchida' : 'NÃO PREENCHIDA',
      chaveSecreta: secretKey ? 'preenchida' : 'NÃO PREENCHIDA',
      conexao: await testarSupabase(),
    },
    asaas: { configurado: Boolean(config.asaas.apiKey), ambiente: config.asaas.ambiente },
    avisos,
  });
});
