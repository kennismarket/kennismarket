// Regras de arquitetura conferidas automaticamente:
// 1. Só o módulo de pagamento (server/pagamentos/) fala com o banco de pagamento.
// 2. Não sobrou nenhuma referência ao processador antigo (exceto no histórico das migrações).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const arquivos = (pasta) => readdirSync(pasta).flatMap((n) => {
  const c = join(pasta, n);
  return statSync(c).isDirectory() ? arquivos(c) : [c];
});
const servidor = arquivos(join(raiz, 'server')).filter((f) => f.endsWith('.js')).map((f) => relative(raiz, f));
const fora = servidor.filter((f) => !f.startsWith('server/pagamentos/'));
const ler = (f) => readFileSync(join(raiz, f), 'utf8');

test('fora do módulo, ninguém importa as peças internas dele (provedores, contrato, config)', () => {
  for (const f of fora) {
    // pega "from '…'", "import '…'" e "import('…')"
    for (const [, caminho] of ler(f).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      if (caminho.includes('pagamentos/')) assert.match(caminho, /pagamentos\/index\.js$/, `${f} importa ${caminho}`);
    }
  }
});

test('fora do módulo, nenhum arquivo cita o banco (Transfeera) nem faz chamadas de rede, exceto as cotações', () => {
  for (const f of fora) {
    const t = ler(f);
    assert.doesNotMatch(t, /transfeera/i, `${f} cita a Transfeera`);
    if (f !== 'server/lib/cotacoes.js') assert.doesNotMatch(t, /\bfetch\(|node:https?['"]/, `${f} faz chamada de rede`);
  }
});

test('nenhuma referência ao processador antigo no projeto (só no histórico das migrações)', () => {
  const nome = ['as', 'aas'].join(''); // montado assim para este arquivo não se acusar
  const versionados = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: raiz, encoding: 'utf8' }).split('\n').filter(Boolean);
  const achados = versionados
    // As migrações e os dados no formato antigo (usados para testar a conversão) são histórico.
    .filter((f) => !f.startsWith('supabase/migrations/') && f !== 'tests/sql/dados-antigos.sql')
    .filter((f) => !/\.(png|jpe?g|ico|woff2?)$/.test(f))
    .filter((f) => { try { return new RegExp(nome, 'i').test(readFileSync(join(raiz, f), 'utf8')); } catch { return false; } });
  assert.deepEqual(achados, []);
});
