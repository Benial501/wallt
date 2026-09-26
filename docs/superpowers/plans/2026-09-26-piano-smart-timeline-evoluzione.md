# Piano Smart: timeline e flussi — Piano di implementazione

> **Per gli agenti:** usare la skill `superpowers:executing-plans` per eseguire il piano attività per attività. Ogni passaggio usa checkbox (`- [ ]`).

**Obiettivo:** Completare Piano Smart con confronti storici navigabili, un radar di ricorrenze in entrata e uscita, qualità dei dati leggibile e obiettivi collegati al margine mensile.

**Architettura:** `GET /api/piano-smart/v2/current-situation` aggiunge dati ottenuti da servizi backend isolati e di sola lettura. Una query aggregata sugli ultimi 180 giorni alimenta tutti i confronti da 1 a 90 giorni; le ricorrenze attive alimentano la proiezione dei prossimi 30 giorni; il backend fornisce anche stime prudenti per gli obiettivi. Componenti Vue dedicati presentano i DTO senza rifare calcoli finanziari nel browser.

**Tecnologie:** Node.js, Express, Sequelize, PostgreSQL, Jest, Vue 3, Pinia e dipendenze già presenti.

**Specifica:** `docs/superpowers/specs/2026-09-26-piano-smart-timeline-evoluzione-design.md`

## Vincoli globali

- Il backend resta l'unica fonte per aggregazioni, impegni, qualità e stime.
- La timeline confronta finestre inclusive di uguale durata: gli ultimi `N` giorni e i `N` immediatamente precedenti.
- I valori `N` sono 1–30 con passo giornaliero, poi 37, 44, 51, 58, 65, 72, 79, 86 e 90; il valore iniziale è 7.
- L'analisi richiede al massimo 180 giorni e filtra sempre per `user_id`.
- Tutti i calcoli monetari usano centesimi interi; l'API serializza gli importi in stringhe decimali.
- I trasferimenti sono esclusi dai totali di entrate e uscite.
- La risposta del riepilogo è additiva, autenticata e di sola lettura; nessun saldo o movimento viene modificato.
- La completezza delle registrazioni manuali non è verificabile e non si mostrano percentuali di precisione inventate.
- Il radar copre ricorrenze attive note nei prossimi 30 giorni; non inventa eventi futuri non registrati.
- La UI resta in italiano, accessibile da tastiera e responsive, con stati non disponibili espliciti.

## Punti di revisione

- Il giorno corrente è parziale, anche nel confronto da un giorno: fissarlo nel test della timeline.
- Un utente senza movimenti o con storico iniziato dopo l'intervallo non deve ricevere zeri inventati: fissarlo nel test del servizio e del rendering.
- Le uscite già protette non devono essere sottratte due volte dal margine radar: fissarlo nei test del calcolo corrente.
- Una ricorrenza pagata, sospesa o terminata non deve apparire come evento futuro: fissarlo nei test del contesto ricorrente.
- Il margine positivo non è condivisibile per intero tra obiettivi diversi: mostrare la stima individuale come ipotesi e fissare lo stato senza dati nel test obiettivi.

---

## Mappa dei file

| File | Responsabilità |
|---|---|
| `server/services/pianoSmartV2/changeTimeline.service.js` | Query aggregata dei movimenti e costruzione pura delle finestre di confronto. |
| `server/services/financialContext.service.js` | Occorrenze ricorrenti future, mantenendo invariati gli attuali impegni e `recurring.items`. |
| `server/services/pianoSmartV2/currentSituation.service.js` | Costruzione del radar e dei riepiloghi obiettivi dai dati già composti. |
| `server/controllers/pianoSmartV2.controller.js` | Passaggio della timeline storica al riepilogo autenticato. |
| `server/tests/pianoSmartChangeTimeline.test.js` | Finestre, totali, qualità, categoria e isolamento per utente. |
| `server/tests/financialContext.test.js` | Compatibilità degli eventi ricorrenti e nuove entrate future. |
| `server/tests/pianoSmartCurrentSituation.test.js` | Radar, affidabilità e collegamento agli obiettivi. |
| `server/tests/pianoSmartSituationContext.test.js` | Contratto HTTP, autenticazione, isolamento e assenza di scritture. |
| `client/src/components/piano-smart/PianoSmartChangeTimeline.vue` | Cursore, date e confronto visuale. |
| `client/src/components/piano-smart/PianoSmartCashFlowRadar.vue` | Eventi previsti e margine spendibile progressivo. |
| `client/src/components/piano-smart/PianoSmartGoalsSummary.vue` | Stato degli obiettivi e stime individuali. |
| `client/src/views/PianoSmartView.vue` | Ordine delle sezioni e composizione responsive. |
| `client/tests/pianoSmartView.test.js` | Presenza dei componenti e stati UI accessibili. |
| `docs/piano-smart-v2-api-contract.md` | Contratto additivo e limiti dei dati esposti. |

