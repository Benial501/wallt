# WALLT — Blocchi 3, 4, 5 e 6: brief per la prossima iterazione

> Punto di partenza per riprendere la proposta di evoluzione UX di WALLT.
> I blocchi 1 e 2 sono stati completati e mergiati su `main` (commit `35cbb56`).
> Questo documento copre i quattro che restano.

## Come usare questo documento

Incollalo come messaggio iniziale, oppure di' semplicemente: *"leggi
`docs/superpowers/briefs/2026-09-14-blocchi-3-6-brief.md` e partiamo dal
sotto-progetto B"*.

Il processo che ha funzionato per i blocchi 1 e 2, da ripetere:
brainstorming → spec → piano → esecuzione subagent-driven con review per task
→ review finale di branch. Non saltare la review finale: sui blocchi 1-2 ha
trovato un difetto critico che dodici review di task non avevano visto.

---

## Parte 1 — Cosa esiste già (e cambia il costo di tutto)

Queste sono le scoperte fatte leggendo il codice durante i blocchi 1-2. Senza
di esse si rischia di ricostruire cose che ci sono.

### Convenzioni introdotte dai blocchi 1-2, da seguire

| Cosa | Dove | Regola |
|---|---|---|
| Stato delle letture | `client/src/utils/risorsa.js` | Ogni lettura API passa da `creaRisorsa`. Un `catch` non deve **mai** azzerare i dati |
| Presentazione dello stato | `client/src/components/common/DataState.vue` | Cinque stati; lo stato vuoto va nello slot `vuoto`, mai in un `v-if="!dati && !loading"` |
| Etichette finanziarie | `client/src/content/glossario.js` | Si leggono con `etichetta(id)`, non si scrivono in linea |
| Contenuti di aiuto | `client/src/content/helpTopics.js` | Testo semplice, nessun dato finanziario, id stabili |

### La trappola che è costata di più

**Pinia srotola i `ref` esposti al primo livello di uno store.** Letto
attraverso lo store, `store.risorsaX.stato` **è già** la stringa: scrivere
`.value` produce `undefined`, e su `.error` produce un `TypeError` che rompe il
render. Ha attraversato dodici review perché era nel piano.

Ma un `computed` dello store che restituisce l'oggetto risorsa **grezzo** non
viene srotolato: lì `.value` serve. `client/src/views/InvestimentiView.vue` ha
un caso di ciascuno, a poche righe di distanza.

`client/tests/storeUnwrap.test.js` fissa il contratto. Leggerlo prima di
scrivere qualunque nuova vista.

### Endpoint già pronti che i blocchi nuovi userebbero

| Endpoint | Restituisce già | Serve a |
|---|---|---|
| `GET /analisi/andamento-patrimonio` | `punti[]` con `patrimonio`, `label`, `labelEsteso`, `data`, `fine`, `delta`; più `inizio`, `fine`, `min`, `max`, `variazione_importo`, `variazione_percentuale` | **Blocco 3, quasi per intero** |
| `GET /movimenti/ricorrenti` | movimenti ricorrenti con il conto incluso | **Blocco 6A** |
| `POST /importazioni/upload` | `summary` con `nuove`, `duplicate`, `categorizzate`, `merchant_riconosciuti`, `da_verificare` | **Blocco 6D**, metà |
| `GET /conti/patrimonio` | `totale`, `totale_conti`, `totale_investimenti`, variazioni | già usato dal blocco 2 |

### Cose che NON esistono e vanno costruite sul server

- **Ricerca testuale e ordinamento per importo** sui movimenti. `getMovimenti`
  (`server/controllers/movimenti.controller.js:40`) filtra solo per
  `tipo`, `categoria`, `conto_id`, `da`, `a`, e ordina solo per data o
  `createdAt`. È l'unico lavoro backend del blocco 4.
- **Qualunque cosa per le previsioni di cassa** (blocco 6C).
- Il budget suggerito esiste (`calcolaBudgetSuggerito` in
  `server/controllers/profilo.controller.js:74`) ma è calcolato sul **profilo
  dichiarato**, non sullo storico. Il blocco 6B chiede una seconda sorgente,
  non una sostituzione.

---

## Parte 2 — Decomposizione proposta

Due sotto-progetti, come concordato all'inizio. Ognuno con spec e piano propri.

### Sotto-progetto B — Leggibilità
**Blocco 5 → Blocco 3 → Blocco 4**, in quest'ordine.

