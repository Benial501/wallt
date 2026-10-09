import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ogni risorsa di uno store deve essere azzerata dal suo `reset()`.
 *
 * Il difetto che questo test impedisce è già costato una volta (difetto noto
 * n. 9): al logout `recentiHome` e due campi interni allo store scommesse
 * restavano in memoria, e l'utente successivo sulla stessa scheda vedeva i
 * movimenti del precedente. `resetPiniaStores()` chiama il `reset()` di ogni
 * store, quindi la correttezza dipende da una cosa sola: che quel `reset()`
 * non dimentichi nessuna risorsa.
 *
 * Aggiungere una `creaRisorsa` a uno store significa aggiungerla al suo
 * `reset()`, altrimenti questa suite fallisce — nello stesso spirito delle
 * coppie di `contrasto.test.js`.
 */

const STORES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'stores');

const files = readdirSync(STORES).filter((f) => f.endsWith('.store.js'));

test('ogni risorsa dichiarata in uno store è azzerata dal suo reset', () => {
  assert.ok(files.length > 0, 'nessuno store trovato: il percorso è cambiato');

  const mancanti = [];

  files.forEach((file) => {
    const sorgente = readFileSync(join(STORES, file), 'utf8');
    const dichiarate = [...sorgente.matchAll(/const\s+(\w+)\s*=\s*creaRisorsa\(/g)]
      .map((m) => m[1]);

    dichiarate.forEach((nome) => {
      if (!new RegExp(`${nome}\\.reset\\(\\)`).test(sorgente)) {
        mancanti.push(`${file}: ${nome}`);
      }
    });
  });

  assert.deepEqual(mancanti, [], `risorse non azzerate dal reset: ${mancanti.join(', ')}`);
});

test('il rilevatore riconosce una risorsa dimenticata', () => {
  // La guardia deve poter fallire: senza questa prova, una regex sbagliata
  // renderebbe il test precedente verde per sempre.
  const finto = `
    const risorsaTenuta = creaRisorsa(() => {});
    const risorsaDimenticata = creaRisorsa(() => {});
    const reset = () => { risorsaTenuta.reset(); };
  `;
  const dichiarate = [...finto.matchAll(/const\s+(\w+)\s*=\s*creaRisorsa\(/g)].map((m) => m[1]);
  const mancanti = dichiarate.filter((n) => !new RegExp(`${n}\\.reset\\(\\)`).test(finto));

  assert.deepEqual(mancanti, ['risorsaDimenticata']);
});
