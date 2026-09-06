/**
 * Catalogo statico dei contenuti di aiuto (italiano).
 *
 * Regole:
 * - solo testo semplice: niente HTML arbitrario, niente v-html;
 * - nessun dato finanziario, nessun token, nessuna dipendenza da API;
 * - gli id sono stabili: vengono usati da HelpTrigger, HelpPanel e AiutoView.
 *
 * I testi descrivono il comportamento reale dell'app (saldi, trasferimenti,
 * ricorrenze mensili, modalità di importazione, contributi agli obiettivi).
 */

const TOPICS = [
  {
    id: 'primi-passi',
    title: 'Da dove si comincia',
    summary: 'Aggiungi un conto, poi registra una spesa oppure importa un estratto.',
    paragraphs: [
      'WALLT non si collega alla tua banca: i dati li inserisci tu, a mano oppure importando un estratto conto.',
      'Il percorso più breve è: crea un conto, poi registra un movimento o importa un file della banca. Budget, obiettivi e analisi sono passaggi facoltativi che diventano utili quando ci sono già dei movimenti.',
    ],
    bullets: [
      'Non serve creare movimenti finti per provare l\'app.',
      'Puoi nascondere il riquadro "Primi passi" e ritrovare questa guida in Aiuto.',
    ],
    link: { label: 'Apri I miei conti', to: '/conti' },
  },
  {
    id: 'conti-cosa-sono',
    title: 'Che cos\'è un conto',
    summary: 'Qui registri i soldi che vuoi monitorare. WALLT non collega automaticamente la tua banca.',
    paragraphs: [
      'Un conto è un contenitore contabile dentro WALLT: un conto corrente, una carta, i contanti, un wallet digitale o un conto di risparmio.',
      'Creare un conto non attiva nessun collegamento con la banca e non scarica nessun movimento. Serve a sapere su quale “tasca” registrare entrate e uscite.',
    ],
    bullets: [
      'Puoi avere più conti e spostarci sopra i movimenti in qualsiasi momento.',
      'Eliminare un conto lo nasconde dall\'app: i movimenti collegati restano nello storico.',
    ],
    link: { label: 'Apri I miei conti', to: '/conti' },
  },
  {
    id: 'conti-saldo-iniziale',
    title: 'Il saldo iniziale',
    summary: 'È il punto di partenza del conto: da lì in poi ogni movimento lo aggiorna.',
    paragraphs: [
      'Il saldo iniziale è la cifra che il conto ha nel momento in cui lo crei. Ogni entrata lo aumenta, ogni uscita lo diminuisce.',
      'Se pensi di importare subito l\'estratto conto completo, tienilo presente: importando con l\'aggiornamento del saldo, il saldo viene ricalcolato e il valore iniziale non viene sommato.',
    ],
    related: ['import-modalita-saldo'],
  },
  {
    id: 'trasferimenti',
    title: 'Spostare soldi tra due conti',
    summary: 'Usalo per spostamenti fra due tuoi conti registrati in WALLT. Non viene conteggiato come spesa o entrata.',
    paragraphs: [
      'Il trasferimento sposta un importo da un tuo conto a un altro: il primo si riduce, il secondo aumenta, e il totale del patrimonio resta lo stesso.',
      'Per questo un trasferimento non compare tra le spese né tra le entrate del mese, e non entra nel budget.',
      'Servono due conti diversi. Se stai invece mandando soldi a un\'altra persona (bonifico, pagamento tra amici), quella è un\'uscita: registrala come movimento con la categoria "Trasferimento denaro".',
    ],
  },
  {
    id: 'movimento-registrare',
    title: 'Registrare un\'entrata o un\'uscita',
    summary: 'Scegli il conto su cui registrare l\'entrata o l\'uscita. Il salvataggio aggiorna il suo saldo.',
    paragraphs: [
      'Un movimento ha sempre un importo, una categoria, un conto e una data. Il conto è la parte che conta di più: al salvataggio il suo saldo viene aggiornato subito.',
      'La categoria serve per budget e analisi. Se non sei sicuro puoi cambiarla in seguito riaprendo il movimento.',
    ],
    bullets: [
      'Le note sono facoltative e servono solo a te per riconoscere il movimento.',
      'Puoi modificare o eliminare un movimento: il saldo del conto viene ricalcolato di conseguenza.',
    ],
  },
  {
    id: 'movimento-ricorrenza',
    title: 'Movimenti ricorrenti',
    summary: 'La ricorrenza disponibile è mensile.',
    paragraphs: [
      'Segnando un movimento come ricorrente, WALLT lo ripete ogni mese nel giorno che indichi: è pensato per affitto, abbonamenti e bollette a importo fisso.',
      'La sola frequenza gestita è quella mensile. Non esistono ricorrenze giornaliere, settimanali o annuali.',
    ],
  },
  {
    id: 'movimenti-pagina',
    title: 'La pagina Movimenti',
    summary: 'Filtri per periodo, tipo, categoria e conto: quello che vedi dipende dai filtri attivi.',
    paragraphs: [
      'La lista mostra i movimenti raggruppati per giorno, nel periodo selezionato in alto. Di default il periodo è il mese corrente.',
      'Se la lista è vuota, controlla prima i filtri: potrebbe non esserci nulla in quel periodo o in quella categoria, pur avendo movimenti in altri mesi.',
    ],
    link: { label: 'Vai ai Movimenti', to: '/movimenti' },
  },
  {
    id: 'import-come-funziona',
    title: 'Importare un estratto conto',
    summary: 'Carichi un file della banca, controlli l\'anteprima e confermi.',
    paragraphs: [
      'Puoi caricare un file CSV o Excel scaricato dalla tua banca (massimo 5 MB). I PDF non sono supportati: dall\'home banking scegli l\'esportazione in CSV o Excel. Serve almeno un conto già creato: le transazioni vengono registrate su un conto WALLT.',
      'Prima di scrivere qualsiasi cosa, WALLT mostra un\'anteprima: per ogni riga puoi cambiare conto, categoria e merchant. Le righe già presenti vengono segnate come duplicate e saltate.',
      'Le righe incomplete (senza conto o senza categoria) non vengono importate: il numero di righe pronte è indicato sopra il pulsante di conferma.',
    ],
    link: { label: 'Vai a Importa', to: '/importa' },
  },
  {
    id: 'import-modalita-saldo',
    title: 'Le due modalità di importazione',
    summary: 'Puoi importare i soli movimenti oppure importare e ricalcolare il saldo del conto.',
    paragraphs: [
      '"Importa solo movimenti" aggiunge le transazioni e lascia il saldo del conto esattamente com\'è. È la scelta giusta se il saldo che vedi in WALLT è già corretto.',
      '"Importa movimenti e aggiorna saldo" ricalcola il saldo: se l\'estratto contiene il saldo finale (per esempio quello di Revolut) viene usato quel valore, altrimenti il saldo diventa la somma delle entrate e delle uscite registrate su quel conto.',
      'Attenzione: questa seconda modalità non somma le nuove operazioni al saldo attuale. Nel calcolo alternativo non rientrano né il saldo iniziale né i trasferimenti, quindi importando solo una parte dell\'estratto il risultato può non corrispondere al saldo reale della banca.',
    ],
    bullets: [
      'Nel dubbio scegli "solo movimenti" e correggi il saldo a mano.',
      'La modalità si sceglie nella finestra di conferma, prima di importare.',
    ],
  },
  {
    id: 'dashboard-riepilogo',
    title: 'Il riepilogo in Home',
    summary: 'Le schede in alto si scorrono lateralmente: ognuna mostra un dato diverso.',
    paragraphs: [
      'Le schede del riepilogo si scorrono con un gesto laterale (o trascinando col mouse): patrimonio, budget del mese, entrate e uscite di oggi, obiettivi.',
      'Il patrimonio totale è la somma dei saldi dei tuoi conti attivi, più gli investimenti se hai attivato quella sezione. Non è un dato letto dalla banca: riflette solo quello che hai registrato in WALLT.',
      'Entrate e uscite di oggi riguardano la sola giornata corrente; il budget riguarda il mese corrente.',
    ],
  },
  {
    id: 'budget-come-funziona',
    title: 'Come funziona il budget',
    summary: 'Un tetto di spesa mensile per categoria, facoltativo.',
    paragraphs: [
      'Il budget si imposta mese per mese: decidi quanto vuoi spendere in ogni categoria e WALLT confronta quel tetto con le uscite già registrate.',
      'Solo entrate e uscite entrano nel calcolo: i trasferimenti tra i tuoi conti non consumano il budget.',
      'Il budget è facoltativo. Serve a controllare le spese, non è necessario per registrare movimenti.',
    ],
    link: { label: 'Vai al Budget', to: '/budget' },
  },
  {
    id: 'obiettivi-contributi',
    title: 'Obiettivi e contributi',
    summary: 'Aggiungi soldi aggiorna il progresso di questo obiettivo. Non sposta denaro e non modifica il saldo dei conti.',
    paragraphs: [
      'Un obiettivo è un traguardo di risparmio: un importo da raggiungere, eventualmente entro una data.',
      'Il pulsante per aggiungere soldi registra un contributo e fa avanzare la barra di progresso. È una nota di avanzamento: nessun conto viene toccato e nessun movimento viene creato.',
      'Se vuoi che il denaro si muova davvero tra i tuoi conti, registra anche un trasferimento.',
    ],
    link: { label: 'Vai agli Obiettivi', to: '/obiettivi' },
  },
  {
    id: 'analisi-come-funziona',
    title: 'Come leggere le Analisi',
    summary: 'Grafici costruiti sui movimenti che hai registrato, nel periodo scelto.',
    paragraphs: [
      'Le analisi riassumono i movimenti già presenti in WALLT: distribuzione delle spese per categoria, confronto tra mesi e andamento del patrimonio.',
      'Se una sezione appare vuota può voler dire che in quel periodo non ci sono movimenti registrati, non che i dati siano andati persi. Cambiando periodo o registrando nuovi movimenti i grafici si aggiornano.',
    ],
    link: { label: 'Vai alle Analisi', to: '/analisi' },
  },
];

