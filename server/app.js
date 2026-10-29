import express from 'express';
import { fileURLToPath } from 'node:url';
import { repo as repoPadrao } from './lib/repo.js';
import { tratarErros } from './lib/seguranca.js';
import { criarPagamentos } from './pagamentos/index.js';
import { rotasSaude } from './routes/saude.js';
import { configPublica } from './routes/config-publica.js';
import { rotasCotacoes, rotaRatesPrototipo } from './routes/cotacoes.js';
import { rotasPedidos } from './routes/pedidos.js';
import { rotasLoja } from './routes/loja.js';
import { rotasAdmin } from './routes/admin.js';
import { rotaWebhookPagamento } from './routes/webhook-pagamento.js';
import { rotasTarefas } from './routes/tarefas.js';
import { rotasTeste } from './routes/teste.js';

const pastaPublica = fileURLToPath(new URL('../public', import.meta.url));

// Monta o site. Os testes passam um banco de dados em memória.
export function criarApp({ repo = repoPadrao, pagamentos = criarPagamentos() } = {}) {
  const app = express();
  const deps = { repo, pagamentos };
  const teste = rotasTeste(deps);
  app.disable('x-powered-by');
  app.locals.pagamentos = pagamentos;

  // O aviso do banco precisa chegar exatamente como foi enviado, para conferir a assinatura.
  app.use('/api/webhooks/pagamento', express.raw({ type: () => true, limit: '1mb' }), rotaWebhookPagamento(deps));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/vivo', (_req, res) => res.json({ ok: true })); // usado pelo Render para saber se está de pé
  app.use('/api/saude', rotasSaude(deps));
  app.use('/api/config', configPublica);
  app.use('/api/cotacoes', rotasCotacoes(deps));
  app.use('/api/rates', rotaRatesPrototipo(deps)); // formato que o protótipo espera (RATES_URL)
  app.use('/api/pedidos', rotasPedidos(deps));
  app.use('/api/loja', rotasLoja(deps));
  app.use('/api/admin', rotasAdmin(deps));
  app.use('/api/tarefas', rotasTarefas(deps));
  app.use('/api/teste', teste.api);
  app.use('/api', (_req, res) => res.status(404).json({ erro: 'rota não encontrada' }));
  app.use('/teste', teste.telas);

  app.use(express.static(pastaPublica));
  // Qualquer outro endereço abre o site (a navegação é feita no navegador).
  app.get('*', (_req, res) => res.sendFile('index.html', { root: pastaPublica }));
  app.use(tratarErros);
  return app;
}
