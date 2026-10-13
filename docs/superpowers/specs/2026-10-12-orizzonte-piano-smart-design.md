# Piano Smart — orizzonte di spesa e separazione del monitoraggio

> Design validato il 12 ottobre 2026.
> Stato: approvato, da implementare.

## Il problema

Aprendo `/funzionalita/piano-smart` un utente non ha modo di capire cosa
sia Piano Smart, perché sotto un solo nome convivono **due prodotti con
domande diverse**:

- i tab `Oggi` / `Prossimi 30 giorni` / `Analisi` sono un cruscotto di
  monitoraggio continuo — «come sto»;
- il tab `Piani` è un wizard che riparte una somma appena arrivata — «è
  arrivata una somma, come la divido».

Il nome del menu e la documentazione descrivono la seconda; quello che si
vede aprendo è la prima. Nessuna riga della pagina dichiara che esistono
entrambe. `PianoSmartView.vue` è un file da 1419 righe con quattro tab e
una decina di sezioni: è il sintomo, non la causa.

Accanto a questo, cinque difetti di leggibilità misurabili nel codice.

**1. Lo stesso numero con due nomi, due numeri con nomi gemelli.**
`dailyLimit` è stampato due volte nell'hero: «Limite giornaliero
indicativo» ([PianoSmartView.vue:409]) e «Il tuo limite»
([PianoSmartView.vue:466]). Accanto convivono «Spendibile» (uno stock) e
«Margine giornaliero» (un flusso: limite meno ritmo). La card mostra undici
cifre per rispondere a una domanda sola.

**2. L'orizzonte è il mese civile e non è mai dichiarato come scelta.**
`remainingDays` sono i giorni fino all'ultimo del mese
([currentSituation.service.js:77]). Conseguenza osservabile: il 30 il
limite giornaliero è enorme, il 1° crolla, senza che sia cambiato nulla
nella vita dell'utente. Per chi non ha stipendio mensile il mese civile non
è un ciclo: è un confine arbitrario che fa saltare il numero più importante
della pagina.

**3. Il limite giornaliero riporta il passato invece di decidere un
budget.** Con entrate giudicate irregolari il limite è
`min(spendibile / giorni_a_fine_mese, spesa_media_storica_giornaliera)`
([currentSituation.service.js:140-145]). Con un capitale ampio rispetto al
mese **vince il secondo termine quasi sempre**: il numero in cima dice
«puoi spendere più o meno quanto hai sempre speso». È circolare e
praticamente costante — il campo `dailyLimitBasis: 'spesa_media'` è il
server che lo dichiara. Chi risparmia un giorno non vede alcun beneficio il
giorno dopo.

**4. La riserva non si consuma mai.** `reserveTarget = spese essenziali
mensili × mesi scelti` è una riserva *rolling*: ogni giorno l'obiettivo è
identico, quindi la quota protetta non scende mai. Quel modello risponde a
«non voglio scendere sotto tre mesi di spese» — una domanda da fondo di
emergenza, che in WALLT è già un conto (Regola 22) — non a «ho questo
capitale e devo arrivare al 30 giugno». Nel secondo caso l'orizzonte è
fisso e si avvicina, il capitale **deve** consumarsi, e il budget deve
salire davvero se ieri si è speso meno. Il modello attuale non può
esprimerlo: non ha una data, e ciò che protegge non è pensato per essere
speso.

**5. Un controllo che appare secondo un giudizio invisibile, e un nome
duplicato.** Il selettore «Mesi di spese da proteggere» esiste solo se
`incomeMode === 'irregolare'`; con entrate stabili `reserveTarget` diventa
`0` e la riserva svanisce in silenzio. Quel giudizio è un coefficiente di
variazione su tre mesi completi con soglia 0,25: l'utente non lo vede e non
lo può contestare. In più `mesi_riserva_piano_smart` (1–6) e
`mesi_sicurezza_target` del fondo (3/6/12) sono due impostazioni diverse
con lo stesso nome e la stessa unità in due pagine diverse.

**6. Serve storico per quasi tutto.** Tre mesi civili completi per le
stime, mesi completi per il limite prudente. Un utente nuovo apre Piano
Smart e trova una pagina di avvisi su ciò che non si può calcolare.

