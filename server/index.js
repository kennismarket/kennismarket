import { config, avisos } from './config.js';
import { criarApp } from './app.js';

criarApp().listen(config.porta, () => {
  avisos.forEach((a) => console.warn('ATENÇÃO:', a));
  console.log(`Kennismarket rodando em http://localhost:${config.porta} (Asaas: ${config.asaas.ambiente})`);
});
