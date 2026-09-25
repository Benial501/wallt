/**
 * Glossario dei concetti finanziari mostrati all'utente.
 *
 * Nasce da un difetto concreto: lo stesso numero aveva tre nomi diversi.
 * "Saldo del conto" nella dashboard, "Patrimonio totale" nella pagina Conti
 * e "Patrimonio Totale" in un componente non usato — tutti e tre erano conti
 * più investimenti. Chi confrontava due pagine trovava definizioni in
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
      'Tutto quello che hai registrato in WALLT: i saldi dei conti attivi più il valore attuale degli investimenti.',
    formula: 'conti attivi + investimenti attivi',
    origine: 'GET /conti/patrimonio → totale',
    topic: 'patrimonio-come-si-calcola',
  },
  {
    id: 'saldo_effettivo',
    etichetta: 'Saldo effettivo',
    descrizione:
      'Quanto puoi spendere davvero: i saldi dei conti che non hai nascosto, meno il denaro già destinato agli obiettivi e le spese che hai in arrivo.',
    formula: 'conti non nascosti − obiettivi non completati − impegni in arrivo',
    origine: 'GET /conti/patrimonio → saldo_effettivo',
    topic: 'saldo-effettivo-come-si-calcola',
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
      'Quanto è entrato meno quanto è uscito nel mese. Gli spostamenti fra due tuoi conti non contano né come entrata né come uscita.',
    formula: 'entrate − uscite, trasferimenti esclusi',
    origine: 'GET /movimenti/bilancio → saldo',
  },

  // --- Le cinque categorie di Piano Smart --------------------------------
  // Sono i nomi che l'utente legge sopra gli importi proposti. Le chiavi
  // dell'API restano in inglese (`needs`, `safety`, …) e la traduzione passa
  // da `utils/pianoSmart.js`: qui vive il significato, lì la corrispondenza.
  {
    id: 'piano_smart_needs',
    etichetta: 'Necessità',
    descrizione:
      'La parte della somma che serve a coprire ciò che devi affrontare adesso: spese fisse, bollette, spesa quotidiana.',
    origine: 'POST /piano-smart/preview → allocations[category=needs]',
  },
  {
    id: 'piano_smart_safety',
    etichetta: 'Sicurezza',
    descrizione:
      'La riserva per gli imprevisti. Se hai un obiettivo di tipo fondo di sicurezza, questa quota non supera mai quanto ti manca per completarlo.',
    origine: 'POST /piano-smart/preview → allocations[category=safety]',
  },
  {
    id: 'piano_smart_goals',
    etichetta: 'Obiettivi',
    descrizione:
      'Quanto va ai tuoi obiettivi attivi, divisi per priorità e scadenza. Nessun obiettivo riceve più di quanto gli manchi, e quelli già completati non ricevono nulla.',
    origine: 'POST /piano-smart/preview → allocations[category=goals]',
  },
  {
    id: 'piano_smart_future',
    etichetta: 'Futuro',
    descrizione:
      'La parte messa da parte per il lungo periodo, oltre gli imprevisti e gli obiettivi che hai già fissato. WALLT non suggerisce dove investirla.',
    origine: 'POST /piano-smart/preview → allocations[category=future]',
  },
  {
    id: 'piano_smart_freedom',
    etichetta: 'Libertà',
    descrizione:
      'Quello che resta a tua disposizione, senza vincoli. Serve a rendere il piano sostenibile: un piano che non lascia niente viene abbandonato.',
    origine: 'POST /piano-smart/preview → allocations[category=freedom]',
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
