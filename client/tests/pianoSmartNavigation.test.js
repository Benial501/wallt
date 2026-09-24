import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNCTIONALITY_ITEMS } from '../src/config/functionalityItems.js';

test('Piano Smart è disponibile nelle funzionalità con route dedicata', () => {
  const item = FUNCTIONALITY_ITEMS.find((candidate) => candidate.id === 'piano-smart');
  assert.deepEqual({ label: item.label, route: item.route }, {
    label: 'Piano Smart', route: '/funzionalita/piano-smart',
  });
  assert.ok(item.placements.includes('sheet'), 'manca dal bottom sheet mobile');
  // Il bottom sheet "Funzionalità" esiste solo su mobile: senza 'sidebar' la
  // voce non compare da nessuna parte su desktop.
  assert.ok(item.placements.includes('sidebar'), 'manca dalla sidebar desktop');
});
