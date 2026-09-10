# Fondamenta: stato dei dati e terminologia del patrimonio — Specifica

> Sotto-progetto **A** della proposta di evoluzione UX di WALLT (blocchi 1 e 2).
> I blocchi 3, 4, 5 e 6 sono sotto-progetti separati, con spec proprie.

## Obiettivo

Impedire che un errore di rete venga interpretato dall'utente come una perdita dei propri dati, e dare a ogni cifra mostrata un nome stabile e una definizione unica in tutta l'applicazione.

Sono due problemi distinti ma inseparabili nel codice: toccano gli stessi store e le stesse schede. Affrontarli insieme evita di riscrivere due volte le stesse righe.

## Contesto: cosa c'è già e cosa manca

L'analisi del codice esistente ha ristretto il perimetro rispetto alla proposta iniziale.

**Il difetto del blocco 1 è reale e localizzato.** Nessuno store espone `error` o `lastUpdated`, e in più punti il gestore dell'errore azzera i dati:

- `client/src/stores/budget.store.js:44` — `catch { statoBudget.value = []; }`
- `client/src/views/BudgetView.vue:150` — `v-if="!budgetStore.hasBudget && modalita === 'view' && !budgetStore.loading"` mostra **"Nessun budget per <mese>"**. Quando `fetchBudget` fallisce, `hasBudget` è falso e `loading` è falso: all'utente viene comunicato che il budget non esiste.
- `client/src/views/AnalisiView.vue:414` — stesso schema con `!hasData && !analisiStore.loading`.

**Il blocco 2 non richiede modifiche ai calcoli.** `GET /conti/patrimonio` restituisce già `totale`, `totale_conti` e `totale_investimenti` (`server/controllers/conti.controller.js:248`), e `GET /conti` usa la stessa identica formula. `GET /movimenti/bilancio` filtra già `tipo IN ('entrata','uscita')`, quindi i trasferimenti sono già esclusi dal risultato del mese. Il difetto è esclusivamente nelle etichette e nel fatto che il client scarta la scomposizione che il server gli manda.

Lo stesso numero ha oggi tre nomi diversi:

| File | Etichetta attuale | Valore effettivo |
|---|---|---|
| `client/src/components/custom/WOverviewCarousel.vue:224` | "Saldo del conto" | conti + investimenti |
| `client/src/views/ContiView.vue:164` | "Patrimonio totale" | lo stesso numero |
| `client/src/components/dashboard/GlassBalanceCard.vue:29` | "Patrimonio Totale" | lo stesso numero (componente non usato) |

## Decisioni prese

| Ambito | Decisione | Motivo |
|---|---|---|
| Persistenza dei dati validi | Solo in memoria, per la durata della sessione | Nessun importo o saldo viene scritto su disco. Coerente con la scelta già fatta sulle notifiche push, il cui payload non contiene mai importi |
| Calcolo del patrimonio | Invariato: tutti i conti attivi restano nella componente "Conti" | Il blocco 2 è un lavoro di chiarezza; cambiare anche il calcolo lo trasformerebbe in un lavoro sui saldi, che è l'area più delicata del progetto |
| Granularità dell'avviso | Per sezione, sulla singola scheda | Dire "i dati" quando è fallito solo il budget farebbe dubitare anche dei saldi, che invece sono corretti |
| Meccanismo | Factory negli store più componente di presentazione | La regola "non azzerare i dati sull'errore" diventa una proprietà del codice, non una disciplina da ricordare |
| Ampiezza | I sette store che alimentano la dashboard | Con l'avviso per sezione, migrarne solo una parte lascerebbe schede silenziosamente vecchie nella pagina vetrina del blocco 1 |
| Nome della prima componente | "Conti", non "Disponibilità totale" | Vedi sotto |
| Timestamp | Lato client, alla ricezione della risposta | Vedi sotto |

### Due deviazioni dalla proposta originale

