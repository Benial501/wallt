# Leggibilità, grafico del patrimonio e filtri dei movimenti — Specifica

> Sotto-progetto **B** della proposta di evoluzione UX di WALLT (blocchi 5, 3 e 4).
> Il sotto-progetto A (blocchi 1 e 2) è su `main` al commit `35cbb56`.
> Il sotto-progetto C (blocco 6) è separato, con spec propria.
> Punto di partenza: `docs/superpowers/briefs/2026-09-14-blocchi-3-6-brief.md`.

## Obiettivo

Rendere leggibile ciò che l'app già mostra, e dare all'utente i due strumenti
che oggi non ha: vedere come si muove il proprio patrimonio nel tempo, e
ritrovare un movimento fra migliaia.

I tre blocchi stanno insieme per una ragione di ordine, non di tema: il blocco 5
definisce i token tipografici e cromatici che i blocchi 3 e 4 useranno.
Invertire l'ordine significherebbe ridisegnare il grafico e i filtri due volte.

## Contesto: cosa ha cambiato la lettura del codice

Il brief conteneva tre stime che la lettura del codice ha corretto. Sono
riportate qui perché ciascuna sposta il costo di un blocco.

### Il blocco 3 richiede lavoro sul server

Il brief dà il server per pronto e definisce il blocco 4 «l'unico blocco che
richiede lavoro sul server». Non è così.

`buildPeriodi` (`server/services/confrontoPeriodi.service.js:159`) conosce solo
`settimana`, `mese` e `anno`, e `QUANTITA_MAX` vale 12. Il selettore che la
proposta chiede — 7 giorni, 30 giorni, 3 mesi, 1 anno — richiede quindi un
bucket giornaliero nuovo e un tetto di quantità che non sia più unico.

### Il tema chiaro sta peggio del tema scuro

Rapporti di contrasto calcolati sui token reali, sulla superficie peggiore di
ciascun tema (il vetro `--glass-primary` nello scuro, lo sfondo di pagina
`--bg-primary` nel chiaro):

| Token | Scuro pagina / card | Chiaro pagina / card |
|---|---|---|
| `--text-secondary` | 8.66 / 7.87 | 6.69 / 7.31 |
| `--text-muted` | **3.89 / 3.54** | **4.20** / 4.59 |
| `--text-subtle` | 7.89 / 7.17 | **4.20** / 4.59 |
| `--nav-item` | **4.25 / 3.86** | **4.20** / 4.59 |
| `--text-link` | 9.75 / 8.87 | 4.57 / 4.99 |
| `--positive` | 10.59 / 9.63 | **3.33 / 3.64** |
| `--negative` | 6.06 / 5.51 | **4.27** / 4.66 |
| `--warning` | 13.29 / 12.08 | **2.81 / 3.07** |

In grassetto ciò che non raggiunge 4.5:1. `--positive` e `--warning` in tema
chiaro colorano gli **importi** e gli **avvisi**: sono i due casi peggiori,
perché riguardano l'informazione per cui l'app esiste.

Una falla che né la proposta né il brief prevedevano: in tema chiaro il testo
del pulsante primario (`--accent-on: #FFFFFF`) sull'accento
(`--accent-green: #00A884`) fa **3.03:1**. È la call-to-action di tutta
l'applicazione. In tema scuro lo stesso rapporto è 9.88, perché lì il testo
sull'accento è già scuro.

`--text-subtle` in tema chiaro è oggi identico a `--text-muted`: due nomi per lo
stesso valore sono un invito a divergere.

### I `font-size` piccoli sono 155, non ~85

Conteggio rifatto, come il brief chiede:

| Valore | Occorrenze |
|---|---|
| `0.8125rem` (13px) | 77 |
| `0.75rem` (12px) | 50 |
| `0.6875rem` (11px) | 22 |
| `0.625rem` (10px) | 6 |
| **Totale sotto 14px** | **155** |

`prefers-reduced-motion` compare in 10 file su 55 `.vue`. Il token
`--focus-ring`, che esiste, è usato in 9 punti.

### Il blocco 4 costa meno del previsto sul raggruppamento

Il brief teme che «il raggruppamento deve reggere una categoria personale che
non appartiene a nessun gruppo». Il problema non si pone: ogni voce di
`server/constants/catalogoCategorie.json` ha già un campo `gruppo`, e
`server/services/categorie.service.js:5` assegna `gruppo: 'Personali'` a ogni
categoria creata dall'utente. Raggruppare è quindi una riga di codice, non un
progetto.

