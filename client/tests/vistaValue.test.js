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
 * `storeUnwrap.test.js` fissa il meccanismo ma non vede le viste. Questo lo
 * completa: guarda i template, che sono il posto in cui l'errore è costato.
 * Nello `<script setup>` `.value` è invece corretto e non viene esaminato.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

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

test('nessun template legge .value su una risorsa di store', () => {
  const colpevoli = [];

  for (const percorso of fileVue(SRC)) {
    const righe = readFileSync(percorso, 'utf8').split('\n');
    for (const i of righeDelTemplate(righe)) {
      if (/risorsa[\w.]*\.value/i.test(righe[i])) {
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

test('il rilevatore riconosce la forma che ha rotto la dashboard', () => {
  // Blindaggio del test stesso: un controllo che non può fallire non protegge.
  const righe = [
    '<template>',
    '  <p v-if="analisiStore.risorsaAndamento.error.value">errore</p>',
    '</template>',
  ];
  const trovate = righeDelTemplate(righe).filter((i) => /risorsa[\w.]*\.value/i.test(righe[i]));
  assert.equal(trovate.length, 1);
});
