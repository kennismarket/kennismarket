import { config, avisos } from './config.js';
import { criarApp } from './app.js';

const app = criarApp();
const { pagamentos } = app.locals;
avisos.push(...pagamentos.avisos());

app.listen(config.porta, () => {
  avisos.forEach((a) => console.warn('ATENÇÃO:', a));
  console.log(`Kennismarket rodando em http://localhost:${config.porta} (pagamentos: ${pagamentos.provedor})`);
});
