# Abbonamenti nella pagina Programmate

Data: 31 ottobre 2026. Stato: bozza da approvare.

In questo documento **«confermato»** indica ciò che il proprietario ha chiesto o
approvato durante la discussione. **«Scelta di progetto»** indica una decisione
presa da chi ha scritto il documento, mai discussa: va controllata in lettura.

## Perché

Oggi WALLT sa quanto esce dal conto, ma non risponde a una domanda semplice:
«quali abbonamenti ho e quanto mi costano al mese e all'anno?». I movimenti
periodici mescolano affitto, bollette e abbonamenti, e nessuna schermata fa il
conto dell'anno.

La nuova scheda **Abbonamenti** è un quadro da leggere. Non è uno strumento di
pagamento: guarda le transazioni, mostra cosa risulta attivo e fa i conti.

## Obiettivi (confermati)

1. La pagina Programmate ha due schede: **Programmate** (quello che c'è oggi) e
   **Abbonamenti**. La funzione si chiama **Programmate / Abbonamenti**.
2. WALLT legge le transazioni e aggiunge da solo un abbonamento che l'utente non
   ha ancora.
3. L'utente può aggiungere, modificare e annullare gli abbonamenti.
4. Ogni abbonamento ha un'icona, scelta da un elenco di servizi comuni con i loghi
   veri.
5. Ogni abbonamento mostra costo, durata e, accanto, il costo annuo oppure il
   totale del periodo. Per uno a tempo si può vedere anche quanto costerebbe in un
   anno.
6. In fondo all'elenco c'è la somma di quanto si spende al mese e all'anno.
7. La pagina è pulita e spiega come funziona, con il pulsante «Come funziona?»
   come nelle altre pagine.

## Non obiettivi

Confermati:

- **Non muove denaro.** Nessuna scrittura su conti, saldi o movimenti.
- **Niente promemoria di rinnovo.**

Scelte di progetto:

- Nessun effetto su saldo effettivo, liquidità, patrimonio, budget o Piano Smart:
  gli abbonamenti non sono impegni. Un addebito vero pesa già attraverso il suo
  movimento o la sua programmazione.
- Nessuna disdetta presso il servizio. «Annulla» cambia solo ciò che WALLT mostra.
- Nessun annullamento automatico quando gli addebiti smettono. Chi registra a mano
  può semplicemente non aver ancora segnato il movimento: l'assenza di un addebito
  non prova nulla.
- Nessuna eliminazione definitiva dalla pagina: basta annullare. La cancellazione
  avviene solo con la cancellazione dell'account.
- Nessun limite Premium: la funzione è per tutti, e `canUseFeature` non c'entra.
- Le programmazioni settimanali e le spese una tantum non diventano abbonamenti.
- Nessuna modifica alla cascata di categorizzazione.

## Cosa la renderebbe un fallimento anche se funzionasse

- Un abbonamento che cambia il saldo o il saldo effettivo.
- Un totale annuo gonfiato in silenzio: un annuale da 50 € contato come mensile
  vale quasi 600 €. Per questo esiste l'avviso «Controlla la durata».
- Doppioni che compaiono ricaricando la pagina.
- Un falso abbonamento che torna a ogni lettura, senza modo di toglierlo.
- Annullare un abbonamento e credere di aver fermato una programmazione che
  continua a scalare il conto.
- Dati di un utente visibili a un altro.

## Come si riconosce un abbonamento

Lettura idempotente a ogni `GET /api/abbonamenti`, dentro la stessa richiesta e
prima di leggere l'elenco (scelta di progetto: un solo punto d'ingresso, invece di
agganciarsi a movimenti, import, Bank Sync e cron). Se questa lettura fallisce si
registra l'errore e la pagina mostra comunque ciò che è salvato.

**Quali movimenti contano** (il principio di una sola transazione e dei 3 mesi è
confermato; il filtro sulle categorie è una scelta di progetto):

- `tipo: 'uscita'`, importo positivo, `ricorrente: false`, data compresa fra tre
  mesi fa e oggi.
- Categoria `abbonamenti`, `streaming`, `musica` o `abbonamenti_digitali`: basta
  questo.
- Categoria assente, `da_verificare` o `altro_uscita`: conta solo se la descrizione
  contiene il nome di un servizio dell'elenco.
- Le categorie dove la cascata manda un servizio noto, solo con il nome del servizio
  nella descrizione: `videogiochi` per i servizi di gioco, `shopping_online` per quelli
  Amazon, `libri` per Audible, `telefono` e `internet` per gli operatori, `palestra` e
  `sport` per le palestre, `delivery` per gli abbonamenti alle consegne. Il nome deve
  essere quello dell'abbonamento: un ordine su Glovo non è «Glovo Prime».
