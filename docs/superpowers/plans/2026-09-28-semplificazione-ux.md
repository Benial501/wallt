# Piano di implementazione: Semplificazione UX WALLT

> **Per chi implementa:** SOTTO-SKILL OBBLIGATORIA: `superpowers:executing-plans`. Eseguire i passaggi nell’ordine indicato e spuntare le caselle.

**Obiettivo:** rendere più immediato l’accesso a Piano Smart e Conti, ridurre l’ambiguità nell’aggiunta dei movimenti e chiarire i controlli della dashboard.

**Architettura:** riusare la navigazione, i bottom sheet, `MovimentoForm` e il carosello già presenti. Le modifiche restano nel client e non cambiano API, dati, saldi o regole finanziarie. Piano Smart mantiene la posizione centrale nella barra mobile.

**Stack:** Vue 3 Composition API, Vue Router, CSS esistente, Vite.

**Specifica:** `docs/superpowers/specs/2026-09-28-semplificazione-ux.md`

## Vincoli globali

- Piano Smart resta la voce centrale della barra mobile a cinque elementi: Home, Transazioni, Piano Smart, Analisi, Altro.
- Il desktop rende Piano Smart visibile nella navigazione principale.
- Le modifiche riusano componenti, store e rotte esistenti.
- Nessuna azione suggerita deve sembrare un movimento finanziario già eseguito.
- Il tipo di movimento scelto dall’utente deve corrispondere al primo passaggio del modulo.
- Nessuna informazione economica o preferenza dell’account viene cambiata dall’interfaccia durante questa riprogettazione.

## Direzione visuale

- **Colori:** notte `#06060A`, grafite `#0F172A`, verde WALLT `#00D4AA`, bianco `#FFFFFF`, nebbia `#A8A8BC`. Sono riferimenti al tema scuro; il codice userà i token CSS attuali, che forniscono le equivalenze corrette nel tema chiaro.
- **Tipografia:** mantenere `--font-sans` e la scala tipografica in `variables.css`; nessun nuovo carattere o dimensione ad hoc.
- **Layout:** il foglio presenta tre righe a larghezza piena, testo allineato a sinistra e bersagli touch da almeno 44 px. Ogni riga abbina icona, azione e descrizione breve.

```text
Nuovo movimento

[ ↓  Entrata          Denaro ricevuto ]
[ ↑  Uscita           Spesa o pagamento ]
[ ⇄  Trasferimento    Tra i tuoi conti ]
```

- **Principi:** mantenere la firma visiva WALLT e i due temi; usare il verde solo per indicare l’azione primaria; dare pari chiarezza ai tre tipi; Piano Smart resta l’ancora centrale della navigazione mobile.
- **Revisione della direzione:** questa scelta riusa colore, font e foglio già disponibili, quindi aggiunge chiarezza attraverso parole e raggruppamento, non tramite una nuova palette o decorazioni. La disposizione verticale favorisce la selezione col pollice e distingue le tre azioni senza chiedere di decifrare sole icone.

## Aree di revisione

1. **Navigazione su schermi stretti:** controllare che la barra continui ad avere cinque elementi e che Piano Smart sia il terzo elemento.
2. **Conti nel menu mobile:** verificare che la voce apra `/conti`, abbia stato attivo e descrizione coerente.
3. **Scelta tipo movimento:** Entrata, Uscita e Trasferimento devono aprire il rispettivo modulo; annullare la scelta deve lasciare l’utente nella lista.
4. **Ingressi precompilati:** i link dashboard con `?action=` devono mantenere il tipo scelto e non mostrare una scelta duplicata.
5. **Carosello dinamico:** quando alcune schede sono assenti per preferenze o dati, i controlli devono continuare a puntare alle slide visibili e comunicare quale è attiva.

---

### Attività 1: accesso coerente a Piano Smart e Conti

**File:**

- Modifica: `client/src/components/layout/AppLayout.vue`
- Modifica: `client/src/config/functionalityItems.js`

**Interfacce:**

- `getFunctionalityItems(context, placement)` continua a restituire le voci ordinate e filtrate secondo visibilità e permessi.
- `mobileNav` conserva cinque voci; il nuovo collegamento ai Conti appartiene al foglio “Funzionalità”.

- [x] Aggiungere l’elemento “I miei conti” al placement `sheet`, con route `/conti`, icona della mappa esistente e ordine prima delle funzioni opzionali.
- [x] Aggiungere Piano Smart tra le voci desktop della sidebar usando `/funzionalita/piano-smart` e l’icona `Sparkles` già importata.
- [x] Lasciare invariata la definizione e la posizione della voce Piano Smart in `mobileNav`.
- [x] Verificare da file che i collegamenti abbiano route corrette, stato attivo e nessun doppione nella sidebar.

### Attività 2: scelta esplicita del tipo prima del modulo

**File:**

- Crea: `client/src/components/movimenti/SceltaTipoMovimento.vue`
- Modifica: `client/src/views/MovimentiView.vue`
- Modifica: `client/src/views/DashboardView.vue`
- Modifica: `client/src/components/movimenti/MovimentoForm.vue`
- Modifica: `client/src/components/layout/BottomSheet.vue`

**Interfacce:**

- `SceltaTipoMovimento.vue` espone `open: Boolean` e gli eventi `close` e `select(tipo)` per i tre tipi ammessi: `entrata`, `uscita`, `trasferimento`.
- `BottomSheet.vue` espone il pannello come dialogo modale accessibile, gestisce Esc e Tab, offre un controllo “Chiudi” e ripristina il focus all’elemento che lo ha aperto.
- In `MovimentiView.vue` e `DashboardView.vue`, una ref locale controlla lo stesso componente; `apriForm(tipo, mov, saltaSceltaTipo)` gestisce creazione e modifica nel rispettivo modulo locale.
- In `MovimentoForm.vue`, la nuova prop booleana `saltaSceltaTipo` vale `false` per impostazione predefinita; quando è `true` il modulo entra direttamente al passaggio dei dati. La schermata di scelta esistente resta disponibile agli ingressi che non la preselezionano.