Il 5 va per primo perché definisce i token: facendolo dopo, il grafico e i
filtri andrebbero ritoccati. È la stessa ragione per cui nei blocchi 1-2 il
maiuscolo del carosello è stato anticipato.

### Sotto-progetto C — Funzioni nuove
**6A → 6D → 6B → 6C**, l'ordine che avevi indicato e che condivido: valorizza
API già presenti, e crea dati affidabili prima di introdurre previsioni.

---

## Parte 3 — I quattro blocchi, nel dettaglio

### Blocco 5 — Contrasto, leggibilità, accessibilità

**Stato:** sfiorato dai blocchi 1-2, non affrontato.

Già fatto per effetto collaterale:
- maiuscolo tolto da `.w-overview__eyebrow` (il carosello della dashboard)
- aree da 44×44 px sui pulsanti "Riprova"
- verde/rosso mai da soli negli avvisi: sempre icona **e** testo
- `role="status"` / `role="alert"` su `DataState`

Da fare:
- **Audit dei contrasti** su `client/src/assets/styles/variables.css`. Il file
  è maturo e ben organizzato: intervenire lì, non pagina per pagina. Attenzione
  ai token `--text-muted`, `--text-subtle` e `--divider`, che sono i sospetti.
- **Dimensione minima 14 px** per le informazioni operative. Alla scrittura di
  questo documento c'erano ~85 occorrenze di `font-size` sotto `0.875rem`;
  rifare il conteggio prima di partire, perché i blocchi 1-2 hanno toccato
  alcuni di quei file.
- **`prefers-reduced-motion`**: presente solo in una decina di file su ~60.
- **`text-transform: uppercase`**: ne restano alcune, fra cui
  `.w-overview__feature-label`, deliberatamente non toccata perché fuori dal
  perimetro di allora.
- **Focus da tastiera**: esiste già il token `--focus-ring`; verificare che sia
  applicato ovunque, non solo dove è stato aggiunto di recente.
- Verifica finale su Dashboard, Movimenti, Conti e Impostazioni, in tema chiaro
  e scuro, a zoom 200% e da tastiera.

**Rischio:** è il blocco che tocca più superficie con meno test possibili.
Nessun test automatico copre il contrasto. Prevedere verifica a schermo come
passo obbligatorio, non opzionale.

---

### Blocco 3 — Grafico principale

**Stato:** non iniziato. **Il server è già pronto.**

`GET /analisi/andamento-patrimonio` restituisce già tutto ciò che la tua
proposta elenca, tranne gli "indicatori per movimenti particolarmente
rilevanti". Il lavoro è quasi interamente client.

Da fare:
- **Componente riutilizzabile** — la proposta chiede che Dashboard e Analisi
  usino gli stessi risultati. Oggi la dashboard disegna una `sparklinePath` a
  mano in `WOverviewCarousel.vue` e Analisi usa Chart.js: due strade per la
  stessa serie.
- **Selettore `7 giorni` / `30 giorni` / `3 mesi` / `1 anno`.** Attenzione:
  l'endpoint accetta `unita` + `quantita` (e i parametri legacy `mesi` e
  `periodo`, mantenuti per compatibilità fra rilasci separati di client e API —
  **non rimuoverli**). "7 giorni" richiede `unita: 'giorno'`: verificare che
  `buildPeriodi` lo supporti prima di prometterlo nella UI.
- **Tooltip al tocco su mobile**, non solo hover.
- **Valore iniziale e finale, variazione assoluta e percentuale.** L'endpoint
  li dà già: `inizio`, `fine`, `variazione_importo`, `variazione_percentuale`.
- **Stato vuoto che spiega quanti dati servono.** Da fare con `DataState` e il
  suo slot `vuoto`.
- **Mai solo colore**: segno, icona e testo devono dire la stessa cosa. È la
  regola già applicata negli avvisi dei blocchi 1-2.

**Nota progettuale:** la percentuale può essere enorme e priva di significato
(un utente che parte da zero vede `+∞%`). La proposta lo dice: affiancare
sempre il valore in euro. Considerare di nascondere la percentuale quando la
base è vicina a zero.

---

### Blocco 4 — Filtri dei movimenti

**Stato:** non iniziato. **È l'unico blocco che richiede lavoro sul server.**

Server:
- Aggiungere a `getMovimenti` la ricerca testuale (descrizione, e valutare
  importo) e l'ordinamento per importo. Oggi accetta solo `ordine=caricamento`.
- Aggiornare `validateMovimentiQuery` in
  `server/middleware/validation.middleware.js:49`.
