# Bank Sync — riconciliazione con i conti esistenti

> Design validato il 2 ottobre 2026.
> Stato: approvato, da implementare.

## Il problema

Il collaudo del primo collegamento reale (Enable Banking, Revolut, 2 ottobre
2026) ha funzionato fino al callback compreso: autorizzazione stabilita,
`state` consumato, IBAN mascherato, saldo letto dalla banca. Si è fermato
prima dell'importazione, e per una ragione che non era un guasto.

L'utente aveva **353 movimenti inseriti a mano** sul proprio conto REVOLUT
(dal 20 gennaio al 1° ottobre 2026), di cui 242 negli ultimi 90 giorni. Il
collegamento ha creato un **secondo** conto accanto a quello:

| id | nome | tipo | saldo |
|---|---|---|---|
| 9 | REVOLUT | app_pagamento | 42,00 € |
| 13 | Christian Maiolo | banca | 42,00 € |

Da qui quattro difetti distinti, tutti sulla stessa giuntura.

**1. Il collegamento crea sempre un conto nuovo.** Non esiste modo di dire
«questa banca è il conto che già uso». Chi ha gestito manualmente fino a ieri
si ritrova lo stesso conto due volte, e il patrimonio conta due volte lo
stesso denaro: 254 € invece di 212 €, prima di qualunque sincronizzazione.

**2. L'importazione duplicherebbe lo storico manuale.** La deduplica di
livello 2 filtra per `bank_connection_id` ([syncEngine.service.js:337]) e i
movimenti manuali hanno quella colonna nulla: non possono corrispondere mai.
La deduplica di livello 3 (`DuplicateChecker`, che li riconoscerebbe per data,
importo e descrizione) si applica **solo alle transazioni senza id stabile**,
e Enable Banking fornisce `entry_reference` per tutte quelle di Revolut.
Nessuna passerebbe da quel controllo: 242 movimenti entrerebbero accanto a
quelli già presenti, e analisi, budget e Piano Smart conterebbero ogni spesa
due volte.

**3. Il conto prende il nome dell'intestatario.** La priorità a
[connections.service.js:400] è `contoProvider.nome || institution_name`, e
Revolut mette in `a.name` il nome del titolare, non quello della banca.

**4. Il saldo di un conto collegato è modificabile a mano.** `updateConto`
accetta `saldo` ([conti.controller.js:163]) senza conoscere le connessioni:
la modifica viene accettata e la sincronizzazione successiva la riscrive in
silenzio.

Accanto a questi, un difetto preesistente che il design deve affrontare
perché ci si appoggia sopra: `const contoProvider = esito.conti?.[0]`
([connections.service.js:384]) prende **il primo** conto che la banca
restituisce, in silenzio. È lo stesso difetto corretto per le banche in
`022060e`, un livello più in basso — e con un emittente multivaluta come
Revolut è concreto.

## Il principio

La decisione «dove vanno questi movimenti» si prende **dopo** il ritorno
dalla banca, non prima, perché solo allora si conoscono i conti veri — nome,
IBAN, saldo. Chiedere prima significa far mappare all'utente qualcosa che non
ha ancora visto, e restare appoggiati al `conti[0]` arbitrario.

Agganciarsi a un conto esistente **non elimina e non archivia nulla**: il
conto che l'utente già usa diventa lui il conto collegato. Stesso id, stesso
nome, stessi movimenti; cambia soltanto da dove arrivano quelli nuovi. È
«sostituire» nel risultato — una sola riga nell'elenco — senza perdere nove
mesi di storico che la banca non è in grado di restituire (la finestra del
provider è di 90 giorni).

## Lo stato

Nuovo stato **`da_riconciliare`** in `CONNECTION_STATUS`, fra `in_attesa` e
`attiva`. Le due appartenenze decidono il comportamento senza logica nuova:

- **dentro `STATI_VIVI`** → occupa l'unico posto per utente. L'autorizzazione
  presso la banca esiste, quindi il posto deve risultare occupato anche se
  l'utente abbandona la riconciliazione. Il recupero resta «Sostituisci
  conto», come per un `in_attesa` abbandonato;
- **fuori da `STATI_SINCRONIZZABILI`** → nessuna sincronizzazione può
  partire, né manuale né da cron. È questa appartenenza, e non una guardia
  aggiunta a mano, che impedisce di importare prima che l'utente abbia detto
  dove vanno i soldi.

