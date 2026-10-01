# Piano Smart — Piano di accantonamento per spese future

## Obiettivo

Quando una persona programma una spesa futura, Piano Smart deve renderla un
impegno gestibile nel tempo: mostrare quanto accantonare, permettere di
registrare manualmente gli importi messi da parte e avvisare se il ritmo non è
sufficiente. Alla scadenza WALLT chiede se la spesa è stata pagata. Solo la
conferma dell'utente registra il movimento effettivo.

Esempio: per una spesa di 180 € con otto verifiche settimanali disponibili, il
piano suggerisce circa 22,50 € a settimana. Se l'utente non accantona nulla,
la quota viene ricalcolata sulle verifiche rimaste; nell'ultima settimana può
quindi essere richiesto l'intero importo residuo. Il suggerimento non sposta
denaro e non garantisce che il denaro sia disponibile: espone ipotesi e
segnala quando i dati indicano un rischio.

## Decisioni confermate

- Il piano riguarda le spese future programmate, non i trasferimenti bancari.
- Gli accantonamenti sono registrazioni manuali di denaro che l'utente dichiara
  di aver messo da parte. Non modificano i saldi registrati dei conti o i
  movimenti e non trasferiscono denaro.
- L'accantonamento è una destinazione virtuale: riduce il saldo effettivo e il
  denaro spendibile, ma non sottrae l'importo dal patrimonio totale o netto.
  Il denaro resta nei conti registrati e nel patrimonio dell'utente.
- Ogni accantonamento è legato alla specifica spesa e concorre al suo
  progresso.
- La quota si ricalcola dinamicamente: saltare una settimana riduce le
  verifiche disponibili e aumenta la quota successiva.
- L'utente può accantonare in qualsiasi momento e per un importo diverso dalla
  quota suggerita. Il piano mostra sempre il residuo aggiornato.
- Alla scadenza l'utente deve confermare se ha pagato. Solo la conferma
  affermativa usa il flusso già esistente di conferma del pagamento programmato
  e crea il movimento reale.
- Se l'utente non ha pagato, il pagamento resta in attesa e Piano Smart mostra
  il ritardo e il rischio; non viene creato alcun movimento.
- I calcoli finanziari restano nel backend. L'interfaccia non interpreta
  l'accantonamento come denaro realmente separato su un conto.

## Ambito della prima versione

La prima versione si applica alle spese di tipo uscita presenti in
`pagamenti_programmati`, con stato `in_attesa`, incluse quelle ricorrenti
materializzate come singole scadenze. Non duplica i piani rateali già associati
a `piano_id`: la loro gestione resta nel flusso esistente dei piani. Entrate
programmate, spese annullate, già pagate e spese senza una scadenza futura sono
fuori ambito.

Le spese oltre l'orizzonte dei prossimi 30 giorni devono comunque comparire
nella nuova sezione dedicata agli accantonamenti, anche se non sono ancora
incluse nella timeline corrente dei flussi a 30 giorni.

Una spesa programmata non è una spesa sostenuta: non entra nelle analisi
storiche, nei totali per categoria o nelle medie delle uscite finché l'utente
non ne conferma il pagamento. Dopo la conferma, il movimento effettivo usa la
categoria già assegnata alla spesa e viene contato una sola volta dalle analisi
esistenti. Il nuovo componente e i suoi scenari non modificano i dati o i
risultati della sezione Analisi.

## Esperienza in Piano Smart

Aggiungere una sezione “Spese da preparare” con una scheda per ciascuna spesa
ammessa. La scheda mostra:

- descrizione, importo, conto previsto e data di scadenza;
- totale accantonato manualmente e importo ancora da coprire;
- quota consigliata per la prossima settimana e numero di verifiche rimaste;
- stato leggibile: “In linea”, “Da recuperare”, “A rischio”, “Dati
  insufficienti”, “Scaduta da confermare” o “Completata”;
- suggerimenti collegati alle spese per categoria, con spesa media osservata,
  riduzione ipotizzata in euro e quanto quella scelta contribuirebbe alla quota
  della spesa futura; non mostrare percentuali di riduzione;
- azione “Registra accantonamento”, con importo e data, e cronologia delle
  registrazioni;
- alla scadenza, richiesta esplicita “Hai pagato questa spesa?” con le scelte
  “Sì, conferma pagamento” e “Non ancora”.

La quota settimanale è una raccomandazione; l'utente può registrare una somma
inferiore, superiore o nulla. Nessun addebito o accantonamento viene eseguito
automaticamente e non serve confermare la quota per continuare a usare
l'applicazione. Un eventuale promemoria deve essere informativo, senza
registrare dati finanziari.

I suggerimenti di risparmio sono mostrati sotto la quota da accantonare, con
importi concreti (“In questa categoria spendi in media 150 € al mese; in un
mese osservato ne hai spesi 120 €. Se riesci a ripetere quel livello, potresti
destinare 30 € al mese alla spesa programmata”). La proposta è una possibilità,
non un taglio imposto. L'utente decide se seguirla e registra un accantonamento
solo quando mette davvero quella somma da parte. Non si deduce automaticamente
dai movimenti che una riduzione sia avvenuta.