/** Mappa id → argomento, per accessi diretti. */
export const HELP_TOPICS = TOPICS.reduce((acc, topic) => {
  acc[topic.id] = topic;
  return acc;
}, {});

/** Elenco ordinato di tutti gli argomenti. */
export const HELP_TOPIC_LIST = TOPICS;

/** Argomento per id, o null se l'id non esiste. */
export const getHelpTopic = (id) => (id && HELP_TOPICS[id]) || null;

/** Sezioni della pagina Aiuto, organizzate per attività. */
export const HELP_SECTIONS = [
  {
    id: 'iniziare',
    title: 'Per iniziare',
    description: 'Il percorso minimo per avere numeri veri in WALLT.',
    topics: ['primi-passi', 'conti-cosa-sono', 'conti-saldo-iniziale'],
  },
  {
    id: 'movimenti',
    title: 'Movimenti e trasferimenti',
    description: 'Registrare entrate e uscite, spostare soldi tra i tuoi conti.',
    topics: ['movimento-registrare', 'movimento-ricorrenza', 'trasferimenti', 'movimenti-pagina'],
  },
  {
    id: 'importazione',
    title: 'Importare un estratto conto',
    description: 'Caricare un file della banca senza sorprese sul saldo.',
    topics: ['import-come-funziona', 'import-modalita-saldo'],
  },
  {
    id: 'strumenti',
    title: 'Home, budget, obiettivi e analisi',
    description: 'Come leggere i riepiloghi e cosa fanno davvero i pulsanti.',
    topics: ['dashboard-riepilogo', 'budget-come-funziona', 'obiettivi-contributi', 'analisi-come-funziona'],
  },
];
