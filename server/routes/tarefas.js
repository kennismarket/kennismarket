import { Router } from 'express';
import { config } from '../config.js';
import { atualizarCotacoes } from '../lib/cotacoes.js';
import { repassarPendentes } from '../lib/repasse.js';
import { erro, iguais, rota } from '../lib/seguranca.js';

// Tarefas disparadas de fora pelo agendador do GitHub (.github/workflows/tarefas.yml),
// porque servidores grátis dormem e não conseguem contar o tempo sozinhos.
export function rotasTarefas({ repo, asaas }) {
  const r = Router();
  r.use((req, _res, next) => next(iguais(req.get('x-tarefas-token'), config.tarefasToken) ? undefined : erro(401, 'token inválido')));

  // Uma vez por dia, depois que o Banco Central Europeu publica.
  // Se nenhuma fonte respondeu, responde com erro para a tarefa aparecer como falha no GitHub.
  r.post('/cotacoes', rota(async (_req, res) => {
    const r = await atualizarCotacoes(repo);
    res.status(Object.keys(r.taxas).length ? 200 : 502).json(r);
  }));

  // De hora em hora: repasses pendentes ou que falharam.
  r.post('/repasses', rota(async (_req, res) => res.json(await repassarPendentes(repo, { asaas }))));

  return r;
}
