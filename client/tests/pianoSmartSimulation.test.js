import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseAmountCents } from '../src/utils/pianoSmartSimulation.js';

test('la validazione locale controlla solo la forma dell’importo della simulazione', () => {
  assert.equal(purchaseAmountCents('150,00'), 15000);
  assert.equal(purchaseAmountCents('0'), null);
  for (const amount of ['', ' ', '-1', '1.005', '1e2', 'Infinity']) {
    assert.equal(purchaseAmountCents(amount), null);
  }
});