- **Aggiungere test**: `server/tests/` ha già suite su isolamento cross-user e
  coerenza saldi. Un filtro che perde l'isolamento per utente sarebbe un difetto
  di sicurezza, non di UX.

Client:
- Componente `MovimentiFilters` separato dalla lista: pannello laterale su
  desktop, foglio dal basso su mobile. Esiste già `BottomSheet.vue`.
- Tre livelli: filtri rapidi / categorie recenti / pannello completo con ricerca.
- Raggruppamento delle categorie in sezioni (Casa, Alimentazione, Trasporti,
  Salute, Tempo libero, Finanza). **Attenzione:** le categorie sono definite in
  `server/constants/catalogoCategorie.json` e in `client/src/utils/categorie.js`,
  e l'utente può crearne di proprie e nasconderne di predefinite. Il
  raggruppamento deve reggere una categoria personale che non appartiene a
  nessun gruppo.
- Filtri attivi come elementi rimovibili, "Azzera filtri", conteggio risultati.
- Salvataggio degli ultimi filtri: **decidere dove**. I blocchi 1-2 hanno
  escluso `localStorage` per i dati finanziari; dei filtri si può discutere,
  ma va deciso esplicitamente, non per inerzia.

**Attenzione alla paginazione:** `movimenti.store.js` accumula le pagine fuori
dalla risorsa, con un token di generazione che scarta una pagina in ritardo
quando i filtri cambiano. Toccando i filtri, non rompere quella guardia:
serve a impedire che righe di due ricerche diverse si mescolino.

---

### Blocco 6A — Centro movimenti ricorrenti

**Stato:** non iniziato. **API già pronta e inutilizzata.**

`GET /movimenti/ricorrenti` esiste e `movimentiStore.fetchRicorrenti()` è
definita ma **non è chiamata da nessuna vista**.

Da fare:
- Pagina nuova `/ricorrenti`. **Aggiungerla a `funzionalitaItems` in
  `client/src/components/layout/AppLayout.vue:110`** — è il menu "Funzionalità"
  del bottom sheet mobile, e la richiesta esplicita era di metterci le pagine
  nuove. Valutare anche la sidebar desktop (`navItems`, riga 88).
- Prossime scadenze, totale mensile previsto, conto associato, ultima
  esecuzione, azioni per modificare/sospendere/eliminare.
- Anticipazione in dashboard: *"Tre pagamenti previsti nei prossimi sette giorni"*.

**Vincolo da non ignorare:** il cron processa **solo la frequenza `mensile`**
(`server/services/ricorrenti.service.js`), e la validazione ora accetta solo
quella. Le "prossime scadenze" vanno calcolate su quella regola, non su una
frequenza generica. Mostrare scadenze che il cron non genererà sarebbe peggio
che non mostrarle.

**"Sospendere" non esiste oggi**: il modello ha `ricorrente` booleano. Sospendere
significa aggiungere uno stato, o riusare `ricorrente: false` perdendo la
distinzione fra "sospesa" e "mai stata ricorrente". Decisione da prendere in
fase di spec.

---

### Blocco 6D — Controllo qualità degli import

**Stato:** metà esiste già.

L'anteprima restituisce già `nuove`, `duplicate`, `categorizzate`,
`merchant_riconosciuti`, `da_verificare`, e `ImportaView.vue` le mostra.
La conferma restituisce `importati`, `duplicateSaltati`, `incompletiSaltati`.

Da fare:
- **Correzione in blocco delle categorie incerte prima della conferma.** È il
  pezzo di valore vero. Esiste già un "conto predefinito per tutte le righe":
  stesso schema, applicato alle categorie con confidenza bassa.
- **Differenza fra saldo importato e saldo WALLT.** `ImportService` ha già
  `_recalculateContoSaldo` e legge il `balance` dalle righe quando c'è.
- **Riepilogo dopo la conferma**, oggi assente.

**Attenzione:** la pipeline di import è duplicata (`services/import/` e
`services/importazioni/`) con re-export. È l'issue nota numero 1. Verificare
quale delle due è viva per il percorso toccato, prima di modificare.

---

### Blocco 6B — Budget suggerito dallo storico

**Stato:** esiste un suggerimento, ma di natura diversa.

`calcolaBudgetSuggerito` parte da `entrata_mensile` e dalle spese fisse
dichiarate nel profilo. La proposta chiede invece una media dello **storico
reale**: *"negli ultimi tre mesi hai speso in media 180 € in ristoranti"*.

