# Piano di accantonamento per spese future — Piano di implementazione

> **Per chi implementa con agenti:** sottocompetenza richiesta: usa `superpowers:subagent-driven-development` oppure `superpowers:executing-plans` per implementare il piano attività per attività. Le attività usano la sintassi delle caselle di controllo (`- [ ]`).

**Obiettivo:** aggiungere a Piano Smart un salvadanaio virtuale per ogni spesa futura, con accantonamenti manuali, quote settimanali ricalcolate, suggerimenti concreti in euro basati sulle categorie di spesa e conferma esplicita prima di registrare il pagamento.

**Architettura:** i contributi vengono salvati come destinazioni virtuali collegate al pagamento programmato; non creano movimenti né cambiano i saldi registrati. Il servizio liquidità li sottrae dal saldo effettivo spendibile e evita di conteggiarli due volte insieme al residuo dell'impegno. L'API Piano Smart espone piani e opportunità ricavate dallo storico; il client presenta e registra le scelte manuali, mentre il flusso esistente conferma il pagamento reale.

**Stack tecnico:** Vue 3, Pinia, Express 5, Sequelize 6, PostgreSQL, Jest, Node test runner e Vite.

**Specifica:** `docs/superpowers/specs/2026-10-01-piano-smart-accantonamenti-spese-design.md`

## Vincoli globali

- Tutti i testi UI, i messaggi d'errore, i commenti e la documentazione sono in italiano; gli identificatori restano in inglese.
- I calcoli monetari usano centesimi interi e le date civili usano Europe/Rome.
- Nessun accantonamento crea un movimento o modifica il saldo registrato di un conto.
- Il saldo effettivo diminuisce per gli importi destinati; patrimonio totale e netto non diminuiscono per l'accantonamento.
- Una spesa programmata resta fuori da movimenti, Analisi e medie storiche finché l'utente non conferma il pagamento.
- La spesa confermata usa la categoria già assegnata e viene registrata una sola volta dal flusso esistente.
- Le letture e le scritture sono sempre isolate per `user_id`; i contributi non superano il residuo e la scrittura è transazionale.
- Le medie di categoria usano i mesi completi classificati da `finestraMesi.service.js`; mesi mancanti non diventano zeri e il mese corrente parziale non determina la media.
- I suggerimenti mostrano importi in euro, mai percentuali. Discrezionali prima, semi-essenziali dopo; le essenziali ricevono solo osservazioni condizionali basate su importi inferiori davvero osservati; le non classificate sono escluse.
- Le suite backend si eseguono con `TEST_DATABASE_URL`/`DB_NAME_TEST=wallt_test`; non eseguire migrazioni sul database di sviluppo personale o di produzione.
- Conservare tutte le modifiche preesistenti, tracciate e non tracciate, nell'checkout corrente. L'esecuzione va isolata in un worktree che parte dall'ultimo commit approvato; non usare `git clean`, reset o checkout distruttivi sull'checkout esistente.

## Punti di revisione

1. **Scadenza oggi o già passata:** quota pari al residuo completo e richiesta di conferma visibile; verificare data Europe/Rome e nessun movimento prima del sì.
2. **Contributi concorrenti o eccedenti:** transazione e blocco impediscono di superare l'importo della spesa; pagamenti chiusi rifiutano altre registrazioni.
3. **Impegno entro e oltre 30 giorni:** saldo effettivo sottrae accantonato e residuo una sola volta; oltre 30 giorni l'accantonato resta protetto.
4. **Storico breve o categoria non classificata:** nessun suggerimento monetario inventato; si mostra perché i dati non bastano e la spesa futura non contamina Analisi.
5. **Spese essenziali:** non proporre tagli generici; mostrare soltanto differenze in euro osservate in mesi completi e formulazione condizionale.

---

### Attività 1: Persistere i contributi virtuali e calcolare il piano di accantonamento

**File:**
- Crea: `server/models/ScheduledPaymentContribution.js`
- Modifica: `server/models/index.js`
- Crea: `server/migrations/20261001000043-create-contributi-pagamenti-programmati.js` (evita la collisione con le migrazioni locali non committate 41 e 42)
- Crea: `server/services/pianoSmartV2/expenseFundingPlan.service.js`
- Test: `server/tests/expenseFundingPlan.test.js`
- Test: `server/tests/migrations.postgres.test.js`

