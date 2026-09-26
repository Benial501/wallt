/**
 * Vocabolario del fondo di emergenza lato client.
 *
 * Duplica di proposito due valori del server (il tipo di conto e le soglie
 * ammesse), come già fa `utils/pianoSmart.js`: il client deve poterli usare
 * senza chiedere, ma la divergenza è il rischio. Per questo
 * `tests/fondoEmergenzaContratto.test.js` confronta questo file con
 * `server/services/fondoEmergenza.service.js` e si rompe se uno dei due cambia
 * da solo.
 */

// Il conto che È il fondo. Serve al client per non offrire quel conto dove non
// può essere usato (una spesa o un'entrata diretta), non per decidere regole:
// i vincoli li applica il server.
export const TIPO_CONTO_FONDO = 'emergenza';

// Le soglie proponibili, in mesi di spese essenziali.
export const MESI_TARGET_AMMESSI = Object.freeze([3, 6, 12]);
export const MESI_TARGET_DEFAULT = 3;

export const isContoFondo = (conto) => !!conto && conto.tipo === TIPO_CONTO_FONDO;

/**
 * "1 mese" / "4 mesi" / "1,5 mesi": al singolare la frase cambia, e "1 mesi" si
 * legge male. I decimali vanno con la virgola: la copertura è spesso un numero
 * come 1,5, e il punto è un errore di lingua che salta all'occhio accanto agli
 * importi in euro, già formattati all'italiana.
 */
export const formattaMesi = (mesi) => {
  // null/undefined significano "non lo so": Number(null) vale 0, e stampare
  // "0 mesi" al posto di un dato mancante sarebbe un numero inventato.
  if (mesi === null || mesi === undefined || mesi === '') return '';
  const n = Number(mesi);
  if (!Number.isFinite(n)) return '';
  const numero = n.toLocaleString('it-IT', { maximumFractionDigits: 1 });
  return n === 1 ? '1 mese' : `${numero} mesi`;
};