- Qualunque altra categoria: non conta mai, anche con il nome nella descrizione.
  «Bonifico a Claude Rossi» categorizzato come `trasferimento_denaro` non è Claude.
- Non contano i movimenti nati da un pagamento programmato o da un piano a rate, né
  le occorrenze di programmazioni diverse da `mensile` e `annuale`: sono pagamenti
  singoli, non abbonamenti.

**Le programmazioni** (`ricorrente: true`, `stato_ricorrenza: 'attiva'`, frequenza
`mensile` o `annuale`, stesso filtro di categoria e descrizione) contano senza
limite di data. Conoscendo già il periodo non generano l'avviso «Controlla la
durata». La riga dell'abbonamento ricorda a quale programmazione è legata.
`ricorrente_occorrenze_rimanenti`, se presente, diventa la durata a tempo: si legge
una volta sola, quando nasce la riga, con inizio da oggi. Non si rilegge, altrimenti
«In totale» calerebbe ogni mese. Per una regola trovata a metà percorso è quindi il
residuo.

Il legame con la programmazione resta vivo in due modi:

- Se l'utente sospende, termina o elimina la programmazione, l'abbonamento legato
  passa ad annullato. Qui l'assenza di addebiti è una scelta dichiarata, non un dubbio.
  Un addebito successivo lo fa tornare attivo, come ogni annullato.
- Se cambia l'importo della programmazione, il costo si aggiorna quando quella modifica
  è più recente dell'ultimo addebito e dell'ultima modifica dell'utente.

**Identità.** La `chiave` è l'id del servizio nell'elenco. Altrimenti è la
descrizione normalizzata con `MerchantNormalizer`. Senza descrizione è
`categoria:<id>`, con il nome della categoria come nome dell'abbonamento.

**Comportamento atteso** (confermato, salvo dove indicato):

| Situazione | Cosa succede |
|---|---|
| Primo addebito di un servizio che non ha righe | Nuovo abbonamento attivo, costo uguale all'addebito, mensile, avviso «Controlla la durata» |
| Due addebiti a circa un mese di distanza (scelta di progetto) | Come sopra, ma senza avviso: il periodo è dimostrato |
| Addebito con prezzo diverso, più recente dell'ultimo addebito e dell'ultima modifica dell'utente | Si aggiorna il costo, senza doppione. Vince il dato più recente |
| Due importi diversi per lo stesso servizio nello stesso mese (scelta di progetto: es. due addebiti Apple) | Due abbonamenti distinti. Ogni addebito va alla riga con lo stesso costo. Altrimenti va a quella col costo più vicino, se la differenza non supera il 25%: oltre, l'addebito non cambia nulla |
| Abbonamento annullato e addebito con data successiva all'annullamento | Torna attivo, con la scritta «Annullato il X, ma addebitato di nuovo il Y» |
| Abbonamento a tempo finito e addebito successivo alla fine (scelta di progetto) | Torna attivo senza scadenza, con «Controlla la durata» |
| «Non è un abbonamento» | Quella chiave non crea più righe nuove e gli addebiti con lo stesso importo sono ignorati. Le altre righe della stessa chiave continuano a vivere: togliere un acquisto singolo su Apple non tocca iCloud. Si può ripristinare |

**Doppioni** (Coding Rule 22): il divieto sta nel database. Due letture simultanee
non possono creare due righe per lo stesso rilevamento. La forma del vincolo è a
scelta di chi costruisce, purché ammetta più righe sulla stessa chiave nel caso dei
due importi nello stesso mese.

## I conti

Scelta di progetto: tutto in **centesimi interi**, come Piano Smart.

Per ogni abbonamento attivo, con `costo`, `periodo_mesi` (1, 3, 6 o 12) e
`durata_mesi` (`null` significa «finché non lo annullo»):

- **Al mese** = `costo / periodo_mesi`.
- **In un anno** = `costo × 12 / periodo_mesi`, come se durasse tutto l'anno.
- **In totale** (solo a tempo) = `costo × ⌈durata_mesi / periodo_mesi⌉`.
- **Peso sul totale annuo**: senza scadenza è «in un anno». A tempo sono i pagamenti
  dei primi 12 mesi al massimo, cioè
  `costo × min(⌈durata_mesi / periodo_mesi⌉, 12 / periodo_mesi)`.

Totali in fondo alla pagina (confermati):

