# Spese/entrate programmate — Piano di implementazione

> **Per gli agenti di coding:** implementare le attività una alla volta in questa sessione. La specifica associata è l'autorità per le decisioni di prodotto.

**Obiettivo:** permettere di programmare movimenti dalla Home e registrare acquisti a rate con pagamento iniziale, tasso annuo, conferma manuale delle scadenze e saldo aggiornato solo sui movimenti pagati.

**Architettura:** mantenere il ledger `movimenti` per denaro effettivamente entrato o uscito. Aggiungere un piano di pagamento e righe programmate persistenti; una riga confermata crea un `Movimento` in transazione DB. Le regole periodiche attuali restano compatibili e automatiche. La schermata attuale Ricorrenti diventa la sezione unificata Programmate.

**Stack:** Vue 3, Pinia, Express 5, Sequelize, PostgreSQL/Supabase, Day.js.

**Spec:** `docs/superpowers/specs/2026-09-27-spese-entrate-programmate-design.md`

## Vincoli globali

- Tutti i testi visibili, commenti e documentazione sono in italiano; identificatori di codice in inglese.
- Le uscite aggiornano il saldo con il segno negativo; le entrate con il segno positivo.
- Una programmazione in attesa non muove il saldo e non compare come movimento effettivo nelle Analisi.
- La conferma di una programmazione crea il movimento e aggiorna il saldo in una transazione atomica.
- Le entrate periodiche producono scadenze manuali; una scadenza segnata in ritardo non riceve altri avvisi.
- Le spese programmate avvisano cinque giorni prima e le entrate programmate il giorno stesso.
- Ogni lettura e scrittura di risorse finanziarie è limitata a `user_id`.
- Non introdurre dipendenze.
- Le uscite periodiche restano registrate automaticamente dal cron; le entrate periodiche richiedono conferma.

## Messa a fuoco della revisione

- Conferma concorrente della stessa rata: una sola richiesta crea il movimento e aggiorna il saldo.
- Saldo insufficiente alla conferma: la rata resta in attesa e il saldo non cambia.
- Piano a tasso zero con centesimi non divisibili: l'ultima rata assorbe il resto e il totale riconcilia.
- Quota iniziale nulla o numero dei pagamenti pari a uno: la validazione evita rate mancanti o capitali residui non programmati.
- Utente diverso che prova a leggere o confermare un pagamento: nessun dato è esposto o modificato.

## Mappa dei file

- `server/migrations/20260927000037-create-pagamenti-programmati.js`: nuove tabelle dei piani e pagamenti programmati, vincoli e indici.
- `server/models/PaymentPlan.js`, `server/models/ScheduledPayment.js`, `server/models/index.js`: modelli, associazioni ed esportazioni.
- `server/services/paymentPlans.service.js`: calcolo rate, creazione atomica del piano, lista, annullamento e conferma idempotente.
- `server/services/ricorrenti.service.js` e `server/services/notifiche/NotificheGenerator.js`: scadenze per gli incassi periodici e avvisi cinque giorni prima / nel giorno previsto.
- `server/migrations/20260928000038-programmate-entrate-ricorrenti.js`: collegamento alla regola periodica, chiave anti-duplicato e stato `in_ritardo`.
- `server/controllers/scheduledPayments.controller.js`, `server/routes/movimenti.routes.js`, `server/middleware/validation.middleware.js`: API autenticate e validate.
- `server/services/liquidita.service.js`, `server/services/financialContext.service.js`: inclusione dei pagamenti in attesa negli impegni futuri senza alterarli come spese avvenute.
- `client/src/utils/installmentCalculator.js`: calcolo presentazionale delle rate a centesimi.
- `client/src/stores/scheduledPayments.store.js`: lettura e scrittura delle programmazioni.
- `client/src/components/movimenti/MovimentoForm.vue`: scelta tra movimento odierno, singola data futura e rate.
- I form di programmazione singola e a rate sono integrati nel dialog `MovimentoForm.vue`, così il flusso resta nello stesso punto usato dalla Home.
- `client/src/views/RicorrentiView.vue`, `client/src/components/ricorrenti/RicorrenteItem.vue`, `client/src/components/programmate/ScheduledPaymentItem.vue`: vista unificata, nome, elenco e azione di conferma.
- `client/src/config/functionalityItems.js`: nome e descrizione in navigazione.
- `docs/API.md`, `docs/DATABASE.md`, `docs/PROJECT_STATUS.md`: API, schema e stato aggiornati.

## Interfacce concordate

