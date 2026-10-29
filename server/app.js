import express from 'express';
import { fileURLToPath } from 'node:url';
import { asaas as asaasPadrao } from './lib/asaas.js';
import { repo as repoPadrao } from './lib/repo.js';
import { tratarErros } from './lib/seguranca.js';
import { saude } from './routes/saude.js';
import { configPublica } from './routes/config-publica.js';
import { rotasCotacoes } from './routes/cotacoes.js';
import { rotasPedidos } from './routes/pedidos.js';
import { rotasAdmin } from './routes/admin.js';
import { rotaWebhookAsaas } from './routes/webhook-asaas.js';
import { rotasTarefas } from './routes/tarefas.js';

const pastaPublica = fileURLToPath(new URL('../public', import.meta.url));

// Monta o site. Os testes passam um banco e um Asaas simulados.
export function criarApp({ repo = repoPadrao, asaas = asaasPadrao } = {}) {
  const app = express();
  const deps = { repo, asaas };
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/vivo', (_req, res) => res.json({ ok: true })); // usado pelo Render para saber se está de pé
  app.use('/api/saude', saude);
  app.use('/api/config', configPublica);
  app.use('/api/cotacoes', rotasCotacoes(deps));
  app.use('/api/pedidos', rotasPedidos(deps));
  app.use('/api/admin', rotasAdmin(deps));
  app.use('/api/webhooks/asaas', rotaWebhookAsaas(deps));
  app.use('/api/tarefas', rotasTarefas(deps));
  app.use('/api', (_req, res) => res.status(404).json({ erro: 'rota não encontrada' }));
  app.use(tratarErros);

  app.use(express.static(pastaPublica));
  // Qualquer outro endereço abre o site (a navegação é feita no navegador).
  app.get('*', (_req, res) => res.sendFile('index.html', { root: pastaPublica }));
  return app;
}
