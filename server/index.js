import { config, avisos } from './config.js';
import { criarApp } from './app.js';

const app = criarApp();
const { pagamentos } = app.locals;
avisos.push(...pagamentos.avisos());
if (app.locals.prototipoFaltando.length) {
  avisos.push(`O protótipo mudou e estes ajustes não foram aplicados: ${app.locals.prototipoFaltando.join(', ')}.`);
}

app.listen(config.porta, () => {
  avisos.forEach((a) => console.warn('ATENÇÃO:', a));
  console.log(`Kennismarket rodando em http://localhost:${config.porta} (pagamentos: ${pagamentos.provedor})`);
});
