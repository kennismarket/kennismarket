import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debitoDoVendedor, dividirVenda, knParaCentavos, PORCENTAGEM_PLATAFORMA } from '../server/lib/dinheiro.js';

test('toda venda é dividida 50/50 sobre o valor cheio', () => {
  assert.equal(PORCENTAGEM_PLATAFORMA, 50);
  assert.deepEqual(dividirVenda(10000), { vendedor: 5000, plataforma: 5000 });
});

test('centavo quebrado fica com o vendedor e a soma bate', () => {
  for (const total of [1, 7, 333, 9999, 12345]) {
    const d = dividirVenda(total);
    assert.equal(d.vendedor + d.plataforma, total);
    assert.ok(d.vendedor - d.plataforma <= 1 && d.vendedor >= d.plataforma);
  }
  assert.deepEqual(dividirVenda(333), { vendedor: 167, plataforma: 166 });
});

test('KN (= euro) vira centavos de real pela cotação', () => {
  assert.equal(knParaCentavos(100, 6.1234), 61234);
  assert.equal(knParaCentavos(1, '5.66335'), 566);
  assert.equal(knParaCentavos(3, 5.665), 1700); // 16,995 arredonda para 17,00
});

test('débito do vendedor num reembolso: a parte dele, proporcional ao devolvido', () => {
  const p = { valor_centavos: 333, vendedor_centavos: 167 };
  assert.equal(debitoDoVendedor(p, 333), 167); // total: a parte inteira
  assert.equal(debitoDoVendedor(p, 100), 50);
  assert.equal(debitoDoVendedor({ valor_centavos: 61234, vendedor_centavos: 30617 }, 1000), 500);
});

test('recusa valores inválidos', () => {
  assert.throws(() => dividirVenda(0));
  assert.throws(() => dividirVenda(10.5));
  assert.throws(() => knParaCentavos(-1, 6));
  assert.throws(() => knParaCentavos(1.5, 6));
  assert.throws(() => knParaCentavos(10, 0));
});

test('divisão com a porcentagem da loja (10% a 90% para o vendedor)', () => {
  assert.deepEqual(dividirVenda(10000, 70), { vendedor: 7000, plataforma: 3000 });
  assert.deepEqual(dividirVenda(10000, 10), { vendedor: 1000, plataforma: 9000 });
  assert.deepEqual(dividirVenda(333, 70), { vendedor: 234, plataforma: 99 }); // centavo quebrado fica com o vendedor
  assert.throws(() => dividirVenda(10000, 95));
  assert.throws(() => dividirVenda(10000, 5));
  assert.throws(() => dividirVenda(10000, 50.5));
});