## Task 1: Aggregazioni storiche e punti timeline

**File:**

- Crea `server/services/pianoSmartV2/changeTimeline.service.js`
- Crea `server/tests/pianoSmartChangeTimeline.test.js`
- Modifica `server/controllers/pianoSmartV2.controller.js`
- Modifica `server/tests/pianoSmartSituationContext.test.js`

**Interfaccia:**

- Consuma: `userId` e data di riferimento `YYYY-MM-DD` da `getFinancialContext`.
- Produce: `getMovementDailyTotals(userId, referenceDate)` → righe aggregate; `buildChangeTimeline({ dailyTotals, referenceDate, firstMovementDate })` → `{ referenceDate, points[] }`.
- Ogni punto espone `days`, intervallo recente e precedente (`from`, `to`, `income`, `expenses`, `averageDailyExpenses`), differenze in centesimi serializzate come stringhe, massimo tre variazioni categoria, `quality`, `observedDays` e `currentPeriodPartial`.
- I valori `days` sono `[1..30, 37, 44, 51, 58, 65, 72, 79, 86, 90]`.

- [ ] **Passo 1: scrivere test che fissano finestre, segno delle differenze e granularità**

```js
test('confronta finestre inclusive uguali e include la granularità richiesta', () => {
  const result = buildChangeTimeline({
    dailyTotals: [],
    firstMovementDate: '2026-01-01',
    referenceDate: '2026-09-30',
  });
  expect(result.points.map((point) => point.days)).toEqual([
    ...Array.from({ length: 30 }, (_, index) => index + 1),
    37, 44, 51, 58, 65, 72, 79, 86, 90,
  ]);
  expect(result.points.find((point) => point.days === 1).recent.from).toBe('2026-09-30');
  expect(result.points.find((point) => point.days === 1).previous.to).toBe('2026-09-29');
});

test('non riempie con zeri gli intervalli precedenti al primo movimento', () => {
  const result = buildChangeTimeline({
    dailyTotals: [],
    firstMovementDate: '2026-09-30',
    referenceDate: '2026-09-30',
  });
  expect(result.points.find((point) => point.days === 90).quality).toBe('storico_limitato');
});
```

- [ ] **Passo 2: eseguire i test mirati e controllare il fallimento**

Eseguire `cd server && npm test -- tests/pianoSmartChangeTimeline.test.js`.
Atteso: fallimento perché le funzioni pure e la risposta `changes` non esistono.

- [ ] **Passo 3: implementare query limitata e aggregazione in centesimi**

La query `getMovementDailyTotals` deve usare `Movimento.findAll` con `where: { user_id: userId, data: { [Op.between]: [inizio180Giorni, referenceDate] }, tipo: { [Op.in]: ['entrata', 'uscita'] }, ricorrente: { [Op.ne]: true } }`, selezionare solo `data`, `tipo`, `categoria` e la somma di `importo`, raggruppare per data/tipo/categoria e ordinare per data. I modelli ricorrenti sono esclusi; gli addebiti generati sono inclusi perché sono movimenti effettivi. `buildChangeTimeline` riceve le righe aggregate e `firstMovementDate`, costruisce le finestre con le funzioni di data già presenti (`sommaGiorni`) e accumula gli importi con `toCents`/`fromCents` da `services/pianoSmart/money.js`.

