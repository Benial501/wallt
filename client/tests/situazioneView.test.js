import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMemoryHistory, createRouter } from 'vue-router';
import { loadModule } from './helpers/renderVue.js';
import { tabSituazione } from '../src/utils/situazioneTab.js';

/**
 * La tua situazione: il cruscotto di monitoraggio spostato da
 * PianoSmartView.vue in Fase 6 (vedi task-6.1-brief.md). Queste prove
 * continuano quelle di pianoSmartView.test.js per i tre tab che sono stati
 * trasferiti qui invariati.
 */

test('La tua situazione espone timeline accessibile, radar e obiettivi dalla situazione del server', async () => {
  const source = await readFile(new URL('../src/views/SituazioneView.vue', import.meta.url), 'utf8');
  assert.match(source, /PianoSmartChangeTimeline/);
  assert.match(source, /PianoSmartCashFlowRadar/);
  assert.match(source, /PianoSmartGoalsSummary/);
  const timeline = await readFile(new URL('../src/components/piano-smart/PianoSmartChangeTimeline.vue', import.meta.url), 'utf8');
  assert.match(timeline, /type="range"/);
  assert.match(timeline, /aria-label=/);
  assert.match(timeline, /currentPeriodPartial/);
  const radar = await readFile(new URL('../src/components/piano-smart/PianoSmartCashFlowRadar.vue', import.meta.url), 'utf8');
  assert.match(radar, /entrata|uscita/);
  assert.match(radar, /marginAfter/);
  const goals = await readFile(new URL('../src/components/piano-smart/PianoSmartGoalsSummary.vue', import.meta.url), 'utf8');
  assert.match(goals, /stima teorica/i);
  assert.match(goals, /estimateReason/);
});

test('La tua situazione distingue le aree di monitoraggio, senza il tab Piani', async () => {
  const source = await readFile(new URL('../src/components/piano-smart/SituazioneHeader.vue', import.meta.url), 'utf8');
  assert.match(source, /\>Oggi<\/button>/);
  assert.match(source, /\>Prossimi 30 giorni<\/button>/);
  assert.match(source, /\>Analisi<\/button>/);
  assert.match(source, /\>Programmate \/ Abbonamenti<\/button>/);
  // Il tab Piani è sparito da qui: il wizard vive sulla rotta separata
  // /funzionalita/piano-smart/nuovo (PianoSmartView.vue). La vecchia URL
  // /funzionalita/piano-smart ora redirige qui (voce 8 della review finale).
  assert.doesNotMatch(source, /\>Piani<\/button>/);
});

test('Programmate / Abbonamenti è una pagina dentro La tua situazione, con le stesse schede', async () => {
  const { routes } = await loadModule('/src/router/routes.js');
  const router = createRouter({ history: createMemoryHistory(), routes });

  assert.equal(router.resolve('/funzionalita/situazione/programmate').name, 'ricorrenti');

  const vista = await readFile(new URL('../src/views/RicorrentiView.vue', import.meta.url), 'utf8');
  const cruscotto = await readFile(new URL('../src/views/SituazioneView.vue', import.meta.url), 'utf8');
  assert.match(vista, /<SituazioneHeader \/>/);
  assert.match(cruscotto, /<SituazioneHeader \/>/);
});

test('il vecchio indirizzo delle programmate porta alla pagina nuova e conserva la scheda', async () => {
  const { routes } = await loadModule('/src/router/routes.js');
  const router = createRouter({ history: createMemoryHistory(), routes });

  await router.push('/ricorrenti?scheda=abbonamenti');
  assert.equal(router.currentRoute.value.name, 'ricorrenti');
  assert.equal(router.currentRoute.value.path, '/funzionalita/situazione/programmate');
  assert.equal(router.currentRoute.value.query.scheda, 'abbonamenti');
});

test('le schede del cruscotto si leggono dall\'indirizzo, e un valore sconosciuto apre Oggi', () => {
  assert.equal(tabSituazione({}), 'today');
  assert.equal(tabSituazione({ tab: 'upcoming' }), 'upcoming');
  assert.equal(tabSituazione({ tab: 'analysis' }), 'analysis');
  assert.equal(tabSituazione({ tab: 'inventata' }), 'today');
  assert.equal(tabSituazione(undefined), 'today');
});

test('il gesto per cambiare scheda non blocca lo scorrimento delle schede della situazione', async () => {
  const vista = await readFile(new URL('../src/views/RicorrentiView.vue', import.meta.url), 'utf8');
  const template = vista.slice(vista.indexOf('<template>'));
  // `touch-action: pan-y` vale anche per i figli: con le schede dentro quel
  // contenitore, su un telefono non scorrerebbero più.
  assert.ok(template.indexOf('<SituazioneHeader') < template.indexOf('@touchstart.passive'));
});

test('il riquadro Accantona compare soltanto nei prossimi 30 giorni, non in Analisi', async () => {
  const source = await readFile(new URL('../src/views/SituazioneView.vue', import.meta.url), 'utf8');
  const upcomingStart = source.indexOf('<template v-if="tab === \'upcoming\'">');
  const funding = source.indexOf('<PianoSmartExpenseFunding');
  const radar = source.indexOf('<PianoSmartCashFlowRadar', upcomingStart);
  assert.ok(upcomingStart >= 0 && funding > upcomingStart && funding < radar);
});

test('il simulatore "Prima di spendere" sta subito dopo l’hero, non dopo la previsione di fine mese', () => {
  // Spec Fase 6: l'unico riposizionamento previsto rispetto al vecchio file.
  return readFile(new URL('../src/views/SituazioneView.vue', import.meta.url), 'utf8').then((source) => {
    const hero = source.indexOf('<SituazioneHero');
    const simulatore = source.indexOf('id="simulatore-title"');
    const previsione = source.indexOf('Previsione fine mese');
    assert.ok(hero >= 0 && simulatore > hero && simulatore < previsione, 'il simulatore deve stare fra l’hero e la previsione di fine mese');
  });
});
