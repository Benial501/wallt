# Piano Smart V2 — Contratto API

Le rotte V2 sono locali al namespace `/api/piano-smart/v2`, richiedono JWT e non modificano saldi o movimenti.

## Situazione corrente

`GET /api/piano-smart/v2/current-situation` legge il contesto finanziario dell'utente e restituisce il riepilogo read-only usato dalla pagina Piano Smart: liquidità, importi protetti, margine disponibile, limite giornaliero, previsione di fine mese, direzione finanziaria, massimo tre suggerimenti, qualità dei dati e avvisi. I valori monetari sono stringhe decimali; la risposta distingue i dati stimati dai dati non stimabili.

`current.dailyMargin` è il limite giornaliero indicativo meno il ritmo giornaliero osservato; è `null` quando uno dei due valori non è stimabile.

## Simulazione di una spesa

`POST /api/piano-smart/v2/simulate-purchase` accetta `{ "amount": "125.50" }` e restituisce importo, valori iniziali e valori dopo l'acquisto per spendibile, limite giornaliero indicativo e previsione. Il calcolo avviene nel backend in centesimi interi. La risposta include `writesFinancialData: false`; l'endpoint non crea movimenti e non aggiorna saldi o obiettivi. Importi non positivi, malformati o con più di due decimali sono rifiutati. Un campo non stimabile resta `null`.

Il riepilogo usa il giorno civile Europe/Rome e l’orizzonte da oggi (incluso)
a fine mese. Non scrive dati finanziari.

- `current.liquidity`: saldo dei conti ordinari; `allocatedToGoals`: importi
  già accantonati negli obiettivi attivi, incluso il fondo di sicurezza.
- `protectedAmount`: importi accantonati + impegni del servizio liquidità +
  ulteriori occorrenze entro fine mese (`additionalCommitments`) + l'eventuale
  quota di riserva prudenziale ancora da coprire.
- `availableToSpend`: liquidità allocabile centrale meno gli ulteriori
  impegni e la riserva ancora da coprire, limitata a zero; `shortfall` conserva
  l’eventuale deficit. Con entrate irregolari resta `null` se non esiste una
  media di spesa su mesi completi.
  Vale `liquidity - protectedAmount = availableToSpend - shortfall`.
- `incomeMode`: `ricorrente` quando la stabilità osservata è `stabile` e la
  media del reddito ricorrente è positiva; altrimenti `irregolare`.
- `reserveMonths`: copertura scelta dall'utente (da 1 a 6, default 1), presente
  quando `incomeMode` è `irregolare`.
- `reserveTarget`, `reserveFromLiquidity`, `reserveExpenseBasis` e
  `averageExpenseMonths`: obiettivo della riserva, quota da coprire con la
  liquidità ordinaria, base spese (`essenziale` o `totale`) e mesi completi
  usati. Il saldo del fondo di sicurezza esistente riduce la quota da coprire.
- `dailyLimit`: con entrate ricorrenti stabili è lo spendibile diviso per i
  giorni rimanenti, troncato al centesimo. Con entrate irregolari è il minore
  fra tale margine giornaliero e la spesa media giornaliera osservata; la base
  mensile è quella essenziale, con ripiego sulla media totale. `dailyLimitBasis`
  dichiara quale dei due valori determina il limite.
- `averageDailyExpenses`: media giornaliera derivata dalla spesa mensile usata
  totale osservata; `null` quando non serve o non è stimabile.
- `actualDailySpend`: uscite non ricorrenti registrate nel mese fino a oggi,
  divise per i giorni dall’inizio del mese o dal primo movimento reale,
  se successivo. Origini ricorrenti e addebiti generati restano fuori dal ritmo.
- `forecast.endOfMonthAvailable`: margine netto (anche negativo) meno le
  spese non ricorrenti proiettate sul periodo residuo. Le entrate future e
  le rate dei debiti non riconciliate con ricorrenze restano escluse.
  Il giorno corrente, parziale, conta sia nei giorni osservati sia nel
  budget residuo: una convenzione prudenziale esplicitata nella UI.
- `forecast.observedDays`, `quality` e `status`: qualità descrittiva, senza
  percentuali di precisione inventate. Senza dati di spesa osservabili,
  ritmo e previsione sono `null`, stato `non_stimabile`, nessun insight numerico
  di fine mese. Uno zero osservato con storico rimane un dato valido.
- `forecast.monthlySavings` è una **media storica**, non il risparmio di questo
  mese. I mesi civili completi restano quelli di `finestraMesi.service.js`.
- `upcoming.items`: tutte le occorrenze residue entro fine mese, ordinate
  per data, con `occurrenceKey` univoca, importo decimale e `reserved` che
  indica se già incluse nella liquidità centrale. Date e deduplica sono quelle
  del cron; sospese, terminate e occorrenze già addebitate sono escluse.
  `upcoming.afterTotal` è il margine **già al netto**: non sottrae ancora il totale.