**"Conti" invece di "Disponibilità totale".** La proposta definisce la prima voce come *"somma dei conti attivi e immediatamente spendibili"*. Poiché il calcolo resta invariato, quella somma comprende anche i conti di tipo `scommesse` e `risparmio`: definirla "immediatamente spendibile" sarebbe falso. Il termine "Disponibilità" resta riservato alle previsioni di cassa (blocco 6C), dove la definizione stretta sarà necessaria e corretta.

**Timestamp lato client invece che lato server.** La proposta chiede che l'API restituisca la data di aggiornamento. Il server però calcola questi valori su richiesta e non li tiene in cache: una data restituita dall'API sarebbe l'orologio del server per lo stesso istante, per giunta in UTC su Vercel. `lastUpdated` significa qui "l'ultima volta che siamo riusciti a chiedere", ed è un'informazione che solo il client possiede.

## Il meccanismo delle risorse

### `client/src/utils/risorsa.js`

Una factory che avvolge una funzione di fetch e ne governa lo stato:

```js
const risorsa = creaRisorsa(fetcher, { iniziale, vuotoSe });
// → { data, loading, error, lastUpdated, stato, carica, riprova, reset }
```

**Parametri.** `fetcher` è una funzione asincrona che restituisce i dati già estratti dalla risposta. `iniziale` è il valore di partenza di `data` (`[]`, `{}`, `null` secondo il caso). `vuotoSe` è un predicato che decide cosa significa "vuoto" per quella risorsa; in assenza, il default considera vuoto un array di lunghezza zero oppure un valore `null`/`undefined`.

**Stati.** `stato` è una proprietà calcolata che restituisce uno fra cinque valori, valutati in quest'ordine:

| Ordine | stato | Condizione | Presentazione |
|---|---|---|---|
| 1 | `caricamento` | richiesta in corso e nessun successo precedente | scheletro |
| 2 | `errore` | fallita e nessun successo precedente | pannello evidente con "Riprova" |
| 3 | `errore-con-dati` | fallita, ma esiste un successo precedente | dati, più avviso discreto |
| 4 | `vuoto` | dati validi, ma `vuotoSe(data)` è vero | stato vuoto esplicativo |
| 5 | `pronto` | dati validi e non vuoti | dati |

L'ordine è vincolante. In particolare `caricamento` precede `errore`, così un tentativo di "Riprova" dopo un fallimento senza dati mostra di nuovo lo scheletro invece di lasciare il pannello d'errore fino alla risposta.

La proposta originale elencava quattro stati; il quinto nasce dalla sua stessa richiesta di un "messaggio più evidente solo quando non esistono dati precedenti". La distinzione fra `errore` e `errore-con-dati` è esattamente quella condizione, resa esplicita.

**Invarianti.** Sono le due proprietà che giustificano l'esistenza della factory:

1. In caso di fallimento, `carica()` scrive **soltanto** `error`. Non tocca `data` e non tocca `lastUpdated`.
2. `lastUpdated` registra l'istante dell'ultima risposta **riuscita**. Un fallimento non lo aggiorna mai, quindi l'orario mostrato all'utente non può mentire.

**Guardia sulle richieste concorrenti.** Ogni chiamata a `carica()` riceve un numero di sequenza; alla risposta, se nel frattempo è partita una richiesta più recente, il risultato viene scartato. Serve perché la dashboard lancia otto caricamenti in parallelo e `onSaved` li rilancia tutti insieme: senza guardia, una risposta lenta partita prima può sovrascrivere una veloce partita dopo, facendo tornare i saldi indietro nel tempo. È un difetto già oggi possibile.

**`reset()`** riporta la risorsa allo stato iniziale: `data` al valore `iniziale`, `error` e `lastUpdated` a `null`.

### `client/src/components/common/DataState.vue`

Componente esclusivamente di presentazione: riceve uno stato e sceglie cosa mostrare. Non conosce axios, non conosce gli store, non decide nulla.

**Interfaccia.** Proprietà: `stato`, `lastUpdated`, `messaggioErrore`, più le opzioni dello scheletro (`skeletonType`, `skeletonLines`) passate a `WSkeleton`, che esiste già. Slot: `default` per i dati, `vuoto` per lo stato vuoto. Evento: `riprova`.

