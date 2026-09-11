/**
 * Glossario dei concetti finanziari mostrati all'utente.
 *
 * Nasce da un difetto concreto: lo stesso numero aveva tre nomi diversi.
 * "Saldo del conto" nella dashboard, "Patrimonio totale" nella pagina Conti
 * e "Patrimonio Totale" in un componente non usato — tutti e tre erano conti
 * piu' investimenti. Chi confrontava due pagine trovava definizioni in
 * conflitto e non poteva sapere quale credere.
 *
 * Da qui in avanti l'etichetta si legge, non si scrive in linea. Aggiungere
 * un concetto significa aggiungerlo qui.
 *
 * Solo testo: nessun calcolo, nessuna dipendenza da API, nessun dato
 * finanziario. Il file deve restare leggibile anche a utente disconnesso.
 */

const CONCETTI = [
  {
    id: 'patrimonio_totale',
    etichetta: 'Patrimonio totale',
    descrizione:
      'Tutto quello che hai registrato in WALLT: i saldi dei conti attivi piu\' il valore attuale degli investimenti.',
    formula: 'conti attivi + investimenti attivi',
    origine: 'GET /conti/patrimonio → totale',
    topic: 'patrimonio-come-si-calcola',
  },
  {
    id: 'componente_conti',
    etichetta: 'Conti',
    descrizione:
      'La somma dei saldi di tutti i tuoi conti attivi, comprese le piattaforme di scommesse e i conti di risparmio.',
    formula: 'somma dei saldi dei conti attivi',
    origine: 'GET /conti/patrimonio → totale_conti',
  },
  {
    id: 'componente_investimenti',
    etichetta: 'Investimenti',
    descrizione: 'Il valore attuale dei tuoi investimenti attivi.',
    formula: 'somma del valore attuale degli investimenti attivi',
    origine: 'GET /conti/patrimonio → totale_investimenti',
  },
  {
    id: 'risultato_mese',
    etichetta: 'Risultato del mese',
    descrizione:
      'Quanto e\' entrato meno quanto e\' uscito nel mese. Gli spostamenti fra due tuoi conti non contano ne\' come entrata ne\' come uscita.',
    formula: 'entrate − uscite, trasferimenti esclusi',
    origine: 'GET /movimenti/bilancio → saldo',
  },
];

/** Mappa id → concetto, per accessi diretti. */
export const GLOSSARIO = CONCETTI.reduce((acc, concetto) => {
  acc[concetto.id] = concetto;
  return acc;
}, {});

/** Elenco ordinato di tutti i concetti. */
export const GLOSSARIO_LIST = CONCETTI;

/** Concetto per id, o null se l'id non esiste. */
export const getConcetto = (id) => (id && GLOSSARIO[id]) || null;

/** Etichetta da mostrare, o stringa vuota se l'id non esiste. */
export const etichetta = (id) => getConcetto(id)?.etichetta || '';
