# Audit iniziale della registrazione e dell’onboarding

Data: 2 ottobre 2026. Analisi in sola lettura del codice, della documentazione e dello schema `public` del progetto Supabase collegato al repository. Non sono state lette righe contenenti dati degli utenti.

## Stato attuale

La registrazione locale (`client/src/views/auth/RegisterView.vue`, `server/controllers/auth.controller.js`) crea `users` e `profili_utente` e richiede i consensi. Anche l’accesso Google crea o recupera le stesse entità (`server/services/googleAuth.service.js`). Il router manda i profili incompleti a `/onboarding`.

L’onboarding attuale (`client/src/views/OnboardingView.vue`) è un questionario di tre schermate. Salva i campi di `profili_utente` solo alla fine; il passaggio corrente e gli importi compilati non hanno una bozza persistente. Il completamento usa `PUT /api/profilo`; il salto usa `POST /api/profilo/skip-onboarding` e richiede la fascia d’età. Nessun conto, categoria, movimento ricorrente o obiettivo viene creato dal questionario. Il profilo finanziario alimenta ancora un suggerimento di budget e alcuni permessi di funzionalità.

`server/services/onboarding.service.js` contiene una incompatibilità diretta con la ripresa: `repairUserProfilo`, chiamato durante login e lettura profilo, completa automaticamente un onboarding incompleto se la registrazione risale a più di 15 minuti. Questa regola va sostituita distinguendo i profili precedenti alla nuova versione dalle nuove bozze; non basta aggiungere un salvataggio nel client.

La Home (`client/src/views/DashboardView.vue`) legge già conti, patrimonio, movimenti recenti, ricorrenze e obiettivi dai rispettivi store. Ha stati vuoti e inviti all’azione. Piano Smart usa il contesto finanziario esistente e non deve ricevere un secondo insieme di numeri inventati.

## Mappa di riuso

| Ambito | Struttura esistente | Impiego nel nuovo flusso |
|---|---|---|
| Categorie | Catalogo `server/constants/catalogoCategorie.json`, `categorie_personali`, `categorie_default_nascoste`, `categorie_default_essenzialita`; `categorie.service.js` | Selezionare le predefinite, nascondere quelle escluse, creare le personali e conservare le categorie tecniche protette. La cascata di import legge la lista per utente. |
| Conti | `conti`, `conti.controller.js` | Creare conti secondo le regole attuali. `nascosto` esclude dalla liquidità spendibile, ma **non** dal patrimonio; non esiste un campo generale “includi nel patrimonio”. Non esistono valuta o istituto per singolo conto; `users.valuta` è globale. |
| Entrate e spese ricorrenti | `movimenti` con `ricorrente`, frequenza, giorno/mese e stato; `ricorrenti.service.js` | Creare regole, senza movimentare subito il saldo. Le entrate alla scadenza diventano conferme in attesa. |
| Pagamenti e rate | `pagamenti_programmati`, `piani_pagamento`, `debiti` | Una spesa singola può essere programmata; un acquisto rateizzato nuovo ha un piano. Un debito già in corso può vivere in `debiti`, ma non è riconciliato automaticamente con una regola ricorrente: evitare il doppio conteggio. |
| Obiettivi | `obiettivi`, `obiettivo_contributi` | Creare i traguardi senza generare contributi o trasferimenti impliciti. |
| Notifiche | `preferenze_notifiche`, `notifiche`, `push_subscriptions` | Salvare i soli interruttori supportati e il limite giornaliero. Le push richiedono un consenso separato nel browser. |
| Import da file | `POST /api/importazioni/upload` e `/conferma`; pipeline `services/importazioni/` → `services/import/` | Riutilizzare parser CSV/XLS/XLSX, anteprima, deduplica, correzione categoria e apprendimento. Il file viene elaborato in memoria, con limite 5 MB e controllo estensione/contenuto; il file originale non è conservato. Il PDF non è supportato da questo flusso. |
| Open Banking | `bank_connections`, rotte e servizi dedicati | Non duplicare il collegamento bancario nella configurazione iniziale. |
| Financial Brain / Piano Smart | `financialContext.service.js`, servizi di essenzialità, liquidità, fondo di sicurezza e `pianoSmart*` | Le entità create migliorano il contesto esistente. Lo storico manuale insufficiente resta dichiarato come tale. |
| Analytics | `client/src/utils/monitoraggio.js` | Eventuali eventi devono contenere solo identificativi di fase e conteggi, mai importi o descrizioni. |

## Schema reale e lacune

La lettura dello schema Supabase `public` conferma le tabelle sopra e RLS attiva sulle tabelle elencate. Non esiste una tabella di sessione/bozza onboarding, né una colonna che distingua gli account creati con il nuovo percorso. Le migrazioni esistenti revocano l’accesso diretto ai ruoli `anon` e `authenticated` per le tabelle finanziarie; il server usa PostgreSQL tramite Sequelize e l’identità del proprio JWT. Prima di modificare lo schema andranno verificati anche gli indici e i vincoli nel database di test. L’audit dello schema non prova da solo quali migrazioni siano state applicate in ogni ambiente di distribuzione.

Non esiste un oggetto “abbonamento personale”: `subscriptions` rappresenta l’abbonamento commerciale a WALLT. Gli abbonamenti pagati dall’utente vanno rappresentati come spese ricorrenti. La tabella `debiti` è adatta al saldo residuo di un impegno già in corso, ma una domanda sulla sola rata non permette di inventare quel saldo: serve un campo esplicito oppure si registra soltanto la ricorrenza. Il fondo di emergenza corrente è un conto di tipo `emergenza`, non un obiettivo di tipo speciale; i commenti storici in alcuni servizi non descrivono più questa regola.

