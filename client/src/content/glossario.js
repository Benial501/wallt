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
    id: 'fondo_emergenza',
    etichetta: 'Fondo di emergenza',
    descrizione:
      'Un conto separato in cui tenere una riserva per gli imprevisti. Resta nel tuo patrimonio ma sta fuori dai soldi spendibili, e il denaro vi entra ed esce solo con un trasferimento fra i tuoi conti.',
    origine: 'GET /fondo-emergenza → importo',
  },
  {
    id: 'mesi_copertura',
    etichetta: 'Mesi di copertura',
    descrizione:
      'Per quanti mesi il fondo coprirebbe le tue spese essenziali se le entrate si fermassero. Si calcola sulla media dei mesi di calendario completi: il mese in corso non entra.',
    formula: 'fondo ÷ media mensile delle spese essenziali',
    origine: 'GET /fondo-emergenza → copertura.mesi_copertura',
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
      'La riserva per gli imprevisti. Se hai un fondo di emergenza, questa quota non supera mai quanto ti manca per raggiungere la sua soglia.',
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
    id: 'saldo_sincronizzato',
    etichetta: 'Saldo sincronizzato',
    descrizione:
      'Il saldo che la tua banca dichiara per il conto collegato. Per un conto sincronizzato è questo il dato autorevole, non la somma dei movimenti: WALLT importa gli ultimi 90 giorni, quindi la somma delle righe non coprirebbe tutta la storia del conto.',
    origine: 'GET /bank-sync/status → connessione.saldo',
  },
  {
    id: 'ultima_sincronizzazione',
    etichetta: 'Ultimo aggiornamento',
    descrizione:
      "L'ultima volta in cui WALLT ha letto con successo i dati dalla tua banca. Un tentativo fallito non cambia questa data: serve a sapere a quale momento si riferisce il saldo che stai guardando.",
    origine: 'GET /bank-sync/status → connessione.ultima_sincronizzazione',
  },
  {
    id: 'piano_smart_freedom',
    etichetta: 'Libertà',
    descrizione:
      'Quello che resta a tua disposizione, senza vincoli. Serve a rendere il piano sostenibile: un piano che non lascia niente viene abbandonato.',
    origine: 'POST /piano-smart/preview → allocations[category=freedom]',
  },

  // --- L'orizzonte di spesa di Piano Smart --------------------------------
  // Il ciclo mensile di sempre, oppure una data entro cui il capitale deve
  // bastare: GET /piano-smart-v2/current-situation → horizon ha la stessa
  // forma in entrambi i casi.
  {
    id: 'budget_giornaliero',
    etichetta: 'Puoi spendere oggi',
    descrizione:
      'Quanto puoi spendere oggi perché il capitale basti fino al termine che hai scelto. Si ricalcola ogni giorno su quello che ti resta davvero: se ieri hai speso meno, oggi puoi spendere di più.',
    formula: 'capitale libero ÷ giorni rimanenti',
    origine: 'GET /piano-smart-v2/current-situation → horizon.budgetGiornaliero',
    topic: 'orizzonte-di-spesa',
  },
  {
    id: 'capitale_libero',
    etichetta: 'Capitale libero',
    descrizione:
      'I soldi dei conti che puoi davvero distribuire sui giorni: i conti attivi non nascosti, meno quanto hai già accantonato sugli obiettivi, meno gli impegni fino al termine scelto e, nel ciclo mensile con entrate irregolari, meno la riserva prudenziale ancora da coprire. Il fondo di emergenza non è compreso.',
    formula: 'conti spendibili − obiettivi accantonati − impegni fino al termine − riserva prudenziale',
    origine: 'GET /piano-smart-v2/current-situation → horizon.capitaleLibero',
    topic: 'orizzonte-di-spesa',
  },
  {
    id: 'impegni_orizzonte',
    etichetta: 'Impegni fino al termine',
    descrizione:
      'Le uscite che sai già di dover sostenere entro il termine scelto: ricorrenze e spese programmate. Vengono messe da parte prima di calcolare quanto puoi spendere al giorno, così una bolletta non azzera il budget il giorno in cui scade. Non comprende la riserva prudenziale, che ha una riga propria.',
    formula: 'ricorrenze + spese programmate con scadenza entro il termine',
    origine: 'GET /piano-smart-v2/current-situation → horizon.impegniFinoA',
    topic: 'orizzonte-di-spesa',
  },
  {
    id: 'riserva_orizzonte',
    etichetta: 'Riserva prudenziale',
    descrizione:
      'Quanto lasci da parte, oltre agli impegni già previsti, per i mesi di spese essenziali che hai scelto come cuscinetto. Si applica solo nel ciclo mensile, con entrate irregolari, e non supera mai quanto ti manca per raggiungere la soglia scelta.',
    formula: 'spese essenziali mensili × mesi di riserva scelti − fondo di emergenza già disponibile',
    origine: 'GET /piano-smart-v2/current-situation → horizon.riservaFinoA',
    topic: 'orizzonte-di-spesa',
  },
  {
    id: 'ritmo_attuale',
    etichetta: 'Ritmo attuale',
    descrizione:
      'Quanto stai spendendo in media al giorno in spese libere, cioè escluse le ricorrenze. Confrontato col budget dice se stai sopra o sotto; da solo non è un limite.',
    formula: 'spese libere del periodo osservato ÷ giorni osservati',
    origine: 'GET /piano-smart-v2/current-situation → current.actualDailySpend',
    topic: 'orizzonte-di-spesa',
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
