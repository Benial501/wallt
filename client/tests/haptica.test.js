import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * La vibrazione e' l'unica cosa dell'app che l'utente sente sul corpo:
 * se scatta quando non deve, o quando ha chiesto meno movimento, diventa
 * subito un motivo per disinstallare. Queste prove sorvegliano proprio i
 * casi in cui NON deve partire.
 */

// In Node `navigator` e' esposto da un getter: assegnarlo direttamente lancia.
const sostituisciGlobale = (nome, valore) => {
  Object.defineProperty(globalThis, nome, { value: valore, configurable: true, writable: true });
};

const conAmbiente = async ({ vibrate, riduciMovimento = false }) => {
  sostituisciGlobale('navigator', vibrate ? { vibrate } : {});
  sostituisciGlobale('window', {
    matchMedia: (q) => ({ matches: riduciMovimento && q.includes('reduced-motion') }),
  });
  // Query string diversa a ogni chiamata: il modulo va rivalutato, altrimenti
  // legge l'ambiente della prova precedente.
  return import(`../src/utils/haptica.js?t=${Math.random()}`);
};

test('vibra sui riscontri previsti quando il dispositivo lo supporta', async () => {
  const chiamate = [];
  const { vibra } = await conAmbiente({ vibrate: (d) => { chiamate.push(d); return true; } });

  assert.equal(vibra('successo'), true);
  assert.equal(vibra('errore'), true);
  assert.deepEqual(chiamate, [12, [14, 45, 14]]);
});

test('non vibra se chi usa l’app ha chiesto meno movimento', async () => {
  const chiamate = [];
  const { vibra } = await conAmbiente({
    vibrate: (d) => { chiamate.push(d); return true; },
    riduciMovimento: true,
  });

  assert.equal(vibra('successo'), false);
  assert.deepEqual(chiamate, [], 'nessuna vibrazione doveva partire');
});

test('resta inerte dove l’API non esiste (iOS, desktop)', async () => {
  const { vibra } = await conAmbiente({ vibrate: null });
  assert.doesNotThrow(() => vibra('successo'));
  assert.equal(vibra('successo'), false);
});

test('uno schema sconosciuto non fa nulla invece di inventare una durata', async () => {
  const chiamate = [];
  const { vibra } = await conAmbiente({ vibrate: (d) => { chiamate.push(d); return true; } });
  assert.equal(vibra('inesistente'), false);
  assert.deepEqual(chiamate, []);
});

test('le durate restano nella soglia del riscontro, non della suoneria', async () => {
  const { SCHEMI_HAPTICA } = await conAmbiente({ vibrate: () => true });
  for (const [nome, schema] of Object.entries(SCHEMI_HAPTICA)) {
    const impulsi = Array.isArray(schema) ? schema.filter((_, i) => i % 2 === 0) : [schema];
    for (const ms of impulsi) {
      assert.ok(ms <= 40, `${nome}: impulso di ${ms}ms, troppo lungo per un riscontro`);
    }
  }
});

test('un’eccezione del browser non arriva a chi chiama', async () => {
  const { vibra } = await conAmbiente({ vibrate: () => { throw new Error('gesto non consentito'); } });
  assert.doesNotThrow(() => vibra('successo'));
  assert.equal(vibra('successo'), false);
});
