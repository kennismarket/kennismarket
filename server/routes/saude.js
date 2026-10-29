import { Router } from 'express';
import { config, avisos } from '../config.js';
import { testarSupabase } from '../lib/supabase.js';

// Página de checagem: mostra o que está configurado e testa a conexão com o Supabase.
// Nunca mostra as chaves, só se estão preenchidas.
export function rotasSaude({ pagamentos }) {
  const r = Router();
  r.get('/', async (_req, res) => {
    const { url, publishableKey, secretKey } = config.supabase;
    res.json({
      ok: true,
      supabase: {
        url: url || 'NÃO PREENCHIDA',
        chavePublica: publishableKey ? 'preenchida' : 'NÃO PREENCHIDA',
        chaveSecreta: secretKey ? 'preenchida' : 'NÃO PREENCHIDA',
        conexao: await testarSupabase(),
      },
      pagamentos: pagamentos.situacao(),
      avisos,
    });
  });
  return r;
}