**Interfacce:**
- Consuma: `pagamenti_programmati` (`ScheduledPayment`) e le regole monetarie di `server/services/pianoSmart/money.js`.
- Produce: `calculateWeeklyQuota({ amountCents, contributedCents, daysUntilDue })`, che restituisce `{ remainingCents, periodsRemaining, weeklyQuotaCents }`; `buildExpenseFundingPlan({ payment, contributedCents, referenceDate })`, che serializza i valori come stringhe decimali.
- Il contributo persistito contiene `id`, `user_id`, `pagamento_programmato_id`, `importo`, `data_contributo` e timestamp; un pagamento contiene molti contributi.

  Formula del servizio puro:

  ```js
  const remainingCents = Math.max(amountCents - contributedCents, 0);
  const periodsRemaining = Math.max(1, Math.ceil(daysUntilDue / 7));
  const weeklyQuotaCents = Math.ceil(remainingCents / periodsRemaining);
  ```

- [ ] **Passo 1: scrivere i test prima dell'implementazione.** Nei test di dominio coprire importo 18000 centesimi con 56 giorni (`weeklyQuotaCents: 2250`), 49 giorni senza versamenti (`2572` centesimi, arrotondamento verso l'alto), un solo periodo rimasto, contributo parziale, residuo zero e scadenza passata. In `migrations.postgres.test.js` aggiungere prima i test per tabella, indici, rollback e presenza nella verifica schema PostgreSQL.
- [ ] **Passo 2: eseguire i test per osservare i fallimenti attesi.**

  Esegui: `cd server && npm test -- --runTestsByPath tests/expenseFundingPlan.test.js tests/migrations.postgres.test.js`

  Atteso: FAIL perché servizio, modello e migrazione non esistono ancora.
- [ ] **Passo 3: implementare modello, associazioni, migrazione reversibile e funzioni pure.** Definire importo `DECIMAL(12,2)`, chiavi utente e pagamento, indici di lettura per utente/pagamento e cancellazione coerente con l'eliminazione utente/pagamento secondo le convenzioni del repository. Usare centesimi e dividere i giorni per sette arrotondando i periodi verso l'alto, con minimo un periodo.
- [ ] **Passo 4: aggiungere test schema/migrazione e rieseguire i test.** In `migrations.postgres.test.js` verificare il nome/tabella, gli indici e la reversibilità con mock di QueryInterface; estendere il test PostgreSQL completo per verificare la presenza della tabella quando `TEST_DATABASE_URL` è configurato. Eseguire `cd server && npm test -- --runTestsByPath tests/expenseFundingPlan.test.js tests/migrations.postgres.test.js`. Atteso: i test di dominio e migrazione passano; nessuna migrazione viene applicata a database personali o produzione.

  Esegui: `cd server && npm test -- --runTestsByPath tests/expenseFundingPlan.test.js`

  Atteso: tutti i casi di quota e residuo passano; la scadenza odierna o passata restituisce il residuo come quota immediata.
- [ ] **Passo 5: rivedere il diff dell'attività.** Eseguire `git diff --check`; verificare che non siano stati modificati saldi, movimenti o Analisi.
- [ ] **Passo 6: registrare l'attività verificata.** Creare un commit italiano limitato a modello, migrazione, servizio puro e test.

### Attività 2: Aggiungere API autenticate per registrare e leggere gli accantonamenti