## Il principio

Il monitoraggio continuo e la ripartizione di una somma sono **due
prodotti**, e vanno separati in due pagine con due nomi che dicano la
differenza.

Dentro il monitoraggio, l'orizzonte temporale diventa **una scelta
dichiarata dell'utente**, non un confine implicito. Due modalità:

- **ciclo mensile** — il budget si rinnova col mese (comportamento di
  oggi, invariato);
- **fino a una data** — il capitale deve bastare fino al giorno scelto.

La seconda è una modalità nuova accanto alla prima, non una sostituzione:
chi ha stipendio fisso sta meglio con il ciclo mensile.

## Decisioni prese

| Decisione | Scelta | Conseguenza |
|---|---|---|
| Rapporto con il modello attuale | Modalità scelta dall'utente | Un solo numero in cima; cambia la regola, non la gerarchia |
| Capitale disteso sui giorni | Conti spendibili, **fondo di emergenza escluso** | Nessuna modifica a `liquidita.service.js`; Regola 22 intatta |
| Cosa copre il budget | Solo le spese libere | Ricorrenze e spese programmate fino alla data vengono messe da parte prima |
| Struttura | Due voci di menu distinte | `PianoSmartView.vue` si divide in due file |

## Il modello di calcolo

Un nuovo `services/pianoSmartV2/orizzonte.service.js`, puro (nessun
`require('../models')`), in centesimi interi come il motore V1 (Regola 21).
`currentSituation.service.js` — già 380 righe — gli **delega** invece di
accogliere un secondo modello al proprio interno.

In modalità data:

```
giorni             = da oggi (incluso) al giorno X (incluso)
base               = conti attivi non nascosti − liquidità allocata su obiettivi
impegni_fino_a_X   = ricorrenze + spese programmate con scadenza in [oggi, X]
capitale_libero    = base − impegni_fino_a_X
budget_giornaliero = floor(capitale_libero / giorni)
```

Gli impegni sono ri-sottratti **sull'intero orizzonte scelto**, non
sommando la finestra dei 30 giorni a una più lunga: è ciò che evita il
doppio conteggio con `reserved`, che oggi significa «già tolto dai 30
giorni di `calcolaLiquidita`».

**L'autocorrezione è la proprietà centrale.** Nessuno stato salvato oltre
la data: il budget è ricalcolato ogni giorno sul capitale reale. Speso meno
ieri → capitale più alto e un giorno in meno → budget di oggi più alto.
Speso di più → più basso. In modalità data **non si applica** il tetto
`min(..., spesa_media_giornaliera)`: la domanda non è quanto si spende di
solito, ma quanto si può spendere al giorno per arrivare alla data.

**Quando il capitale non basta.** `capitale_libero < 0` → stato
`scoperto`, con l'ammontare che manca. In ogni caso, accanto al budget, la
**data raggiungibile** al ritmo medio osservato delle spese libere: è il
confronto fra data scelta e data raggiungibile a rendere la pagina utile
ogni giorno.

**Il fondo di emergenza resta fuori dal capitale.** Se la data non è
raggiungibile, una riga di sola lettura dice quanti giorni in più il fondo
coprirebbe. Informazione, non capitale incluso.

**Senza storico il budget esiste.** In modalità data serve solo capitale e
data: zero mesi completi. Restano non stimabili «ritmo attuale» e «data
raggiungibile», e lo si dichiara **su quelle due voci**, non sull'intero
schermo.

**Persistenza.** Due campi in `profilo_utente`: `orizzonte_tipo`
(`mensile` | `data`, default `mensile`, NOT NULL) e `orizzonte_data`
(DATEONLY, null in mensile). `mesi_riserva_piano_smart` resta e vale
**solo** in modalità mensile. La data è modificabile in qualsiasi momento:
è una preferenza di pianificazione, non una soglia di integrità dei dati
come `import_da` di Bank Sync.

## L'interfaccia: una risposta, tre numeri, una porta

**Livello 1 — la risposta.** Un numero grande, un solo nome, mai ripetuto
(il doppione «Limite giornaliero indicativo» / «Il tuo limite» scompare):

```
Puoi spendere oggi
€38
per arrivare al 30 giugno · 112 giorni
● In rotta            (oppure: ⚠ al ritmo attuale arrivi al 14 marzo)
```

