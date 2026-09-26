import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Piano Smart collega il link Come funziona alla guida interattiva', async () => {
  const source = await readFile(new URL('../src/views/PianoSmartView.vue', import.meta.url), 'utf8');
  assert.match(source, /PianoSmartGuide/);
  assert.match(source, /class="info-button"/);
  assert.match(source, /aria-label="Apri la guida di Piano Smart"/);
  assert.match(source, /:open="infoAperta"/);
  assert.match(source, /@close="infoAperta = false"/);
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
