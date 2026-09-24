import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Piano Smart collega il link Come funziona alla guida interattiva', async () => {
  const source = await readFile(new URL('../src/views/PianoSmartView.vue', import.meta.url), 'utf8');
  assert.match(source, /PianoSmartGuide/);
  assert.match(source, /:open="infoAperta"/);
  assert.match(source, /@close="infoAperta = false"/);
});
