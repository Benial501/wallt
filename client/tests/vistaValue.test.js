import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Il difetto che questo test esiste per impedire ha superato dodici review.
 *
 * Una risorsa di `creaRisorsa` esposta al primo livello di uno store Pinia
 * viene scompattata da `reactive()`: `store.risorsaX.stato` è già la stringa.
 * Scriverci `.value` produce `undefined`, e `store.risorsaX.error.value`
 * lancia un TypeError che rompe il render dell'intera pagina.
 *
 * MA il caso opposto esiste ed è altrettanto vero: un `computed` dello store
 * che restituisce l'oggetto risorsa GREZZO non viene scompattato, e lì
 * `.value` serve. `investimenti.store.js` ne ha uno — `risorsaMovimentiAttiva`
 * — e `InvestimentiView.vue` lo legge correttamente con `.value`.
 *
 * Un grep che non distinguesse i due casi non sarebbe una guardia: sarebbe
 * una macchina per rompere il caso corretto. L'elenco delle esenzioni si
 * ricava quindi dagli store veri, non da un commento nel template che
 * potrebbe mentire.
 *
 * `storeUnwrap.test.js` fissa il meccanismo; questo guarda le viste, che
 * sono il posto in cui l'errore è costato.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const STORES = join(SRC, 'stores');

/** Corpo di `computed(` a partire dalla parentesi aperta, per bilanciamento. */
const corpoComputed = (sorgente, daIndice) => {
  let profondita = 0;
  for (let i = daIndice; i < sorgente.length; i++) {
    if (sorgente[i] === '(') profondita += 1;
    else if (sorgente[i] === ')') {
      profondita -= 1;
      if (profondita === 0) return sorgente.slice(daIndice + 1, i);
    }
  }
  return '';
};

/**
 * Nomi dei `computed` che restituiscono una risorsa grezza invece dei suoi
 * campi. Il segnale è un identificatore `risorsa…` usato NUDO, cioè non
 * seguito da `.` (che leggerebbe un campo) né da `(` (che sarebbe una
 * chiamata).
 */
export const risorseGrezze = (dir = STORES) => {
  const esenti = new Set();
  for (const nome of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const sorgente = readFileSync(join(dir, nome), 'utf8');
    for (const m of sorgente.matchAll(/const\s+(\w+)\s*=\s*computed\s*\(/g)) {
      const corpo = corpoComputed(sorgente, m.index + m[0].length - 1);
      if (/\brisorsa\w*(?![\w.(])/.test(corpo)) esenti.add(m[1]);
    }
  }
  return esenti;
};

const PATH_VALUE = /\b(\w*[Rr]isorsa\w*)(?:\.\w+)*\.value\b/g;

/** Identificatori di risorsa letti con `.value` che non sono esentati. */
export const colpevoliDellaRiga = (riga, esenti) => [...riga.matchAll(PATH_VALUE)]
  .map((m) => m[1])
  .filter((identificatore) => !esenti.has(identificatore));

const fileVue = (dir) => readdirSync(dir).flatMap((nome) => {
  const percorso = join(dir, nome);
  if (statSync(percorso).isDirectory()) return fileVue(percorso);
  return nome.endsWith('.vue') ? [percorso] : [];
});

/** Indici delle righe comprese fra `<template` e l'ultimo `</template>`. */
const righeDelTemplate = (righe) => {
  const apertura = righe.findIndex((r) => r.includes('<template'));
  if (apertura === -1) return [];
  let chiusura = -1;
  for (let i = righe.length - 1; i > apertura; i--) {
    if (righe[i].includes('</template>')) { chiusura = i; break; }
  }
  if (chiusura === -1) return [];
  return righe.map((_, i) => i).filter((i) => i > apertura && i < chiusura);
};

test('nessun template legge .value su una risorsa già scompattata', () => {
  const esenti = risorseGrezze();
  const colpevoli = [];

  for (const percorso of fileVue(SRC)) {
    const righe = readFileSync(percorso, 'utf8').split('\n');
    for (const i of righeDelTemplate(righe)) {
      if (colpevoliDellaRiga(righe[i], esenti).length) {
        colpevoli.push(`${relative(SRC, percorso)}:${i + 1} → ${righe[i].trim()}`);
      }
    }
  }

  assert.deepEqual(
    colpevoli, [],
    'Una risorsa letta da uno store è già scompattata: togliere `.value`.\n'
    + `Punti trovati:\n${colpevoli.join('\n')}`,
  );
});

test('le risorse grezze si ricavano dagli store, non da un commento', () => {
  const esenti = risorseGrezze();
  // `investimenti.store.js` espone un computed che restituisce la risorsa
  // intera: è il caso documentato da storeUnwrap.test.js.
  assert.ok(
    esenti.has('risorsaMovimentiAttiva'),
    `atteso risorsaMovimentiAttiva fra le esenzioni, trovate: ${[...esenti]}`,
  );
});

test('il rilevatore distingue il caso rotto da quello corretto', () => {
  // Blindaggio del test stesso: un controllo che non può fallire non protegge,
  // e un controllo che non può assolvere rompe il codice giusto.
  const esenti = new Set(['risorsaMovimentiAttiva']);

  assert.deepEqual(
    colpevoliDellaRiga('<p v-if="analisiStore.risorsaAndamento.error.value">x</p>', esenti),
    ['risorsaAndamento'],
    'la forma che ha rotto la dashboard deve essere segnalata',
  );
  assert.deepEqual(
    colpevoliDellaRiga(':stato="investimentiStore.risorsaMovimentiAttiva.stato.value"', esenti),
    [],
    'su un computed che restituisce la risorsa grezza `.value` è corretto',
  );
  assert.deepEqual(
    colpevoliDellaRiga(':stato="movimentiStore.risorsaMovimenti.stato"', esenti),
    [],
    'senza `.value` non c\'è nulla da segnalare',
  );
});
