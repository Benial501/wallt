# Consegna: filtri dei movimenti (blocco 4)

> Prompt di lavoro autosufficiente. Incollalo come primo messaggio.
> Lavorazione parallela: un altro agente sta facendo il blocco 3 (grafico del
> patrimonio) sugli stessi repository ma su file che non si toccano.

---

Lavori su **WALLT**, un'applicazione di finanza personale in italiano: SPA Vue 3
(`client/`) più API REST Node/Express con Sequelize e PostgreSQL (`server/`).
Devi implementare il **blocco 4: i filtri della pagina Movimenti**.

## Dove lavorare

Repository: `/Users/christianmaiolo/Developer/wallt`

Il lavoro di riferimento sta nel worktree
`.claude/worktrees/leggibilita-grafico-filtri`, branch
`worktree-leggibilita-grafico-filtri`, HEAD `58492bd`.

**Crea un branch tuo da quel commit** e lavora lì:

```bash
cd /Users/christianmaiolo/Developer/wallt
git worktree add .worktrees/filtri-movimenti -b filtri-movimenti 58492bd
cd .worktrees/filtri-movimenti
npm install --prefix client
npm install --prefix server
cp ../../server/.env server/.env
cp ../../server/.env.test server/.env.test
```

I due file `.env` sono ignorati da git e non arrivano nel worktree: vanno
copiati a mano, altrimenti i test di integrazione non trovano il database.
PostgreSQL deve essere in ascolto (`pg_isready`).

**Non lavorare sul branch `worktree-leggibilita-grafico-filtri`**: ci sta
committando l'altro agente. I due branch verranno uniti alla fine.

## I documenti da leggere per primi

1. `docs/superpowers/plans/2026-09-14-leggibilita-grafico-filtri.md` — il piano.
   **I task 11, 12, 13 e 14 sono i tuoi**, e contengono il codice esatto da
   scrivere, i test compresi. Sono la tua fonte di requisiti.
2. `docs/superpowers/specs/2026-09-14-leggibilita-grafico-filtri-design.md` — la
   spec, che dice il *perché*. È l'autorità: se il piano e la spec divergono,
   vince la spec.
3. `CLAUDE.md` — convenzioni del progetto.

**Non leggere né toccare i task 8, 9 e 10**: sono dell'altro agente.

## Cosa devi costruire

Oggi la pagina Movimenti ha sette `ref` di filtro sparsi nella vista, costruisce
i parametri della query a mano, e legge le categorie da un elenco statico. Non
c'è ricerca testuale, non c'è ordinamento per importo, e i filtri attivi non
sono visibili né rimovibili.

Quattro task, in quest'ordine.

### Task 11 — server: ricerca e ordinamento

`getMovimenti` in `server/controllers/movimenti.controller.js` guadagna:
- **`cerca`**: sottostringa sulla descrizione, con `Op.iLike` parametrizzato
- **`ordine`** esteso con `importo_desc` e `importo_asc`; `caricamento` resta
  identico e `data DESC` resta il default

E `validateMovimentiQuery` in `server/middleware/validation.middleware.js` chiude
una lacuna che esiste già oggi: valida **solo** `conto_id`, `da` e `a`. `tipo`,
`categoria`, `page`, `limit` e `ordine` arrivano al controller senza alcun
controllo.

Più `server/tests/movimentiFiltri.test.js`, il cui codice è nel piano.

### Task 12 — `client/src/utils/filtriMovimenti.js`

Modulo **puro** che traduce lo stato dei filtri nei parametri della query. Puro
perché è l'unica forma testabile: nel client non c'è infrastruttura di
rendering, solo `node --test`. Il modello da imitare è
`client/src/utils/periodoAnalisi.js`, che ha la stessa forma e il suo test.

### Task 13 — `client/src/components/movimenti/MovimentiFilters.vue`

Pannello separato dalla lista: laterale su desktop, foglio dal basso su mobile
(`client/src/components/layout/BottomSheet.vue` esiste già — è in `layout/`, non
in `common/`). Tre livelli: filtri rapidi sempre visibili, categorie recenti
come scorciatoia, pannello completo con ricerca.

### Task 14 — adozione nella vista e stato nello store

`MovimentiView.vue` adotta il componente; `movimenti.store.js` conserva lo stato
dei filtri in memoria.

---

## I cinque vincoli che non si negoziano

### 1. L'isolamento fra utenti è sicurezza, non interfaccia

`where.user_id = req.userId` resta la **prima** condizione, e i filtri nuovi si
**aggiungono**. Un filtro che perde l'isolamento per utente è un difetto di
sicurezza: un utente vedrebbe i movimenti di un altro.

