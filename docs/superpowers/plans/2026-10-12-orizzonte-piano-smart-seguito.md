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

## Un falso difetto, chiarito

Durante il lavoro `server/tests/saldoEffettivo.test.js` mostrava **2 test
rossi**, e sono stati a lungo creduti un difetto preesistente del repository:
erano stati riprodotti identici sul commit di partenza, il che sembrava
escludere che fossero una regressione.

**Non erano un difetto del codice.** Erano contaminazione del database di test
condiviso: su un database fresco, con il file di test identico a quello di
`main`, la suite passa **30/30**.

L'errore di metodo vale più della conclusione: la riproduzione sul commit di
partenza teneva costante il *codice*, ma teneva costante anche il *database*, ed
era quello la variabile vera. Un fallimento che si riproduce "anche prima" non è
per questo un difetto preesistente del codice: lo è solo se l'ambiente è stato
isolato.

Da qui la prassi: quando una suite fallisce in modo inspiegabile, **prima** si
riesegue su un database appena creato, poi si cerca nel codice. Il commit
`9eb804d` su `main` («Dà a ogni checkout il proprio database di test») risolve
la causa alla radice.

## Fuori perimetro, aperto come lavoro separato

Niente. I 2 test rossi di `server/tests/saldoEffettivo.test.js` che erano stati
aperti come lavoro separato **non esistono**: vedi la sezione precedente. Su un
database isolato la suite passa 30/30.

## Rilievi emersi dalla verifica nel browser (13 ottobre)

La verifica a schermo ha trovato **tre difetti Critici**, tutti corretti
(`c89b876`, `733e433`, `424b152`). Erano tutti e tre nelle **giunture** fra i
pezzi — database → contesto, contesto → rotta, motore → serializzazione — che
i test unitari non attraversano, perché costruiscono ogni pezzo a mano.

Questi invece sono i rilievi **minori** emersi nello stesso giro, non corretti:

- Il simulatore chiede «Vuoi sapere come cambierebbe **il tuo mese**?» anche in
  modalità data, dove l'orizzonte può essere di 200 giorni.
- «Quota del margine usata: **basso**» — concordanza sbagliata (*bassa*), e
  ormai ridondante accanto alla frase sui giorni di autonomia.
- Il suggerimento «Stai spendendo circa **31.92** al giorno contro **20.47**
  disponibili» usa il **punto** invece della virgola: è testo generato dal
  server, mentre tutti gli altri numeri della pagina sono formattati in
  italiano.
- «Metti da parte **€255,00**» mette il simbolo prima, dove altrove è
  «255,00 €».
- Nello stato `scaduto` la riga di contesto dice ancora «per arrivare al 12
  ottobre · 0 giorni» accanto a «la data è passata»: si potrebbe sopprimere.
- La previsione di fine mese dice «Quanto potrebbe restare dello
  **spendibile**», un'etichetta che la specifica voleva ritirare.
- Con capitale negativo, «Ritmo attuale … **31,92 € sopra il budget**» è
  aritmeticamente giusto (il budget è zero) ma suona strano.

## Un comportamento da non "correggere" per errore

La validazione **rifiuta** la data di oggi quando l'utente la imposta (400: «la
data deve essere nel futuro»), mentre il motore gestisce correttamente il caso
`giorni = 1`. Non è una contraddizione: non si può **scegliere** oggi — un
orizzonte che scade stasera non è una pianificazione — ma la data scelta
**arriva**, e quel giorno la pagina funziona. Verificato a schermo: stato
`in_rotta`, un giorno, tutto il capitale spendibile.

Chi in futuro allineasse la validazione al motore «per coerenza» permetterebbe
di scegliere un orizzonte privo di senso.

## Nota sulle rotte

Il prefisso reale delle rotte della seconda versione è `/api/piano-smart/v2`
(`server/app.js:156`), non `/api/piano-smart-v2` come scritto nella specifica,
nei brief e in parte del contratto. Da allineare nella documentazione.
