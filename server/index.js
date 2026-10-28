import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { saude } from './routes/saude.js';
import { configPublica } from './routes/config-publica.js';

const app = express();
const pastaPublica = fileURLToPath(new URL('../public', import.meta.url));

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use('/api/saude', saude);
app.use('/api/config', configPublica);
// Próximas etapas: /api/lojas, /api/pedidos, /api/checkout, /api/chat,
// /api/reembolsos, /api/convites e /api/webhooks/asaas.

app.use(express.static(pastaPublica));
// Qualquer outro endereço abre o site (a navegação é feita no navegador).
app.get('*', (_req, res) => res.sendFile('index.html', { root: pastaPublica }));

app.listen(config.porta, () => {
  console.log(`Kennismarket rodando em http://localhost:${config.porta} (Asaas: ${config.asaas.ambiente})`);
});