Se `firstMovementDate` precede l'inizio disponibile, il punto usa `storico_disponibile`; se l'intervallo è coperto solo in parte, usa `storico_limitato`; se non c'è alcun movimento, usa `dati_insufficienti`. Non attribuire zero ai giorni antecedenti al primo movimento. Segnalare sempre che il giorno corrente è parziale.

Aggiornare il controller: leggere il contesto, passare la sua `referenceDate` a `getMovementDailyTotals`, chiamare `buildChangeTimeline` con le righe e `context.dataQuality.firstMovementDate`, quindi includere il risultato nel DTO di `buildCurrentSituation`. Filtrare la query per utente anche quando un utente non ha movimenti.

- [ ] **Passo 4: aggiungere test per importi e isolamento**

Creare movimenti entrata/uscita/trasferimento dello stesso giorno e un movimento appartenente a un secondo utente. Verificare che la differenza usa il segno `periodo recente - periodo precedente`, che il trasferimento è escluso, che il secondo utente non compare, che il punto `N=90` richiede al massimo 180 giorni e che `N=1` marca il giorno corrente parziale.

- [ ] **Passo 5: rieseguire i test mirati e verificare la risposta API**

Eseguire `cd server && npm test -- tests/pianoSmartChangeTimeline.test.js tests/pianoSmartSituationContext.test.js`.
Atteso: tutti i test passano; la rotta anonima risponde 401 e la rotta autenticata include `changes.points` senza scritture.

## Task 2: Ricorrenze future e radar dei flussi

**File:**

- Modifica `server/services/financialContext.service.js`
- Modifica `server/services/pianoSmartV2/currentSituation.service.js`
- Modifica `server/tests/financialContext.test.js`
- Modifica `server/tests/pianoSmartCurrentSituation.test.js`

**Interfaccia:**

- Consuma: ricorrenze attive, periodi e addebiti già rilevati.
- Produce: `context.recurring.cashFlowItems[]` per entrate e uscite fino a `referenceDate + 30 giorni`; `currentSituation.cashFlowTimeline` contiene data, direzione, importo, descrizione e margine dopo l'evento.
- Compatibilità: `context.recurring.items`, `context.recurring.commitments` e `currentSituation.upcoming` conservano il significato attuale.

- [ ] **Passo 1: testare entrate future, orizzonte 30 giorni e compatibilità**

Nel test di `financialContext` aggiungere una ricorrenza attiva in entrata, una in uscita nel mese seguente, un addebito già avvenuto e ricorrenze sospese/terminate. Verificare che `cashFlowItems` includa soltanto gli eventi futuri validi fino a 30 giorni, mentre `items` e `commitments` mantengono gli attuali risultati.

- [ ] **Passo 2: eseguire i test interessati e controllare il fallimento**

Eseguire `cd server && npm test -- tests/financialContext.test.js tests/pianoSmartCurrentSituation.test.js`.
Atteso: fallimento per gli eventi e il radar non ancora esposti.

- [ ] **Passo 3: aggiungere gli eventi futuri senza alterare la liquidità esistente**

In `riepilogoRicorrenti`, generare un nuovo elenco fino a `sommaGiorni(referenceDate, 30)` per entrambe le direzioni. Riutilizzare `valutaOccorrenza`, `periodoPerFrequenza` e la chiave di deduplica già impiegate dal cron. Mantenere l'elenco corrente delle uscite e i conteggi esistenti; calcolare gli impegni solo sulle uscite come prima.

In `buildCurrentSituation`, iniziare dal margine `availableToSpend`, aggiungere le entrate future e sottrarre soltanto le uscite con `reserved === false`. Le uscite già protette non si sottraggono una seconda volta. Ordinare gli eventi per data e calcolare il margine dopo ciascuno con centesimi interi; serializzare ogni importo come stringa decimale.

- [ ] **Passo 4: testare deduplica, margine e casi limite**

Verificare: evento pagato escluso; ricorrenza sospesa/terminata esclusa; entrata sommata una volta; uscita già protetta non sottratta due volte; uscita futura non protetta sottratta una volta; eventi alla data limite inclusi; risposta ordinata; nessun evento restituito quando mancano ricorrenze.