In compenso c'è una lacuna che il brief non cita:
`validateMovimentiQuery` (`server/middleware/validation.middleware.js:49`)
valida **solo** `conto_id`, `da` e `a`. `tipo`, `categoria`, `page`, `limit` e
`ordine` arrivano al controller senza alcun controllo.

### Dashboard e Analisi si contendono la stessa risorsa

`analisiStore.risorsaAndamento` è unica. La Dashboard la carica con
`{ unita: 'settimana', quantita: 12 }` (`client/src/views/DashboardView.vue:182`),
Analisi con il periodo scelto in cima alla pagina
(`client/src/views/AnalisiView.vue:330`). Oggi si sovrascrivono a vicenda senza
che si veda, perché nessuna delle due espone un selettore. Il blocco 3 ne mette
uno in entrambe: da quel momento scegliere "1 anno" in Analisi e tornare alla
Dashboard mostra un anno finché non atterra il fetch della Dashboard.

## Decisioni prese

| Ambito | Decisione | Motivo |
|---|---|---|
| Selettore del grafico | Estendere il server con un bucket giornaliero | Su un'app di finanza personale il dettaglio giornaliero è quello che si guarda più spesso |
| Tetto di quantità | Per unità: `giorno` fino a 31, le altre restano 12 | Un tetto unico alzato a 31 renderebbe legali 31 anni |
| Dimensione minima del testo | 14px sull'informativo, deroga dichiarata altrove | Alzare tutti i 155 punti romperebbe assi e badge dove il testo piccolo è legittimo |
| Token di colore per ruolo | Uno solo, corretto fino a 4.5:1 | `--positive` più `--positive-text` raddoppia la decisione a ogni chiamata |
| Testo sull'accento chiaro | Scurire `--accent-on`, non l'accento | Il verde del brand non si tocca, e i due temi finiscono per condividere la stessa regola |
| Periodo del grafico | Locale al componente, non nello store | Due montaggi indipendenti non possono contendersi una risorsa sola |
| Ricerca testuale | Solo sulla descrizione | Digitare `50` e ricevere sia la spesa da 50 € sia "cena 50esimo compleanno" è peggio di non trovare nulla |
| Persistenza dei filtri | In memoria, nello store Pinia | Nessun dato su disco; `resetPiniaStores()` li azzera già al logout |
| Categorie recenti | Ricavate da `recentiHome`, già caricata | Nessun endpoint nuovo per un'informazione già in memoria |
| Verifica del contrasto | Script eseguibile in `client/tests/` | Il brief segnala «nessun test automatico copre il contrasto»: è il modo di chiuderlo |

### Debito dei blocchi 1-2 chiuso qui

Solo il **test a grep sui `.value` nelle viste** (punto 2 della Parte 5 del
brief). Va scritto per primo, prima che i blocchi 3 e 4 creino viste nuove, così
che quelle viste nascano già sotto la guardia.

Espressamente **non** chiusi qui: gli otto `loading` senza consumatori, il
`refreshAfterWrite` inerte, e la verifica a schermo dei blocchi 1-2 come task a
sé. Sul blocco 5 si passerà comunque da Dashboard, Movimenti, Conti e
Impostazioni: se emerge un difetto preesistente va **segnalato**, non corretto
di nascosto dentro un task di accessibilità.

---

## Blocco 5 — Contrasto, leggibilità, accessibilità

Il lavoro sta quasi tutto in `client/src/assets/styles/variables.css`. Il file è
maturo e ben organizzato: si interviene lì, non pagina per pagina.

### Correzioni ai token di colore

| Token | Tema | Da | A | Rapporto risultante |
|---|---|---|---|---|
| `--text-muted` | scuro | `#6B6B80` | `#7E7E94` | 4.64 su vetro |
| `--nav-item` | scuro | `#64748B` | `#7A8799` | 5.04 su vetro |
| `--text-muted` | chiaro | `#64748B` | `#5A6779` | 5.08 su pagina |
| `--nav-item` | chiaro | `#64748B` | `#5A6779` | 5.08 su pagina |
| `--positive` | chiaro | `#059669` | `#047857` | 4.84 su pagina |
| `--negative` | chiaro | `#DC2626` | `#C81E1E` | 5.07 su pagina |
| `--warning` | chiaro | `#D97706` | `#A34A07` | 5.24 su pagina |
| `--accent-on` | chiaro | `#FFFFFF` | `#04241C` | 5.44 sull'accento |