## Vincoli di coerenza per il progetto

1. L’anteprima import attuale usa categorie e conti **già salvati**. Per mostrare import in una bozza, la pipeline deve accettare un catalogo e riferimenti ai conti della bozza, oppure occorre spostare il momento della creazione definitiva. Il secondo approccio renderebbe molto più difficile la finalizzazione atomica.
2. La creazione ordinaria di un conto con saldo positivo registra anche un movimento “Saldo iniziale”. Se si importano movimenti storici con aggiornamento del saldo, la scelta del saldo corrente deve essere unica e visibile; altrimenti saldo e storico potrebbero sommarsi due volte o mostrare entrate fittizie nelle analisi.
3. `confirmImport` apre oggi una propria transazione. Per includerlo nella finalizzazione unica va estratta un’operazione che accetti una transazione esterna; il percorso esistente deve continuare a funzionare.
4. La deduplica corrente confronta i movimenti salvati e quelli all’interno del file, ma non è una chiave permanente per ritentare l’intera configurazione. Una sessione unica per utente, bloccata nella finalizzazione, fornisce l’idempotenza richiesta.
5. Il sistema protegge categorie tecniche come `da_verificare` e `altro_entrata`; la selezione utente non deve poterle nascondere. L’apprendimento delle correzioni passa già da `CategoryLearningService`.
6. Le API finanziarie validano categoria, proprietà del conto, importi e autorizzazione nelle rispettive rotte. La finalizzazione dovrà riusare gli stessi servizi o estrarre la loro logica comune, senza invocare i controller HTTP dall’interno.
7. La fascia d’età resta necessaria per applicare le restrizioni ai minori anche nello scenario minimale. Gli altri campi del vecchio profilo vanno posti solo se cambiano un risultato concreto; non bisogna presentare come osservati gli importi dichiarati.

## File e verifiche coinvolti

- Frontend: `RegisterView.vue`, `OnboardingView.vue`, router, store auth/profilo/categorie/conti/import/obiettivi/notifiche, `DashboardView.vue`, componenti comuni e stili esistenti.
- Backend: servizi auth/onboarding/categorie/import/ricorrenti/conti/obiettivi/notifiche, modelli e associazioni, route e validazione, migrazione additiva.
- Documenti: `docs/API.md`, `docs/DATABASE.md`, `docs/SECURITY.md` e stato del progetto.
- Test: registrazione locale/Google, ripresa, categorie prima dei conti, creazione dati, saldo/import, idempotenza, isolamento utenti e compatibilità account precedenti.

## Verifica iniziale

`client/npm test`: 265 test superati. `client/npm run build`: riuscita, con avvisi preesistenti sugli import dinamici inefficaci. Il client non dichiara script `lint` o `typecheck`. La prima esecuzione backend in sandbox non raggiungeva PostgreSQL locale (`EPERM 127.0.0.1:5432`); non è un risultato della suite applicativa. La seconda esecuzione della suite completa, autorizzata sul database locale di test, ha esaurito la memoria di Node 20 dopo circa cinque minuti e non ha prodotto un riepilogo; il runtime era inferiore al minimo dichiarato dal progetto. Con Node 24 sono passate le sette suite pertinenti ad autenticazione, profilo, import, categorie, ricorrenze, obiettivi e notifiche: **91 test su 91**. La suite completa andrà ripetuta con Node 22/24 dopo l’implementazione. Nessuna migrazione o scrittura è stata eseguita sul progetto Supabase collegato.

## Implementazione e verifica finale — 3 ottobre 2026

La registrazione locale e Google ora aprono una sessione onboarding versionata. Il nuovo flusso salva la bozza con revisione, la riprende dopo il logout, protegge la finalizzazione dai vecchi endpoint, e crea in un’unica transazione le categorie, i conti, le ricorrenze, i debiti dichiarati, gli obiettivi, le preferenze e le righe d’importazione confermate. I file sono elaborati in memoria; il saldo dichiarato resta il saldo corrente e gli import storici non lo modificano. Il vecchio questionario è conservato per compatibilità con i test e i percorsi preesistenti.

La Home propone collegamenti alle sezioni coerenti con gli utilizzi scelti. La schermata d’onboarding è stata verificata a larghezza desktop e mobile; sul viewport mobile non c’è overflow orizzontale e la bozza resta al passo salvato dopo un ricaricamento. Il caso del debito con solo saldo residuo noto non richiede rata o conto e non genera una spesa ricorrente.

Verifiche: `client/npm test` **266/266**; `client/npm run build` riuscita (restano gli avvisi preesistenti sugli import dinamici inefficaci); backend mirato con Node 24, **3 suite e 31/31 test superati**; `git diff --check` superato. La suite backend completa con Node 24 ha riportato **95 suite superate e 3 fallite, 1.317 test superati e 63 falliti**. Nei log acquisiti compare una chiamata legacy alla rotta di riconciliazione Bank Sync che non è presente nelle route server correnti; non è stato completato il triage degli altri errori. Questo risultato va mantenuto distinto dal verde delle suite mirate. Nessuna migrazione o scrittura è stata eseguita sul progetto Supabase collegato.
