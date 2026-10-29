import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentoValido } from '../server/lib/documentos.js';

test('CPF e CNPJ válidos, com ou sem pontuação', () => {
  assert.equal(documentoValido('529.982.247-25'), '52998224725');
  assert.equal(documentoValido('11144477735'), '11144477735');
  assert.equal(documentoValido('11.222.333/0001-81'), '11222333000181');
});

test('recusa dígito verificador errado, repetidos e tamanhos estranhos', () => {
  for (const d of ['529.982.247-26', '111.111.111-11', '11.222.333/0001-82', '00000000000000', '123', '', null, 'abc']) {
    assert.equal(documentoValido(d), null, String(d));
  }
});
