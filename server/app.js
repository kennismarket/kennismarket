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
import { rotasContas } from './routes/contas.js';
import { rotaWebhookPagamento } from './routes/webhook-pagamento.js';
import { rotasTarefas } from './routes/tarefas.js';
import { rotasTeste } from './routes/teste.js';
import { rotasPrototipo } from './routes/prototipo.js';
import { montarPaginaPrototipo } from './lib/pagina-prototipo.js';

const pastaPublica = fileURLToPath(new URL('../public', import.meta.url));

// Monta o site. Os testes passam um banco de dados em memória.
export function criarApp({ repo = repoPadrao, pagamentos = criarPagamentos(), paginaPrototipo = montarPaginaPrototipo() } = {}) {
  const app = express();
  const deps = { repo, pagamentos };
  const teste = rotasTeste(deps);
  const prototipo = rotasPrototipo(deps);
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // o Render fica na frente: o IP do visitante vem no cabeçalho
  app.locals.pagamentos = pagamentos;
  app.locals.prototipoFaltando = paginaPrototipo.faltando;

  // O aviso do banco precisa chegar exatamente como foi enviado, para conferir a assinatura.
  app.use('/api/webhooks/pagamento', express.raw({ type: () => true, limit: '1mb' }), rotaWebhookPagamento(deps));
  // Arquivos do protótipo chegam como estão (até 20 MB), sem passar pelo leitor de JSON.
  app.use('/api/prototipo/arquivos', express.raw({ type: () => true, limit: 20 * 1024 * 1024 + 1 }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/vivo', (_req, res) => res.json({ ok: true })); // usado pelo Render para saber se está de pé
  app.use('/api/saude', rotasSaude(deps));
  app.use('/api/config', configPublica);
  app.use('/api/cotacoes', rotasCotacoes(deps));
  app.use('/api/rates', rotaRatesPrototipo(deps)); // formato que o protótipo espera (RATES_URL)
  app.use('/api/pedidos', rotasPedidos(deps));
  app.use('/api/loja', rotasLoja(deps));
  app.use('/api/contas', rotasContas({ ...deps, mudouPrototipo: prototipo.mudou }));
  app.use('/api/admin', rotasAdmin(deps));
  app.use('/api/tarefas', rotasTarefas(deps));
  app.use('/api/teste', teste.api);
  app.use('/api/prototipo', prototipo.api);
  app.use('/api', (_req, res) => res.status(404).json({ erro: 'rota não encontrada' }));
  app.use('/teste', teste.telas);
  app.use('/_blob', prototipo.blob);

  // A página do site é o protótipo (a navegação dele é feita no navegador, pelo # do endereço).
  const enviarPagina = (_req, res) => res.set('Cache-Control', 'no-cache').type('html').send(paginaPrototipo.html);
  app.get(['/', '/index.html'], enviarPagina);
  app.use(express.static(pastaPublica));
  app.get('*', enviarPagina);
  app.use(tratarErros);
  return app;
}