**Resa per stato.** `caricamento` rende `WSkeleton`. `vuoto` rende lo slot omonimo. `pronto` rende lo slot `default`. `errore-con-dati` rende lo slot `default` preceduto da un avviso discreto. `errore` rende un pannello evidente al posto dei dati.

**Testo dell'avviso discreto**, come da proposta:

> Non è stato possibile aggiornare i dati. Stai visualizzando l'ultimo aggiornamento disponibile.

accompagnato dall'orario dell'ultimo aggiornamento riuscito, dall'indicatore "Dati non aggiornati" e dal pulsante "Riprova".

**Accessibilità.** L'avviso discreto è `role="status"` (annuncio non interruttivo); il pannello d'errore è `role="alert"`. L'indicatore "Dati non aggiornati" porta icona **e** testo, mai il solo colore: anticipa la regola del blocco 5 invece di richiedere una correzione successiva. Il pulsante "Riprova" è un `<button>` reale, raggiungibile da tastiera.

**Formato dell'orario.** Assoluto e non relativo: "aggiornati alle 14:32" se la data è odierna, "aggiornati il 9 set alle 14:32" altrimenti. Un orario relativo richiederebbe un timer per restare veritiero; quello assoluto è anche ciò che la proposta chiede letteralmente.

## Adozione negli store

Migrano i sette store che alimentano la dashboard: `conti`, `movimenti`, `budget`, `analisi`, `obiettivi`, `investimenti`, `scommesse`.

Ogni fetch di lettura diventa una risorsa con stato proprio. Gli store conservano la loro interfaccia pubblica dove possibile, per non propagare la modifica a viste non coinvolte.

**`analisi.store` è il caso che guadagna di più.** Oggi un solo `loading` è condiviso da cinque fetch distinti: caricare la distribuzione delle spese accende lo scheletro anche del confronto e dei suggerimenti, e spegnerlo per uno lo spegne per tutti. Con `creaRisorsa` ciascuno dei cinque acquista lo stato proprio, e il difetto si risolve come conseguenza della migrazione anziché come intervento separato.

**`movimenti.store` è già nella forma giusta**: ha flag separati per concern (`loading`, `loadingMore`, `loadingBilancio`, `loadingRecenti`). Conferma che la direzione è quella naturale del progetto.

**Le ultime tre sono le più economiche**, perché **preservano già** i dati in caso di errore: manca soltanto comunicarlo all'utente. Scommesse e investimenti perché `DashboardView.vue:171` e `DashboardView.vue:189` intercettano l'errore con un `catch` che commenta "la card resta nello stato precedente"; obiettivi per una ragione diversa, cioè che `obiettivi.store.fetchObiettivi` usa `try/finally` senza azzerare e lascia risalire l'errore. La migrazione unifica i due meccanismi.

### Due casi che non usano l'avviso standard

**Paginazione (`loadMoreMovimenti`).** Se fallisce il caricamento della pagina successiva, i dati già presenti restano validi e freschi: non si tratta di "stai vedendo un vecchio aggiornamento". L'errore va mostrato inline vicino al pulsante "Carica altri". La risorsa espone `error`; è la vista a scegliere come renderlo.

**Ricariche dopo una scrittura.** `client/src/utils/afterWrite.js` già distingue "scrittura riuscita" da "vista non aggiornata" e comunica `VISTA_NON_AGGIORNATA`. Quel percorso non viene modificato: `afterWrite` governa le scritture, `DataState` governa le letture. Restano due meccanismi distinti e non vanno unificati.

### Ricaduta sul reset di sessione

`resetPiniaStores` in `client/src/utils/session.js:20` azzera i campi manualmente, store per store; il difetto noto numero 9 del `CLAUDE.md` documenta che dimentica `recentiHome` e parti di `scommesse`. Poiché ogni risorsa espone `reset()`, il logout potrà azzerarle in modo uniforme anziché elencare campi. La parte di quel difetto relativa agli store migrati si chiude come conseguenza del lavoro in corso.