Scartata l'alternativa di tenere `attiva` e dedurre la riconciliazione
pendente da `conto_id IS NULL`: `attiva` smetterebbe di significare
«funzionante» e ogni punto che la legge dovrebbe ricordarsi del secondo
controllo, `STATI_SINCRONIZZABILI` compreso. Lo stato deve dire da sé cosa è
vero.

## Lo schema

Una migrazione, due modifiche a `bank_connections`:

- estendere il `CHECK` su `status` con `'da_riconciliare'`
  (il vincolo è in [20261001000042-create-bank-connections.js:140]);
- **`import_da`** (`DATE`, nullable): la soglia sotto la quale non si importa.
  `null` significa «nessuna soglia, vale la finestra dei 90 giorni», così le
  connessioni esistenti e chi crea un conto nuovo si comportano **esattamente
  come oggi** e la Regola 24 resta vera per loro.

`conto_id` è già nullable: non va toccato. Nessuna colonna di appoggio per il
«conto di destinazione scelto»: la scelta arriva dopo il callback, quindi il
conto si scrive direttamente in `conto_id`.

La migrazione altera una tabella esistente e già protetta, non ne crea: non
servono RLS né revoche, e il guardrail di `migrazioniReali.test.js` resta
verde.

## Il flusso

### Il callback si restringe

Oggi `completaConnessione` fa due cose insieme: stabilisce l'autorizzazione e
crea il conto. Si separano. Il callback stabilisce **solo** l'autorizzazione,
porta la connessione in `da_riconciliare` e non scrive `conto_id`,
`provider_account_id`, `iban_mascherato`, `valuta`, `saldo_provider`: quei
campi descrivono un conto non ancora scelto, e riempirli con `conti[0]` è
precisamente il difetto.

La firma di `POST /bank-sync/callback` non cambia (`state`, `code`
facoltativo). Cambia il messaggio di risposta, che non può più promettere
l'importazione dei 90 giorni.

### `GET /bank-sync/riconciliazione`

Valida solo in stato `da_riconciliare`. Restituisce quanto serve a decidere:

- **`conti_banca`**: i conti che la banca espone — nome, IBAN mascherato,
  valuta, saldo. **Riletti dal provider** a ogni chiamata, non persistiti al
  callback: sono dati provvisori, e una colonna che li conserva invecchia.
  Se il provider non risponde, l'utente vede un errore e ritenta; la
  connessione resta `da_riconciliare` e non si perde nulla.
- **`conti_wallt`**: i conti agganciabili dell'utente. Esclusi il fondo di
  emergenza (non ammette entrate o uscite dirette, Regola 22) e i conti
  scommesse (già sincronizzati con le piattaforme, Regola 5).

Questa rotta **non** dice se esistono movimenti preesistenti, benché il dato
sarebbe comodo al client: quel predicato decide se l'importazione va fermata,
e deve vivere in un posto solo — la guardia di `POST /bank-sync/sync`
descritta più sotto. Calcolarlo anche qui vorrebbe dire due risposte possibili
alla stessa domanda, ed è il difetto che questo documento corregge altrove.

### `POST /bank-sync/riconciliazione`

Corpo: `{ provider_account_id, destinazione }`, dove `destinazione` è
`'nuovo'` oppure l'id di un conto esistente.

Scrive in transazione `conto_id` (creato o esistente), i campi del conto
bancario scelto, e lo stato a `attiva`.

La connessione si trova **dall'utente autenticato**, mai da un id nel corpo:
lo stesso principio che protegge il callback. Il client non invia mai
`user_id` né `status`.

Validazioni:

- il conto di destinazione deve essere dell'utente, attivo, non fondo di
  emergenza, non scommesse;
- il `provider_account_id` deve essere fra quelli che la sessione espone
  davvero — l'id che arriva dal client non è attendibile;
- chiamarla su una connessione già `attiva` risponde 200 con lo stato
  corrente, come fa il callback con `ripetuto`.

Montaggio nell'ordine già stabilito in `bankSync.routes.js`:
`authMiddleware` → rate limit → `requireFeature` → validazione → controller.

Un conto già usato da una connessione **revocata** resta agganciabile: è il
caso «ricollego dopo aver scollegato», ed è desiderabile. Agganciare un conto
usato da una connessione **viva** è impossibile per costruzione, perché di
connessioni vive ce n'è una sola per utente ed è quella in corso.

