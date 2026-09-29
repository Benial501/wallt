/**
 * Vocabolario condiviso del fondo di emergenza (CLAUDE.md Regola 22).
 *
 * Sta in `constants/` e non dentro il service per la stessa ragione di
 * `constants/pianoSmart.js`: questi valori li usano validator, controller,
 * service e il test-contratto del client, e un solo elenco non può divergere.
 *
 * Il motivo pratico che ha portato l'estrazione: il file deve restare
 * importabile da `client/tests/fondoEmergenzaContratto.test.js`, che gira nel
 * job "Frontend (build)" della CI dove `server/node_modules` non esiste.
 * Finché le costanti stavano nel service — che alla prima riga fa
 * `require('../models')` e quindi carica Sequelize — quel test non riusciva
 * nemmeno a caricarsi in CI, e il contratto che doveva sorvegliare non è mai
 * stato verificato. Qui dentro non deve entrare nessun `require`.
 */

// Il discriminante del fondo. Segue la convenzione già in uso per i conti
// 'scommesse' (Regola 5) invece di aggiungere una colonna booleana.
const TIPO_CONTO_FONDO = 'emergenza';

// Le soglie proponibili, in mesi di spese essenziali. Un elenco chiuso: sono
// le uniche scelte offerte dall'interfaccia, e la validazione non ne accetta
// altre.
const MESI_TARGET_AMMESSI = [3, 6, 12];
const MESI_TARGET_DEFAULT = 3;

const NOME_DEFAULT = 'Fondo di emergenza';

/** Vero se questo conto è il fondo di emergenza. Unico predicato: chi deve
 * applicare i vincoli del fondo (niente entrate/uscite dirette, `nascosto`
 * non disattivabile) lo interroga invece di confrontare la stringa a mano. */
const isContoFondo = (conto) => !!conto && conto.tipo === TIPO_CONTO_FONDO;

module.exports = {
  TIPO_CONTO_FONDO,
  MESI_TARGET_AMMESSI,
  MESI_TARGET_DEFAULT,
  NOME_DEFAULT,
  isContoFondo,
};