Da fare:
- Nuova sorgente basata sui movimenti degli ultimi N mesi, per categoria.
- **Il suggerimento deve dichiarare da quali dati deriva** — è nella proposta ed
  è la parte che lo rende accettabile invece che magico.
- **Non applicare automaticamente.**
- Decidere come convivono le due sorgenti: profilo per chi è appena arrivato,
  storico per chi ha dati. La transizione fra le due va progettata, non lasciata
  al caso.

---

### Blocco 6C — Previsioni di cassa

**Stato:** nulla. **Il più rischioso, ed è giusto che sia ultimo.**

Da fare: stima del saldo a fine mese da saldo attuale, ricorrenti, entrate
previste, budget residuo e andamento medio.

**Tre avvertenze progettuali:**

1. **Presentare come intervallo, non come certezza.** È nella proposta e va
   difeso: una cifra secca verrebbe letta come una promessa.
2. **Qui serve davvero "Disponibilità totale"** nel senso stretto — denaro
   spendibile, escluse scommesse e risparmio. Il termine è stato lasciato
   libero apposta nel blocco 2. Definirlo qui, aggiungerlo al glossario.
3. **È l'unica funzione che può dare un numero sbagliato su cui l'utente
   prende una decisione.** Prevedere di mostrarne i componenti, non solo il
   risultato, e di poterla ignorare.

---

## Parte 4 — Alla fine di tutto

**Aggiornare l'aiuto.** Era la richiesta esplicita. Oggi ci sono 21 argomenti in
`client/src/content/helpTopics.js`, di cui uno aggiunto dai blocchi 1-2. Ogni
funzione nuova del blocco 6 ne merita uno, e la pagina Aiuto è organizzata per
attività: le sezioni in `HELP_SECTIONS` vanno estese, non solo la lista.

**Aggiungere le pagine nuove a "Funzionalità"** (`AppLayout.vue:110`). Vale per
il centro ricorrenti, e per qualunque altra pagina nasca.

---

## Parte 5 — Debito aperto dai blocchi 1-2

Da chiudere quando si passa di lì, non come lavoro a sé:

1. **Otto `loading` negli store sono senza consumatori** dopo la migrazione
   (`conti`, `budget`, `movimenti` ×3, `obiettivi`, `investimenti`, `scommesse`).
   Toglierli **tutti insieme** in un commit: rimuoverne uno solo sarebbe la
   scelta incoerente.
2. **Manca un test a grep** che fallisca se ricompare un `.value` su una
   risorsa letta da uno store in un template. `storeUnwrap.test.js` fissa il
   meccanismo ma non vede le viste. Quattro righe, e chiude il buco che ha
   lasciato passare il difetto critico.
3. **`refreshAfterWrite` è inerte**: le funzioni migrate non lanciano più,
   quindi il suo booleano è sempre `true` e il toast `VISTA_NON_AGGIORNATA` non
   può scattare. Documentato in `docs/ARCHITECTURE.md`. Decidere se rimuovere i
   due rami morti (`ImportaView.vue`, `MovimentoForm.vue`) o lasciarli.
4. **Verifica a schermo mai eseguita** sui blocchi 1-2. Nessuno dei dodici task
   è stato controllato in un browser. Da fare prima di costruirci sopra.

---

## Parte 6 — Come lavorare (lezioni dai blocchi 1-2)

Cinque cose che hanno fatto la differenza, tutte pagate con difetti veri:

1. **Il piano scritto tutto in anticipo invecchia.** Un task risolve un problema
   e i task già scritti non lo sanno. Rileggere i task rimanenti dopo ogni
   scoperta significativa.
2. **Una verifica fatta al momento sbagliato non è una verifica.** Il controllo
   sui componenti morti era di nove task prima; la ricerca sui punti che
   scrivono negli store si era fermata al primo file trovato. Rifare le
   verifiche meccaniche al momento in cui servono.
3. **Un "Verified X" di un revisore è un'affermazione, non una prova.** Su
   questo branch tre revisori hanno dichiarato cose false, una delle quali ha
   lasciato passare un bug a runtime. Dove la verifica è meccanica e gratuita,
   rifarla.
4. **La review finale di branch vede cose che nessuna review di task può
   vedere.** Su dodici task tutti approvati, ha trovato un difetto critico che
   impediva alla dashboard di renderizzare.
5. **Build e test verdi non bastano.** Il difetto critico compilava e passava 85
   test: `node --test` esercitava la factory in isolamento, dove il bug non
   poteva manifestarsi. Per il codice di interfaccia serve il browser.