Il piano contiene due test espliciti — una ricerca e un ordinamento lanciati dal
token dell'utente B su dati dell'utente A. Non sono decorativi: eseguili.

### 2. Mai `sequelize.literal` con input dell'utente

La ricerca usa `Op.iLike` con il termine come parametro. E i caratteri jolly di
`LIKE` vanno neutralizzati: chi cerca `50%` cerca quel testo, non «50 seguito da
qualunque cosa». Il piano mostra come.

### 3. La guardia della paginazione non si tocca

`client/src/stores/movimenti.store.js` ha un token `generazione` (riga 124
circa). Serve a scartare una pagina che arriva in ritardo quando i filtri sono
già cambiati: senza, righe di due ricerche diverse si mescolerebbero e
sembrerebbero dati veri.

Ogni `fetchMovimenti` lo incrementa: è il comportamento voluto. La ricerca va in
debounce (~300 ms) per non tempestare l'API, non per correttezza.

### 4. I filtri vivono in memoria, mai su disco

Niente `localStorage`, niente `sessionStorage`. Una ricerca salvata può essere
rivelatrice quanto un importo. Lo stato sta nello store Pinia e `reset()` lo
azzera, quindi il logout lo pulisce già senza aggiungere nulla.

### 5. La trappola dello scompattamento Pinia

Una risorsa creata da `creaRisorsa` (`client/src/utils/risorsa.js`) ed esposta al
**primo livello** di uno store è già scompattata: `store.risorsaX.stato` **è** la
stringa. Scriverci `.value` dà `undefined`, e su `.error` lancia un `TypeError`
che rompe il render dell'intera pagina.

Ma un `computed` **dentro lo store** che restituisce l'oggetto risorsa grezzo
non è scompattato: lì `.value` serve.

`client/tests/storeUnwrap.test.js` fissa il contratto e
`client/tests/vistaValue.test.js` sorveglia i template. Leggi entrambi prima di
scrivere una vista. Questo difetto ha superato dodici review e ha rotto la
dashboard in produzione.

---

## Convenzioni del progetto

- **Italiano** per tutto ciò che l'utente legge e per i commenti. Inglese per il
  codice solo dove il file circostante lo usa già: questo repository usa nomi
  italiani negli store e negli util (`creaRisorsa`, `filtri`, `buildPeriodi`).
- **Un `catch` non azzera mai i dati già ottenuti.** È la regola che ha reso
  indistinguibili «dati assenti» ed «errore di rete». Ogni lettura API passa da
  `creaRisorsa`, e le viste mostrano lo stato con
  `client/src/components/common/DataState.vue`. Lo stato vuoto va nello slot
  `vuoto`, mai in un `v-if="!dati && !loading"`.
- **Le etichette finanziarie** si leggono da `client/src/content/glossario.js`
  con `etichetta(id)`, non si scrivono in linea.
- **Pavimento tipografico**: nessun `font-size` sotto `0.875rem` (14px) per
  testo che l'utente legge per decidere. Sotto si scende solo con
  `var(--text-micro)` e un commento sulla riga che inizia con `deroga:` e dice
  **perché** quel testo non è operativo. `client/tests/tipografia.test.js`
  sorveglia tutto `src/` e fallisce altrimenti.
- **Contrasto**: `client/tests/contrasto.test.js` verifica le coppie
  testo/superficie dichiarate. Se introduci una combinazione nuova di colore e
  sfondo, aggiungila a `COPPIE`. Le soglie sono 4.5:1 per il testo normale e
  3:1 per i bordi che identificano un controllo.
- **Aree tattili**: i controlli interattivi hanno almeno 44×44 px.
- **Focus**: ogni elemento raggiungibile da tastiera mostra
  `box-shadow: var(--focus-ring)` su `:focus-visible`. Se un antenato ha
  `overflow: hidden` il `box-shadow` viene tagliato: lì si usa
  `outline: 2px solid var(--border-focus); outline-offset: 2px`.
- I token di colore, tipografia e spaziatura stanno in
  `client/src/assets/styles/variables.css`. Usa quelli, non valori in linea.

## Comandi

```bash
npm test --prefix client          # node --test, ~102 test
npm run build --prefix client
npm test --prefix server          # Jest, 37 suite / 451 test, richiede PostgreSQL
npm run test:unit --prefix server # solo le suite senza database
```

Usa sempre `--prefix`, non `cd client && …`.

**Il baseline dal quale parti è verde**: client 102 test, server 37 suite / 451
test. Se qualcosa è rosso prima che tu tocchi nulla, fermati e segnalalo.

## Metodo di lavoro

**Un task per volta, in ordine.** Per ciascuno:

1. Leggi il task nel piano.
2. **Scrivi i test prima.** Eseguili e verifica che **falliscano** per il motivo
   giusto. Un test che passa subito non sta testando quello che credi.
3. Implementa il minimo che li fa passare.
4. Riesegui, più la suite completa.
5. Committa.

**Un test che non può fallire non protegge.** Dove aggiungi una guardia,
provala: rompi deliberatamente ciò che sorveglia, verifica che se ne accorga,
ripristina. Riporta l'output di quella prova.

**Non fidarti di ciò che c'è scritto, verifica.** Il piano è stato scritto prima
dell'esecuzione e in tre punti si è già rivelato sbagliato. Se un riferimento a
una riga non corrisponde, o un file non ha la forma descritta, **segnalalo
invece di adattarti in silenzio**.

**Se il piano ti fa fare qualcosa che ti sembra sbagliato, dillo.** È già
successo tre volte in questo progetto che il piano prescrivesse un errore vero.
Segnalarlo è il comportamento giusto; aggirarlo di nascosto no.

## Formato dei commit

Messaggi in italiano, che spiegano **perché**, non cosa. Guarda `git log` per il
tono: le righe di soggetto sono al presente indicativo terza persona («Aggiunge
la ricerca…», «Separa il testo…»).

Ogni commit termina con:

```
Co-Authored-By: ChatGPT <noreply@openai.com>
```

## File che sono tuoi, e file che non lo sono

**Tuoi — nessun altro li tocca:**
```
server/controllers/movimenti.controller.js
server/middleware/validation.middleware.js
server/tests/movimentiFiltri.test.js          (nuovo)
client/src/utils/filtriMovimenti.js           (nuovo)
client/tests/filtriMovimenti.test.js          (nuovo)
client/src/components/movimenti/MovimentiFilters.vue  (nuovo)
client/src/views/MovimentiView.vue
client/src/stores/movimenti.store.js
```

**Non toccare — ci sta lavorando l'altro agente:**
```
client/src/composables/useAndamentoPatrimonio.js
client/src/components/analisi/AndamentoPatrimonio.vue
client/src/views/AnalisiView.vue
client/src/views/DashboardView.vue
client/src/components/custom/WOverviewCarousel.vue
client/src/stores/analisi.store.js
```

**`client/src/utils/appIcons.js` è già a posto.** Era l'unico file che entrambi
i blocchi avrebbero toccato: `SlidersHorizontal`, `Search` e `X` sono già
esportate (commit `58492bd`). Non serve aggiungerci nulla.

**La documentazione (`CLAUDE.md`, `docs/API.md`, `docs/ARCHITECTURE.md`,
`client/src/content/helpTopics.js`) la aggiorna l'altro agente alla fine**, per
entrambi i blocchi. Non modificarla: annota invece nel tuo report finale cosa
andrebbe scritto sui filtri — i parametri nuovi di `GET /movimenti` e il loro
comportamento.

## Due cose che il piano dà per scontate e che invece vanno verificate

1. **Il raggruppamento delle categorie è quasi gratis.** Ogni voce del catalogo
   ha già un campo `gruppo`, e le categorie create dall'utente ricevono
   `gruppo: 'Personali'` da `server/services/categorie.service.js`. Le categorie
   si leggono da `CATEGORIE_ENTRATA` / `CATEGORIE_USCITA` in
   `client/src/utils/categorie.js`, che `loadCategorie()` mantiene allineate
   all'API: quelle nascoste dall'utente spariscono da sole, quelle personali
   compaiono. **Verificalo** prima di costruirci sopra.

2. **L'indicatore di ricerca in corso serve davvero.** Durante una nuova
   ricerca lo stato della risorsa resta `pronto`, perché `lastUpdated` non è più
   nullo: senza un indicatore la lista mostrerebbe in silenzio i risultati
   precedenti. È il task 14 e il piano lo spiega.

## Quando hai finito

Rispondi con:
- I commit prodotti, uno per task.
- L'output reale di `npm test --prefix client` e `npm test --prefix server`.
- Per ogni guardia aggiunta, la prova che sa fallire.
- Cosa andrebbe scritto in `docs/API.md` sui parametri nuovi.
- **Le decisioni che hai preso** dove il piano era ambiguo o sbagliato, con il
  motivo e cosa costa se la decisione è sbagliata.
- Le cose che hai lasciato indietro, se ce ne sono, e perché.

Se ti blocchi su qualcosa che il piano non risolve, **decidi e scrivi cosa hai
deciso** invece di fermarti: una decisione sbagliata e dichiarata si corregge,
una domanda senza risposta ferma il lavoro.