In modalità mensile cambia solo la riga di contesto («fino al 31 marzo ·
19 giorni»): stesso componente, stessa gerarchia, niente da reimparare
passando da una modalità all'altra.

**Livello 2 — tre numeri con nomi che non si somigliano.**

| Oggi | Diventa | Perché |
|---|---|---|
| «Spendibile» | **Capitale libero** | Non può chiamarsi come il numero in cima: uno è uno stock, l'altro una quota giornaliera |
| «Da proteggere» | **Impegni fino al 30/6** | Dice cosa e fino a quando; «da proteggere» non dice né l'uno né l'altro |
| «Ritmo non ricorrente» + «Margine giornaliero» | **Ritmo attuale** €52/g · *−14 sopra il budget* | Il margine è una differenza, non una grandezza: diventa il segno accanto al ritmo |

Escono dalla card: «Liquidità dei conti» (è il lordo, non serve a decidere
nulla), «Riserva obiettivo» e il suo «da proteggere», «Mancano €X» — che
diventa lo stato `scoperto` del livello 1, dove è l'unica cosa che conta
quando accade.

**Livello 3 — una porta sola.** Oggi la spiegazione degli stessi importi
sta dietro quattro aperture diverse: due `<details>`, il modale
`spiegazioneImportiAperta`, un `HelpTrigger` e la guida. Diventa un unico
pannello «Come è calcolato» con il percorso per intero:

```
Liquidità dei conti        €12.400
− obiettivi accantonati     −3.920
− impegni fino al 30/6      −4.200
= capitale libero            4.280
÷ 112 giorni            = €38/giorno
```

**La scelta dell'orizzonte.** Un controllo sempre presente sotto il numero
(`Orizzonte: ciclo mensile ▾`) con due opzioni, ciascuna con la frase che
dice a chi serve. I mesi di riserva stanno **dentro** l'opzione mensile,
non in pagina: appartengono a quella modalità e solo a quella. Il giudizio
del server sulla stabilità delle entrate diventa **una frase dentro il
pannello** — «le tue entrate risultano irregolari negli ultimi 3 mesi:
l'orizzonte a data potrebbe descriverti meglio» — visibile e ignorabile,
invece di decidere in silenzio quali controlli esistono.

**Il simulatore risale.** «Prima di spendere» va subito sotto il livello 2:
è l'azione naturale dopo aver letto il budget, oggi è sepolto sotto la
previsione di fine mese. In modalità data risponde meglio — «questo
acquisto ti costa 4 giorni di autonomia: la data raggiungibile passa dal 14
al 10 marzo» — invece di «impatto: moderato, 20–45% dello spendibile».

## Le due pagine

- **`views/SituazioneView.vue`** — rotta `funzionalita/situazione`, menu
  «La tua situazione»: oggi, prossimi 30 giorni, analisi.
- **`views/PianoSmartView.vue`** — rotta nuova, `funzionalita/piano-smart/nuovo`,
  menu «Piano Smart»: solo wizard e piani salvati.

> Nota (review finale, voce 8): la prima implementazione aveva lasciato il
> wizard sulla vecchia rotta `funzionalita/piano-smart` senza far
> redirigere nessuno — un segnalibro su quell'indirizzo continuava a
> cercare il monitoraggio e trovava il wizard. La decisione finale è
> l'opposta di quella scritta sopra: è il **wizard** a spostarsi su una
> rotta nuova, e `funzionalita/piano-smart` diventa un redirect verso la
> situazione — chi aveva un segnalibro su quell'indirizzo cercava il
> monitoraggio, non la creazione di un piano (Coding Rule 14: link e
> bookmark non si rompono, continuano solo a portare altrove).

## File toccati

**Server**

