import { Router } from 'express';
import { config, avisos } from '../config.js';
import { testarSupabase } from '../lib/supabase.js';
import { conexoes } from '../lib/conexoes.js';

const INICIO = new Date().toISOString(); // muda a cada reinício: mostra se a última mudança no Render já entrou

// Página de checagem: mostra o que está configurado e testa a conexão com o Supabase.
// Nunca mostra as chaves, só se estão preenchidas.
// Quantas conexões estão abertas, em uso e quantas chamadas esperam na fila (todas as origens).
function estatisticas() {
  const st = conexoes.agente.stats || {};
  const soma = (campo) => Object.values(st).reduce((t, o) => t + (o?.[campo] || 0), 0);
  return { abertas: soma('connected'), emUso: soma('running'), naFila: soma('pending') };
}

export function rotasSaude({ pagamentos, repo }) {
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
      // Qual versão do código está no ar. O Render preenche estas duas variáveis sozinho.
      versao: {
        branch: process.env.RENDER_GIT_BRANCH || 'desconhecida',
        commit: (process.env.RENDER_GIT_COMMIT || 'desconhecido').slice(0, 7),
      },
      // Senha da tarefa diária das cotações (.github/workflows/tarefas.yml).
      tarefas: { token: config.tarefasToken ? 'preenchido' : 'NÃO PREENCHIDO' },
      // conexões HTTP com o Supabase (lib/conexoes.js): limite, tempo para fechar as paradas e uso agora
      conexoesSupabase: { maximo: conexoes.limites.maxConexoes, fechaParadaEmMs: conexoes.limites.ociosaMs, ...estatisticas() },
      // memória curta na frente do banco (lib/cache-repo.js): logins guardados e listas guardadas
      memoria: repo?.memoria ? repo.memoria() : null,
      noArDesde: INICIO,
      pagamentos: pagamentos.situacao(),
      avisos,
    });
  });
  return r;
}
