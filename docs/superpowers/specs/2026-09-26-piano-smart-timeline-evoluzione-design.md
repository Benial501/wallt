# Piano Smart — Timeline, flussi e obiettivi

## Obiettivo

Completare l'evoluzione di Piano Smart da riepilogo della situazione corrente a
strumento che renda leggibili i cambiamenti nel tempo e le conseguenze delle
scelte. La pagina deve rispondere con chiarezza a quattro domande:

1. Come sono cambiate entrate e uscite rispetto a un periodo equivalente?
2. Quali flussi ricorrenti sono previsti nel prossimo mese e quale margine
   lasciano?
3. Quanto è affidabile ciascuna stima, considerando i dati effettivamente
   registrati?
4. Come si collega il margine mensile agli obiettivi attivi?

La pagina continua a usare il backend come unica fonte per aggregazioni e
stime. Le letture non modificano movimenti, conti, obiettivi o saldi. WALLT non
può verificare la completezza delle registrazioni manuali e non deve presentare
una stima come certezza.

## Decisioni confermate

- Il confronto usa periodi della stessa durata.
- Il controllo temporale avanza di un giorno per valori da 1 a 30 giorni; dopo
  il primo mese avanza di una settimana fino a 90 giorni.
- Per una durata `N`, il periodo recente è confrontato con i `N` giorni
  immediatamente precedenti.
- Il riepilogo e la nuova serie temporale sono dati read-only.
- Le stime mostrano la propria base e i limiti; non si inventano percentuali di
  precisione.
- Il progetto estende il contratto `GET /api/piano-smart/v2/current-situation`
  in modo additivo, senza cambiare le rotte esistenti e senza introdurre tabelle.

## Ambito

### 1. “Cosa è cambiato?”

Il cursore seleziona la durata del confronto: 1, 2, …, 30 giorni e poi valori
settimanali (37, 44, …, 86) fino a 90 giorni, includendo esattamente 90 come
ultimo valore. Il valore iniziale è 7 giorni. Ogni posizione confronta:

```text
periodo recente:   [riferimento - 2N + 1, riferimento - N]
periodo corrente: [riferimento - N + 1, riferimento]
```

Il riferimento è la data civile Europe/Rome restituita dal riepilogo. Gli
intervalli sono inclusivi e di `N` giorni ciascuno. Per `N = 1` si confrontano
il giorno corrente e il giorno precedente; il giorno corrente è dichiarato
parziale.

Per ogni posizione l'API restituisce valori e differenze per entrate, uscite e
media giornaliera delle uscite. Le uscite non vengono mostrate come giudizio
morale. Quando le categorie sono disponibili, si aggiungono fino a tre
categorie con le variazioni assolute maggiori. I trasferimenti interni sono
esclusi dai totali di entrate e uscite. I modelli di ricorrenza (`ricorrente: true`)
non sono movimenti avvenuti e vengono esclusi; i loro addebiti generati restano
inclusi perché sono movimenti reali. La categoria non classificata resta
visibile come tale; la UI non attribuisce una causa che i dati non dimostrano.

Il server prepara tutti i punti necessari in una singola lettura. Il browser
seleziona un punto già ricevuto, senza inviare una richiesta a ogni movimento
del cursore. La serie copre al massimo i 180 giorni necessari al confronto
90+90. Se i movimenti disponibili iniziano dopo un intervallo richiesto, il
server marca quel punto come limitato o non disponibile: non riempie i giorni
precedenti con zeri.

La cronologia dei movimenti rappresenta i dati come sono registrati oggi; il
database non conserva snapshot di ogni giorno né l'audit delle modifiche. Il
confronto misura quindi entrate e uscite registrate, non ricostruisce saldi,
liquidità o spendibile storici. L'interfaccia lo dichiara accanto alla serie.
La data iniziale usata per valutare la copertura considera il primo movimento
effettivo di entrata o uscita: trasferimenti e regole ricorrenti non dimostrano
che l'utente abbia registrato spese o entrate.

### 2. Qualità e affidabilità

Ogni punto del confronto dichiara date coperte, giorni osservabili e qualità
(`dati_insufficienti`, `storico_limitato`, `storico_disponibile`). La copertura
temporale non prova che tutte le spese siano state registrate: questa
limitazione resta esplicita.

La previsione corrente riusa i segnali già disponibili (giorni osservati,
mesi civili completi, classificazioni mancanti e avvisi). La UI li riassume in
un'indicazione leggibile e spiega quali dati la sostengono. Non mostra una
percentuale di affidabilità senza un modello statistico validato.

### 3. Radar dei flussi prossimi

La sezione “Prossimi flussi” mostra su una timeline fino a 30 giorni le
occorrenze future delle ricorrenze attive note, sia entrate sia uscite. Ogni
evento espone data, descrizione, importo e direzione. Il radar mostra anche il
margine spendibile stimato dopo ogni evento, rispettando la distinzione tra
impegni già protetti e nuove uscite da sottrarre.

Le occorrenze seguono il calendario e la deduplica già usati da
`ricorrenti.service.js`. Le occorrenze sospese, terminate o già addebitate sono
escluse. Il contesto aggiunge `cashFlowItems` con un orizzonte fino a oggi + 30
giorni; `items`, `commitments` e il totale degli impegni usato dalla liquidità
mantengono il significato attuale e continuano a riferirsi al periodo
corrente.

