import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryHistory, createRouter } from 'vue-router';
import { loadModule, renderSfc } from './helpers/renderVue.js';

test('una URL sconosciuta risolve la route 404', async () => {
  const { routes } = await loadModule('/src/router/routes.js');
  const router = createRouter({ history: createMemoryHistory(), routes });

  assert.equal(router.resolve('/questa-pagina-non-esiste').name, 'not-found');
});

test('le route conosciute continuano a risolvere prima della catch-all', async () => {
  const { routes } = await loadModule('/src/router/routes.js');
  const router = createRouter({ history: createMemoryHistory(), routes });

  assert.equal(router.resolve('/dashboard').name, 'dashboard');
  assert.equal(router.resolve('/ricorrenti').name, 'ricorrenti');
  assert.equal(router.resolve('/notifiche').name, 'notifiche');
});

test('la pagina 404 rende un landmark e due vie di uscita nominate', async () => {
  const html = await renderSfc('/src/views/NotFoundView.vue');

  assert.match(html, /<main/);
  assert.match(html, /Pagina non trovata/);
  assert.match(html, /Torna alla Home/);
  assert.match(html, /Torna indietro/);
  assert.match(html, /href="\/dashboard"/);
  assert.match(html, /<button[^>]*type="button"/);
});
