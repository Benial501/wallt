# Orizzonte di spesa — cosa resta da fare

> Chiusura dell'implementazione del 12 ottobre 2026.
> Il lavoro è completo e revisionato; qui restano le cose deliberatamente
> lasciate fuori, con il motivo.

Spec: `docs/superpowers/specs/2026-10-12-orizzonte-piano-smart-design.md`
Piano: `docs/superpowers/plans/2026-10-12-orizzonte-piano-smart.md`

## Prima di pubblicare (obbligatorio)

1. **Eseguire la migrazione su Supabase prima del push su `main`.**
   `server/migrations/20261012000052-add-piano-smart-horizon.js` aggiunge
   `orizzonte_tipo` e `orizzonte_data` a `profili_utente`. In produzione le
   migrazioni non girano all'avvio: il modello dichiara le due colonne, quindi
   senza migrazione **ogni** lettura di `profili_utente` fallisce — l'app
   intera, non solo Piano Smart. La migrazione è idempotente
   (`describeTable` su entrambe le colonne) e la `down` è simmetrica.

2. **Aprire le due pagine in un browser con un backend vero.** In nessuna fase
   dell'implementazione è stato possibile completare questa verifica: non c'è
   mai stato un backend disponibile nella sessione di lavoro. La review finale
   ha osservato che **cinque dei nove difetti che ha trovato** sarebbero
   emersi alla prima apertura della pagina. Da provare: un utente a entrate
   irregolari, con tre mesi di storico e una data a ~6 mesi, guardando nello
   stesso giro l'hero, il pannello «Come è calcolato», il simulatore e la riga
   in Analisi; poi il passaggio ciclo mensile ↔ data, il redirect dalla vecchia
   rotta e la raggiungibilità del wizard da mobile.

3. **Separare il branch.** `orizzonte-piano-smart` contiene anche il lavoro
   Bank Sync di un'altra sessione, con i commit **interlacciati**: non esiste
   un intervallo pulito. `CLAUDE.md` e `docs/API.md` sono toccati da entrambi i
   lavori, quindi un cherry-pick selettivo incontrerà conflitti proprio lì.

## Rilievi minori rinviati

Tutti verificati e giudicati non bloccanti dalla review finale o dalla
re-review del giro di correzione.

- `currentSituation.service.js` — `forecast.scenarios.limite` non ha una
  guardia su `null`: in modalità data `dailyLimitCents` può essere `null`
  (stati `scaduto`/`non_stimabile`) con `forecast` non nullo, e `null * N === 0`
  rende `limite` pari a `available`. Nessun consumatore lato client: è una
  falsità solo nell'API.
- `docs/piano-smart-v2-api-contract.md` — `horizon.riservaFinoA` è un campo
  nuovo della risposta e non è documentato.
- `SituazioneHero.vue` — in modalità mensile con entrate **stabili**
  `riservaFinoA` vale `'0.00'` e non `null`, quindi la riga «− riserva
  prudenziale 0,00» compare per il profilo più comune: rumore nel pannello che
  la correzione voleva snellire.
- `currentSituation.service.js` — `protectedAmount` è ancora passato a
  `buildHorizonData` e non più usato: parametro morto.
- `OrizzonteSelector.vue` — il `v-for` dei mesi di riserva legge il massimo
  dalla costante condivisa ma parte comunque da 1, ignorando
  `RISERVA_MESI_MIN`.
- `orizzonte.service.js` — con capitale libero esattamente zero e ritmo
  positivo, `dataRaggiungibile` vale la data di riferimento invece di `null`.
  Caso limite; ora quel campo alimenta anche i giorni di autonomia del
  simulatore.
- `client/src/content/helpTopics.js` — l'argomento generico `piano-smart` è
  stato riscritto per le due pagine, ma vale una rilettura d'insieme ora che
  la divisione è compiuta.

## Debito tecnico osservato

- **Prestazioni della finestra lunga.** `financialContext.service.js` proietta
  le ricorrenze iterando **giorno per giorno** e istanziando un
  `Intl.DateTimeFormat` a ogni giorno per ogni ricorrenza: misurati **439 ms**
  per 10 ricorrenze su 1.095 giorni. Si somma al fatto che il controller
  riesegue `riepilogoRicorrenti` per intero (circa 4 query duplicate)
  scartandone tutto tranne `.horizon`. Rimedio: iterare per occorrenza invece
  che per giorno, o memoizzare il formatter.
- **Un helper `proiettaOccorrenze`.** I tre cicli di proiezione in
  `financialContext.service.js` ripetono lo stesso scheletro. La duplicazione
  era la condizione per restare additivi rispetto ai consumatori esistenti;
  ora che la terza finestra esiste, vale un'estrazione.
- **Dimensione dei file.** La divisione ha risolto il problema di prodotto (due
  nomi per due domande), non quello di dimensione: `PianoSmartView.vue` resta
  grande e `SituazioneView.vue` nasce con tre tab.

## Fuori perimetro, aperto come lavoro separato

`server/tests/saldoEffettivo.test.js` ha **2 test rossi preesistenti** a tutto
questo lavoro, riprodotti identici sul commit di partenza: la POST che crea una
spesa programmata non restituisce `movimento`, e il test a riga 243 vi accede.
Non è una regressione dell'orizzonte di spesa e non va nascosto in questo merge.