- **Al mese**: somma dei «al mese».
- **All'anno**: somma dei pesi sul totale annuo.
- **Nota**, solo se esiste almeno un abbonamento a tempo: quanto sarebbe il totale
  se tutti durassero 12 mesi.

Scelta di progetto: gli abbonamenti con «Controlla la durata» entrano nei totali.
L'avviso è già sulla loro scheda.

Casi da usare come test:

| Costo | Si paga ogni | Durata | Al mese | In un anno | In totale | Peso annuo |
|---|---|---|---|---|---|---|
| 13,99 | 1 mese | illimitata | 13,99 | 167,88 | — | 167,88 |
| 49,90 | 12 mesi | illimitata | 4,16 | 49,90 | — | 49,90 |
| 30,00 | 3 mesi | illimitata | 10,00 | 120,00 | — | 120,00 |
| 10,99 | 1 mese | 3 mesi | 10,99 | 131,88 | 32,97 | 32,97 |
| 10,00 | 1 mese | 24 mesi | 10,00 | 120,00 | 240,00 | 120,00 |
| 30,00 | 3 mesi | 7 mesi | 10,00 | 120,00 | 90,00 | 90,00 |

Con i cinque abbonamenti di esempio delle bozze (Netflix 13,99 mensile, Prime Video
49,90 annuale, ChatGPT 23,00 mensile, Claude 18,00 mensile, Spotify 10,99 mensile
per 3 mesi): **al mese 70,14 €, all'anno 742,75 €, nota 841,66 €**.

I conti stanno sul server, unica fonte per scheda e totali. Il riquadro verde del
modulo li rifà sul client mentre si scrive, con una funzione sorvegliata da un test
di contratto che la confronta con quella del server.

## Stati

- **Attivo**: nell'elenco e nei totali.
- **Annullato**: scelto dall'utente. Fuori dall'elenco e dai totali, recuperabile.
- **Finito**: un abbonamento a tempo oltre la fine. **Si legge dalla data**, non da
  una colonna scritta da un cron (stesso principio della Regola 23).
- **Escluso**: «Non è un abbonamento». Fuori da tutto, recuperabile.

«Mostra annullati (n)» apre sotto i totali l'elenco di annullati, finiti ed esclusi,
ciascuno col suo stato e un pulsante «Ripristina».

## La pagina (confermata con le bozze)

**Testata**: titolo «Programmate / Abbonamenti», pulsante «Come funziona?», una riga
di spiegazione che cambia con la scheda. Quella di Abbonamenti dice: «Quanto spendi
in abbonamenti, a colpo d'occhio. Questa pagina legge soltanto: i tuoi conti non
cambiano.»

**Schede**: selettore a due voci sotto la testata, nello stile di quello di
`CategorieView.vue`. Sul telefono ci si sposta anche scorrendo di lato, riusando
`decidiAsse` di `components/movimenti/swipeGesture.js`. La scheda aperta sta
nell'indirizzo (`/ricorrenti?scheda=abbonamenti`). Scelta di progetto: gli
abbonamenti si caricano alla prima apertura della scheda, così Programmate resta
identica a oggi.

**Elenco: una scheda per abbonamento** (layout B delle bozze).

- In alto: icona, nome, costo. Sotto il nome, se serve, «Controlla la durata» o
  «Annullato il X, ma addebitato di nuovo il Y».
- Sotto: etichette e valori. Senza scadenza: **Durata** e **All'anno**. A tempo:
  **Durata**, **In totale**, **In un anno**.
- Toccare la scheda apre il modulo. Deve essere un elemento attivabile anche da
  tastiera.

**Totali**: riquadro in fondo all'elenco, «Quanto spendi in abbonamenti», con Al
mese e All'anno, più la nota se c'è un abbonamento a tempo.

**Vuoto**: spiega che WALLT aggiunge da solo gli abbonamenti trovati nelle
transazioni e offre «+ Aggiungi». Si usa `DataState` con lo slot `vuoto`.

**Modulo** (`AppDialog`, come gli altri):

- **Nuovo**: ricerca e griglia di servizi per gruppo. Toccando un servizio si
  compilano nome e icona. Se non è in elenco si scrive il nome e si sceglie
  un'icona generica.
- **Campi**: Nome, Costo, «Si paga ogni» (mese, 3 mesi, 6 mesi, anno), «Quanto dura»
  («Finché non lo annullo» o «Solo per un periodo»). Con un periodo compaiono «Per
  quanti mesi» e «Dal». Nessuna scelta del conto.
- **Riquadro verde**: «Ti costa X all'anno», oppure «Ti costa X in totale» con «In
  un anno sarebbero Y».
