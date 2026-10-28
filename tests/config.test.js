import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveEhSecreta } from '../server/config.js';

const jwt = (role) => ['x', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'y'].join('.');

test('reconhece chaves secretas nos formatos novo e antigo', () => {
  assert.equal(chaveEhSecreta('sb_secret_abc123'), true);
  assert.equal(chaveEhSecreta(jwt('service_role')), true);
});

test('chaves públicas não são tratadas como secretas', () => {
  assert.equal(chaveEhSecreta('sb_publishable_abc123'), false);
  assert.equal(chaveEhSecreta(jwt('anon')), false);
  assert.equal(chaveEhSecreta(''), false);
});