- [x] Creare `SceltaTipoMovimento.vue` riusando `BottomSheet`, le icone esistenti e token di colore, focus e raggio già definiti.
- [x] Rendere il `BottomSheet` utilizzabile da tastiera con nome del dialogo, chiusura esplicita, Esc, focus confinato e ripristino del focus.
- [x] In `MovimentiView.vue`, aprire il foglio dal pulsante “+” e dagli stati vuoti che propongono un inserimento; alla scelta aprire il modulo locale sul tipo selezionato.
- [x] In `DashboardView.vue`, fare in modo che “Aggiungi transazione” apra lo stesso foglio invece di preselezionare Uscita; l’inserimento scelto riusa il modulo locale e il suo aggiornamento dashboard.
- [x] Aggiungere `saltaSceltaTipo` a `MovimentoForm.vue` e impostare il passaggio iniziale in modo che edit e trasferimenti conservino il comportamento attuale, mentre la scelta esplicita avvia direttamente i dati.
- [x] Passare `saltaSceltaTipo` dai link `?action=` e dai CTA che già indicano il tipo; non passarlo quando il tipo non è noto.
- [x] Verificare nel codice che edit, trasferimenti dalla pagina Conti, pagamenti programmati e flussi da Analisi/Fondo non attivino la nuova scorciatoia.

### Attività 3: controlli accessibili del carosello e CTA coerenti

**File:**

- Modifica: `client/src/components/custom/WOverviewCarousel.vue`
- Riferimento: CTA che aprono il foglio e passaggio `?action=` di `client/src/views/DashboardView.vue` e `client/src/views/MovimentiView.vue`

**Interfacce:**

- `slides` rimane la fonte dei pannelli mostrati.
- `activeIndex` rimane l’indice della slide attiva e guida il testo accessibile dei pulsanti di navigazione.

- [x] Derivare etichette leggibili per gli identificatori slide già esistenti (`saldo`, `conti`, `fondo-emergenza`, `prossime-spese`, `budget`, `uscite-oggi`, `entrate-oggi`, `obiettivi`, `scommesse`, `investimenti`).
- [x] Dare a ogni indicatore un nome accessibile del tipo “Mostra: <sezione>”, esporre quello attivo con `aria-current="true"` oppure `aria-pressed="true"` e mantenere la logica di scorrimento attuale.
- [x] Uniformare i CTA di aggiunta: il testo deve descrivere ciò che succede e il parametro `action` deve coincidere con il tipo del modulo quando l’azione è specifica.
- [x] Controllare il carosello nel codice: le etichette coprono le slide condizionali e lo scorrimento continua a usare l’indice visibile.

### Attività 4: verifica finale della tranche

**File:** nessun nuovo file applicativo.

- [x] Rileggere il diff e controllare che non ci siano cambi a server, API, store finanziari o dati account.
- [x] Eseguire la build del client e verificare compilazione e template Vue.
- [x] Controllare nel codice la barra mobile a cinque voci, gli ingressi dal foglio, i tipi preselezionati e i punti di apertura del modulo.
- [x] Registrare i file modificati, il risultato della build e il limite della verifica visuale in browser.

## Controllo di copertura

- Navigazione e vincolo del Piano Smart: Attività 1.
- CTA, selezione tipo, apertura diretta e conservazione degli altri ingressi: Attività 2.
- Etichette, stato attivo e comportamento del carosello: Attività 3.
- Integrità del diff e verifica visuale: Attività 4.

La verifica resta limitata alla compilazione e al controllo manuale; non si aggiungono né si eseguono test automatici in questa tranche.

## Registro di esecuzione

Identità: `docs/superpowers/plans/2026-09-28-semplificazione-ux.md`.

- Base: `52c2d6bd8e813a5f395ea063340bc34c0f9fcbe9` (`origin/main`).
- Preflight: worktree isolato e branch `codex/ux-simplification` attivo; specifica e piano approvati dall’utente.
- Ruling: lo script `sdd-workspace` non può creare la cartella ignorata `.superpowers/sdd` per i permessi locali; registro i progressi in questo piano nel worktree.
- Attività 1: completa; aggiunti Conti al foglio “Altro” e Piano Smart alla sidebar desktop, mantenuti i cinque slot mobili invariati.
- Attività 2: completa; dashboard e movimenti condividono un foglio di scelta, il tipo esplicito salta il passaggio duplicato e l’assenza di conti porta a `/conti`.
- Attività 3: completa; i controlli del carosello hanno etichette italiane e stato attivo accessibile.
- Attività 4: completa; build Vite passata in `/private/tmp/wallt-ux-simplification-build`, `git diff --check` senza errori; verifica visuale via browser non eseguita.
- Ruling: non aggiungo né avvio test automatici in conformità alle istruzioni operative; costo se errato: regressioni di interazione non coperte da test automatizzati.
- Revisione: il revisore ha segnalato che il nuovo foglio non offriva una chiusura da tastiera; il turno di revisione si è poi interrotto per limite di utilizzo. Ho esteso il `BottomSheet` condiviso con semantica dialogo, tasto Esc, chiusura, focus confinato e ripristino.
- Ruling: applico la correzione accessibile al `BottomSheet` condiviso, così tutte le sue istanze ricevono lo stesso comportamento modale — riduce la divergenza fra fogli; costo se errato: la gestione del focus tocca anche fogli già esistenti.