- **In modifica**: «Salva modifiche», «Annulla abbonamento». Se è stato trovato
  nelle transazioni, in alto compare l'ultimo addebito e in fondo «Non è un
  abbonamento».
- **Salvare** toglie l'avviso «Controlla la durata» e la scritta dell'addebito dopo
  l'annullamento.
- **Annullare o escludere** non chiede conferma, perché è reversibile (scelta di
  progetto): basta un messaggio di esito.
- **Se è legato a una programmazione**, il modulo avvisa che annullarlo o modificarlo
  qui non cambia la programmazione, con un collegamento alla scheda Programmate.

**Come funziona?**: nuovo argomento `abbonamenti-gestione` in
`content/helpTopics.js`, nella categoria `movimenti`. Punti da spiegare: la pagina
legge e non tocca i conti; come arrivano gli abbonamenti trovati; perché c'è
«Controlla la durata»; come si leggono i totali; la differenza fra annullare qui e
disdire presso il servizio; il caso della programmazione.

**Nome della funzione**: in `config/functionalityItems.js` l'etichetta diventa
«Programmate / Abbonamenti» e la descrizione menziona gli abbonamenti. Va verificato
che stia nella barra laterale e nella navigazione del telefono. Vanno aggiornati i
testi di aiuto che citano la sezione Programmate. La rotta resta `/ricorrenti`, così
i collegamenti esistenti non si rompono.

## Le icone (confermato)

Circa 110 servizi, con il logo vero dove la raccolta lo ha (76) e una sigla negli altri casi:

- **Video**: Netflix, Prime Video, Disney+, NOW, Sky, DAZN, Apple TV+, Paramount+,
  YouTube Premium, Crunchyroll, HBO Max, discovery+, TIMVISION, Mediaset Infinity,
  MUBI, Rakuten TV, Twitch
- **Musica**: Spotify, Apple Music, Amazon Music, YouTube Music, Tidal, Deezer,
  SoundCloud, Qobuz
- **Intelligenza artificiale**: ChatGPT, Claude, Gemini, Perplexity, Copilot,
  Midjourney, Grok, Mistral, Cursor, ElevenLabs, Suno
- **Cloud e software**: iCloud+, Google One, Dropbox, Microsoft 365, Adobe, Canva,
  Notion, NordVPN, GitHub, Apple One, Google Workspace, Proton, ExpressVPN, Surfshark,
  1Password, Bitwarden, LastPass, Dashlane, Figma, Slack, Zoom, Grammarly, Evernote,
  Todoist, CapCut, Norton, McAfee
- **Giochi**: PlayStation Plus, Xbox Game Pass, Nintendo Switch Online, EA Play,
  Ubisoft+, GeForce NOW, Apple Arcade, Google Play Pass
- **App e benessere**: Duolingo, Strava, Headspace, Calm, MyFitnessPal, Tinder, Bumble,
  LinkedIn Premium, X Premium, Telegram Premium, Uber One, Deliveroo Plus, Glovo Prime,
  McFIT, FitActive, Virgin Active
- **Giornali e notizie**: Corriere della Sera, la Repubblica, Il Sole 24 Ore, La Gazzetta
  dello Sport, The New York Times, Medium, Substack
- **Telefono e internet**: TIM, Vodafone, WindTre, iliad, Fastweb, ho. Mobile, Kena
  Mobile, Very Mobile, CoopVoce, PosteMobile, Starlink
- **Altro**: Amazon Prime, Audible, Kindle Unlimited, Revolut Premium, Telepass, e le
  icone generiche per palestra, telefono, giornali e «altro» (da `lucide-vue-next`, già
  presente)

I disegni si copiano dalla raccolta Simple Icons (licenza CC0) dentro un file del
client, **senza aggiungere dipendenze** (Coding Rule 5). Un servizio il cui logo non
è disponibile, e ogni abbonamento fuori elenco, mostra un riquadro colorato con
l'iniziale. I loghi restano marchi dei proprietari e servono solo a indicare il
servizio: prima di una versione a pagamento di WALLT l'uso va fatto controllare da
un legale.

## Lato tecnico

**Server** (scelte di progetto, sul modello di `debiti` e del fondo di emergenza):

