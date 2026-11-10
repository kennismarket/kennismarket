import { config, avisos } from './config.js';
import { criarApp } from './app.js';
import { espelharTodas } from './lib/espelho-lojas.js';
import { repo } from './lib/repo.js';
import { aplicarLogosOficiais } from './lib/logos-lojas.js';

const app = criarApp();
const { pagamentos } = app.locals;
avisos.push(...pagamentos.avisos());
if (app.locals.prototipoFaltando.length) {
  avisos.push(`O protótipo mudou e estes ajustes não foram aplicados: ${app.locals.prototipoFaltando.join(', ')}.`);
}

app.listen(config.porta, () => {
  avisos.forEach((a) => console.warn('ATENÇÃO:', a));
  console.log(`Kennismarket rodando em http://localhost:${config.porta} (pagamentos: ${pagamentos.provedor})`);
  // Copia as lojas do protótipo para as tabelas reais (pega o que mudou enquanto o servidor estava fora).
  espelharTodas(repo)
    .then((r) => { console.log(`Lojas copiadas para as tabelas: ${r.copiadas}`); r.erros.forEach((e) => console.error('cópia de loja:', e)); })
    .catch((e) => console.error('cópia das lojas falhou:', e.message));
  // Logos oficiais das lojas que já existiam (cada uma é aplicada uma vez só).
  aplicarLogosOficiais(repo, { mudou: app.locals.mudouPrototipo })
    .then((r) => {
      if (r.aplicadas.length) console.log(`Logos oficiais aplicadas: ${r.aplicadas.join(', ')}`);
      if (r.semLoja.length) console.warn(`Logos oficiais sem loja (ainda não aplicadas): ${r.semLoja.join(', ')}`);
    })
    .catch((e) => console.error('logos oficiais falharam:', e.message));
});