**File:**
- Modifica: `server/services/paymentPlans.service.js`
- Modifica: `server/controllers/scheduledPayments.controller.js`
- Modifica: `server/routes/movimenti.routes.js`
- Modifica: `server/middleware/validation.middleware.js`
- Modifica: `server/models/index.js` (associazioni create nell'attività 1, riusarle)
- Test: `server/tests/scheduledPaymentContributions.api.test.js`
- Test: `server/tests/ricorrenti.test.js` o la suite di pagamenti programmati già esistente individuata durante l'implementazione

**Interfacce:**
- Consuma: `ScheduledPaymentContribution` e `buildExpenseFundingPlan` dall'attività 1.
- Produce: `listScheduledPaymentContributions({ userId, paymentId })` e `addScheduledPaymentContribution({ userId, paymentId, amount, date })` nel servizio pagamenti.
- Rotte: `GET /api/movimenti/programmate/:id/accantonamenti` e `POST /api/movimenti/programmate/:id/accantonamenti` con body `{ "amount": "30.00", "date": "2026-10-01" }`.

  Risposta minima di esempio:

  ```json
  { "paymentId": 17, "contributed": "30.00", "remaining": "150.00", "writesAccountBalance": false, "writesMovement": false, "contributions": [] }
  ```

- [ ] **Passo 1: scrivere test fallibili per i contratti API.** Verificare risposta lista e riepilogo; creazione restituisce `writesAccountBalance: false` e `writesMovement: false`; importo positivo con massimo due decimali; rifiuto di pagamento altrui, tipo diverso da uscita, stato non attesa, rata con `piano_id`, valore oltre il residuo e pagamento già confermato. Il test di isolamento deve dimostrare che l'utente A non legge né modifica contributi dell'utente B. Un test concorrente con due contributi il cui totale supera il residuo deve dimostrare che al massimo una richiesta viene accettata oltre il residuo residuo disponibile.
- [ ] **Passo 2: eseguire la suite API per osservare i fallimenti attesi.**

  Esegui: `cd server && npm test -- --runTestsByPath tests/scheduledPaymentContributions.api.test.js`

  Atteso: FAIL perché le nuove rotte e operazioni non sono ancora implementate.
- [ ] **Passo 3: implementare validazione, controller e operazioni transazionali.** Bloccare la riga `ScheduledPayment` con `LOCK.UPDATE`, ricalcolare contributi e residuo nella stessa transazione e rifiutare contributi eccedenti. Non chiamare `createMovement`, `muoveSaldo` o funzioni di variazione del conto.
- [ ] **Passo 4: eseguire i test API e i casi relativi alle scadenze programmate.**

  Esegui: `cd server && npm test -- --runTestsByPath tests/scheduledPaymentContributions.api.test.js`

  Atteso: creazione isolata e transazionale; saldo e movimenti invariati; richieste non valide rifiutate con gli status già adottati dall'API.
- [ ] **Passo 5: rieseguire le suite backend interessate.**

  Esegui: `cd server && npm test -- --runTestsByPath tests/ricorrenti.test.js tests/financialConsistency.test.js`

  Atteso: le conferme esistenti continuano a creare un solo movimento e ad aggiornare i saldi correttamente.
- [ ] **Passo 6: registrare l'attività verificata.** Eseguire `git diff --check`, rivedere il diff e creare un commit italiano limitato alle rotte, validazione, servizio e test API.

### Attività 3: Integrare il salvadanaio nella liquidità senza doppio conteggio

**File:**
- Modifica: `server/services/liquidita.service.js`
- Test: `server/tests/liquidita.test.js`
- Test: `server/tests/financialConsistency.test.js`

**Interfacce:**
- Consuma: somma dei contributi per pagamento e `ScheduledPayment.importo` per lo stesso utente.
- Produce: liquidità effettiva con quota accantonata e residuo dell'impegno conteggiati una sola volta; saldo conto, patrimonio lordo e patrimonio netto invariati dall'accantonamento virtuale.

  Per una scadenza entro l'orizzonte, la quantità protetta della spesa è:

  ```text
  quota_protetta = accantonato + max(importo_programmato - accantonato, 0)
  ```

  Non sommare `accantonato` una seconda volta all'impegno integrale.

- [ ] **Passo 1: aggiungere test fallibili di liquidità.** Per scadenza entro 30 giorni, confrontare nessun contributo con contributo parziale e verificare che il protetto resti l'importo totale della spesa; per una scadenza oltre 30 giorni, verificare che il contributo sia protetto e il residuo non anticipato nell'orizzonte; verificare che `saldo_effettivo` diminuisca mentre saldo conto/patrimonio non cambiano.
- [ ] **Passo 2: eseguire i test per verificare il fallimento atteso.**

  Esegui: `cd server && npm test -- --runTestsByPath tests/liquidita.test.js`

  Atteso: FAIL perché i contributi non fanno ancora parte del calcolo.
- [ ] **Passo 3: integrare le aggregazioni senza cambiare la formula del patrimonio.** Per pagamenti entro l'orizzonte, sostituire la porzione già coperta del pagamento con il contributo, così `contributo + residuo` resta pari all'impegno; per pagamenti fuori orizzonte sottrarre soltanto il contributo già registrato. Escludere pagamenti annullati/pagati e contare una sola volta ogni pagamento.
- [ ] **Passo 4: eseguire test liquidità e coerenza finanziaria.**

  Esegui: `cd server && npm test -- --runTestsByPath tests/liquidita.test.js tests/financialConsistency.test.js`

  Atteso: saldo effettivo riflette le destinazioni; saldi conti e patrimonio non ricevono scritture; gli impegni non sono duplicati.
- [ ] **Passo 5: registrare l'attività verificata.** Eseguire `git diff --check`, rivedere il diff e creare un commit italiano limitato a servizio e test dell'attività.

### Attività 4: Esporre piani e suggerimenti per categoria in Piano Smart

**File:**
- Modifica: `server/services/financialContext.service.js`
- Crea: `server/services/pianoSmartV2/expenseFundingInsights.service.js`
- Modifica: `server/services/pianoSmartV2/currentSituation.service.js`
- Modifica: `docs/piano-smart-v2-api-contract.md`
- Test: `server/tests/pianoSmartExpenseFundingInsights.test.js`
- Test: `server/tests/pianoSmartV2Contract.test.js`
- Test: `server/tests/pianoSmartSituationContext.test.js`

**Interfacce:**
- Consuma: pagamenti in attesa eleggibili (`tipo: uscita`, `piano_id: null`), contributi, `context.expenses.history`/movimenti completi e livelli da `categorie.service.js`.
- Produce: funzione pura `buildExpenseFundingInsights({ payments, contributionsByPayment, monthlyCategoryHistory, referenceDate, weeklyMarginCents })` e campo additivo `upcomingExpensePlans` nella risposta current-situation.
- Ogni DTO espone importo, scadenza, categoria assegnata, accantonato, residuo, quota settimanale, periodi rimasti, stato, copertura dati e suggerimenti in euro.

  Struttura minima per il campo additivo:

  ```json
  {
    "upcomingExpensePlans": [{
      "paymentId": 17,
      "amount": "180.00",
      "contributed": "30.00",
      "remaining": "150.00",
      "weeklyQuota": "25.00",
      "periodsRemaining": 6,
      "category": "svago",
      "suggestions": [{
        "category": "ristoranti",
        "essentiality": "discrezionale",
        "averageMonthly": "150.00",
        "lowerObservedMonthly": "120.00",
        "suggestedMonthlyReduction": "30.00"
      }]
    }]
  }
  ```

- [ ] **Passo 1: scrivere test di dominio dei suggerimenti e del contratto.** Includere categoria discrezionale prima di semi-essenziale; media di 150 € e mese completo osservato da 120 € producono opportunità massima di 30 € mensili, senza percentuali; una categoria essenziale mostra solo differenza osservata condizionale; non classificata o con meno di tre mesi completi non produce importi; scadenza futura non entra in movimenti/totali Analisi; contributo riduce residuo e quota.
- [ ] **Passo 2: eseguire i test nuovi per osservarne i fallimenti attesi.**

  Esegui: `cd server && npm test -- --runTestsByPath tests/pianoSmartExpenseFundingInsights.test.js`

  Atteso: FAIL perché il servizio di insight non esiste.
- [ ] **Passo 3: implementare aggregazione storica mensile per categoria e DTO.** Usare solo uscite effettive (`Movimento` di tipo uscita, `muoveSaldo`) e mesi completi classificati da `finestraMesi.service.js`; nessuna lettura deve includere `pagamenti_programmati` nell'analisi storica. La differenza monetaria candidata non può superare né il divario medio/minimo mensile osservato né il fabbisogno mensile del salvadanaio. Serializzare importi come decimali stringa e qualità/stato espliciti.
- [ ] **Passo 4: aggiungere il campo alla situazione corrente senza modificare i campi esistenti.** Limitare il campo alle scadenze singole eleggibili, includendo quelle oltre 30 giorni; lasciare piani rateali e scadenze pagate/annullate fuori.
- [ ] **Passo 5: eseguire test insight e contratto Smart.**

  Esegui: `cd server && npm test -- --runTestsByPath tests/pianoSmartExpenseFundingInsights.test.js tests/pianoSmartV2Contract.test.js tests/pianoSmartSituationContext.test.js`

  Atteso: response additiva e stabile; nessun campo legacy cambia; nessuna spesa non confermata entra in Analisi.
- [ ] **Passo 6: registrare l'attività verificata.** Eseguire `git diff --check`, rivedere il diff e creare un commit italiano con servizio, integrazione e test backend Smart.

### Attività 5: Realizzare la sezione Piano Smart e il flusso di conferma manuale

**File:**
- Modifica: `client/src/stores/scheduledPayments.store.js`
- Modifica: `client/src/views/PianoSmartView.vue`
- Crea: `client/src/components/piano-smart/PianoSmartExpenseFunding.vue`
- Test: `client/tests/pianoSmartExpenseFunding.test.js`

**Interfacce:**
- Consuma: `currentSituation.upcomingExpensePlans`, `GET/POST /movimenti/programmate/:id/accantonamenti` e il metodo store esistente di conferma `POST /movimenti/programmate/:id/conferma`.
- Produce: scheda accessibile per ogni spesa con progressione manuale, quota aggiornata, stato, suggerimenti in euro ordinati per essenzialità, registrazione contributo e domanda di conferma quando la scadenza è oggi o passata.

- [ ] **Passo 1: scrivere test per store e logica di presentazione.** Verificare che il submit invii solo amount/data, aggiorni la situazione senza inferire nuovi movimenti, e che la conferma “Sì” richiami una sola volta l'endpoint esistente; “Non ancora” non richiami API di scrittura. Verificare che i suggerimenti mostrino importi assoluti senza percentuali e non offrano tagli generici alle spese essenziali. Collocare il test accanto alle suite Node in `client/tests/` e riusare `client/tests/helpers/renderVue.js` per il componente se il test esistente supporta quel rendering.
- [ ] **Passo 2: eseguire i test per osservare i fallimenti attesi.**

  Esegui: `cd client && npm test -- pianoSmartExpenseFunding.test.js`

  Atteso: FAIL perché store e componente non espongono ancora queste azioni.
- [ ] **Passo 3: aggiungere i metodi store e il componente.** Validare lato UI importo positivo e residuo; mostrare cronologia, qualità dei dati, importo che manca e quote in euro. Il modulo chiede conferma dell'importo prima di registrare il contributo; nessun pulsante suggerimento deve creare un movimento.
- [ ] **Passo 4: integrare la conferma alla scadenza.** Mostrare la domanda “Hai pagato questa spesa?” per pagamenti scaduti o in scadenza; “Sì, conferma pagamento” usa una sola volta la route corrente; “Non ancora” lascia il pagamento in attesa. Non aggiungere promemoria o notifiche automatiche non previsti dalla specifica.
- [ ] **Passo 5: eseguire test client e build.**

  Esegui: `cd client && npm test && npm run build`

  Atteso: test esistenti e nuovi passano; build Vite completata; se non esistono test di montaggio Vue, documentare il build e coprire le funzioni store/esposizione dati con i test disponibili.
- [ ] **Passo 6: registrare l'attività verificata.** Eseguire `git diff --check`, rivedere il componente su schermi piccoli e creare un commit italiano con store, view, componente e test frontend.

### Attività 6: Verifica trasversale, documentazione e revisione finale

**File:**
- Modifica: `docs/API.md`
- Modifica: `docs/DATABASE.md`
- Modifica: `docs/piano-smart-v2-api-contract.md`
- Modifica: `client/src/content/pianoSmartGuide.js`
- Test: suite completa `server` e `client`

**Interfacce:**
- Consuma: schema, contratti e componenti delle attività 1–5.
- Produce: documentazione che dichiara i campi/rotte, la semantica di saldo effettivo e patrimonio e il fatto che Analisi cambia solo dopo conferma.

- [ ] **Passo 1: aggiornare API, schema e guida tecnica.** Documentare nuovi endpoint, tabella/chiavi, DTO, validazione, stato pagato e semantica contabile senza descrivere l'accantonamento come trasferimento.
- [ ] **Passo 2: eseguire tutte le verifiche richieste dal repository.**

  Esegui: `cd server && npm test`

  Atteso: tutte le suite backend passano con il database `wallt_test`.

  Esegui: `cd client && npm test && npm run build`

  Atteso: tutti i test frontend e il build passano.
- [ ] **Passo 3: eseguire revisione finale delle differenze e sicurezza.** Usare `git diff --check`; verificare isolamento utente, un solo movimento alla conferma, invarianti di saldo/trasferimenti, nessuna scrittura da un consiglio, nessuna contaminazione di Analisi, nessun file preesistente non tracciato sovrascritto.
- [ ] **Passo 4: aggiornare i contratti non funzionali e registrare i risultati delle verifiche.** Elencare esattamente file modificati, comandi eseguiti e risultati; segnalare eventuali limiti di dati o componenti non testabili.
- [ ] **Passo 5: registrare documentazione e verifiche finali.** Rivedere che la documentazione dica che il salvadanaio è virtuale e che l'analisi storica cambia solo dopo la conferma; creare un commit italiano limitato ai documenti.