- `models/Abbonamento.js` e una tabella `abbonamenti`. Campi necessari: `user_id`,
  `servizio_id`, `chiave`, `nome`, `icona`, `costo`, `periodo_mesi`, `durata_mesi`,
  `data_inizio`, `stato`, `origine` (`manuale` o `rilevato`), `da_verificare`,
  `ultimo_addebito_data`, `ultimo_addebito_importo`, `annullato_il`, il momento
  dell'ultima modifica dell'utente, e il riferimento alla programmazione. Quel
  riferimento è un intero senza chiave esterna: una chiave con `SET NULL` cancellerebbe
  proprio l'informazione che serve a capire che la programmazione è stata eliminata.
- La migrazione **abilita RLS e revoca i privilegi ad `anon`/`authenticated`**: lo
  pretende `migrazioniReali.test.js`. Va eseguita in produzione **prima** del push
  su `main`, perché lì le migrazioni non girano all'avvio.
- `constants/abbonamenti.js`, **senza `require`**: categorie, periodi, elenco dei
  servizi con gli alias per le descrizioni. Duplicato nel client in
  `utils/abbonamenti.js` e sorvegliato da `client/tests/abbonamentiContratto.test.js`.
  Gli alias più specifici vengono prima: «apple music» prima di «apple», «prime
  video» prima di «amazon prime». «amazon» da solo non è un alias.
- `services/abbonamenti.service.js` è il punto sorgente unico (Regola 20). Una
  funzione pura per i conti, in un file senza `require` così il test di contratto
  può importarla.
- Rotte in `routes/abbonamenti.routes.js`, montate su `/api/abbonamenti`, tutte con
  `authMiddleware`, validazione e filtro per `user_id`:
  - `GET /`: elenco attivi, elenco non attivi, totali.
  - `POST /`: crea.
  - `PUT /:id`: modifica.
  - `PATCH /:id/annulla`, `PATCH /:id/escludi`, `PATCH /:id/ripristina`.
- Il client non scrive mai `user_id`, `origine`, `chiave` né gli `ultimo_addebito_*`.
- **Cancellazione ed esportazione**: la tabella entra in `deleteAllUserData` e in
  `esportaDati`. Il reset dei movimenti (`deleteAllTransactions`) elimina solo le
  righe `rilevato` mai toccate dall'utente, perché derivano da movimenti che non
  esistono più. Le altre restano, come budget e obiettivi.
- `eliminaDatiImportati` di Bank Sync non tocca gli abbonamenti.

**Client**:

- `stores/abbonamenti.store.js` con `creaRisorsa` (Coding Rule 17) e getter calcolati
  verso le viste (Coding Rule 23). Il suo `reset()` va in `resetPiniaStores()`,
  altrimenti al cambio utente restano i dati del precedente.
- Componenti in `components/abbonamenti/`: scheda, totali, modulo, griglia icone,
  icona del servizio.
- `RicorrentiView.vue` ospita il selettore. La parte Abbonamenti sta in un componente
  proprio, per non ingrossare una vista già lunga.
- Pavimento tipografico a 14px (`--text-xs`, Coding Rule 19). Le bozze usano testi
  più piccoli: nella griglia delle icone probabilmente servono 4 colonne invece di 5.
- Le etichette «Al mese» e «All'anno» dei totali vanno nel glossario (Coding Rule 18).
- Icone e testi devono funzionare in tema chiaro e scuro.

**Test**:

- Suite server: riconoscimento (ogni riga della tabella «Comportamento atteso»),
  conti (la tabella qui sopra), isolamento fra utenti, due `GET` simultanee senza
  doppioni, nessuna scrittura su conti e movimenti, cancellazione ed esportazione.
- Una prova esplicita che saldo effettivo e patrimonio non cambino con e senza
  abbonamenti.
- Test client: contratto server/client, come in `fondoEmergenzaContratto.test.js`.
- Verifica nel browser: telefono e computer, tema chiaro e scuro.

**Documentazione**: nuova regola in `CLAUDE.md`, conteggio endpoint, `docs/API.md`,
`docs/DATABASE.md`.

**Dove si lavora** (scelta di progetto): ramo `abbonamenti` da `origin/main`, nel worktree
`.worktrees/abbonamenti`. L'orizzonte di spesa è già in `main`, quindi non ci sono
sovrapposizioni con il ramo `orizzonte-spesa`.

## Lasciato a chi costruisce

- La forma esatta del vincolo anti-doppioni.
- Come rilevare «circa un mese» fra due addebiti.
- Il testo definitivo di aiuto, stati vuoti e messaggi, nel tono delle altre pagine.
- L'ordine delle schede nell'elenco. Suggerimento: dal costo annuo più alto.
- I colori dei riquadri delle icone.
- Se duplicare il vocabolario a mano o generarlo, come fa `sync-category-catalog.js`,
  purché un test lo sorvegli.