- `changes.referenceDate` e `changes.points`: punti precalcolati per durate da
  1 a 30 giorni, poi 37, 44, 51, 58, 65, 72, 79, 86 e 90. Ogni punto confronta
  due finestre inclusive di uguale durata; `delta` è sempre periodo recente
  meno periodo precedente. Il giorno corrente è parziale. `quality` dichiara
  `dati_insufficienti`, `storico_limitato` o `storico_disponibile`; nessun
  giorno prima del primo movimento utile viene riempito con uno zero.
  `recent.observedDays` e `previous.observedDays` dichiarano i giorni coperti
  separatamente; la media giornaliera è `null` quando una finestra non ha
  movimenti osservabili. Le categorie si mostrano solo quando entrambe le
  finestre sono coperte per intero. `changedCategories` contiene al massimo tre categorie ordinate per variazione
  assoluta. I confronti riguardano i movimenti registrati, non saldi o
  disponibilità storiche; la completezza dei movimenti manuali non è verificabile.
- `cashFlowTimeline`: eventi ricorrenti attivi in entrata e uscita da oggi a
  oggi + 30 giorni, ordinati per data. `marginAfter` è una stima del margine
  spendibile dopo l'evento, non il saldo dei conti. Le entrate vengono sommate;
  le uscite con `reserved: true` sono già considerate nello spendibile iniziale
  e non vengono sottratte di nuovo; le altre uscite vengono sottratte una volta.
  Eventi futuri non registrati come ricorrenze non sono inclusi.
- `financialDirection.activeGoals`: numero di obiettivi non completati.
  Lo stato usa il vocabolario di `obiettiviStato.service.js`
  (`completato`, `in_corso`, `scaduto`, …), non quello dei piani: il conteggio
  lo fa il backend e il client non lo ricalcola.
- `financialDirection.goals`: obiettivi con `importo_restante` e
  `contributo_mensile_richiesto` serializzati come stringhe decimali o `null`,
  più `estimatedMonthsAtCurrentMargin`, `estimateBasis` ed `estimateReason`.
  La durata teorica è disponibile soltanto con almeno tre mesi civili completi,
  residuo valido e margine medio mensile positivo. È calcolata per un obiettivo
  alla volta, non ripartisce il margine fra obiettivi e non promette una data.
- Gli scenari numerici legacy restano nella risposta quando stimabili:
  `prudente` applica +20% alla spesa non ricorrente residua, `attuale` usa il
  ritmo osservato, `limite` usa il limite giornaliero; sono ipotesi deterministiche,
  non intervalli probabilistici. La pagina privilegia una sola stima spiegata.

Il simulatore frontend sottrae una spesa **aggiuntiva** dai risultati del server,
senza registrare movimenti. Mostra prima/dopo e conserva valori negativi.
Accetta importi positivi con al massimo due decimali. Il rischio prevale quando
lo spendibile o la previsione risultano negativi; una previsione assente resta
non stimabile. Impatto basso/moderato/alto descrive la quota di spendibile usata
(≤20%, ≤45%, >45%), non una garanzia di sostenibilità.


## Preview

`POST /api/piano-smart/v2/preview`

Body: `amount`, `mandatoryExpenses`, `sourceType`, `recurring`.

La risposta contiene `engineVersion: "smart-v2"`, capitale ricevuto/obbligatorio/riserva/distribuibile, situazione finanziaria, qualità dati, tre scenari, proiezioni a 3/6/12 mesi, avvisi e affidabilità. `actionsByScenario` associa le azioni preparatorie a ogni scenario selezionabile; `actions` resta l'insieme delle azioni bilanciate per i client precedenti.

Gli importi sono stringhe decimali. I valori non stimabili hanno stato `non_stimabile` e una motivazione.

## Salvataggio

`POST /api/piano-smart/v2`

Ricalcola il piano lato server e salva snapshot e azioni in una transazione. `selectedScenario` può indicare lo scenario generato da salvare (prudente, bilanciato o ambizioso); lo scenario selezionato è memorizzato nello snapshot e riportato nel dettaglio. Le allocazioni persistite corrispondono a quello scenario. Non crea movimenti finanziari.

Il dettaglio V1 continua a fornire l'elenco e le quote persistite. Per un piano V2, `GET /api/piano-smart/v2/:id` restituisce lo snapshot della generazione associato a quel piano e `GET /api/piano-smart/v2/:id/actions` restituisce le azioni persistite, con il loro stato corrente.

## Azioni

- `GET /api/piano-smart/v2/:id/actions`
- `PATCH /api/piano-smart/v2/:id/actions/:actionId` con `{ "status": "completata" | "ignorata" }`

Le azioni appartengono sempre all'utente autenticato e partono da `da_fare`.

I piani `smart-v1` restano gestiti dal contratto V1 e non vengono convertiti automaticamente.
