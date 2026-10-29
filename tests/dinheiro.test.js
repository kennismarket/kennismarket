import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dividirVenda, knParaCentavos, reaisParaCentavos } from '../server/lib/dinheiro.js';

test('toda venda é dividida 50/50', () => {
  assert.deepEqual(dividirVenda(10000), { vendedor: 5000, plataforma: 5000 });
});

test('centavo quebrado fica com o vendedor e a soma bate', () => {
  for (const total of [1, 7, 333, 9999, 12345]) {
    const d = dividirVenda(total);
    assert.equal(d.vendedor + d.plataforma, total);
    assert.ok(d.vendedor - d.plataforma <= 1);
  }
  assert.deepEqual(dividirVenda(333), { vendedor: 167, plataforma: 166 });
});

test('KN (= euro) vira centavos de real pela cotação', () => {
  assert.equal(knParaCentavos(100, 6.1234), 61234);
  assert.equal(knParaCentavos(1, '5.66335'), 566);
  assert.equal(knParaCentavos(3, 5.665), 1700); // 16,995 arredonda para 17,00
});

test('reais do Asaas viram centavos sem erro de vírgula', () => {
  assert.equal(reaisParaCentavos(611.35), 61135);
  assert.equal(reaisParaCentavos(0.29), 29);
});

test('recusa valores inválidos', () => {
  assert.throws(() => dividirVenda(0));
  assert.throws(() => dividirVenda(10.5));
  assert.throws(() => knParaCentavos(-1, 6));
  assert.throws(() => knParaCentavos(1.5, 6));
  assert.throws(() => knParaCentavos(10, 0));
});