`--text-subtle` in tema chiaro va differenziato da `--text-muted` o fuso con
esso; la scelta si prende guardando i suoi call site, non a tavolino.

Se al controllo a schermo un **riempimento** (linea del grafico, barra di
avanzamento) risultasse spento dal colore più scuro, quello è il momento in cui
un secondo token per i riempimenti si guadagna l'esistenza — non prima.

### Scala tipografica con un pavimento

Nuovi token:

```
--text-micro: 0.75rem;   /* 12px — solo con deroga commentata */
--text-xs:    0.875rem;  /* 14px — pavimento dell'informativo */
--text-sm:    0.9375rem;
--text-base:  1rem;
--text-lg:    1.125rem;
```

**Informativo** è tutto ciò che l'utente legge per decidere: importi, date,
nomi di categoria e di conto, etichette di campo, messaggi di stato ed errore,
testi di aiuto. Sotto il pavimento si scende solo con `--text-micro`, e ogni
uso richiede un commento sulla riga che dica perché quel testo non è operativo.

**Deroga prevista e ammessa** per: etichette degli assi dei grafici, badge di
stato accanto a un testo che dice la stessa cosa, micro-didascalie sotto un
valore già leggibile. In nessun caso si scende sotto `--text-micro`.

Lo sweep sui 155 punti si divide per area (`views/`, `components/dashboard/`,
`components/movimenti/`, `components/analisi/`, il resto), non in un unico
task: è la parte con più superficie e meno rete di sicurezza.

### Movimento e focus

`prefers-reduced-motion` va esteso a tutti i file che animano, non ai 10
attuali. La forma è già stabilita dai file che ce l'hanno e va copiata, non
reinventata.

`--focus-ring` esiste già: va applicato ovunque ci sia un elemento
raggiungibile da tastiera, non solo dove è stato aggiunto di recente. Il
controllo si fa a tastiera, non a grep: un `:focus-visible` può esserci ed
essere coperto da un `overflow: hidden`.

### `text-transform: uppercase`

Undici occorrenze residue. `.w-overview__feature-label` è quella che il brief
cita come deliberatamente non toccata. Vanno riviste tutte: il maiuscolo
forzato riduce la leggibilità e rompe la pronuncia degli screen reader su parole
che diventano acronimi.

### La verifica diventa eseguibile

`client/tests/contrasto.test.js` legge `variables.css`, estrae i token e
calcola il rapporto WCAG per un elenco **dichiarato** di coppie
testo/superficie, nei due temi. Fallisce sotto 4.5:1 per il testo normale e
sotto 3:1 per i bordi che delimitano un controllo. Le superfici traslucide si
compongono sul proprio sfondo prima del calcolo: un token al 5% di bianco non ha
un contrasto proprio.

L'elenco delle coppie è la parte che vale: è la dichiarazione, verificabile, di
quale testo finisce su quale superficie.

Accanto, due grep: uno che fallisce su un `font-size` sotto il pavimento privo
di deroga, uno che fallisce su un file che anima senza
`prefers-reduced-motion`.

### Verifica a schermo

Passo obbligatorio del blocco, non appendice. Dashboard, Movimenti, Conti e
Impostazioni, in tema chiaro e scuro, a zoom 200% e da tastiera. Nessuno dei
test sopra vede un contrasto reale su una superficie sfocata.

---

## Blocco 3 — Grafico del patrimonio condiviso

### Server: il bucket giornaliero

`server/services/confrontoPeriodi.service.js`:

- `UNITA_VALIDE` guadagna `giorno`.
- `bucketGiorni(quantita, oggi)` restituisce un punto per giorno, dal più
  vecchio al più recente, con `da === a === chiave`. `label` breve (`14 set`),
  `labelEsteso` completo (`14 settembre 2026`).
- Il tetto diventa per unità: `QUANTITA_MAX_PER_UNITA = { giorno: 31,
  settimana: 12, mese: 12, anno: 12 }`. `normalizzaQuantita` accetta l'unità e
  applica il tetto giusto.
- `QUANTITA_MAX` **resta esportato** con il valore attuale: è letto dalla
  validazione e dai test esistenti.