- [ ] **Passo 5: rieseguire i test mirati**

Eseguire `cd server && npm test -- tests/financialContext.test.js tests/pianoSmartCurrentSituation.test.js`.
Atteso: test nuovi e preesistenti passano senza cambi di `commitments` o degli impegni liquidità.

## Task 3: Affidabilità leggibile e obiettivi collegati

**File:**

- Modifica `server/services/pianoSmartV2/currentSituation.service.js`
- Modifica `server/tests/pianoSmartCurrentSituation.test.js`

**Interfaccia:**

- Consuma: `context.dataQuality`, le medie di `context.income` e `context.expenses`, `context.goals[]` e le metriche correnti già serializzate.
- Produce: ragioni esplicite per qualità limitata e `financialDirection.goals[]` arricchito con la stima per ogni obiettivo attivo; tempo teorico soltanto con almeno tre mesi completi e media positiva.

- [ ] **Passo 1: testare obiettivi senza margine, con dati insufficienti e con storico utile**

```js
test('non stima il raggiungimento quando il margine è nullo o lo storico è corto', () => {
  const situation = build({
    income: { monthlyAverage: 520 }, expenses: { monthlyAverage: 400 },
    dataQuality: { completeMonths: 2 },
    goals: [{ id: 1, importo_restante: 760, stato: 'in_corso' }],
  });
  expect(situation.financialDirection.goals[0].estimatedMonthsAtCurrentMargin).toBeNull();
});

test('stima un obiettivo individuale senza promettere una data certa', () => {
  const situation = build({
    income: { monthlyAverage: 520 }, expenses: { monthlyAverage: 400 },
    dataQuality: { completeMonths: 5 },
    goals: [{ id: 1, importo_restante: 760, stato: 'in_corso' }],
  });
  expect(situation.financialDirection.goals[0].estimatedMonthsAtCurrentMargin).toBe(7);
  expect(situation.financialDirection.goals[0].estimateBasis).toBe('margine_medio_mensile');
});
```

- [ ] **Passo 2: eseguire i test mirati e controllare il fallimento**

Eseguire `cd server && npm test -- tests/pianoSmartCurrentSituation.test.js`.
Atteso: i test falliscono finché `financialDirection.goals` non contiene la stima.

- [ ] **Passo 3: costruire il riepilogo obiettivi e la spiegazione dati**

Per ogni obiettivo non completato esporre `id`, `nome`, `importo_restante`, `scadenza`, `contributo_mensile_richiesto`, `stato` ed `estimatedMonthsAtCurrentMargin`. Convertire ogni importo in centesimi prima dei confronti. La durata è `ceil(importo_restante / margine_mensile)`; se residuo o margine sono nulli, il margine non è positivo, `completeMonths < 3` o manca un residuo valido, restituire `null` e un motivo leggibile. La stima resta individuale: non sommare né ripartire il margine tra gli obiettivi.

Arricchire la qualità corrente con i dati già disponibili: giorni osservati, mesi completi, classificazioni mancanti e avviso sulla completezza manuale non verificabile. Non generare una percentuale.

- [ ] **Passo 4: verificare stati e serializzazione**

Testare obiettivi completati, senza scadenza, scaduti, dati mancanti, margine negativo e due obiettivi attivi. Verificare importi in stringhe decimali e che il backend non scriva contributi.

- [ ] **Passo 5: rieseguire i test della situazione corrente**

Eseguire `cd server && npm test -- tests/pianoSmartCurrentSituation.test.js`.
Atteso: tutti i casi passano e i campi correnti non cambiano significato.

## Task 4: Componenti Piano Smart e gerarchia UI

**File:**

- Crea `client/src/components/piano-smart/PianoSmartChangeTimeline.vue`
- Crea `client/src/components/piano-smart/PianoSmartCashFlowRadar.vue`
- Crea `client/src/components/piano-smart/PianoSmartGoalsSummary.vue`
- Modifica `client/src/views/PianoSmartView.vue`
- Modifica `client/tests/pianoSmartView.test.js`

