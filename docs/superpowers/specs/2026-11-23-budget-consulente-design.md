# Budget come consulente: tre macro-categorie e modelli pronti

Data: 23 novembre 2026. Stato: in attesa di approvazione.

## Perché

Il budget di oggi è un modulo: un elenco di singole categorie con percentuali da
portare al 100%, da ricreare ogni mese. Il suggerimento viene dall'onboarding
(quattro profili fissi in `profilo.controller.js#DISTRIBUZIONI`) e contiene una
voce «risparmio» che non conta mai nulla: in `budgetStato.service.js`
`BUDGET_TO_MOVIMENTI.risparmio` è `[]` e nessuna categoria di movimento si chiama
`risparmio`, quindi resta sempre a 0 €.

Il proprietario vuole che la pagina Budget si comporti come un consulente: che
proponga già una divisione dei soldi adatta alla persona, che offra modelli pronti
tipo 50/30/20, e che lo mostri in modo che chiunque capisca come dividere i propri
soldi. Lo scopo è triplice: riuscire a pagare ciò che si deve, spendere in modo
più responsabile, mettere da parte o investire per i propri obiettivi.

## Obiettivi

- Il budget è diviso in tre **macro-categorie**:
  - **Bisogni**: ciò che devi pagare comunque;
  - **Desideri**: ciò che scegli di spendere;
  - **Futuro**: ciò che metti da parte o investi.
- Ogni macro-categoria spiega quali categorie contiene.
- **Modelli pronti**, con uno consigliato in base al profilo dell'onboarding.
- **Si imposta una volta sola** e vale per ogni mese finché l'utente non lo cambia.
- Una **frase di consiglio** in testa alla pagina dice com'è andata e cosa fare.
- Il budget **non si adatta alle spese reali**: propone il modello scelto e mostra
  quanto ci si discosta (decisione del proprietario, «regola fissa»).

## Fuori da questo lavoro

- Limiti per singola categoria: il budget sono solo tre numeri (decisione del proprietario).
- Storico dei mesi passati: la pagina mostra solo il mese in corso.
- Spostare denaro: il budget consiglia e non scrive mai movimenti, saldi o trasferimenti.
- Convertire i vecchi budget per categoria nel nuovo modello.
- Consigli generati da AI: le frasi seguono regole fisse.

## Cosa non deve succedere (anti-obiettivi)

- Due definizioni diverse di «quanto ho speso nei Desideri» fra pagina, avvisi,
  Analisi e home. Il calcolo è uno solo (Regola 20).
- Una ricorrenza appena creata che fa scattare «Bisogni superati»: si conta solo
  ciò che muove davvero denaro (`muoveSaldo`, Regola 11), come oggi.
- Il modello che cambia da solo. Il consulente può *suggerire* un altro modello,
  ma lo cambia solo l'utente.
- Importi nel testo delle notifiche push (Regola 17).
- Una categoria eliminata dall'utente che ricompare nel dettaglio di una voce:
  l'elenco delle categorie passa da `categorie.service.list()` (Regola 18).

## Strade considerate

| | Dove sta il piano | Pro | Contro |
|---|---|---|---|
| **A · Profilo** (scelta) | Colonne su `profili_utente`, come `orizzonte_tipo`/`orizzonte_data` di Piano Smart | Modifica più piccola, segue un precedente del progetto, «un solo piano per persona» è garantito dalla struttura | Cambiare modello a metà mese ricalcola anche il mese in corso, e del modello precedente non resta traccia |
| B · Tabella nuova | Una riga per persona con data di inizio validità | Dati più ordinati, pronta per lo storico | Tabella in più da proteggere con RLS, più codice per un solo piano per persona |
| C · Tabelle di oggi | `budget_mensili` con tre righe in `budget_categorie`, copiate ogni mese | Nessuna tabella nuova | «Una volta sola» diventa una copia mensile; ogni lettore dovrebbe capire sia il formato vecchio sia quello nuovo |

Il proprietario ha scelto **A**. Il suo limite (nessuno storico) coincide con un
non-obiettivo. Se un giorno servisse lo storico, si passa a B senza rifare le schermate.

## Modello dei dati

### Profilo

Nuove colonne su `profili_utente`:

- `budget_modello`: uno fra `equilibrato`, `spese_fisse_alte`, `risparmio_deciso`
  e `personalizzato`. Vale `null` finché l'utente non ha scelto un modello: in quel
  caso la pagina mostra la scelta del modello.
- `budget_pct_bisogni`, `budget_pct_desideri`, `budget_pct_futuro`: interi da 0 a
  100. Sono tutti e tre `null` oppure tutti e tre valorizzati, con somma 100.

Le percentuali si salvano **anche per i modelli pronti**. Se un giorno un modello
pronto cambiasse nel codice, il piano già scelto resterebbe com'era: è lo stesso
principio della configurazione versionata di Piano Smart (Regola 21a). Il vincolo
«tutti `null` o somma 100» è un `CHECK` nel database, non solo nella validazione
(Coding Rule 22).

**La base del 100% è `profili_utente.entrata_mensile`**, il campo che l'onboarding
già scrive. Se l'utente lo modifica dalla pagina Budget, cambia quel campo
(`PUT /api/profilo`, che lo accetta già). Oggi lo leggono solo il budget e
l'onboarding: un secondo campo «entrata del budget» avrebbe creato due numeri per
lo stesso concetto. Questo corregge quanto detto in conversazione («tre campi»):
i campi nuovi sono il modello e le percentuali, l'entrata esiste già.

La migrazione non crea tabelle e quindi non richiede RLS nuove. Va applicata in
produzione **prima** di pubblicare il codice, perché in produzione le migrazioni
non girano all'avvio.

### Vecchie tabelle

`budget_mensili` e `budget_categorie` restano con i loro dati. Le leggono ancora
l'esportazione (`impostazioni.controller.js`), il reset e l'eliminazione
dell'account (`accountReset.service.js`) e il controllo in `categorie.routes.js`
che impedisce di cambiare tipo a una categoria usata in un budget. Nessuna pagina
le mostra più.

## Vocabolario: un solo posto

`server/constants/budget.js`, senza `require` (stesso vincolo di
`constants/fondoEmergenza.js`, Regola 22), contiene:

- le tre macro-categorie (`bisogni`, `desideri`, `futuro`);
- i quattro modelli con le percentuali dei tre modelli pronti (50/30/20, 70/20/10,
  40/30/30);
- la soglia per consigliare «Spese fisse alte» (`SOGLIA_SPESE_FISSE_ALTE`, vedi
  sotto);
- le soglie degli avvisi (80 e 100);
- il numero di mesi per il suggerimento di cambio modello (3).

Il vocabolario è duplicato in `client/src/utils/budget.js` e sorvegliato da
`client/tests/budgetContratto.test.js`, che confronta i due file nel job
"Frontend (build)" della CI.

Le etichette rivolte all'utente («Bisogni», «Desideri», «Futuro» e le frasi che
spiegano ciascuna voce) stanno in `client/src/content/glossario.js` (Coding Rule 18).

## Quale spesa va in quale voce

Un'unica funzione pura, in `services/budgetMacro.js`, riceve un movimento (con i
conti coinvolti) e l'elenco delle categorie dell'utente, e restituisce la sua
macro-categoria oppure `null` (non conta).

| Movimento | Voce |
|---|---|
| Uscita in categoria `investimento` (anche quella creata da un versamento in Investimenti, `investimenti.controller.js`) | Futuro |
| Trasferimento **verso** un conto di tipo `risparmio`, `investimenti` o `emergenza` **da** un conto di altro tipo | Futuro, in positivo |
| Trasferimento **da** uno di quei conti **verso** un conto di altro tipo | Futuro, in negativo (si è tolto denaro messo da parte) |
| Trasferimento fra due conti di quei tipi, o fra due conti di altri tipi | Non conta |
| Trasferimento con categoria `deposito_scommesse` | Desideri (oggi è già contato nel budget, `TRASFERIMENTI_NEL_BUDGET`) |
| Uscita di una categoria `essenziale` | Bisogni |
| Uscita `semi_essenziale`, `discrezionale` o non classificata | Desideri |
| Origine di una ricorrenza (`muoveSaldo` falso) | Non conta |
| Entrate | Non contano |

L'essenzialità si legge da `categorie.service.list(userId)`, che applica già le
personalizzazioni dell'utente: è la stessa classificazione su cui si calcola il
fondo di emergenza (`essenzialita.service.js`).

