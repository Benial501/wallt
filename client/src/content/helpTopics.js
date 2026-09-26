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
      'Per questo un trasferimento non compare tra le spese né tra le entrate del mese. L\'unica eccezione è il budget delle scommesse: i depositi su una piattaforma di gioco sono trasferimenti, ma restano conteggiati nel limite mensile che hai impostato.',
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
    summary: 'Una ricorrenza è una regola: il movimento lo registra WALLT a ogni scadenza.',
    paragraphs: [
      'Segnando un movimento come ricorrente crei una regola, pensata per affitto, abbonamenti e bollette a importo fisso. Il movimento vero lo registra WALLT a ogni scadenza, ed è in quel momento che il saldo del conto cambia: salvare la regola non addebita nulla subito, nemmeno se la scadenza è oggi.',
      'Il controllo passa una volta al giorno. Per una ricorrenza mensile, se il giorno del mese è già passato quando crei la regola, il primo addebito arriva al controllo successivo senza saltare il mese.',
      'Intanto l\'uscita è già visibile in home nel saldo effettivo, come impegno: il denaro è ancora sul conto, ma sai che è promesso.',
      'Puoi ripetere il movimento ogni mese, ogni settimana o ogni anno. Dalla pagina Ricorrenti puoi anche programmare un\'uscita una sola volta, in una data precisa.',
    ],
  },
  {
    id: 'ricorrenti-gestione',
    title: 'Gestire i movimenti ricorrenti',
    summary: 'Controlla le ricorrenze mensili, la prossima esecuzione e il conto coinvolto.',
    paragraphs: [
      'La pagina Ricorrenti raccoglie in un solo posto i movimenti mensili già configurati. Per ciascuno mostra importo, conto, giorno del mese e prossima esecuzione prevista.',
      'Puoi modificare i dati della ricorrenza, sospenderla o terminarla. Una ricorrenza sospesa o terminata non viene più addebitata e smette di pesare sul saldo effettivo: sospendila per fermarla senza perderne lo storico, e riprendila quando ti servirà di nuovo. Riprendendola non arrivano arretrati.',
      'Se il giorno scelto non esiste in un mese, la prossima esecuzione cade nell\'ultimo giorno disponibile di quel mese.',
    ],
    link: { label: 'Vai a Ricorrenti', to: '/ricorrenti' },
    related: ['movimento-ricorrenza'],
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
    id: 'filtrare-i-movimenti',
    title: 'Come trovare un movimento',
    summary: 'Combina ricerca, periodo, conto, categoria e ordinamento per restringere la lista.',
    paragraphs: [
      'I pulsanti in alto filtrano per tipo: entrate, uscite o trasferimenti. Le categorie recenti sono quelle che hai usato di più negli ultimi movimenti.',
      'Il pannello "Filtri" apre tutto il resto: la ricerca nella descrizione, il periodo, il conto, la categoria e l\'ordinamento. Puoi ordinare per importo quando cerchi la spesa più grande di un mese.',
      'I filtri che hai scelto compaiono sotto i pulsanti e si tolgono uno alla volta. "Azzera filtri" li rimuove tutti insieme.',
      'I filtri restano mentre navighi nell\'app e si azzerano quando esci: non vengono salvati sul tuo dispositivo.',
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
    id: 'patrimonio-come-si-calcola',
    title: 'Come si calcola il patrimonio',
    summary: 'Patrimonio totale = saldi dei conti attivi + valore attuale degli investimenti.',
    paragraphs: [
      'Il "Patrimonio totale" della home somma due cose: i saldi di tutti i tuoi conti attivi e il valore attuale dei tuoi investimenti. Sotto la cifra trovi la composizione, così vedi sempre quanta parte è su conti e quanta è investita.',
      'Dentro "Conti" c\'è ogni conto che hai registrato come attivo: conto corrente, contanti, wallet, risparmio e anche le piattaforme di scommesse. Non è quindi la cifra che puoi spendere domani, ma tutto il denaro che tieni tracciato in WALLT.',
      'I trasferimenti fra due tuoi conti non cambiano il patrimonio: spostano denaro da una tasca all\'altra, quindi non sono né entrate né uscite e non compaiono nel risultato del mese.',
    ],
    bullets: [
      'Un conto eliminato non entra più nel totale: i suoi movimenti restano però nello storico.',
      'Il "Risultato del mese" è entrate meno uscite, senza i trasferimenti.',
    ],
    related: ['trasferimenti', 'dashboard-riepilogo', 'saldo-effettivo-come-si-calcola'],
  },
  {
    id: 'saldo-effettivo-come-si-calcola',
    title: 'Come si calcola il saldo effettivo',
    summary: 'Saldo effettivo = conti non nascosti − soldi già su obiettivi − spese in arrivo.',
    paragraphs: [
      'Il "Patrimonio totale" dice quanto possiedi. Il "Saldo effettivo", mostrato subito sotto, dice quanto puoi spendere davvero: di solito è più basso, ed è normale che lo sia.',
      'Un conto che hai nascosto resta nel patrimonio, ma esce dal saldo effettivo: se non lo vedi in giro non lo consideri disponibile, quindi WALLT non te lo conta come spendibile.',
      'I soldi che hai già messo su un obiettivo non completato sono tolti anche loro: sono destinati a quello scopo, non sono liberi per altro.',
      'Vengono scalate anche le spese che sai già arrivare: le ricorrenti di questo mese non ancora addebitate e le spese programmate entro i prossimi 30 giorni, anche se il pagamento non è ancora avvenuto.',
    ],
    related: ['patrimonio-come-si-calcola'],
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
      'Le analisi riassumono i movimenti già presenti in WALLT: distribuzione di spese ed entrate per categoria, confronto tra mesi e andamento del patrimonio.',
      'Il selettore in alto sceglie il periodo: settimana, mese, trimestre, anno oppure un intervallo di date a tua scelta. Vale sia per le spese sia per le entrate, così puoi vedere quanto hai speso e incassato in questa settimana senza aspettare la fine del mese. La settimana parte da lunedì e arriva a oggi.',
      'Se una sezione appare vuota può voler dire che in quel periodo non ci sono movimenti registrati, non che i dati siano andati persi. Cambiando periodo o registrando nuovi movimenti i grafici si aggiornano.',
    ],
    link: { label: 'Vai alle Analisi', to: '/analisi' },
  },
  {
    id: 'categorie-creare',
    title: 'Creare una categoria tua',
    summary: 'Se nessuna categoria predefinita descrive bene una spesa, puoi aggiungerne una.',
    paragraphs: [
      'WALLT parte con un elenco di categorie già pronte, ma non deve andarti bene per forza. Da Impostazioni → Categorie, il pulsante "Nuova categoria" ne aggiunge una tua: le servono un nome, il verso (entrata o uscita), un\'icona e un colore.',
      'Il verso è la parte che conta: una categoria di uscita compare solo quando registri una spesa, una di entrata solo quando registri un\'entrata. Puoi cambiarlo in seguito, ma non dopo che la categoria è stata usata da un movimento, da un budget o da una regola.',
      'Le tue categorie sono visibili solo a te e si usano esattamente come le predefinite: nei movimenti, nell\'importazione e nelle analisi.',
    ],
    bullets: [
      'Il nome non può coincidere con quello di una categoria predefinita dello stesso verso.',
      'Mano a mano che correggi la categoria dei movimenti, WALLT impara a proporla da solo per operazioni simili.',
    ],
    link: { label: 'Apri Categorie', to: '/impostazioni/categorie' },
    related: ['categorie-eliminare', 'movimento-registrare'],
  },
  {
    id: 'categorie-eliminare',
    title: 'Eliminare le categorie che non usi',
    summary: 'Puoi togliere dall\'elenco le categorie che non ti servono, comprese quelle predefinite. Lo storico non si tocca.',
    paragraphs: [
      'In Impostazioni → Categorie ogni categoria ha una casella di selezione: spuntane una o più e usa "Elimina selezionate". C\'è anche "Seleziona tutte le categorie mostrate", che tiene conto della ricerca e del verso che stai guardando, se vuoi fare pulizia in un colpo solo e tenere quasi solo le tue.',
      'Eliminare una categoria non cancella nulla di ciò che hai già registrato. I movimenti passati la conservano e continuano a comparire nelle analisi con il loro nome. Quello che cambia è il futuro: la categoria sparisce dagli elenchi quando registri un movimento, e WALLT smette di assegnarla da sola quando importi un estratto conto.',
      'Le categorie eliminate finiscono in fondo alla pagina, nella sezione "Eliminate", con il pulsante "Ripristina". Non è una scelta definitiva: puoi tornare indietro quando vuoi.',
    ],
    bullets: [
      'Alcune categorie sono marcate "Di sistema" e non si possono eliminare: WALLT le usa per registrare movimenti da solo, come il saldo iniziale di un conto o le operazioni non riconosciute durante un\'importazione.',
      'Se durante un\'importazione una spesa finiva in una categoria che hai eliminato, ora arriva come "Non categorizzata" e sei tu a scegliere dove metterla.',
    ],
    link: { label: 'Apri Categorie', to: '/impostazioni/categorie' },
    related: ['categorie-creare', 'import-come-funziona'],
  },
  {
    id: 'funzionalita-navigazione',
    title: 'Trovare tutte le funzionalità',
    summary: 'Su computer sono nella barra laterale; su mobile nel menu Funzionalità.',
    paragraphs: [
      'Su schermi ampi le sezioni di WALLT sono raccolte nella barra laterale. Su mobile le destinazioni principali restano in basso e il pulsante “Funzionalità” apre l\'elenco completo.',
      'Le due navigazioni mostrano le stesse sezioni disponibili per il tuo profilo, comprese Ricorrenti, Notifiche e Impostazioni.',
    ],
    link: { label: 'Resta in Aiuto', to: '/aiuto' },
  },
  {
    id: 'notifiche-aggiornamento',
    title: 'Aggiornare le notifiche',
    summary: 'Un errore di connessione non cancella le notifiche già caricate.',
    paragraphs: [
      'La pagina Notifiche distingue chiaramente il caricamento, l\'assenza di elementi e un problema di connessione. In caso di errore puoi usare “Riprova” senza cambiare pagina.',
      'Se erano già presenti notifiche, restano visibili mentre WALLT segnala che l\'aggiornamento non è riuscito. La lettura e l\'eliminazione riprendono normalmente quando la connessione torna disponibile.',
    ],
    link: { label: 'Vai alle Notifiche', to: '/notifiche' },
  },
  {
    id: 'piano-smart',
    title: 'Piano Smart',
    summary: 'Capisci cosa sta succedendo ai tuoi soldi e organizza le prossime decisioni.',
    paragraphs: [
      'La Situazione attuale è il punto di partenza: mostra quanto puoi spendere oggi, cosa devi ancora proteggere, il ritmo delle tue spese e una stima di come potresti arrivare a fine mese.',
      'Puoi leggere le prossime uscite, i suggerimenti di WALLT e la direzione finanziaria con patrimonio, debiti e obiettivi. I valori osservati sono distinti dalle stime e gli avvisi spiegano quando i dati non bastano per una previsione affidabile.',
      'Prima di un acquisto puoi usare “Prima di spendere”: inserisci un importo e WALLT mostra come cambierebbero margine, limite giornaliero e previsione del mese. È una simulazione e non registra nessun movimento.',
      'Da “Crea piano” puoi organizzare una nuova entrata tra necessità, sicurezza, obiettivi, futuro e libertà. WALLT usa i dati che hai già inserito, può chiederti solo il contesto mancante e ti permette di modificare la proposta prima di salvarla.',
      'Piano Smart non sposta denaro, non aggiorna i saldi e non decide al posto tuo: serve a capire la situazione e a prendere decisioni più consapevoli.',
    ],
    link: { label: 'Apri Piano Smart', to: '/funzionalita/piano-smart' },
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
    topics: ['primi-passi', 'funzionalita-navigazione', 'conti-cosa-sono', 'conti-saldo-iniziale'],
  },
  {
    id: 'movimenti',
    title: 'Movimenti e trasferimenti',
    description: 'Registrare entrate e uscite, spostare soldi tra i tuoi conti.',
    topics: ['movimento-registrare', 'movimento-ricorrenza', 'ricorrenti-gestione', 'trasferimenti', 'movimenti-pagina', 'filtrare-i-movimenti'],
  },
  {
    id: 'categorie',
    title: 'Categorie',
    description: 'Adattare l\'elenco delle categorie a come spendi davvero.',
    topics: ['categorie-creare', 'categorie-eliminare'],
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
    topics: ['patrimonio-come-si-calcola', 'saldo-effettivo-come-si-calcola', 'dashboard-riepilogo', 'budget-come-funziona', 'obiettivi-contributi', 'analisi-come-funziona', 'piano-smart'],
  },
  {
    id: 'notifiche',
    title: 'Notifiche',
    description: 'Controllare gli aggiornamenti e riprovare dopo un problema di connessione.',
    topics: ['notifiche-aggiornamento'],
  },
];
