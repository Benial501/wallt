import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('la lettura dei conti attende le risposte lente dell’API', async () => {
  const store = await readFile(new URL('../src/stores/conti.store.js', import.meta.url), 'utf8');

  assert.match(
    store,
    /api\.get\(['"]\/conti['"],\s*\{\s*timeout:\s*30000\s*\}\)/,
    'la richiesta dei conti deve avere un timeout dedicato di 30 secondi',
  );
});

test('la lettura dello stato bancario attende le risposte lente dell’API', async () => {
  const store = await readFile(new URL('../src/stores/bankSync.store.js', import.meta.url), 'utf8');

  assert.match(
    store,
    /api\.get\(['"]\/bank-sync\/status['"],\s*\{\s*timeout:\s*30000\s*\}\)/,
    'la richiesta dello stato bancario deve avere lo stesso timeout dedicato di 30 secondi',
  );
});
