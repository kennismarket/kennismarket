import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dividirVenda, knParaCentavos } from '../server/lib/dinheiro.js';

test('vendedor por inscrição paga 15%', () => {
  assert.deepEqual(dividirVenda(10000, 'inscricao'), { vendedor: 8500, plataforma: 1500, taxa: 15 });
});

test('vendedor por convite divide 50/50', () => {
  assert.deepEqual(dividirVenda(10000, 'convite'), { vendedor: 5000, plataforma: 5000, taxa: 50 });
});

test('centavo quebrado fica com o vendedor e a soma bate', () => {
  for (const total of [1, 7, 333, 9999, 12345]) {
    for (const origem of ['inscricao', 'convite']) {
      const d = dividirVenda(total, origem);
      assert.equal(d.vendedor + d.plataforma, total);
    }
  }
  assert.deepEqual(dividirVenda(333, 'convite'), { vendedor: 167, plataforma: 166, taxa: 50 });
});

test('recusa valores inválidos', () => {
  assert.throws(() => dividirVenda(0, 'inscricao'));
  assert.throws(() => dividirVenda(10.5, 'inscricao'));
  assert.throws(() => dividirVenda(100, 'outro'));
  assert.throws(() => knParaCentavos(-1));
});