Il Futuro del mese è il **saldo netto** di versamenti e prelievi e può scendere
sotto zero. Un disinvestimento (entrata `rendimento_investimenti`) **non** lo
riduce, perché quella categoria mescola rendimenti e prelievi.

Le categorie `investimento` e `deposito_scommesse` hanno una voce fissa: il menu
⋯ del dettaglio non le offre come spostabili.

## Spostare una categoria fra Bisogni e Desideri

Si usano gli endpoint che esistono già:

- `PUT /api/categorie/default/:id/essenzialita` per le predefinite;
- l'aggiornamento della categoria personale per le personali.

Nessuna rotta nuova.

- **Verso i Bisogni**: si scrive `essenziale`.
- **Verso i Desideri**: se la classificazione di catalogo della categoria
  predefinita la mette già nei Desideri, si **rimuove la personalizzazione**
  (`essenzialita: null`), così una `semi_essenziale` torna `semi_essenziale`.
  Altrimenti si scrive `discrezionale`.

Il dettaglio avvisa che la scelta vale anche per il calcolo del fondo di emergenza.

## Il modello consigliato

È una funzione pura sul profilo, che riusa il calcolo delle spese fisse dichiarate
(`calcolaSpeseFisse` in `profilo.controller.js`: casa, bollette, trasporti,
spese fisse extra). Va spostata in un modulo condiviso: non deve restarne una
seconda copia.

1. `situazione_abitativa === 'vivo_con_genitori'` → **Risparmio deciso** (40/30/30).
2. Spese fisse dichiarate / `entrata_mensile` **oltre `SOGLIA_SPESE_FISSE_ALTE`**
   (0,40) → **Spese fisse alte** (70/20/10).
3. Altrimenti, e anche senza entrata o senza profilo → **Equilibrato** (50/30/20).

Il 40% è una mia scelta: sui Bisogni pesano anche spesa alimentare e salute, che
il profilo non dichiara, quindi spese fisse al 40% lasciano circa 10 punti per
il resto. Il consiglio porta sempre con sé la frase che lo motiva, con la
percentuale calcolata (per esempio «Le spese fisse che hai indicato valgono il
31% della tua entrata: puoi permetterti il modello più classico»).

Il consiglio vale solo **al momento della scelta**: una volta salvato, il modello
non cambia anche se il profilo cambia.

## Stato del mese

Il calcolo vive in `services/budgetStato.service.js`, riscritto per le
macro-categorie. Lo leggono la pagina, le notifiche, le Analisi e la home. Il
mese è quello civile a Roma (`FUSO_DEFAULT`) per l'API, come nel resto dell'API,
e nel fuso delle preferenze per le notifiche. Leggere le preferenze dall'API ne
creerebbe la riga a ogni apertura della pagina (`findOrCreate`), per uno scarto
possibile solo a cavallo della mezzanotte dell'ultimo giorno del mese.

Per ogni macro-categoria restituisce:

- obiettivo in euro (`entrata_mensile × percentuale`, arrotondato al centesimo);
- usato (per il Futuro: messo da parte, netto);
- restante;
- percentuale usata;
- le categorie che hanno avuto movimenti nel mese, con importo, ordinate dalla
  più alta. Per ciascuna il server dice anche se è spostabile, se è predefinita
  e qual è la sua essenzialità di catalogo: servono al client per scegliere il
  valore da scrivere quando l'utente la sposta. Una categoria archiviata con
  spese nel mese resta nella sua voce: l'essenzialità si legge con
  `list(userId, { includeArchived: true })`;
- per Bisogni e Desideri, l'elenco delle categorie della voce che **non** hanno
  avuto movimenti, cioè ciò che spiega «cosa racchiude» la voce. Non si mostrano
  le categorie archiviate.

Restituisce anche i giorni che mancano a fine mese e **una sola** frase di
consiglio (vedi sotto).

Gli importi si calcolano in centesimi interi e si convertono solo in uscita,
così le tre voci si riconciliano col totale senza scarti di arrotondamento.

## La frase del consulente

Ne compare una sola, la prima vera in quest'ordine:

0. **Entrata mancante**: se `entrata_mensile` è nulla o zero (per esempio è
   stata azzerata dopo la scelta del modello), gli obiettivi valgono 0 e la
   frase invita a indicare l'entrata. Nessun'altra frase e nessun avviso.