## Adozione nelle pagine

Le viste perdono le condizioni della forma `v-if="!x && !loading"` e avvolgono le sezioni in `<DataState>`.

Gli stati vuoti esistenti **non vengono riscritti**: sono già buoni, con icona, titolo e spiegazione. Vengono spostati nello slot `vuoto`, dove non possono più essere mostrati al posto di un errore.

Pagine coinvolte: `DashboardView` (sette schede del carosello, ciascuna con il proprio stato), `ContiView`, `BudgetView`, `AnalisiView`, `MovimentiView`, `ObiettiviView`, `InvestimentiView`, `ScommesseView`.

## Terminologia e composizione del patrimonio

### `client/src/content/glossario.js`

Un catalogo statico dei concetti finanziari mostrati all'utente, sul modello di `client/src/content/helpTopics.js`, che è già la convenzione del progetto per i testi rivolti all'utente.

| Concetto | Etichetta | Formula | Origine del dato |
|---|---|---|---|
| Patrimonio totale | "Patrimonio totale" | conti attivi + investimenti attivi | `GET /conti/patrimonio` → `totale` |
| Componente conti | "Conti" | somma dei saldi dei conti attivi | → `totale_conti` |
| Componente investimenti | "Investimenti" | valore corrente degli investimenti attivi | → `totale_investimenti` |
| Risultato del mese | "Risultato del mese" | entrate − uscite, trasferimenti esclusi | `GET /movimenti/bilancio` → `saldo` |

Nessun endpoint nuovo, nessuna modifica al server.

### Modifiche al client

`conti.store` smette di scartare `totale_conti` e `totale_investimenti`, che il server già invia, e li espone insieme a una proprietà calcolata `composizionePatrimonio`.

La prima scheda della dashboard diventa:

```
Patrimonio totale ⓘ
741,00 €
Conti 241,00 € · Investimenti 500,00 €
```

`ContiView` e `MovimentiView` leggono le etichette dal glossario anziché scriverle in linea.

### Il pulsante informativo

Non richiede componenti nuovi. `HelpTrigger` con `variant="quiet"` è già un pulsante con la sola icona ed etichetta accessibile, che apre `HelpPanel`. Serve unicamente un nuovo argomento in `helpTopics.js` che spieghi la formula del patrimonio e chiarisca che i trasferimenti fra conti non sono né entrate né uscite.

### Rimozione di componenti non utilizzati

Cinque componenti non sono importati da alcun file del client, come verificato per ricerca sull'intera cartella `client/src`:

- `client/src/components/dashboard/GlassBalanceCard.vue`
- `client/src/components/dashboard/SummaryCards.vue`
- `client/src/components/dashboard/CategoryCarousel.vue`
- `client/src/components/dashboard/CategoryCard.vue` (usato soltanto da `CategoryCarousel`)
- `client/src/views/PlaceholderView.vue`

Vengono eliminati. La ragione non è la pulizia in sé ma il fatto che `GlassBalanceCard` contiene un'etichetta concorrente per lo stesso numero: lasciandola, il glossario avrebbe una fonte di verità rivale nel repository. La rimozione chiude anche il difetto noto numero 4 del `CLAUDE.md`.

## Test

Il client dispone di `node --test tests/*.test.js` su moduli JavaScript puri: non esiste infrastruttura per il test dei componenti, e introdurre `vitest` o `@vue/test-utils` sarebbe una dipendenza nuova, contraria alla regola 5 del `CLAUDE.md`.

Questo vincolo è recepito nel design anziché subito: **tutta la logica risiede in `risorsa.js`, che è JavaScript puro e verificabile; `DataState.vue` resta abbastanza semplice da non richiedere test**, perché riceve uno stato e sceglie uno slot senza prendere decisioni proprie.

**`client/tests/risorsa.test.js`** copre la macchina a stati:

- un fallimento non modifica `data` né `lastUpdated`;
- con un successo precedente lo stato è `errore-con-dati`; senza, è `errore`;
- un tentativo riuscito dopo un errore azzera `error` e aggiorna `lastUpdated`;
- durante un nuovo tentativo senza dati precedenti lo stato torna `caricamento`;
- una risposta lenta partita prima non sovrascrive una veloce partita dopo;
- `vuoto` non viene mai restituito quando `error` è valorizzato;
- `reset()` riporta ogni campo al valore iniziale.

**`client/tests/glossario.test.js`**, sul modello di `client/tests/helpTopics.test.js`: identificatori unici, ogni concetto provvisto di etichetta e descrizione, e l'argomento di aiuto referenziato dalla scheda del patrimonio effettivamente esistente in `helpTopics.js`.

**Server**: nessun test nuovo e nessuna modifica. I blocchi 1 e 2 non toccano il backend. `cd server && npm test` va comunque eseguito come conferma di non-regressione.

**Verifica manuale obbligatoria**, perché non copribile dai test disponibili:

1. `AnalisiView` con i cinque stati ora indipendenti, per confermare che il comportamento degli scheletri sia migliorato e non degradato;
2. la dashboard con la rete disattivata dopo un primo caricamento riuscito, per verificare che le schede mostrino i dati con l'avviso anziché svuotarsi;
3. `BudgetView` con `GET /budget/:anno/:mese` in errore, per verificare che non compaia più "Nessun budget per <mese>";
4. `npm run build` deve completare, a conferma che i cinque componenti rimossi non fossero importati dinamicamente.

## Rischi

| Rischio | Gravità | Mitigazione |
|---|---|---|
| Regressione sui saldi | Alta se presente | Azzerata per costruzione: nessuna modifica ai calcoli, nessuna modifica al server, percorso `afterWrite` non toccato. Il blocco 2 rinomina, non ricalcola |
| Il `loading` condiviso di `analisi.store` spezzato in cinque | Media | Cambia il comportamento visibile degli scheletri in `AnalisiView`: è un miglioramento che può apparire come regressione. Verifica manuale a schermo, punto 1 |
| Sette sezioni per cinque stati: trentacinque combinazioni sulla dashboard | Media | Non verificabili manualmente. La macchina a stati è testata una volta sola in `risorsa.test.js`; le sezioni si limitano a consumarla |
| Un import dinamico sfuggito alla ricerca dei componenti rimossi | Bassa | `npm run build` fallisce su import mancanti; ricerca aggiuntiva dei nomi dei file come stringhe |
| L'astrazione `creaRisorsa` non si adatta a uno store | Bassa | La migrazione procede uno store per volta; se uno non si adatta resta con lo schema attuale e la cosa viene documentata |

## Documentazione da aggiornare

Al termine del sotto-progetto A:

- **`CLAUDE.md`**: nuova regola nella sezione Coding Rules sugli store (`creaRisorsa`, divieto di azzerare i dati in caso di errore) e sul glossario come fonte unica delle etichette. Chiusura del difetto noto numero 4 e della parte del numero 9 relativa agli store migrati.
- **`docs/PROJECT_STATUS.md`**: stato e roadmap.
- **`docs/ARCHITECTURE.md`**: il pattern delle risorse negli store Pinia.
- **`client/src/content/helpTopics.js`**: argomento sul calcolo del patrimonio. È il primo pezzo dell'aggiornamento complessivo dell'aiuto, che verrà completato al termine di tutti i sotto-progetti.

## Fuori perimetro

Appartengono ai sotto-progetti successivi e non vanno anticipati qui:

- selettore di periodo, tooltip e valori del grafico principale (blocco 3);
- ricerca testuale e ordinamento dei movimenti, che richiedono lavoro sull'API (blocco 4);
- revisione di contrasto, dimensioni tipografiche e `prefers-reduced-motion` (blocco 5);
- centro movimenti ricorrenti, controllo qualità degli import, budget suggerito dallo storico, previsioni di cassa (blocco 6);
- persistenza dei dati su `localStorage`: esplicitamente esclusa, non rimandata.