**Interfaccia:**

- Consuma: `currentSituation.changes`, `.cashFlowTimeline`, `.forecast` e `.financialDirection.goals` dal server.
- Produce: timeline selezionabile, flussi ordinati, spiegazione qualità e riepilogo obiettivi; nessuna formula finanziaria nel client.

- [ ] **Passo 1: fissare il markup accessibile atteso**

Aggiornare i test della view per verificare: controllo `input[type="range"]` con nome accessibile, valore iniziale 7 giorni, risoluzioni e intervalli mostrati; stato non disponibile per storico corto; timeline flussi con direzione testuale; stima obiettivo etichettata come teorica; rispetto di `prefers-reduced-motion`.

- [ ] **Passo 2: eseguire i test frontend e controllare il fallimento**

Eseguire `cd client && npm test`.
Atteso: i test che cercano i nuovi componenti e stati falliscono prima della loro introduzione.

- [ ] **Passo 3: realizzare i componenti con DTO del server**

Nel componente timeline usare i `points` API direttamente. Conservare solo l'indice di selezione locale, inizializzato sul punto `days === 7`; associare il valore del cursore all'indice del punto, così i passaggi 1–30 sono quotidiani e i successivi settimanali. Mostrare date, confronto e differenze con un segno e un'etichetta testuale oltre al colore. Se un punto è limitato, mostrare i giorni effettivamente coperti.

Nel radar mostrare gli eventi su una linea cronologica verticale, entrate e uscite distinguibili con testo e icona, più il margine spendibile dopo l'evento. Usare date `it-IT` e non chiamare il margine “saldo”.

Nel componente obiettivi mostrare nome, residuo, scadenza, contributo richiesto e stima teorica condizionale. Se la stima manca, esporre la ragione fornita dal backend.

In `PianoSmartView.vue` posizionare le nuove sezioni dopo l'eroe: analisi del cambiamento, previsione/qualità, radar, azioni e obiettivi, direzione finanziaria. Mantenere il simulatore e le schede Crea piano/Storico. Gli stati di caricamento e di errore della situazione non devono duplicarsi nei componenti.

- [ ] **Passo 4: verificare test UI e build**

Eseguire `cd client && npm test && npm run build`.
Atteso: test e build passano; la pagina mantiene la resa mobile, i controlli sono raggiungibili da tastiera e gli importi nulli non diventano zero.

## Task 5: Contratto API e verifica integrata

**File:**

- Modifica `docs/piano-smart-v2-api-contract.md`
- Modifica `server/tests/pianoSmartSituationContext.test.js`
- Modifica `client/tests/pianoSmartView.test.js` se la verifica finale individua un caso non coperto

**Interfaccia:**

- Consuma: DTO additivo prodotto dai Task 1–3.
- Produce: documentazione accurata di `changes`, `cashFlowTimeline`, obiettivi, date, qualità e limiti.

- [ ] **Passo 1: aggiungere controlli API per autenticazione, isolamento e sola lettura**

Verificare risposta 401 senza token, due utenti con movimenti e ricorrenze distinti, dati non incrociati, conteggio invariato dei movimenti e saldi dei conti invariati dopo la lettura.

- [ ] **Passo 2: documentare esempi e semantica dei campi**

Documentare valori possibili del cursore, definizione delle finestre, segno dei delta, giorno corrente parziale, stati di qualità, direzione degli eventi, convenzione del margine progressivo, stima individuale obiettivi e limiti della registrazione manuale.

- [ ] **Passo 3: eseguire verifica completa richiesta dal repository**

Eseguire `cd server && npm test`, poi `cd client && npm test && npm run build`.
Atteso: tutte le suite e la build passano. Se un test fallisce, correggere il problema o documentare con precisione il blocco prima di completare.

- [ ] **Passo 4: rivedere la diff e lo stato Git**

Controllare che siano incluse solo le modifiche Piano Smart e i file di documentazione previsti; preservare le modifiche preesistenti a `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `server/controllers/cron.controller.js`, `server/vercel.json` e `server/.gitignore`.