1. **Bisogni oltre l'obiettivo**: «I Bisogni hanno superato il 50%: la differenza
   va tolta dai Desideri». Se negli **ultimi 3 mesi completi** i Bisogni hanno
   superato l'obiettivo ogni volta, aggiunge un suggerimento di cambio modello
   (per esempio «il modello 70/20/10 potrebbe adattarsi meglio a te»). Contano
   solo i mesi osservati secondo `finestraMesi.service.js`: un mese precedente al
   primo movimento non è uno zero, e con meno di 3 mesi completi osservati il
   suggerimento non compare. Si calcola con il piano e l'entrata di oggi,
   perché non c'è storico. Nessun suggerimento se il modello è già
   `spese_fisse_alte` o `personalizzato`.
2. **Desideri oltre l'obiettivo**: di quanto, e quali sono le due categorie con
   l'importo più alto nel mese.
3. **Futuro sotto l'obiettivo**: quanto manca, con il rimando a Piano Smart per
   decidere dove mettere quei soldi.
4. **Tutto in regola**: quanto resta nei Desideri e per quanti giorni.

Il server restituisce un codice e i numeri. Il testo lo compone il client in
`client/src/content/budgetConsigli.js`, con le etichette delle voci lette dal
glossario: così la frase è verificabile nei test e la lingua resta in un solo
posto.

## API

| Metodo | Rotta | Cosa fa |
|---|---|---|
| `GET` | `/api/budget/piano` | Restituisce il piano salvato (o `null`), l'entrata, il modello consigliato con il motivo e l'elenco dei modelli con gli importi calcolati sull'entrata |
| `PUT` | `/api/budget/piano` | Salva `{ modello, percentuali? }`. Le percentuali sono obbligatorie solo per `personalizzato`, e per i modelli pronti il server le ignora e usa le proprie. Risponde `422 entrata_mancante` se il profilo non ha un'entrata mensile maggiore di zero: l'entrata si salva prima, con `PUT /api/profilo` |
| `GET` | `/api/budget/stato` | Stato del mese in corso (sezione sopra). `404` se non c'è un piano |

Le tre rotte usano `authMiddleware` e la validazione con express-validator:
interi 0–100, somma 100, modello nella lista. Il client non invia mai `user_id`.
Le rotte vanno dichiarate prima di `/:anno/:mese`.

Le rotte vecchie (`GET /:anno/:mese`, `GET /:anno/:mese/stato`, `POST /`,
`PUT /:id`) e `GET /api/profilo/budget-suggerito` non hanno più un client. Il
costruttore le rimuove insieme a `calcolaBudgetSuggerito`, `DISTRIBUZIONI` e
`client/src/utils/budgetCategorie.js`, e aggiorna `docs/API.md` e il conteggio
delle rotte in `CLAUDE.md`. Un'app ancora aperta con il pacchetto vecchio non
deve ricevere un 500: un 404 su una rotta rimossa va bene, perché `DataState` lo
mostra come errore riprovabile.

## Schermate

Le bozze approvate sono in `.superpowers/brainstorm/` (file non versionati).

**Pagina principale** (bozza A):

- in alto il titolo «Budget», il chip con il modello («50/30/20») e la riga
  «Novembre · su 2.000 € di entrata · mancano 7 giorni»;
- una scheda di consiglio, evidenziata, con la frase del consulente;
- una scheda con tre righe, una per voce, ciascuna con:
  - nome e pallino colorato;
  - «usato di obiettivo»;
  - una barra (rossa oltre il 100%);
  - una nota («Restano 220 €», «Superato di 40 €», «Mancano 250 €»);
  - **la frase che spiega cosa contiene la voce** (dalla bozza C);
- toccando una riga si apre il dettaglio della voce;
- «Cambia modello» porta alla scelta del modello.

Si legge con `creaRisorsa` e `DataState` (Coding Rules 17 e 23). Lo stato vuoto,
cioè nessun piano, apre la scelta del modello.

**Scelta del modello**:

- l'entrata mensile, con «Modifica»;
- il modello consigliato, evidenziato e preselezionato, con il motivo e la barra
  50/30/20 con gli importi in euro;
- gli altri tre modelli, ciascuno con una riga che dice per chi è;
- «Personalizzato» apre tre campi interi che devono fare 100;
- il pulsante «Usa questo modello»;
- in fondo, la riga che spiega le tre voci.