`validateConfrontoQuery` valida `quantita` contro il tetto dell'unità
richiesta. I parametri legacy `mesi` e `periodo` **non si toccano**: il brief
lo impone e la ragione è che client e API vengono rilasciati separatamente.

`getAndamentoPatrimonio` non cambia: cicla già sui periodi che riceve.

Test in `server/tests/confrontoPeriodi.test.js`: 7 e 30 giorni, il confine del
mese, il tetto a 31, e che `settimana` resti limitata a 12 anche quando
`giorno` arriva a 31.

### Client: il composable

`client/src/composables/useAndamentoPatrimonio.js` possiede una propria
`creaRisorsa` **per istanza**. Due montaggi, due periodi indipendenti: sparisce
la contesa fra Dashboard e Analisi.

Espone **ref piatti**, non l'oggetto risorsa:

```js
const { stato, lastUpdated, punti, statistiche, periodo, cambiaPeriodo, riprova }
  = useAndamentoPatrimonio({ periodoIniziale: 'mese_3' });
```

La ragione è la trappola dei blocchi 1-2, che qui si presenta specchiata. Una
risorsa esposta da uno store Pinia è **già scompattata** (`store.risorsaX.stato`
è la stringa). La stessa risorsa dentro un componente è un oggetto semplice con
`ref` annidati, e i `ref` annidati **non** si scompattano nel template.
Restituire binding di primo livello elimina la classe di errore invece di
chiedere a chi scrive la vista di ricordarsene. `creaRisorsa` non è mai stata
usata fuori da uno store: questa è la convenzione che fissa il caso.

Mappatura del selettore:

| Etichetta | Richiesta | Punti | Stato oggi |
|---|---|---|---|
| 7 giorni | `giorno` × 7 | 7 | da costruire |
| 30 giorni | `giorno` × 30 | 30 | da costruire |
| 3 mesi | `settimana` × 12 | 12 | funziona |
| 1 anno | `mese` × 12 | 12 | funziona |

"3 mesi" come dodici settimane e non come tre mesi: tre punti non sono una
linea. Dodici settimane sono 84 giorni, non un trimestre esatto:
l'approssimazione è voluta, il tetto settimanale resta 12 per non cambiare il
selettore del confronto nelle Analisi, e le date reali si leggono sull'asse e
nel tooltip. Non è un difetto da correggere alzando il tetto a 13.

`vuotoSe` marca vuota una serie senza punti, oppure interamente a zero e senza
movimenti — cioè un utente che non ha ancora registrato nulla.

### Client: il componente

`client/src/components/analisi/AndamentoPatrimonio.vue`, su Chart.js, che il
Dashboard **già carica**: `WOverviewCarousel.vue` importa `vue-chartjs` e
disegna già un `<Line>` per gli investimenti, mentre il patrimonio nello stesso
file usa una `sparklinePath` SVG scritta a mano. Il costo di bundle di questa
scelta è zero, e la `sparklinePath` sparisce.

Prop `compatta`:

- **intero** (Analisi): grafico con assi, selettore, quattro statistiche
  (inizio, attuale, minimo, massimo), variazione.
- **compatto** (Dashboard): stessa linea, stessa variazione, senza assi né
  selettore.

Regole di presentazione:

- **Mai solo colore.** La variazione porta segno, icona di direzione e testo:
  è la regola già applicata agli avvisi dei blocchi 1-2.
- **La percentuale si nasconde quando `|inizio| < 1 €`** e resta il solo
  importo in euro. Un utente che parte da 0,50 € vedrebbe `+12.000%`: vero e
  inutile.
- **Tooltip al tocco**, non solo hover. Chart.js va configurato con gli eventi
  touch, e il tooltip non deve sparire al `touchend`.
- **Stato vuoto** con lo slot `vuoto` di `DataState`, che spiega cosa serve
  perché il grafico compaia.
- **Tabella `sr-only`** accanto al canvas con i punti della serie. Un `<canvas>`
  è opaco a uno screen reader, ed è anche l'unico modo perché la serie resti
  leggibile a zoom 200% quando il grafico esce dallo schermo.

### Rimozioni

`risorsaAndamento`, `andamentoPatrimonio` e `fetchAndamentoPatrimonio` in
`analisi.store.js` restano senza consumatori, insieme a `lineData`/`lineOptions`
in `AnalisiView.vue` e alla `sparklinePath` in `WOverviewCarousel.vue`.