Il margine iniziale è `current.availableToSpend`. Le entrate previste vengono
aggiunte alla data prevista; le uscite non ancora incluse nel margine vengono
sottratte una sola volta. Le uscite marcate come già protette sono già state
considerate nel margine iniziale e non vengono sottratte di nuovo. La UI
etichetta il risultato come “margine spendibile stimato”, non come saldo conto.
I flussi non registrati come ricorrenze non vengono inventati. Il radar
dichiara che considera solo ricorrenze note e non costituisce una garanzia del
saldo futuro.

### 4. Obiettivi collegati al margine

Per ogni obiettivo attivo, la UI mostra importo residuo, scadenza e contributo
mensile richiesto quando il servizio di dominio lo può calcolare. Quando esiste
una media mensile positiva del flusso di cassa e almeno tre mesi civili
completi, mostra anche il tempo teorico al raggiungimento ipotizzando di
destinare l'intero margine medio all'obiettivo. L'ipotesi è dichiarata e non
modifica il budget né crea un contributo.

Se il margine è nullo/negativo, lo storico è insufficiente, la scadenza manca o
i dati dell'obiettivo non sono validi, la UI mostra lo stato informativo
corrispondente e non calcola una data. Non si assegna automaticamente la stessa
quota mensile a più obiettivi: il tempo teorico è presentato per singolo
obiettivo e non implica che l'intero margine sia disponibile per tutti
contemporaneamente.

## Contratto API e componenti

### Backend

- Aggiungere un servizio puro per costruire i confronti storici dai dati
  aggregati dei movimenti.
- La query storica deve filtrare sempre per `user_id`, limitare le date agli
  ultimi 180 giorni, leggere solo le colonne necessarie e ignorare i
  trasferimenti.
- Estendere il riepilogo ricorrente del FinancialContext per esporre le
  occorrenze future note sia per le entrate sia per le uscite, preservando
  contatori e impegni già esistenti.
- Estendere `buildCurrentSituation` con `changes`, `cashFlowTimeline` e
  informazioni di progresso/tempo teorico per gli obiettivi, mantenendo tutti
  i campi esistenti.
- Importi monetari serializzati come stringhe decimali. Le somme e le
  differenze si calcolano in centesimi interi.
- L'endpoint resta autenticato e read-only. Gli errori e i dati mancanti
  mantengono gli stati già adottati dal namespace.

### Frontend

- Conservare la gerarchia: situazione di oggi → cosa è cambiato → previsione e
  flussi prossimi → azioni e obiettivi → direzione finanziaria.
- Realizzare la timeline con un controllo nativo accessibile, valore e date
  leggibili, etichette per giorno/settimana, tastiera e layout mobile.
- Aggiornare i valori mostrati al cambiare del cursore con animazioni sobrie o
  senza animazione quando `prefers-reduced-motion` è attivo.
- Rendere evidenti valori positivi/negativi anche senza affidarsi solo al
  colore; mostrare gli stati vuoti, limitati, in caricamento e di errore.
- Riutilizzare i DTO ricevuti. Il client non ricalcola aggregati finanziari,
  qualità dello storico, impegni o stime degli obiettivi.
- Estrarre componenti Piano Smart dedicati se riducono la complessità della
  view, senza introdurre dipendenze.

## Sicurezza, compatibilità e limiti

- Nessun dato può includere movimenti di altri utenti.
- Nessuna chiamata crea o modifica dati finanziari.
- La risposta aggiunge campi: i consumatori esistenti ignorano i nuovi campi e
  continuano a funzionare.
- Gli importi sono valori decimali testuali; non si usano float per calcolare
  differenze monetarie.
- I confronti storici sono confronti dei movimenti registrati, non snapshot
  patrimoniali. Le modifiche retroattive ai movimenti possono cambiare un
  confronto ricalcolato.
- La completezza delle registrazioni manuali non è verificabile.
- Il radar include solo ricorrenze attive e note, non eventi futuri non
  registrati.
- Le stime sugli obiettivi sono ipotesi descrittive e non consigli finanziari.

## Piano di verifica

- Test puri per finestre inclusive 1/30/31/90 giorni, confronto a uguale durata,
  date locali, centesimi, trasferimenti esclusi e storico parziale.
- Test per radar con ricorrenze in entrata/uscita, impegni già protetti,
  occorrenze già addebitate, stati sospesi/terminati, ordinamento e margine
  progressivo.
- Test per obiettivi con margine positivo, nullo/negativo, scadenza assente,
  dati insufficienti e più obiettivi contemporanei.
- Test API per autenticazione, isolamento tra utenti, risposta additiva e
  assenza di scritture.
- Verifica frontend di cursore accessibile, risoluzione giornaliera/settimanale,
  stati non disponibili, riduzione movimento e resa responsive.
- Eseguire i test backend richiesti dalle regole del repository e la build
  frontend; verificare la diff e le etichette in italiano.

## Fuori ambito

- Ricostruzione dei saldi passati o introduzione di snapshot giornalieri.
- Previsioni probabilistiche, percentuali di affidabilità non validate o AI.
- Entrate e uscite future non rappresentate da ricorrenze attive.
- Esecuzione automatica di pagamenti, trasferimenti o versamenti agli obiettivi.
- Modifiche alla Home, alle API V1 o agli endpoint di creazione/salvataggio dei
  piani.
