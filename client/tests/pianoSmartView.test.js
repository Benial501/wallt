import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Piano Smart usa l’aiuto contestuale condiviso come le altre sezioni', async () => {
  const source = await readFile(new URL('../src/views/PianoSmartView.vue', import.meta.url), 'utf8');
  const helpTopics = await readFile(new URL('../src/content/helpTopics.js', import.meta.url), 'utf8');
  assert.match(source, /import HelpTrigger from '@\/components\/help\/HelpTrigger\.vue'/);
  assert.match(source, /<HelpTrigger topic="piano-smart"\s*\/>/);
  assert.doesNotMatch(source, /class="info-button"/);
  assert.match(helpTopics, /id: 'piano-smart'[\s\S]*?link: \{ label: 'Apri la guida completa e interattiva'/);
  assert.match(source, /:open="guidaSpiegazioneAperta"/, 'le spiegazioni contestuali nella pagina devono restare disponibili');
});

test('Piano Smart espone timeline accessibile, radar e obiettivi dalla situazione del server', async () => {
  const source = await readFile(new URL('../src/views/PianoSmartView.vue', import.meta.url), 'utf8');
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

test('Piano Smart distingue le tre aree e salva lo scenario V2 selezionato', async () => {
  const source = await readFile(new URL('../src/views/PianoSmartView.vue', import.meta.url), 'utf8');
  const store = await readFile(new URL('../src/stores/pianoSmart.store.js', import.meta.url), 'utf8');
  assert.match(source, /\>Oggi<\/button>/);
  assert.match(source, /\>Analisi<\/button>/);
  assert.match(source, /\>Piani<\/button>/);
  assert.match(source, /selectedScenario/);
  assert.match(store, /createV2Plan/);
  assert.match(store, /createV2Plan/);
  assert.match(store, /selectedScenario: selectedScenario\.value/);
});

test('Piano Smart apre da Aiuto la sezione richiesta dalla statistica', async () => {
  const help = await readFile(new URL('../src/views/AiutoView.vue', import.meta.url), 'utf8');
  const guide = await readFile(new URL('../src/components/piano-smart/PianoSmartGuide.vue', import.meta.url), 'utf8');
  assert.match(help, /PianoSmartGuide/);
  assert.match(help, /argomento.*piano-smart|piano-smart.*argomento/);
  assert.match(guide, /initialSection/);
  assert.match(guide, /Che cosa significa\?/);
});