La ricerca dei consumatori va **rifatta nel momento della rimozione**, non
adesso: è la lezione numero 2 del brief, pagata con un difetto vero.

---

## Blocco 4 — Filtri dei movimenti

### Server

`getMovimenti` (`server/controllers/movimenti.controller.js:39`) guadagna:

- **`cerca`**: `descrizione` con `Op.iLike` e il termine come parametro.
  Mai `sequelize.literal` con interpolazione.
- **`ordine`** esteso: `importo_desc`, `importo_asc`. `caricamento` resta
  identico, `data DESC` resta il default.

`where.user_id = req.userId` resta la **prima** condizione e le nuove si
aggiungono. Un filtro che perde l'isolamento per utente è un difetto di
sicurezza, non di UX.

`validateMovimentiQuery` chiude la lacuna esistente e copre il nuovo:

| Parametro | Regola |
|---|---|
| `tipo` | whitelist `entrata`, `uscita`, `trasferimento` |
| `categoria` | stringa, tetto di lunghezza |
| `cerca` | stringa, `trim`, tetto di lunghezza |
| `ordine` | whitelist `data`, `caricamento`, `importo_desc`, `importo_asc` |
| `page`, `limit` | interi con estremi |
| `conto_id`, `da`, `a` | invariati |

**Nessun indice nuovo.** `idx_movimenti_user_data_desc` copre già
`WHERE user_id ORDER BY data`. Una `ILIKE '%…%'` filtra dopo quell'indice e
l'ordinamento per importo richiede un sort: alla scala di un'app di finanza
personale va bene. Un indice trigram risolverebbe un problema che non abbiamo.

Test in `server/tests/`:

- `cerca` trova per sottostringa, ignora il maiuscolo, e **non** restituisce
  righe di un altro utente;
- i due ordinamenti per importo ordinano davvero, e `caricamento` non è
  cambiato;
- la validazione rifiuta un `ordine` fuori whitelist e un `cerca` troppo lungo;
- combinazione di `cerca` con `tipo`, `categoria` e intervallo di date.

### Client: il modulo puro

`client/src/utils/filtriMovimenti.js` traduce lo stato dei filtri nei parametri
della query, sul modello di `periodoAnalisi.js`. È l'unico modo per testarlo:
in `client/` non c'è infrastruttura di rendering, solo `node --test`.

La logica di calendario resta **separata** da quella delle Analisi: l'"anno"
delle Analisi va da gennaio a oggi, quello dei Movimenti è un anno di calendario
scelto dall'utente. Il commento nel file lo dirà, perché la somiglianza invita a
fonderli.

### Client: il componente

`client/src/components/movimenti/MovimentiFilters.vue`, separato dalla lista:
pannello laterale su desktop, `BottomSheet` su mobile — il componente esiste già
in `client/src/components/layout/BottomSheet.vue` (non in `common/`).

Tre livelli:

1. **Filtri rapidi**, sempre visibili: tipo e periodo.
2. **Categorie recenti**, ricavate dalle categorie che compaiono in
   `recentiHome`, che lo store già carica.
3. **Pannello completo**: ricerca, categorie raggruppate, conto, ordinamento,
   intervallo personalizzato.

Il raggruppamento legge `gruppo` dalle categorie, che arrivano da
`CATEGORIE_ENTRATA`/`CATEGORIE_USCITA`: `loadCategorie()` le mantiene allineate
all'API, quindi le categorie nascoste dall'utente spariscono dai filtri da sole
e le personali compaiono sotto `Personali`.

Inoltre: filtri attivi come elementi rimovibili, "Azzera filtri", conteggio dei
risultati da `pagination.total`, che lo store espone già.

### Client: stato e paginazione

Lo stato di UI dei filtri vive in `movimenti.store.js` — più ricco dei parametri
API, perché `periodo: 'mese'` non è `da`/`a` — e viene ripristinato al montaggio
della vista. `reset()` lo azzera, quindi `resetPiniaStores()` lo pulisce già al
logout senza aggiungere nulla.

**La guardia della paginazione non si tocca.** Il token `generazione` in
`movimenti.store.js:124` scarta una pagina in ritardo quando i filtri cambiano:
serve a impedire che righe di due ricerche diverse si mescolino.

La ricerca va in debounce di circa 300 ms. Ogni `fetchMovimenti` incrementa
`generazione`, che è il comportamento voluto.