## Regole di calcolo

Tutti i calcoli monetari usano centesimi interi. Le date sono date civili
Europe/Rome.

Per una spesa in attesa:

```text
accantonato = somma degli accantonamenti confermati
residuo = max(importo_spesa - accantonato, 0)
giorni_alla_scadenza = max(data_scadenza - oggi, 0)
verifiche_rimaste = max(1, ceil(giorni_alla_scadenza / 7))
quota_settimanale = ceil(residuo / verifiche_rimaste)
```

Per il giorno della scadenza e per le spese già scadute si usa una sola
verifica: il piano mostra l'intero residuo come importo da coprire subito. Gli
accantonamenti non riducono il numero di verifiche; riducono il residuo. La
quota può diminuire se l'utente accantona più del previsto e aumenta quando il
tempo passa senza contributi. Se il residuo è zero, la quota è zero, ma la
spesa resta da confermare come pagata alla scadenza.

Per tutte le spese aperte si sommano le quote settimanali. Il sistema le
confronta con il margine settimanale stimabile da Piano Smart, basato sulle
entrate, sulle uscite e sugli impegni già registrati. Se la somma richiesta
supera il margine stimato, o il margine è negativo, lo stato diventa “A
rischio”/“Da recuperare” e la UI espone il divario, ordinando prima le spese
più vicine. Quando i dati non consentono una stima, non si mostra un giudizio
di sostenibilità numerico: si espongono la quota matematica e lo stato “Dati
insufficienti”. La copertura dello storico non prova che l'utente abbia
registrato tutte le proprie entrate e uscite.

La prima versione non ridistribuisce automaticamente il margine fra le spese
né sceglie quale impegno l'utente debba trascurare. Mostra quote individuali,
fabbisogno aggregato e deficit stimato, così l'utente può decidere come
procedere. Non presenta stime euristiche come consulenza professionale o come
garanzia di pagamento.

### Strategia di risparmio per categoria

Le opportunità di risparmio usano le uscite effettivamente registrate, le
medie per categoria dei mesi civili completi e la classificazione di
essenzialità già gestita da WALLT. Le categorie vengono proposte in quest'ordine:

1. **Discrezionali**: prime candidate per obiettivi di riduzione in euro.
2. **Semi-essenziali**: proposte in euro dopo quelle discrezionali, con
   attenzione al fatto che possono includere spese importanti per la persona.
3. **Essenziali**: nessun taglio generico o automatico. Se i dati mostrano che
   in uno o più mesi completi la categoria è costata meno, si può indicare la
   differenza concreta come possibilità da valutare (“in quel mese hai speso
   30 € in meno”), senza presentarla come risparmio sicuramente ripetibile.
4. **Non classificate**: nessuna proposta di riduzione finché la categoria non
   ha un livello di essenzialità affidabile; la UI invita a classificarla.

Per ogni categoria, usare almeno tre mesi civili completi osservati. Mostrare
la media mensile osservata e, se esiste, una spesa mensile inferiore realmente
registrata; la differenza in euro è il massimo riferimento concreto per una
proposta basata su quel periodo. Per esempio, media 150 € e mese più leggero
120 € consentono di formulare “potresti provare a liberare 30 € al mese”,
spiegando che l'importo deriva dalla differenza osservata e potrebbe non essere
ripetibile. Gli importi suggeriti non superano il divario documentato né il
fabbisogno mensile del salvadanaio. L'interfaccia non mostra percentuali.

Le medie usano i mesi completi classificati da `finestraMesi.service.js`; i mesi
non osservati non vengono riempiti con zeri e il mese corrente parziale non
determina la media. La categoria prevista per la spesa futura non è conteggiata
come uscita: serve a indicare il contesto dell'obiettivo, mentre le opportunità
di riduzione si basano sulle uscite storiche effettive. Con storico limitato,
categoria non classificata o importo non stimabile, la UI spiega il motivo e
non inventa un importo di risparmio.

Gli importi candidati di più categorie possono essere combinati per mostrare
quanta parte della quota settimanale o mensile coprirebbero. Le categorie
discrezionali vengono considerate prima delle semi-essenziali; per le
essenziali si mostrano solo differenze già osservate e con formulazione
condizionale. La combinazione resta uno scenario: la UI non applica tagli,
non modifica budget o analisi e non sposta denaro. Se le differenze osservate
non coprono il fabbisogno, mostra il residuo senza inventare altri risparmi.

## Dati e API

### Persistenza

Aggiungere una tabella append-only `contributi_pagamenti_programmati` collegata
a `pagamenti_programmati`, con almeno: `id`, `user_id`, `pagamento_programmato_id`,
`importo` (`DECIMAL(12,2)`), `data_contributo` (`DATEONLY`), `created_at`.
L'identità utente e il pagamento devono essere coerenti; gli indici devono
supportare letture per utente e pagamento. Una registrazione non può eccedere
il residuo e la versione iniziale rifiuta importi maggiori. Un'operazione di
rettifica/eliminazione non fa parte della prima versione: la cronologia non
viene riscritta silenziosamente. La UI deve mostrare l'importo e chiedere
conferma prima di registrarlo.