### Il saldo: un solo proprietario

Su un conto **nuovo** il saldo iniziale lo mette la creazione, come oggi. Su
un conto **esistente** la riconciliazione non lo tocca: lo allinea la prima
sincronizzazione, che è già l'unico punto che fa quel lavoro (`allineaSaldo`).
Un solo proprietario di quella scrittura invece di due.

Il conto creato continua a nascere senza il movimento «Saldo iniziale», per la
ragione già documentata: per un conto bancario sarebbe un'entrata inventata
che falserebbe medie di reddito, budget e Piano Smart.

## La soglia di importazione

La scelta della data avviene al **primo Sincronizza**, non alla
riconciliazione: l'avviso sui duplicati deve arrivare quando l'importazione
sta per partire davvero, non mentre l'utente sta ancora collegando.

L'avviso non può vivere solo nell'interfaccia — una chiamata diretta all'API
importerebbe comunque tutto. La protezione sta nel server:

> Al primo Sincronizza, se l'utente ha movimenti preesistenti non provenienti
> da questa connessione e `import_da` è nullo, `POST /bank-sync/sync`
> **rifiuta** con il codice `SOGLIA_RICHIESTA` e restituisce
> `data_suggerita`. Il client mostra l'avviso con quella data già compilata;
> l'utente conferma o la cambia; la chiamata si ripete con `{ import_da }`,
> che viene persistito prima di procedere.

**`data_suggerita`** è il giorno successivo all'ultimo movimento **non futuro**
del conto di destinazione: `MAX(data) + 1 giorno WHERE data <= CURRENT_DATE`.
Il vincolo sul futuro non è decorativo: senza di esso un movimento già
registrato in avanti produrrebbe un suggerimento sbagliato.

Se il conto di destinazione è vuoto — il caso di chi ha creato un conto nuovo
pur avendo già storico altrove — si ripiega sull'ultimo movimento non futuro
**fra tutti i conti dell'utente**. Il ripiego è coerente con la condizione di
rischio, che è cross-conto: a suggerire la finestra piena su un conto nuovo si
riproporrebbe il doppio conteggio che l'avviso esiste per evitare. Se l'utente
non ha alcun movimento, non c'è soglia da suggerire e non c'è rischio: vale la
finestra dei 90 giorni.

La condizione di rischio è «esistono movimenti che precedono la connessione»,
non «è stato agganciato un conto esistente». È più larga di proposito: creando
un conto nuovo e lasciando attivo quello manuale, i 90 giorni importati si
sommerebbero comunque nelle analisi e nel patrimonio, solo su due conti
invece di uno. Il rischio è lo stesso e l'avviso deve comparire in entrambi i
casi.

«Importa tutti i 90 giorni» non è un flag separato: è la data più vecchia
disponibile. Una strada sola invece di due.

Nel motore la soglia entra in un punto, [syncEngine.service.js:224]:

```js
dataDa: maxData(giorniPrimaISO(giorni), connessione.import_da)
```

Con `import_da` nullo l'espressione collassa su `giorniPrimaISO(giorni)`.

## Il conto collegato nell'interfaccia

**Il nome.** Per un conto nuovo la priorità si inverte a
`connessione.institution_name || contoProvider.nome || 'Conto bancario'` →
«Revolut». Rinominarlo funziona già tramite `PUT /conti/:id`, che accetta
`nome` e non ha restrizioni per i conti collegati: non serve aggiungere
nulla. Su un conto agganciato né il nome né il `tipo` vengono toccati — sono
scelte dell'utente, e il `tipo` non ha effetti funzionali fuori da
`emergenza` e `scommesse`.

**L'indicatore.** La card di un conto nella griglia non mostra oggi in alcun
modo che quel conto è alimentato dalla banca. Senza indicatore l'utente non
distingue il conto collegato da quelli che continua a riempire a mano — e su
un conto collegato inserire un movimento a mano è un doppione in arrivo. Si
aggiunge un segno discreto accanto al nome («collegato a Revolut») che
risponda a colpo d'occhio a «quale di questi si aggiorna da solo?».

**Il saldo non è modificabile.** La banca è la fonte di verità per quel numero
(Regola 24), quindi la modifica manuale non è rischiosa: è **inutile**, perché
qualunque valore vale fino alla chiamata successiva. Una conferma del tipo «sì,
lo so che verrà sovrascritto» farebbe compiere un'azione priva di effetto.