Durante una nuova ricerca `stato` resta `pronto`, perché `lastUpdated` non è più
nullo: la lista mostrerebbe risultati vecchi in silenzio. Serve un indicatore
che legga `risorsaMovimenti.loading` — uno degli otto `loading` oggi senza
consumatori, che qui ne acquista uno vero.

---

## Test

| Livello | Copre | Dove |
|---|---|---|
| Contrasto | Ogni coppia testo/superficie dichiarata, nei due temi | `client/tests/contrasto.test.js` |
| Grep tipografico | `font-size` sotto il pavimento senza deroga | `client/tests/` |
| Grep movimento | File che animano senza `prefers-reduced-motion` | `client/tests/` |
| Grep `.value` | Risorse di store lette con `.value` in un template | `client/tests/` |
| Unità client | `filtriMovimenti.js`, mappatura del selettore del grafico | `client/tests/` |
| Unità server | `bucketGiorni`, tetto per unità | `server/tests/confrontoPeriodi.test.js` |
| Integrazione server | `cerca`, ordinamenti, validazione, **isolamento cross-user** | `server/tests/` |
| Browser | Tutto il resto del blocco 5 | manuale, obbligatorio |

Il test a grep sui `.value` va scritto **per primo**, prima che i blocchi 3 e 4
creino viste nuove.

## Sequenza

1. Test a grep sui `.value` nelle viste.
2. **Blocco 5**: token di colore → scala tipografica → sweep per area →
   movimento e focus → maiuscolo → script di contrasto e grep → verifica a
   schermo.
3. **Blocco 3**: bucket giornaliero e validazione sul server → composable →
   componente → adozione nelle due viste e rimozioni.
4. **Blocco 4**: server e validazione → modulo puro → componente → adozione
   nella vista e stato nello store.

Circa quindici task: la stessa scala dei blocchi 1-2.

## Rischi

**Il blocco 5 tocca la superficie più ampia con la copertura più sottile.** Lo
sweep su 155 punti è dove un layout denso può rompersi senza che nessun test lo
dica. Mitigazione: divisione per area e verifica a schermo obbligatoria.

**Le correzioni di contrasto cambiano l'aspetto dell'app.** Sono giuste e si
vedono. Il cambiamento più visibile è il testo del pulsante primario in tema
chiaro, che passa da bianco a verde molto scuro.

**La rimozione di `risorsaAndamento`** va preceduta da una ricerca dei
consumatori rifatta in quel momento.

**Il piano scritto in anticipo invecchia.** Dopo ogni scoperta significativa, i
task rimanenti vanno riletti: è la lezione numero 1 del brief.

## Documentazione da aggiornare

- `CLAUDE.md`: la regola dei token di leggibilità accanto alle Coding Rules 17 e
  18; la convenzione di `creaRisorsa` fuori dagli store.
- `docs/API.md`: `cerca` e i nuovi valori di `ordine` su `GET /movimenti`;
  `unita=giorno` su `GET /analisi/andamento-patrimonio`.
- `docs/ARCHITECTURE.md`: il componente condiviso dell'andamento e la fine della
  risorsa condivisa nello store.
- `client/src/content/helpTopics.js`: un argomento sui filtri dei movimenti.

## Fuori perimetro

- Gli otto `loading` senza consumatori, tranne quello dei movimenti che qui ne
  acquista uno. Vanno rimossi tutti insieme, in un commit dedicato.
- `refreshAfterWrite` inerte e i suoi due rami morti: il sotto-progetto C tocca
  `ImportaView.vue`, è lì che la decisione costa meno.
- La verifica a schermo dei blocchi 1-2 come task a sé.
- Gli «indicatori per movimenti particolarmente rilevanti» sul grafico, che la
  proposta cita e l'endpoint non fornisce.
- Un filtro per intervallo di importo. La ricerca copre la descrizione,
  l'importo si governa con l'ordinamento.
- **`getAndamentoPatrimonio` ricostruisce il patrimonio a ritroso dal totale
  attuale usando solo `entrata` e `uscita`** (`analisi.controller.js:215`).
  Trasferimenti e variazioni di valore degli investimenti non entrano nel
  calcolo, quindi i punti passati sono un'approssimazione. Non è un difetto
  introdotto da questo sotto-progetto e non va corretto qui, ma è annotato
  perché non vada perso.
