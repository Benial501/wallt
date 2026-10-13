import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNCTIONALITY_ITEMS } from '../src/config/functionalityItems.js';

// Prima della review finale la voce non doveva esistere, per non duplicare
// quella già nella sidebar desktop (AppLayout.vue, navItems). Ma sulla barra
// inferiore mobile la voce diretta era stata sostituita da "La tua
// situazione": senza una voce nel foglio "Altro" il wizard restava
// raggiungibile solo da una card di suggerimento o da Aiuto (difetto 9 della
// review finale). La voce compare quindi SOLO nel foglio, non nella sidebar,
// dove la sidebar la elenca già per conto suo.
test('Piano Smart compare nel foglio "Altro", non duplicata nella sidebar', () => {
  const item = FUNCTIONALITY_ITEMS.find((candidate) => candidate.id === 'piano-smart');
  assert.ok(item, 'la voce Piano Smart deve esistere in FUNCTIONALITY_ITEMS');
  assert.deepEqual(item.placements, ['sheet']);
});
