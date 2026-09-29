/**
 * Il contratto del fondo di emergenza fra client e server, verificato
 * confrontando i due file di vocabolario invece di fidarsi che restino
 * allineati (stesso principio di pianoSmartContratto.test.js).
 *
 * `src/utils/fondoEmergenza.js` duplica di proposito il tipo di conto e le
 * soglie ammesse: se una delle due parti cambia da sola, qui si rompe.
 *
 * Il lato server si legge da `server/constants/fondoEmergenza.js` e non dal
 * service: il service fa `require('../models')` e quindi carica Sequelize,
 * che nel job "Frontend (build)" della CI non è installato (lì `npm ci` gira
 * solo in `client/`). Finché l'import passava di lì, questo file non riusciva
 * a caricarsi in CI e i suoi test non venivano eseguiti affatto — un
 * test-contratto che non ha mai sorvegliato niente. L'ultimo test qui sotto
 * verifica che il service continui a leggere da quel modulo invece di
 * ridefinire le costanti per conto proprio.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import serverFondo from '../../server/constants/fondoEmergenza.js';
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

test('i due predicati rispondono allo stesso modo sugli stessi conti', () => {
  // Il predicato è duplicato come le costanti: se uno dei due cambiasse idea
  // su cosa sia il fondo, il client offrirebbe il conto dove il server lo
  // rifiuta (niente entrate o uscite dirette sul fondo, Regola 22).
  const casi = [
    { tipo: TIPO_CONTO_FONDO }, { tipo: 'banca' }, { tipo: 'scommesse' }, { tipo: null }, {}, null,
  ];
  casi.forEach((conto) => {
    assert.equal(isContoFondo(conto), serverFondo.isContoFondo(conto), `divergono su ${JSON.stringify(conto)}`);
  });
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

test('il service del fondo legge il vocabolario dal modulo condiviso', () => {
  // Il confronto qui sopra vale solo se il server ha una sorgente sola. Se le
  // costanti tornassero a vivere dentro il service, questo file continuerebbe
  // a confrontare il client con un modulo che nessuno usa più.
  const service = readFileSync(new URL('../../server/services/fondoEmergenza.service.js', import.meta.url), 'utf8');
  assert.match(service, /require\('\.\.\/constants\/fondoEmergenza'\)/, 'il service non importa il vocabolario condiviso');
  assert.doesNotMatch(service, /const\s+(TIPO_CONTO_FONDO|MESI_TARGET_AMMESSI|MESI_TARGET_DEFAULT|NOME_DEFAULT)\s*=/, 'il service ridefinisce una costante del vocabolario');
});
