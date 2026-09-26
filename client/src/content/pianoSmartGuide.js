export const GUIDA_ESEMPIO = Object.freeze({
  totale: 2000,
  allocazioni: Object.freeze({ needs: 500, safety: 300, goals: 400, future: 300, freedom: 500 }),
});

export const calcolaTotaleEsempio = (allocazioni) => Object.values(allocazioni)
  .reduce((totale, valore) => totale + (Number(valore) || 0), 0);

export const GUIDA_PIANO_SMART = Object.freeze([
  {
    id: 'cos-e', titolo: 'A cosa serve Piano Smart',
    sottotitolo: 'Leggi la situazione, valuta una scelta e organizza una somma.',
    paragraphs: [
      'Piano Smart mette in ordine i dati che hai registrato per aiutarti a capire il margine di oggi, osservare come cambia nel tempo, simulare una spesa e preparare un piano collegato a una somma o a un obiettivo.',
      'Puoi esplorare Oggi, Analisi e Piani nell’ordine che preferisci. Le indicazioni descrivono dati e ipotesi: le decisioni restano tue e non sono consulenza finanziaria.',
      'Piano Smart non sposta denaro: le simulazioni e i piani non creano movimenti né aggiornano saldi o obiettivi.',
    ],
    limits: ['Non collega automaticamente i conti bancari.', 'Non sposta denaro e non crea movimenti durante letture o simulazioni.', 'Una previsione non garantisce il saldo futuro.'],
  },
  {
    id: 'oggi', titolo: 'Oggi: margine e somme protette',
    sottotitolo: 'Il limite giornaliero è indicativo e dipende dai giorni considerati.',
    paragraphs: [
      'Liquidità: saldo dei conti ordinari considerati. I conti nascosti e i conti scommesse sono esclusi dalla somma spendibile.',
      'Somme protette: importi già accantonati negli obiettivi e impegni ricorrenti compresi nel calcolo, più eventuali scadenze note entro fine mese. Lo spendibile è la liquidità allocabile dopo queste voci; un impegno già protetto non si sottrae una seconda volta.',
      'Limite indicativo al giorno = margine spendibile diviso per i giorni civili da oggi (incluso) a fine mese. Il ritmo giornaliero usa le uscite non ricorrenti registrate nel mese e i giorni osservabili. Il margine giornaliero confronta limite e ritmo.',
    ],
    example: 'Esempio: con 300 € spendibili e 10 giorni da oggi a fine mese, il limite indicativo è 30 € al giorno. È una divisione del margine, non una promessa di spesa sicura.',
  },
  {
    id: 'previsione', titolo: 'Previsione, qualità e avvisi',
    sottotitolo: 'Una stima basata sul ritmo osservato, con i suoi limiti visibili.',
    paragraphs: [
      'La previsione di fine mese parte dal margine dopo le somme protette e sottrae una proiezione delle spese non ricorrenti sul periodo residuo, usando il ritmo osservato nel mese. Oggi, giorno parziale, è incluso secondo la convenzione del calcolo.',
      'Gli scenari prudente, attuale e limite sono ipotesi deterministiche basate su ritmi diversi; non sono probabilità. Quando mancano movimenti osservabili, il valore è “non stimabile”, non zero.',
      '“Storico limitato” indica una base temporale breve; “dati insufficienti” indica che il valore non si può calcolare con i dati disponibili. WALLT non può verificare se hai registrato tutte le operazioni.',
    ],
  },
  {
    id: 'flussi', titolo: 'Prossime entrate e uscite',
    sottotitolo: 'Il calendario mostra soltanto ricorrenze attive conosciute.',
    paragraphs: [
      'La timeline mostra occorrenze ricorrenti note da oggi fino ai prossimi 30 giorni. Per ogni evento indica la data, il verso e il margine spendibile stimato dopo l’evento.',
      'Le entrate future non registrate come ricorrenze, le rate non collegate a una ricorrenza e gli altri eventi futuri non sono inclusi. Il margine dopo un evento non è il saldo del conto e non garantisce che l’addebito o l’incasso avvenga come previsto.',
    ],
  },
  {
    id: 'simulazione', titolo: 'Prima di spendere',
    sottotitolo: 'Confronta la situazione iniziale con quella dopo l’acquisto ipotizzato.',
    paragraphs: [
      'Inserisci un importo e avvia la simulazione. Il server ricalcola il confronto tra spendibile, limite giornaliero indicativo e previsione di fine mese. Un dato non disponibile resta indicato come tale.',
      'La simulazione considera l’acquisto come spesa aggiuntiva e non modifica movimenti, saldi o obiettivi. Non esegue pagamenti. La quota di margine coinvolta è una descrizione dell’impatto, non una misura di sostenibilità.',
      '“Entro il limite indicativo” significa che la spesa rientra nel limite giornaliero e non porta sotto zero la previsione disponibile. “Attenzione” indica che supera quel limite; “rischio” che il margine o la previsione diventano negativi. “Non stimabile” segnala che manca una delle basi necessarie. Impatto basso: fino al 20% del margine; moderato: oltre il 20% fino al 45%; alto: oltre il 45%.',
    ],
    example: 'Esempio: prova una spesa di 100 € nella schermata Oggi. Il risultato è illustrativo e usa i dati aggiornati al momento della richiesta.',
  },
  {
    id: 'analisi', titolo: 'Analisi: periodi, medie e patrimonio',
    sottotitolo: 'I confronti descrivono i movimenti registrati oggi.',
    paragraphs: [
      'Il confronto storico usa periodi consecutivi di uguale durata e mostra le date coperte. Entrate e uscite indicano movimenti registrati: il database non conserva fotografie quotidiane dei saldi, quindi WALLT non ricostruisce patrimonio o liquidità passati.',
      'Le medie settimanali e mensili per categoria usano periodi completi; il mese in corso e la settimana in corso non entrano nelle medie. Il risparmio medio storico è la differenza tra media mensile delle entrate e delle uscite sui mesi completi classificati dal servizio finanziario.',
      'Patrimonio netto = attività meno passività note. I debiti mostrano gli importi registrati e le rate dichiarate; le rate non vengono sottratte dal margine se non sono rappresentate anche da ricorrenze. Il fondo di sicurezza mostra importo, obiettivo e copertura quando stimabili.',
      'Per ogni obiettivo puoi leggere residuo, contributo mensile richiesto e un tempo teorico se esistono almeno tre mesi civili completi e un margine medio positivo. La stima considera un obiettivo per volta e non registra contributi.',
    ],
  },
  {
    id: 'piani', titolo: 'Creare e ritrovare i piani',
    sottotitolo: 'Indica la somma, le spese obbligatorie e il contesto che vuoi usare.',
    steps: [
      ['1', 'Dichiara la somma', 'Scegli importo e origine; indica se è occasionale o ricorrente.'],
      ['2', 'Considera gli obblighi', 'Le spese obbligatorie confermate vengono sottratte: capitale distribuibile = somma ricevuta − spese obbligatorie, con minimo zero. Le ricorrenze suggerite vanno controllate e confermate.'],
      ['3', 'Confronta e personalizza', 'La ripartizione V1 distingue necessità, sicurezza, obiettivi, futuro e libertà. Analisi evoluta V2 propone tre scenari, proiezioni e azioni preparatorie.'],
      ['4', 'Salva e ritrova', 'Scegli lo scenario V2 da salvare. Il dettaglio mostra la versione, lo scenario, le proiezioni e le azioni associate alla fotografia salvata.'],
      ['5', 'Una pianificazione, senza operazioni', 'Il piano non sposta denaro, non crea movimenti e non aggiorna saldi o obiettivi.'],
    ],
    items: [
      { id: 'needs', titolo: 'Necessità', testo: 'Spese essenziali e obblighi dichiarati da coprire.' },
      { id: 'safety', titolo: 'Sicurezza', testo: 'Quota destinata alla riserva per imprevisti.' },
      { id: 'goals', titolo: 'Obiettivi', testo: 'Ripartizione collegata agli obiettivi attivi.' },
      { id: 'future', titolo: 'Futuro', testo: 'Quota per priorità patrimoniali di lungo periodo.' },
      { id: 'freedom', titolo: 'Libertà', testo: 'Quota che resta flessibile secondo le tue priorità.' },
    ],
    example: 'Esempio: 2.000 € ricevuti meno 300 € di spese obbligatorie lasciano 1.700 € da distribuire. Modifica le quote qui sotto: questo esempio non usa i tuoi dati e non viene salvato.',
  },
  {
    id: 'dati-limiti', titolo: 'Dati usati e limiti',
    sottotitolo: 'Osservazioni, risposte manuali e stime sono cose diverse.',
    paragraphs: [
      'I dati osservati arrivano dai movimenti e dai conti registrati, dalle ricorrenze, dagli obiettivi e dai debiti inseriti. Le risposte manuali servono al piano per cui sono state fornite. Le previsioni, i limiti giornalieri e i tempi degli obiettivi sono stime.',
      'Categorie mancanti, mesi incompleti o uno storico breve possono ridurre ciò che si riesce a mostrare. Le registrazioni manuali potrebbero essere incomplete; WALLT non si collega alla banca per verificarle.',
      'Le azioni V2 sono promemoria preparatori. Segnarle completate o ignorate aggiorna solo il loro stato nel piano. Non sposta denaro, non versa contributi e non garantisce risultati.',
    ],
    limits: ['Le entrate, le uscite e le rate future non registrate come ricorrenze potrebbero non essere considerate.', 'Gli importi non disponibili non vengono sostituiti con zero.', 'Una previsione non garantisce il saldo futuro.'],
  },
]);