La modifica richiede una migrazione Sequelize reversibile. Nessun dato
finanziario esistente viene convertito o cancellato.

### Rotte

Estendere il namespace autenticato di `/api/movimenti/programmate` con:

- `GET /api/movimenti/programmate/:id/accantonamenti`: contributi e riepilogo
  della spesa;
- `POST /api/movimenti/programmate/:id/accantonamenti`: registra un
  contributo manuale, con `amount` e `date`.

L'endpoint della situazione corrente Piano Smart espone in modo additivo
`upcomingExpensePlans`, con DTO per spesa: identificativo, descrizione,
importo, scadenza, accantonato, residuo, quota settimanale, verifiche rimaste,
stato, prossima azione e base/qualità della stima di sostenibilità. Gli importi
sono stringhe decimali. Una risposta di contributo dichiara esplicitamente
`writesAccountBalance: false` e `writesMovement: false`.

Le rotte verificano autenticazione, proprietà del pagamento, stato in attesa,
tipo uscita, importo positivo con al massimo due decimali e residuo disponibile.
Il controllo del residuo e l'inserimento avvengono in transazione per evitare
che richieste concorrenti accantonino più dell'importo. Una spesa pagata o
annullata non accetta nuovi contributi.

## Integrazione con liquidità e conferma del pagamento

Gli importi registrati nel salvadanaio non sono un trasferimento e non
modificano il saldo registrato del conto o i movimenti. Per Piano Smart
rappresentano tuttavia denaro che l'utente dichiara già destinato a quella
spesa e quindi non più spendibile. Il calcolo sottrae questa destinazione dal
saldo effettivo, ma il patrimonio totale e netto continua a includere il saldo
reale del conto: l'accantonamento cambia la disponibilità, non la proprietà del
denaro. Per la stessa spesa si conteggia l'accantonato una sola volta e si
considera solo il residuo non coperto; accantonato più residuo protetto resta
pari all'impegno totale, senza doppio conteggio.

Per spese oltre i 30 giorni, il contributo già registrato resta protetto anche
se l'impegno residuo non entra ancora nell'orizzonte della liquidità corrente.
Le query aggregano sempre per utente e non includono dati di altri account.

La spesa programmata non viene aggiunta a `Movimento`, ai totali storici o
alle analisi per categoria durante la pianificazione. Solo la conferma di
pagamento crea il movimento categorizzato previsto e da quel momento la spesa
partecipa alle analisi con le regole già esistenti.

La conferma “Sì, ho pagato” riusa `confirmScheduledPayment`, che crea il
movimento effettivo e aggiorna il saldo nella transazione esistente. Il
contributo manuale non crea un movimento aggiuntivo e non viene nuovamente
sottratto dopo la conferma: una volta pagata, la spesa esce dagli impegni
futuri e resta rappresentata dal movimento reale. “Non ancora” non modifica
pagamenti, conti o movimenti e mantiene visibile la spesa scaduta.

## Compatibilità e limiti

- L'estensione della risposta Smart è additiva; le schermate e i client
  precedenti possono ignorare i campi nuovi.
- Le scadenze esistenti continuano a essere confermate con il flusso attuale.
- I pagamenti a rate già gestiti tramite `piano_id` non ricevono un secondo
  piano di accantonamento.
- Il saldo conto rimane il saldo registrato reale; il salvadanaio è un
  indicatore virtuale basato su dichiarazioni manuali. Il saldo effettivo
  diminuisce dell'importo destinato; patrimonio totale e patrimonio netto non
  diminuiscono per effetto dell'accantonamento.
- Un accantonamento errato può rappresentare una disponibilità protetta
  inesatta; la UI deve chiamarlo “registrato dall'utente”, non “verificato”.
- La stima dipende dai movimenti inseriti e non può accertare la completezza
  delle registrazioni o la reale disponibilità bancaria.

## Verifica richiesta

- Test di dominio per scadenza lontana, ultima settimana, data odierna/scaduta,
  residuo zero, contributo parziale e settimane saltate.
- Test API per validazione, isolamento tra utenti, stato non valido, residuo
  superato e richieste concorrenti.
- Test di liquidità per spesa oltre 30 giorni e dentro 30 giorni, mostrando che
  accantonato + residuo sono protetti una sola volta, il saldo effettivo
  diminuisce, il saldo del conto e il patrimonio restano invariati.
- Test strategia categorie: ordine discrezionale/semi-essenziale/essenziale,
  uso di tre mesi completi, esclusione degli zeri inventati e delle categorie
  non classificate, importi assoluti in euro e quote settimanali coerenti;
  nessuna percentuale o spesa futura nei risultati di Analisi.
- Test di conferma: nessun movimento prima del “Sì”; un solo movimento dopo la
  conferma; “Non ancora” lascia la scadenza in attesa.
- Test/build frontend per importi, stati, accessibilità e layout mobile della
  sezione e del flusso di conferma.
- Esecuzione della suite backend prescritta dal repository quando saranno
  modificate API o middleware.