- **Server**: in `updateConto`, se il conto è legato a una connessione viva e
  la richiesta contiene `saldo`, rifiuto con un messaggio che spiega — «Il
  saldo di un conto collegato lo aggiorna la banca» — non un errore generico.
  Segue il modo già in uso nello stesso punto per il fondo di emergenza
  ([conti.controller.js:172]), che rifiuta `nascosto: false` invece di
  avvisare: un invariante si impone, non si raccomanda.
- Il controllo passa da un aiutante nel modulo Bank Sync, non da una query
  sparsa nel controller dei conti: così `conti.controller.js` non impara cose
  sulle connessioni.
- **Client**: nella modifica di un conto collegato il campo saldo è
  disabilitato, con la riga che dice perché. Nome, icona, colore e ordine
  restano modificabili: la banca non li tocca.

**Il movimento manuale avvisa ma non è bloccato.** Qui, al contrario del
saldo, l'azione ha un effetto vero: il saldo si muove (`deltaSaldo`) e la
spesa esiste. Vietarla significherebbe dire «aspetta la banca» su
un'operazione già avvenuta — una spesa di stamattina può non essere ancora
`booked`, e le `pending` per scelta non entrano nei movimenti. Si avvisa che
quella spesa arriverà anche dalla banca e che il doppione è possibile, poi si
lascia procedere.

## Test

Le proprietà che devono restare vere, non la copertura per numero:

- in `da_riconciliare` nessuna sincronizzazione parte, né manuale né da cron;
- agganciare un conto esistente **non perde i suoi movimenti**, non ne crea di
  nuovi e non cambia l'id del conto;
- la riconciliazione rifiuta: un conto di un altro utente, il fondo di
  emergenza, un conto scommesse, un `provider_account_id` non appartenente
  alla sessione;
- la riconciliazione è idempotente;
- primo sync con movimenti preesistenti e senza soglia → `SOGLIA_RICHIESTA`,
  **non** un'importazione;
- con `import_da` valorizzato le transazioni precedenti non entrano;
- con `import_da` nullo il comportamento è quello odierno — è il test che
  protegge la Regola 24;
- `updateConto` rifiuta `saldo` su un conto collegato e lo accetta su uno
  normale;
- il vocabolario del nuovo stato duplicato client/server e sorvegliato, come
  già fanno `entitlementsContratto.test.js` e `fondoEmergenzaContratto.test.js`.

## Pulizia della produzione

Residui del collaudo interrotto, da rimuovere **chiedendo conferma** al
momento:

- connessione `#3` (`attiva`, Revolut, zero movimenti importati) → revocare;
- conto `13` («Christian Maiolo», zero movimenti) → eliminare. Avendo zero
  movimenti è un'eliminazione innocua, da non confondere con quella del conto
  9 che è stata esclusa.

Le connessioni `#1` e `#2` sono già `revocata` e non vanno toccate.

Dopo la pulizia il collaudo riparte dall'inizio sul percorso nuovo.

## Documentazione da aggiornare

- **CLAUDE.md, Regola 24**: la frase «la prima sincronizzazione importerà gli
  ultimi 90 giorni» diventa condizionata a `import_da`. Va aggiunto che un
  conto esistente può diventare il conto collegato senza perdere lo storico,
  e che il saldo di un conto collegato non è modificabile a mano.
- **docs/API.md**: le due rotte nuove, il codice `SOGLIA_RICHIESTA`, il
  conteggio degli endpoint.
- **docs/DATABASE.md**: `import_da` e il nuovo valore di `status`.
- **docs/premium-bank-sync.md**: il flusso di riconciliazione.

## Fuori perimetro

- Più di un conto bancario collegato per utente: l'invariante «una connessione
  → un conto» non si muove. La scelta è *quale* conto, non quanti.
- Riconciliare automaticamente per somiglianza i movimenti già inseriti a mano
  con quelli che arrivano dalla banca. Valutato e scartato: il confronto per
  somiglianza scarta per sbaglio spese identiche legittime, ed è la ragione per
  cui oggi le transazioni con id stabile non passano da `DuplicateChecker`.
- Attivare `bank_sync_cron_enabled` e `bank_sync_beta_enabled`: restano spenti
  finché il collegamento non è collaudato.
