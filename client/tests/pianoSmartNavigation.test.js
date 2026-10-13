import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryHistory, createRouter } from 'vue-router';
import { FUNCTIONALITY_ITEMS } from '../src/config/functionalityItems.js';
import { loadModule } from './helpers/renderVue.js';

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
  // La voce riguarda la creazione di un piano: deve puntare alla rotta nuova
  // del wizard, non alla vecchia URL che ora redirige alla situazione
  // (voce 8 della review finale).
  assert.equal(item.route, '/funzionalita/piano-smart/nuovo');
});

// Voce 8 della review finale: la vecchia URL del wizard
// (`/funzionalita/piano-smart`) diventa un redirect verso la situazione —
// chi aveva un segnalibro su quel percorso cercava il monitoraggio, non la
// creazione di un piano. Il wizard si sposta su una rotta nuova.
test('la vecchia URL del wizard redirige alla situazione, il wizard vive sulla rotta nuova', async () => {
  const { routes } = await loadModule('/src/router/routes.js');
  const router = createRouter({ history: createMemoryHistory(), routes });

  await router.push('/funzionalita/piano-smart');
  assert.equal(router.currentRoute.value.name, 'situazione');

  assert.equal(router.resolve('/funzionalita/piano-smart/nuovo').name, 'piano-smart');

  // Il redirect precedente, aggiunto per un percorso mai esistito
  // (`/funzionalita/piano-smart/situazione`), è stato rimosso insieme a
  // questa correzione: non deve restare un secondo modo, inutile, di
  // arrivare alla situazione.
  assert.equal(router.resolve('/funzionalita/piano-smart/situazione').name, 'not-found');
});
