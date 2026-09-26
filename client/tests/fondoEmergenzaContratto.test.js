/**
 * Il contratto del fondo di emergenza fra client e server, verificato
 * confrontando i due file di vocabolario invece di fidarsi che restino
 * allineati (stesso principio di pianoSmartContratto.test.js).
 *
 * `src/utils/fondoEmergenza.js` duplica di proposito il tipo di conto e le
 * soglie ammesse: se una delle due parti cambia da sola, qui si rompe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import serverFondo from '../../server/services/fondoEmergenza.service.js';
import {
  TIPO_CONTO_FONDO, MESI_TARGET_AMMESSI, MESI_TARGET_DEFAULT, isContoFondo, formattaMesi,
} from '../src/utils/fondoEmergenza.js';
import { GLOSSARIO } from '../src/content/glossario.js';

test('il tipo di conto del fondo è lo stesso dei due lati', () => {
  assert.equal(TIPO_CONTO_FONDO, serverFondo.TIPO_CONTO_FONDO);
});

test('le soglie proponibili coincidono con quelle accettate dal server', () => {
  assert.deepEqual([...MESI_TARGET_AMMESSI], [...serverFondo.MESI_TARGET_AMMESSI]);
});

test('la soglia di partenza è la stessa che il server applica senza mesi_target', () => {
  assert.equal(MESI_TARGET_DEFAULT, serverFondo.MESI_TARGET_DEFAULT);
  assert.ok(MESI_TARGET_AMMESSI.includes(MESI_TARGET_DEFAULT));
});

test('isContoFondo riconosce il conto del fondo e nessun altro', () => {
  assert.equal(isContoFondo({ tipo: TIPO_CONTO_FONDO }), true);
  assert.equal(isContoFondo({ tipo: 'banca' }), false);
  assert.equal(isContoFondo(null), false);
});

test('formattaMesi non scrive "1 mesi" e usa la virgola decimale', () => {
  assert.equal(formattaMesi(1), '1 mese');
  assert.equal(formattaMesi(3), '3 mesi');
  // La copertura è spesso un numero con decimali: in italiano "1.5" è un
  // errore di lingua, accanto a importi già scritti con la virgola.
  assert.equal(formattaMesi(1.5), '1,5 mesi');
  assert.equal(formattaMesi(null), '');
});

test('il fondo e i mesi di copertura hanno una voce di glossario', () => {
  // Coding Rule 18: l'etichetta di un concetto finanziario si legge dal
  // glossario, non si scrive in linea nei componenti.
  assert.ok(GLOSSARIO.fondo_emergenza, 'manca la voce fondo_emergenza');
  assert.ok(GLOSSARIO.mesi_copertura, 'manca la voce mesi_copertura');
  assert.equal(GLOSSARIO.fondo_emergenza.etichetta, 'Fondo di emergenza');
});
