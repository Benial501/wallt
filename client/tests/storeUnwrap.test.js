import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia, defineStore } from 'pinia';
import { computed } from 'vue';
import { creaRisorsa } from '../src/utils/risorsa.js';

/**
 * Blindaggio di un difetto specifico: una risorsa creata da `creaRisorsa` è
 * un oggetto con `ref`/`computed` al suo interno. Restituita al livello
 * più alto di uno store Pinia, lo store la avvolge in `reactive()`, e
 * `reactive()` scompatta automaticamente i ref che trova come proprietà
 * dirette. Da fuori lo store, `store.risorsaX.stato` è quindi già la
 * stringa: aggiungere `.value` come si farebbe dentro il modulo dello
 * store stesso è sbagliato e in produzione ha rotto la dashboard.
 *
 * `node --test` non passa mai da Pinia, quindi la vecchia suite di
 * `risorsa.test.js` (che chiama `creaRisorsa` direttamente, senza uno
 * store) non poteva vedere questo scompattamento: per questo il difetto
 * ha superato tutte le review dei singoli task.
 */
const useTestStore = defineStore('storeUnwrapTest', () => {
  const risorsaX = creaRisorsa(async () => ['a'], { iniziale: [] });

  // Stessa forma di `risorsaMovimentiAttiva` in investimenti.store.js: un
  // `computed` che restituisce l'oggetto risorsa grezzo invece dei suoi
  // campi. Un `computed` esposto al livello più alto viene scompattato
  // (si legge `store.risorsaAttiva`, non `store.risorsaAttiva.value`), ma
  // l'oggetto che ne esce non è mai passato da `reactive()`: resta
  // l'oggetto grezzo con `stato`/`lastUpdated` ancora come ref.
  const risorsaAttiva = computed(() => risorsaX);

  return { risorsaX, risorsaAttiva };
});

test('una risorsa esposta al livello più alto dello store è già scompattata', () => {
  setActivePinia(createPinia());
  const s = useTestStore();

  assert.equal(typeof s.risorsaX.stato, 'string', 'stato deve essere il valore, non un ref');
  // Mai caricata: 'caricamento', non 'vuoto' (vedi risorsa.js e risorsa.test.js).
  assert.equal(s.risorsaX.stato, 'caricamento');
  assert.equal(s.risorsaX.stato.value, undefined, '.value su un valore già scompattato è sbagliato');
});

test('leggere error su una risorsa scompattata non lancia ed è null quando sana', () => {
  setActivePinia(createPinia());
  const s = useTestStore();

  assert.doesNotThrow(() => s.risorsaX.error);
  assert.equal(s.risorsaX.error, null);
  // La forma che ha rotto la dashboard: `error.value` quando `error` è già
  // `null` prova a leggere `.value` su `null`, e lancia.
  assert.throws(() => s.risorsaX.error.value);
});

test('un computed dello store che restituisce la risorsa grezza resta da scompattare con .value', () => {
  setActivePinia(createPinia());
  const s = useTestStore();

  // `risorsaAttiva` stesso è scompattato (si legge senza `.value`), ma
  // l'oggetto che contiene è quello grezzo di `creaRisorsa`: lì dentro
  // `stato` è ancora un ref, non il valore.
  assert.equal(typeof s.risorsaAttiva.stato, 'object');
  assert.equal(s.risorsaAttiva.stato.value, 'caricamento');
});