- `POST /api/movimenti/programmate`: `{ type, amount, category, account_id, description, due_date }` → `{ payment }`.
- `POST /api/movimenti/installment-plans`: `{ purchase_amount, initial_payment, payment_count, annual_rate, first_due_date, category, account_id, description }` → `{ plan, payments }`.
- `GET /api/movimenti/programmate`: elenca pagamenti pendenti dell'utente, ordinati per scadenza.
- `POST /api/movimenti/programmate/:id/conferma`: registra il pagamento con data effettiva odierna, restituisce `{ payment, movement, account }`.
- `PATCH /api/movimenti/programmate/:id/annulla`: annulla una programmazione ancora pendente.
- `PATCH /api/movimenti/programmate/:id/ritardo`: segna come in ritardo un'entrata non arrivata.
- Importo e calcoli monetari del dominio sono rappresentati in centesimi interi durante i calcoli; Sequelize salva importi decimali a due cifre.

## Attività

### Attività 1: migrazione e modelli delle programmazioni

**File:**
- Crea `server/migrations/20260927000037-create-pagamenti-programmati.js`.
- Crea `server/models/PaymentPlan.js`.
- Crea `server/models/ScheduledPayment.js`.
- Modifica `server/models/index.js`.
- Modifica `docs/DATABASE.md`.

**Interfacce:** produce `PaymentPlan` e `ScheduledPayment` associati all'utente; `ScheduledPayment.plan_id` e `movement_id` sono nullable per singoli pagamenti e pagamenti non ancora confermati.

- [x] Crea la tabella `piani_pagamento` con chiave utente, descrizione, `conto_id`, `categoria`, `importo_acquisto`, `importo_iniziale`, `numero_pagamenti`, `tasso_annuo`, `totale_da_restituire`, `interessi_stimati`, riferimento opzionale al movimento iniziale e stato.
- [x] Crea la tabella `pagamenti_programmati` con chiave utente, piano opzionale, conto, tipo, importo, categoria, descrizione, `data_scadenza`, stato, `movimento_id` opzionale e `pagato_il` opzionale.
- [x] Aggiungi indici per `(user_id, stato, data_scadenza)`, chiavi esterne con cancellazione coerente e vincolo univoco sul `movimento_id` quando non nullo.
- [x] Definisci le associazioni Sequelize e includi entrambi i modelli nelle esportazioni centrali.
- [x] Aggiorna la documentazione DB con colonne, relazioni e vincoli.

### Attività 2: servizio di calcolo e conferma

**File:**
- Crea `server/services/paymentPlans.service.js`.
- Modifica `server/services/liquidita.service.js`.
- Modifica `server/services/financialContext.service.js`.

**Interfacce:** esporta `calculateInstallmentPlan({ purchaseAmount, initialPayment, paymentCount, annualRate })`, `createScheduledPayment({ userId, data })`, `createInstallmentPlan({ userId, data })`, `listScheduledPayments(userId)`, `confirmScheduledPayment({ userId, paymentId, paymentDate })`, `cancelScheduledPayment({ userId, paymentId })`.

- [x] Implementa il calcolo in centesimi: rata costante con tasso mensile `tassoAnnuo / 1200`, rata futura zero interessi se tasso nullo e ultimo importo corretto per l'arrotondamento.
- [x] Valida capitale positivo, quota iniziale tra zero e costo, numero pagamenti intero maggiore di zero, tasso annuo non negativo e date ammesse.
- [x] Crea piano, movimento iniziale effettivo (se maggiore di zero) e tutte le rate future dentro una sola transazione Sequelize; salva sul piano l'ID del movimento iniziale; rifiuta il piano se l'uscita iniziale non è coperta dal saldo.
- [x] Crea una singola programmazione senza toccare il saldo.
- [x] Conferma sotto lock DB: rifiuta risorsa estranea o già annullata, controlla saldo per le uscite salvo carta di credito, crea `Movimento` con `ricorrente: false`, aggiorna il conto e collega la riga programmata nella stessa transazione.
- [x] Annulla pagamenti singoli pendenti e consente di annullare un intero piano a rate; conserva lo storico dei pagamenti confermati.
- [x] Includi gli importi pendenti nel calcolo degli impegni di liquidità e nel contesto finanziario; escludi gli annullati e non creare uscite storiche finché non confermati.

### Attività 3: API e validazione

**File:**
- Crea `server/controllers/scheduledPayments.controller.js`.
- Modifica `server/routes/movimenti.routes.js`.
- Modifica `server/middleware/validation.middleware.js`.
- Modifica `docs/API.md`.

**Interfacce:** gli endpoint descritti in «Interfacce concordate» chiamano il servizio dell'Attività 2 e restituiscono errori italiani con codici HTTP coerenti.