| File | Cosa |
|---|---|
| `migrations/` (nuova) | `profilo_utente`: `orizzonte_tipo`, `orizzonte_data` |
| `models/ProfiloUtente.js` | i due campi |
| `middleware/validation.middleware.js:1250` | `orizzonte_data` obbligatoria se tipo = `data`, nel futuro nel fuso dell'utente, con tetto a 3 anni perché non si proiettino ricorrenze su vent'anni |
| `controllers/profilo.controller.js:132` | i due campi nella whitelist |
| **`services/pianoSmartV2/orizzonte.service.js`** (nuovo) | `{ tipo, dataFine, giorni, capitaleLibero, impegniFinoA, budgetGiornaliero, stato, dataRaggiungibile }` |
| `services/financialContext.service.js:56` | parametrizzare `termineFlussi` (`oggi + 30`) con l'orizzonte richiesto |
| `services/pianoSmartV2/currentSituation.service.js` | delega all'orizzonte; in modalità mensile comportamento identico |
| idem, `simulatePurchase` | giorni di autonomia persi e nuova data raggiungibile |
| `constants/pianoSmart.js` | vocabolario dell'orizzonte (file senza `require`, Regola 21) |
| `docs/piano-smart-v2-api-contract.md` | il contratto cresce di un oggetto `horizon` |

**Client**

| File | Cosa |
|---|---|
| `router/routes.js:150` | rotta nuova e redirect dalla vecchia |
| `components/layout/AppLayout.vue:118,135` | due voci di menu |
| `views/SituazioneView.vue` (nuovo) | i tre tab di monitoraggio |
| `components/piano-smart/SituazioneHero.vue`, `OrizzonteSelector.vue` (nuovi) | l'hero è il pezzo che cambia di più: fuori dalla view diventa testabile |
| `content/glossario.js` | «Capitale libero», «Impegni fino al …», «Ritmo attuale», «Budget giornaliero» (Coding Rule 18); «Spendibile» va ritirato, non lasciato in circolo come etichetta concorrente |
| `utils/pianoSmart.js` | duplicato del vocabolario; `client/tests/pianoSmartContratto.test.js` lo sorveglia già |
| `components/piano-smart/PianoSmartGuide.vue` | la guida spiega due modalità |

## Test

- **`server/tests/pianoSmartOrizzonte.test.js`** (nuovo, puro, gira in
  `test:unit`): l'autocorrezione è la proprietà da bloccare — *speso meno
  ieri → budget di oggi più alto*. Più: giorni inclusivi su entrambi gli
  estremi, giorno X = oggi (giorni = 1), `capitaleLibero` negativo →
  `scoperto`, data raggiungibile diversa da quella scelta, zero mesi
  completi → budget presente e ritmo `null`.
- **`pianoSmartRecurringCashFlow.test.js`**: proiezione oltre i 30 giorni
  senza doppio conteggio di `reserved` e **senza occorrenze duplicate** su
  orizzonte lungo. È la trappola che il commento a
  [financialContext.service.js:62-70] documenta già, e su 240 giorni è più
  facile inciamparci che su 30.
- `pianoSmartCurrentSituation.test.js`, `pianoSmartV2Contract.test.js`:
  contratto **invariato** in modalità mensile.
- `pianoSmartSecurity.test.js`: date passate o fuori tetto rifiutate.
- `client/tests/vistaValue.test.js`: le due view nuove rispettano le
  Regole 20 e 23 sui ref.

## Fuori perimetro

- **Il motore V1** (`services/pianoSmart/`): non si tocca. Non calcola
  orizzonti, e `config.js` versionato `smart-v1` deve restare riproducibile
  sui piani già salvati (Regola 21).
- **`liquidita.service.js` e `fondoEmergenza.service.js`**: zero
  modifiche. È la conseguenza diretta della scelta di tenere il fondo fuori
  dal capitale.
- Nessuna scrittura finanziaria: l'orizzonte non muove un euro, come Piano
  Smart oggi.

## Rischi

1. **La migrazione va eseguita su Supabase prima del push su `main`.** In
   produzione le migrazioni non girano all'avvio: un modello che dichiara
   una colonna inesistente rompe ogni lettura di `profilo_utente`, cioè
   l'app intera.
2. **`financialContext` è condiviso** con il motore V1, il radar e gli
   insight: è il punto dove una regressione si propaga più lontano. Il
   default resta rigorosamente `oggi + 30`; solo l'orizzonte a data chiede
   una finestra più lunga.
3. **Il tetto `spesa_media` resta in modalità mensile.** Toglierlo anche lì
   cambierebbe il numero in cima per utenti che non hanno chiesto nulla: va
   affrontato separatamente, se mai.
