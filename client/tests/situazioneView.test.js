import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

test('La tua situazione distingue le tre aree di monitoraggio, senza il tab Piani', async () => {
  const source = await readFile(new URL('../src/views/SituazioneView.vue', import.meta.url), 'utf8');
  assert.match(source, /\>Oggi<\/button>/);
  assert.match(source, /\>Prossimi 30 giorni<\/button>/);
  assert.match(source, /\>Analisi<\/button>/);
  // Il tab Piani è sparito da qui: il wizard vive sulla rotta separata
  // /funzionalita/piano-smart (PianoSmartView.vue).
  assert.doesNotMatch(source, /\>Piani<\/button>/);
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