- [x] Aggiungi le rotte programmate e piani sotto il router movimenti già protetto da autenticazione.
- [x] Aggiungi validator express-validator per importi positivi a due decimali, date ISO non passate per nuove programmazioni, numero dei pagamenti intero e tasso annuo finito e non negativo.
- [x] Limita ogni query a `req.userId`; non fidarti di `user_id` forniti dal client.
- [x] Mappa saldo insufficiente a 400, risorsa non trovata a 404, pagamento non confermabile a 409 e errori inattesi al middleware esistente.
- [x] Documenta payload, risposte e stati delle nuove rotte API.

### Attività 4: flusso dalla Home e calcolo visibile

**File:**
- Crea `client/src/utils/installmentCalculator.js`.
- Crea `client/src/components/programmate/ScheduledPaymentForm.vue`.
- Crea `client/src/components/programmate/InstallmentPlanForm.vue`.
- Crea `client/src/stores/scheduledPayments.store.js`.
- Modifica `client/src/components/movimenti/MovimentoForm.vue`.

**Interfacce:** lo store espone `payments`, `loading`, `fetchPayments()`, `createPayment(payload)`, `createInstallmentPlan(payload)` e `confirmPayment(id)`; i form emettono `saved` dopo una risposta riuscita.

- [x] Mantieni il salvataggio semplice con data odierna implicita; nascondi le opzioni nel flusso normale e mostra la procedura unificata nella sezione Programmate.
- [x] Per una data futura richiedi conto, importo, categoria, data e descrizione; salva come programmazione in attesa.
- [x] Per un acquisto a rate richiedi costo, quota pagata oggi, numero totale dei pagamenti, tasso annuo, prima scadenza, conto, categoria e descrizione.
- [x] Calcola in anteprima rate, totale da restituire e interessi; se quota oggi è zero, il numero indica le rate future, altrimenti include il pagamento di oggi.
- [x] Dopo il salvataggio aggiorna conti, patrimonio, elenco e toast; il blocco di caricamento del dialog impedisce invii ripetuti.
- [x] Presenta errori di validazione e saldo insufficiente con messaggi italiani comprensibili.

### Attività 5: sezione Programmate e conferma scadenze

**File:**
- Crea `client/src/components/programmate/ScheduledPaymentItem.vue`.
- Modifica `client/src/views/RicorrentiView.vue`.
- Modifica `client/src/components/ricorrenti/RicorrenteItem.vue`.
- Modifica `client/src/config/functionalityItems.js`.

**Interfacce:** la vista carica sia le ricorrenze esistenti sia i pagamenti pendenti dal nuovo store; conferma e annullamento ricaricano le risorse coinvolte.

- [x] Rinomina titolo, pulsanti, empty state e descrizioni della sezione in «Spese/entrate programmate».
- [x] Mostra pagamenti singoli e rate in ordine di scadenza con importo, descrizione, conto e indicazione di scadenza/in ritardo.
- [x] Aggiungi le azioni di conferma e annullamento solo per righe pendenti; la conferma aggiorna saldo/patrimonio e rimuove la riga dall'elenco pendente.
- [x] Consenti di segnare un'entrata in ritardo senza creare movimenti né avvisi successivi.
- [x] Mantieni nella stessa sezione le regole ricorrenti attive, sospese e terminate, con modifica/sospensione/riattivazione.
- [x] Cambia in navigazione label «Ricorrenti» in «Programmate» e descrizione in «Spese, entrate e rate future».

### Attività 6: documentazione e revisione finale

**File:**
- Modifica `docs/API.md`.
- Modifica `docs/DATABASE.md`.
- Modifica `docs/PROJECT_STATUS.md`.
- Rivedi tutte le modifiche del branch.

- [x] Aggiorna stato funzionalità e note di compatibilità; distingue i pagamenti manuali dalle ricorrenze automatiche legacy.
- [x] Avvisa per le spese cinque giorni prima e per le entrate nella data prevista.
- [x] Rimuovi i pulsanti duplicati in testata e usa un unico accesso alla procedura guidata.
- [x] Rivedi i diff per aggiornamenti di saldo doppi, query non isolate per utente, importi floating point nel calcolo, date e testi visibili.
- [x] Non eseguire test automatici in questo piano: le istruzioni di sessione consentono test solo su richiesta esplicita. Riporta questa limitazione e lascia le suite documentate per esecuzione successiva.

### Scelte emerse durante l'implementazione

- I due nuovi form sono stati integrati nel dialog esistente `MovimentoForm.vue` invece di introdurre due dialog separati, così il flusso resta unico dalla Home.
- Annullare una rata singola non è consentito: l'azione disponibile annulla tutto il piano ancora da pagare e conserva le rate già confermate.
- La suite automatica non è stata modificata né eseguita secondo le istruzioni di sessione.
