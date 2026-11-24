/**
 * Vocabolario del budget a tre voci lato client.
 *
 * Duplica di proposito voci, modelli e soglie di `server/constants/budget.js`,
 * come già fa `utils/fondoEmergenza.js`: il client li usa per mostrare la scelta
 * del modello e controllare un piano personalizzato prima di inviarlo, ma è il
 * server a decidere. `tests/budgetContratto.test.js` confronta i due file e si
 * rompe se uno dei due cambia da solo.
 */

export const VOCI = Object.freeze(['bisogni', 'desideri', 'futuro']);

export const ETICHETTE_VOCI = Object.freeze({ bisogni: 'Bisogni', desideri: 'Desideri', futuro: 'Futuro' });

export const MODELLI_PRONTI = Object.freeze({
  equilibrato: Object.freeze({ bisogni: 50, desideri: 30, futuro: 20 }),
  spese_fisse_alte: Object.freeze({ bisogni: 70, desideri: 20, futuro: 10 }),
  risparmio_deciso: Object.freeze({ bisogni: 40, desideri: 30, futuro: 30 }),
});

export const MODELLO_PERSONALIZZATO = 'personalizzato';

export const MODELLI_IDS = Object.freeze([...Object.keys(MODELLI_PRONTI), MODELLO_PERSONALIZZATO]);

export const SOGLIA_SPESE_FISSE_ALTE = 0.40;

export const SOGLIE_AVVISO = Object.freeze([80, 100]);

export const MESI_SUGGERIMENTO_MODELLO = 3;

export const TIPI_CONTO_FUTURO = Object.freeze(['risparmio', 'investimento', 'emergenza']);

export const CATEGORIE_VOCE_FISSA = Object.freeze({ investimento: 'futuro', trading: 'futuro', deposito_scommesse: 'desideri' });

// Non contano in nessuna voce: si mostrano a parte, «da attribuire».
export const CATEGORIE_FUORI_VOCI = Object.freeze(['trasferimento_denaro']);

export const CODICI_CONSIGLIO = Object.freeze(['entrata_mancante', 'bisogni_oltre', 'desideri_oltre', 'futuro_indietro', 'in_regola']);

/**
 * L'essenzialità da scrivere quando l'utente sposta una categoria fra Bisogni
 * e Desideri. `null` significa «rimuovi la personalizzazione»: quando il
 * catalogo mette già la categoria predefinita nella voce scelta, tornare al
 * catalogo conserva la sfumatura (una semi-essenziale resta semi-essenziale)
 * invece di sovrascriverla. È la stessa classificazione del fondo di emergenza.
 *
 * @param {{predefinita:boolean, essenzialita_catalogo:?string}} categoria - da GET /budget/stato
 * @param {'bisogni'|'desideri'} voceDestinazione
 * @returns {'essenziale'|'discrezionale'|null}
 */
export const essenzialitaPerSpostamento = (categoria, voceDestinazione) => {
  const catalogoNeiBisogni = categoria.essenzialita_catalogo === 'essenziale';
  if (voceDestinazione === 'bisogni') {
    return categoria.predefinita && catalogoNeiBisogni ? null : 'essenziale';
  }
  return categoria.predefinita && categoria.essenzialita_catalogo && !catalogoNeiBisogni ? null : 'discrezionale';
};

/** Vero solo per un piano con esattamente le tre voci, ciascuna un intero
 * da 0 a 100, che sommano a 100: lo stesso controllo del server. */
export const percentualiValide = (percentuali) => {
  if (!percentuali || typeof percentuali !== 'object') return false;
  const chiavi = Object.keys(percentuali);
  if (chiavi.length !== VOCI.length || !VOCI.every((v) => chiavi.includes(v))) return false;
  const valori = VOCI.map((v) => percentuali[v]);
  if (!valori.every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) return false;
  return valori.reduce((a, b) => a + b, 0) === 100;
};
