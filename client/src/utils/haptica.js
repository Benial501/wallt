/**
 * Vibrazione breve sui gesti che cambiano qualcosa.
 *
 * Tre regole che tengono la cosa dalla parte del "si sente bene" invece che
 * del fastidio:
 *
 * 1. **Solo dove c'e' un esito**, mai a ogni tocco. Un movimento salvato, un
 *    errore, un'eliminazione confermata: momenti in cui il pollice sta gia'
 *    aspettando una risposta. Lo scorrimento di una lista o il cambio di una
 *    scheda non vibrano.
 * 2. **Durate brevissime.** Sopra i ~40 ms non si percepisce piu' come un
 *    riscontro ma come una suoneria.
 * 3. **Chi ha chiesto meno movimento non vibra.** `prefers-reduced-motion`
 *    riguarda il movimento in generale, e per molte persone la vibrazione e'
 *    esattamente cio' che si vuole evitare.
 *
 * `navigator.vibrate` non esiste su iOS Safari e non fa nulla sui desktop:
 * la funzione resta silenziosamente inerte, senza controlli sparsi altrove.
 */

const SCHEMI = {
  /** Qualcosa e' andato a buon fine: un colpo solo, asciutto. */
  successo: 12,
  /** Conferma di un gesto distruttivo: piu' corposo, si deve notare. */
  conferma: 20,
  /** Errore: due colpi, il ritmo che significa "no" senza bisogno di leggere. */
  errore: [14, 45, 14],
  /** Tocco leggero per un cambio di stato (un interruttore, una selezione). */
  tocco: 8,
};

const disponibile = () => typeof navigator !== 'undefined'
  && typeof navigator.vibrate === 'function';

const movimentoRidotto = () => typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Emette il riscontro tattile richiesto. Ritorna `true` solo se e' stato
 * davvero inviato al dispositivo: comodo nei test, inutile per chi chiama.
 */
export const vibra = (schema = 'tocco') => {
  if (!disponibile() || movimentoRidotto()) return false;
  const durata = SCHEMI[schema];
  if (durata === undefined) return false;
  try {
    return navigator.vibrate(durata);
  } catch {
    // Alcuni browser lanciano se la pagina non ha ancora avuto interazione.
    return false;
  }
};

export const SCHEMI_HAPTICA = SCHEMI;
