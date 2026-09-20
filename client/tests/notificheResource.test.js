import test from 'node:test';
import assert from 'node:assert/strict';
import { creaRisorsaNotifiche } from '../src/utils/notifiche.js';

const risposta = (notifiche = []) => ({
  notifiche,
  totale: notifiche.length,
  nonLette: notifiche.filter((item) => !item.letta).length,
});

test('un errore iniziale non viene rappresentato come notifiche vuote', async () => {
  const risorsa = creaRisorsaNotifiche(async () => { throw new Error('rete'); });

  await risorsa.carica();

  assert.equal(risorsa.stato.value, 'errore');
  assert.notEqual(risorsa.stato.value, 'vuoto');
});

test('retry recupera la lista dopo un errore', async () => {
  let tentativi = 0;
  const risorsa = creaRisorsaNotifiche(async () => {
    tentativi += 1;
    if (tentativi === 1) throw new Error('rete');
    return risposta([{ id: 1, letta: false }]);
  });

  await risorsa.carica({ limit: 100 });
  await risorsa.riprova();

  assert.equal(tentativi, 2);
  assert.equal(risorsa.stato.value, 'pronto');
  assert.deepEqual(risorsa.data.value, risposta([{ id: 1, letta: false }]));
});

test('un errore di aggiornamento conserva l ultima lista valida', async () => {
  let deveFallire = false;
  const risorsa = creaRisorsaNotifiche(async () => {
    if (deveFallire) throw new Error('rete');
    return risposta([{ id: 3, letta: true }]);
  });

  await risorsa.carica();
  const lastUpdated = risorsa.lastUpdated.value;
  deveFallire = true;
  await risorsa.carica();

  assert.equal(risorsa.stato.value, 'errore-con-dati');
  assert.deepEqual(risorsa.data.value, risposta([{ id: 3, letta: true }]));
  assert.equal(risorsa.lastUpdated.value, lastUpdated);
});

test('solo un successo con lista vuota produce lo stato vuoto', async () => {
  const risorsa = creaRisorsaNotifiche(async () => risposta());
  await risorsa.carica();
  assert.equal(risorsa.stato.value, 'vuoto');
});
