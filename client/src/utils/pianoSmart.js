/**
 * Vocabolario di Piano Smart lato client: il gemello di
 * `server/constants/pianoSmart.js`.
 *
 * Esiste per lo stesso motivo di `utils/categorie.js` rispetto a
 * `constants/categorie.js` (Coding Rule 15): i valori degli enum viaggiano
 * nell'API, quindi client e server devono concordare esattamente, e un elenco
 * scritto in linea in una view è un elenco che divergerà.
 *
 * Prima di questa integrazione la view mandava al backend etichette da
 * interfaccia — `sourceType: 'Regalo'`, `status: 'completato'` — e ogni
 * chiamata tornava 400. Qui i valori dell'API e le etichette da mostrare
 * restano due cose distinte e collegate.
 *
 * IL BACKEND RESTA L'AUTORITÀ. Niente in questo file calcola un piano, una
 * percentuale o una fascia: sono solo nomi, ordine e traduzioni.
 */

/** Ordine fisso delle cinque categorie: è quello in cui il backend le
 * restituisce, e coincide con il suo spareggio deterministico. */
export const CATEGORIE_PIANO = Object.freeze(['needs', 'safety', 'goals', 'future', 'freedom']);

/** Categoria API → id del concetto nel glossario (Coding Rule 18: le
 * etichette dei concetti finanziari si leggono, non si scrivono in linea). */
export const CATEGORIA_CONCETTO = Object.freeze({
  needs: 'piano_smart_needs',
  safety: 'piano_smart_safety',
  goals: 'piano_smart_goals',
  future: 'piano_smart_future',
  freedom: 'piano_smart_freedom',
});

/**
 * Origini ammesse per la somma in ingresso. I `value` sono esattamente
 * `SOURCE_TYPES` del backend (che a sua volta riusa il vocabolario delle
 * nature di entrata): qualunque altro valore viene rifiutato con 400.
 *
 * `ricorrentePerDefault` propone una risposta alla domanda sulla ricorrenza,
 * senza deciderla: `recurring` resta una scelta esplicita dell'utente, perché
 * cambia la ripartizione e il backend non lo indovina.
 */
export const ORIGINI_SOMMA = Object.freeze([
  { value: 'stipendio', label: 'Stipendio', ricorrentePerDefault: true },
  { value: 'pensione', label: 'Pensione', ricorrentePerDefault: true },
  { value: 'compenso', label: 'Compenso o fattura', ricorrentePerDefault: false },
  { value: 'bonus', label: 'Bonus o premio', ricorrentePerDefault: false },
  { value: 'regalo', label: 'Regalo', ricorrentePerDefault: false },
  { value: 'rimborso', label: 'Rimborso', ricorrentePerDefault: false },
  { value: 'vendita', label: 'Vendita', ricorrentePerDefault: false },
  { value: 'altro', label: 'Altro', ricorrentePerDefault: false },
]);

/** Stati del piano: valore API → etichetta. */
export const STATI_PIANO = Object.freeze({
  draft: 'Bozza',
  active: 'Attivo',
  completed: 'Completato',
  archived: 'Archiviato',
});

/**
 * Transizioni ammesse, rispecchiate dal backend.
 *
 * Serve solo a non mostrare un pulsante che tornerebbe 400: la regola resta
 * applicata dal server (`TRANSIZIONI_STATO` in `constants/pianoSmart.js`), qui
 * si decide soltanto cosa disegnare. Cambiando quelle del backend va aggiornato
 * anche questo elenco.
 */
export const TRANSIZIONI_STATO = Object.freeze({
  draft: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
});

/** Verbo da mettere sul pulsante che porta a quello stato. */
export const AZIONE_STATO = Object.freeze({
  active: 'Attiva',
  completed: 'Completa',
  archived: 'Archivia',
});

/**
 * Importo monetario dell'API (stringa decimale, es. `"800.00"`) → centesimi
 * interi.
 *
 * Tutti i confronti di denaro nel client passano da qui. Il motivo è lo stesso
 * per cui il backend serializza stringhe: confrontare `800.00` con la somma di
 * cinque float produce prima o poi un residuo di mezzo centesimo, e il
 * pulsante "Salva" si bloccherebbe senza che l'utente capisca perché.
 *
 * `null` per ciò che non è un importo, così un campo assente non diventa zero.
 */
export const importoInCentesimi = (valore) => {
  if (valore === null || valore === undefined || valore === '') return null;
  const numero = Number(String(valore).replace(',', '.'));
  if (!Number.isFinite(numero)) return null;
  return Math.round(numero * 100);
};

/** Centesimi interi → stringa decimale nel formato che l'API accetta. */
export const centesimiInImporto = (centesimi) => {
  if (!Number.isFinite(centesimi)) return null;
  const segno = centesimi < 0 ? '-' : '';
  const assoluti = Math.abs(Math.round(centesimi));
  return `${segno}${Math.trunc(assoluti / 100)}.${String(assoluti % 100).padStart(2, '0')}`;
};

/** Formattazione in euro per la lettura. Accetta stringhe decimali dell'API,
 * numeri e `null` (che diventa un trattino, non "0,00 €": un dato assente non
 * è uno zero). */
export const formattaEuro = (valore) => {
  const centesimi = importoInCentesimi(valore);
  if (centesimi === null) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
    .format(centesimi / 100);
};

/** Etichetta di una percentuale che il backend può restituire `null` (capitale
 * allocabile zero: una percentuale di zero non esiste). */
export const formattaPercentuale = (valore) => (Number.isFinite(Number(valore)) && valore !== null
  ? `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(Number(valore))}%`
  : '—');
