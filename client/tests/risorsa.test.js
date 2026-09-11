import test from 'node:test';
import assert from 'node:assert/strict';
import { creaRisorsa } from '../src/utils/risorsa.js';

/** Promise che possiamo risolvere o rifiutare a comando, per i test di concorrenza. */
const differita = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('parte in stato di caricamento e arriva a pronto', async () => {
  const r = creaRisorsa(async () => [1, 2, 3], { iniziale: [] });
  assert.equal(r.stato.value, 'vuoto');
  const attesa = r.carica();
  assert.equal(r.stato.value, 'caricamento');
  await attesa;
  assert.equal(r.stato.value, 'pronto');
  assert.deepEqual(r.data.value, [1, 2, 3]);
  assert.equal(r.error.value, null);
  assert.ok(r.lastUpdated.value > 0);
});

test('senza dati precedenti un fallimento porta in errore', async () => {
  const r = creaRisorsa(async () => { throw new Error('rete'); }, { iniziale: [] });
  await r.carica();
  assert.equal(r.stato.value, 'errore');
  assert.equal(r.lastUpdated.value, null);
});

test('INVARIANTE: un fallimento non tocca data ne lastUpdated', async () => {
  let deveFallire = false;
  const r = creaRisorsa(async () => {
    if (deveFallire) throw new Error('rete');
    return [1, 2, 3];
  }, { iniziale: [] });

  await r.carica();
  const primoAggiornamento = r.lastUpdated.value;

  deveFallire = true;
  await r.carica();

  assert.deepEqual(r.data.value, [1, 2, 3], 'i dati devono restare');
  assert.equal(r.lastUpdated.value, primoAggiornamento, 'lastUpdated non deve cambiare');
  assert.equal(r.stato.value, 'errore-con-dati');
});

test('carica non lancia mai: restituisce undefined in caso di errore', async () => {
  const r = creaRisorsa(async () => { throw new Error('rete'); }, { iniziale: [] });
  const esito = await r.carica();
  assert.equal(esito, undefined);
});

test('un tentativo riuscito dopo un errore pulisce lo stato', async () => {
  let deveFallire = true;
  const r = creaRisorsa(async () => {
    if (deveFallire) throw new Error('rete');
    return [7];
  }, { iniziale: [] });

  await r.carica();
  assert.equal(r.stato.value, 'errore');

  deveFallire = false;
  await r.riprova();
  assert.equal(r.stato.value, 'pronto');
  assert.equal(r.error.value, null);
  assert.deepEqual(r.data.value, [7]);
});

test('durante un nuovo tentativo senza dati lo stato torna caricamento', async () => {
  const primo = differita();
  const secondo = differita();
  let chiamate = 0;
  const r = creaRisorsa(async () => {
    chiamate += 1;
    return chiamate === 1 ? primo.promise : secondo.promise;
  }, { iniziale: [] });

  const a = r.carica();
  primo.reject(new Error('rete'));
  await a;
  assert.equal(r.stato.value, 'errore');

  const b = r.carica();
  assert.equal(r.stato.value, 'caricamento', 'caricamento deve precedere errore');
  secondo.resolve([1]);
  await b;
  assert.equal(r.stato.value, 'pronto');
});

test('con dati precedenti l avviso resta visibile durante il nuovo tentativo', async () => {
  let modo = 'ok';
  const lenta = differita();
  const r = creaRisorsa(async () => {
    if (modo === 'ok') return [1];
    if (modo === 'ko') throw new Error('rete');
    return lenta.promise;
  }, { iniziale: [] });

  await r.carica();
  modo = 'ko';
  await r.carica();
  assert.equal(r.stato.value, 'errore-con-dati');

  modo = 'lenta';
  const inVolo = r.carica();
  assert.equal(r.stato.value, 'errore-con-dati', 'il banner non deve sparire a meta del retry');
  lenta.resolve([2]);
  await inVolo;
  assert.equal(r.stato.value, 'pronto');
});

test('una risposta lenta partita prima non sovrascrive una veloce partita dopo', async () => {
  const lenta = differita();
  const veloce = differita();
  let chiamate = 0;
  const r = creaRisorsa(async () => {
    chiamate += 1;
    return chiamate === 1 ? lenta.promise : veloce.promise;
  }, { iniziale: [] });

  const a = r.carica();
  const b = r.carica();

  veloce.resolve(['recente']);
  await b;
  lenta.resolve(['vecchia']);
  await a;

  assert.deepEqual(r.data.value, ['recente'], 'la risposta sorpassata va scartata');
});

test('un errore sorpassato non sporca una risorsa gia riuscita', async () => {
  const lenta = differita();
  const veloce = differita();
  let chiamate = 0;
  const r = creaRisorsa(async () => {
    chiamate += 1;
    return chiamate === 1 ? lenta.promise : veloce.promise;
  }, { iniziale: [] });

  const a = r.carica();
  const b = r.carica();

  veloce.resolve(['ok']);
  await b;
  lenta.reject(new Error('rete'));
  await a;

  assert.equal(r.error.value, null, 'un fallimento sorpassato non deve comparire');
  assert.equal(r.stato.value, 'pronto');
});

test('vuoto non viene mai restituito quando c e un errore', async () => {
  let deveFallire = false;
  const r = creaRisorsa(async () => {
    if (deveFallire) throw new Error('rete');
    return [];
  }, { iniziale: [] });

  await r.carica();
  assert.equal(r.stato.value, 'vuoto');

  deveFallire = true;
  await r.carica();
  assert.equal(r.stato.value, 'errore-con-dati', 'l errore ha la precedenza sul vuoto');
});

test('vuotoSe personalizzato decide cosa significa vuoto', async () => {
  const r = creaRisorsa(async () => ({ esiste: false }), {
    iniziale: null,
    vuotoSe: (v) => !v || v.esiste === false,
  });
  await r.carica();
  assert.equal(r.stato.value, 'vuoto');
});

test('reset riporta ogni campo al valore iniziale', async () => {
  const r = creaRisorsa(async () => [1], { iniziale: [] });
  await r.carica();
  r.reset();
  assert.deepEqual(r.data.value, []);
  assert.equal(r.error.value, null);
  assert.equal(r.lastUpdated.value, null);
  assert.equal(r.loading.value, false);
  assert.equal(r.stato.value, 'vuoto');
});

test('reset invalida le richieste in volo', async () => {
  const lenta = differita();
  const r = creaRisorsa(async () => lenta.promise, { iniziale: [] });

  const inVolo = r.carica();
  r.reset();
  lenta.resolve(['dati del vecchio utente']);
  await inVolo;

  assert.deepEqual(r.data.value, [], 'dopo il logout nessuna risposta deve ripopolare la risorsa');
});

test('riprova ripete la chiamata con gli stessi argomenti', async () => {
  const visti = [];
  const r = creaRisorsa(async (mese, anno) => {
    visti.push([mese, anno]);
    return { mese, anno };
  }, { iniziale: null });

  await r.carica(9, 2026);
  await r.riprova();

  assert.deepEqual(visti, [[9, 2026], [9, 2026]]);
});