**Dettaglio di una voce** (rotta figlia o pannello: decide il costruttore):

- la frase che spiega la voce;
- usato e restante;
- «Dove sono andati questo mese», con il menu ⋯ «Sposta nei Desideri» o «Sposta
  nei Bisogni», che avvisa del fondo di emergenza;
- «Fanno parte dei Bisogni, nessuna spesa questo mese», con «Mostra tutte»;
- per il Futuro, i versamenti e i prelievi del mese, senza menu ⋯.

Il tema chiaro e scuro e la leggibilità seguono `variables.css` (Coding Rule 19):
le bozze usavano testo a 11–12 px, ma nell'app il minimo è `--text-xs`.

Il tema d'aiuto `budget-come-funziona` (`client/src/content/helpTopics.js`) va
riscritto per le macro-categorie e i modelli.

## Avvisi, Analisi e home

- **Notifiche** (`regolaBudget` in `NotificheGenerator.js`): gli stessi due tipi
  (`budget_80` e `budget_superato`), ma per **Bisogni e Desideri**. Il Futuro non
  manda avvisi.
  - `dedupe_key`: `budget:<periodo>:<voce>:<soglia>`.
  - Testo senza importi, per esempio «Hai superato i Desideri previsti per questo mese».
  - Restano la preferenza `alert_budget_attivi` e la valutazione subito dopo un
    movimento (`valutaBudgetDopoMovimento`).
  - Le notifiche già consegnate restano come sono.
- **Analisi** (`analisi.controller.js`, `budget_alert`): un avviso per voce
  invece che per categoria.
- **Home** (`DashboardView.vue`, `WOverviewCarousel.vue`, `GettingStartedCard.vue`):
  - «Crea un budget» risulta fatto quando esiste un piano;
  - la scheda del budget mostra le tre voci.
  - Il reset della sessione (`utils/session.js`) segue lo store riscritto.

## Test

- **Puri** (girano anche in `npm run test:unit`):
  - assegnazione movimento → voce, in tutti i casi della tabella sopra;
  - modello consigliato ai bordi della soglia;
  - scelta della frase del consulente;
  - somma in centesimi.
- **API**:
  - `PUT` rifiuta somma ≠ 100, modello sconosciuto e percentuali fuori intervallo;
  - per i modelli pronti salva le percentuali del server;
  - isolamento fra utenti;
  - `GET /stato` senza piano risponde 404;
  - una ricorrenza appena creata non muove le voci;
  - un trasferimento verso il fondo di emergenza alza il Futuro e uno di ritorno
    lo abbassa;
  - una categoria eliminata non compare nel dettaglio.
- **Migrazione**: il `CHECK` rifiuta somme sbagliate; `migrazioniReali.test.js`
  resta verde.
- **Notifiche**: una sola notifica per voce, per soglia, per mese; nessuna per
  il Futuro.
- **Contratto client/server** sul vocabolario.

## Lasciato al costruttore

- Se il dettaglio di una voce è una rotta figlia o un pannello.
- I nomi interni di funzioni e file oltre a quelli fissati sopra.
- Il componente della barra (riusare o estrarre da `BudgetView.vue`).
- Il testo esatto delle frasi, purché segua i quattro casi e stia in
  `client/src/content/budgetConsigli.js`.
- Come mostrare «Personalizzato» quando la somma non fa 100 (avviso in linea,
  pulsante disattivato).

## Scelte fatte da me durante la scrittura

- La base resta `entrata_mensile`, senza un campo nuovo.
- Soglia «Spese fisse alte» al 40% delle spese fisse dichiarate.
- Il Futuro è un netto: i prelievi da risparmio e fondo lo riducono, i
  disinvestimenti no.
- Le categorie non classificate e `da_verificare` contano nei Desideri, come dice
  il catalogo.
- Spostare verso i Desideri rimuove la personalizzazione quando il catalogo la
  mette già lì.
- Il testo delle frasi lo compone il client (`content/budgetConsigli.js`), con le
  etichette del glossario.
- Le rotte vecchie vengono rimosse insieme al loro client.
- Senza entrata il modello non si salva (`422`). Se l'entrata sparisce dopo, la
  pagina chiede di indicarla e non partono avvisi.
- Il suggerimento di cambio modello richiede 3 mesi completi osservati.
