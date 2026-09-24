import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNCTIONALITY_ITEMS } from '../src/config/functionalityItems.js';

test('Piano Smart non duplica la voce Funzionalità', () => {
  const item = FUNCTIONALITY_ITEMS.find((candidate) => candidate.id === 'piano-smart');
  assert.equal(item, undefined);
});
