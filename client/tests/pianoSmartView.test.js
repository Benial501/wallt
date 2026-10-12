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

test('Piano Smart (il wizard) resta sulla sua rotta e salva lo scenario V2 selezionato', async () => {
  const source = await readFile(new URL('../src/views/PianoSmartView.vue', import.meta.url), 'utf8');
  const store = await readFile(new URL('../src/stores/pianoSmart.store.js', import.meta.url), 'utf8');
  assert.match(source, /\>Crea un piano<\/button>/);
  assert.match(source, /\>Piani salvati<\/button>/);
  assert.match(source, /selectedScenario/);
  // Il monitoraggio (Oggi/Prossimi 30 giorni/Analisi) è su una pagina
  // separata (SituazioneView.vue, Fase 6): qui non deve più esistere.
  assert.doesNotMatch(source, /currentSituation/);
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
