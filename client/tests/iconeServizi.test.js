import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO_SERVIZI, ICONE_GENERICHE } from '../src/utils/abbonamenti.js';
import { ICONE_SERVIZI } from '../src/components/abbonamenti/iconeServizi.js';
import { loadModule, renderSfc } from './helpers/renderVue.js';

const ESADECIMALE = /^#[0-9A-F]{6}$/i;
const TRACCIATO_SVG = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+$/;

test('ogni servizio in elenco ha un\'icona', () => {
  CATALOGO_SERVIZI.forEach(({ id }) => {
    const icona = ICONE_SERVIZI[id];
    assert.ok(icona, `manca l'icona di ${id}`);
    assert.match(icona.colore, ESADECIMALE, `colore di ${id}`);
    assert.match(icona.testo, ESADECIMALE, `colore del disegno di ${id}`);
    assert.ok(icona.path || icona.sigla, `${id} non ha né disegno né sigla`);
    if (icona.path) assert.match(icona.path, TRACCIATO_SVG, `tracciato di ${id}`);
  });
});

test('i servizi citati nella richiesta hanno il logo vero', () => {
  ['netflix', 'prime-video', 'chatgpt', 'claude'].forEach((id) => {
    assert.ok(ICONE_SERVIZI[id].path, `${id} deve avere il disegno`);
  });
});

test('un servizio noto mostra il suo logo', async () => {
  const html = await renderSfc('/src/components/abbonamenti/ServizioIcona.vue', { icona: 'netflix', nome: 'Netflix' });
  assert.match(html, /<svg/);
  assert.ok(html.includes(ICONE_SERVIZI.netflix.path.slice(0, 20)));
});

test('un abbonamento fuori elenco mostra l\'iniziale del nome', async () => {
  const html = await renderSfc('/src/components/abbonamenti/ServizioIcona.vue', { icona: null, nome: 'palestra Fit' });
  assert.doesNotMatch(html, /<svg/);
  assert.match(html, />P</);
});

test('un servizio senza logo disponibile mostra la sua sigla', async () => {
  const html = await renderSfc('/src/components/abbonamenti/ServizioIcona.vue', { icona: 'now', nome: 'NOW' });
  assert.match(html, />NOW</);
});

test('le icone generiche hanno un disegno', async () => {
  const { ICONE_GENERICHE_COMPONENTI } = await loadModule('/src/components/abbonamenti/iconeGeneriche.js');
  ICONE_GENERICHE.forEach(({ id }) => assert.ok(ICONE_GENERICHE_COMPONENTI[id], `manca ${id}`));
  const html = await renderSfc('/src/components/abbonamenti/ServizioIcona.vue', { icona: 'palestra', nome: 'Palestra' });
  assert.match(html, /<svg/);
});
