import { config, avisos } from './config.js';
import { criarApp } from './app.js';
import { espelharTodas } from './lib/espelho-lojas.js';
import { repo } from './lib/repo.js';
import { conexoes } from './lib/conexoes.js';
import { aplicarLogosOficiais } from './lib/logos-lojas.js';
import { separarProdutosDasLojas } from './lib/ids-produtos.js';

const app = criarApp();
const { pagamentos } = app.locals;
avisos.push(...pagamentos.avisos());
if (app.locals.prototipoFaltando.length) {
  avisos.push(`O protótipo mudou e estes ajustes não foram aplicados: ${app.locals.prototipoFaltando.join(', ')}.`);
}

const servidor = app.listen(config.porta, () => {
  avisos.forEach((a) => console.warn('ATENÇÃO:', a));
  console.log(`Kennismarket rodando em http://localhost:${config.porta} (pagamentos: ${pagamentos.provedor})`);
  // Tarefas ao ligar, uma depois da outra (as duas primeiras regravam lojas: juntas, uma apagaria a outra).
  // 1. Produtos de lojas de vendedores com id próprio (correção de segurança).
  // 2. Logos oficiais das lojas que já existiam (cada uma é aplicada uma vez só).
  // 3. Copia as lojas do protótipo para as tabelas reais (pega o que mudou enquanto o servidor estava fora).
  const mudou = app.locals.mudouPrototipo;
  (async () => {
    try {
      const r = await separarProdutosDasLojas(repo, { mudou });
      if (r.produtos) console.log(`Produtos com id próprio: ${r.produtos} (lojas ${r.lojas.join(', ')}; arquivos movidos: ${r.arquivos})`);
    } catch (e) { console.error('ids próprios dos produtos falharam:', e.message); }
    try {
      const r = await aplicarLogosOficiais(repo, { mudou });
      if (r.aplicadas.length) console.log(`Logos oficiais aplicadas: ${r.aplicadas.join(', ')}`);
      if (r.semLoja.length) console.warn(`Logos oficiais sem loja (ainda não aplicadas): ${r.semLoja.join(', ')}`);
    } catch (e) { console.error('logos oficiais falharam:', e.message); }
    try {
      const r = await espelharTodas(repo);
      console.log(`Lojas copiadas para as tabelas: ${r.copiadas}`);
      r.erros.forEach((e) => console.error('cópia de loja:', e));
    } catch (e) { console.error('cópia das lojas falhou:', e.message); }
  })();
});

// Desligar com calma (o Render manda SIGTERM a cada publicação): para de aceitar visitas, termina as
// que estão em andamento e fecha as conexões com o Supabase. Se demorar mais de 10 s, sai assim mesmo.
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.once(sinal, () => {
    console.log(`${sinal}: desligando`);
    setTimeout(() => process.exit(0), 10_000).unref();
    servidor.close(() => conexoes.fechar().finally(() => process.exit(0)));
  });
}
