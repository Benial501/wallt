# Piano Smart V1 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementare il flusso frontend completo di Piano Smart, dalla pagina Funzionalità a wizard, preview, personalizzazione, salvataggio, storico e dettaglio, usando il backend come unica fonte di verità.

**Architecture:** Aggiungere una view autenticata `PianoSmartView.vue`, uno store Pinia dedicato e un client API isolato. La view compone pochi componenti UI focalizzati; lo store conserva readiness, preview, recommended/final e stati espliciti, mentre nessun calcolo finanziario viene duplicato nel browser.

**Tech Stack:** Vue 3 Composition API, Vue Router 5, Pinia 3, Axios 1.18, lucide-vue-next, CSS/WALLT esistenti, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-24-piano-smart-frontend-design.md`

## Global Constraints

- Nessuna modifica a migration, modelli, controller, Allocation Engine o sicurezza backend.
- Nessun fallback fake in produzione e nessun motore finanziario nel browser.
- Riutilizzare router, Axios, Pinia, `DataState`, toast, dialog, formatter monetari e icone esistenti.
- Il backend è source of truth per profilo, readiness, allocazioni, motivazioni, warning e validazioni definitive.
- Il client può calcolare solo validazioni UI e feedback visuali temporanei.
- Mantenere separati `recommended` e `final`.
- Verificare test frontend e build prima del completamento.

## Review Focus

- Contratto API con importi decimali/stringhe: testare serializzazione senza perdita di precisione nel client API e nello store.
- Risposte readiness senza domande e con domande di tipi diversi: testare entrambi i rami senza questionario hardcoded.
- Allocatable capital pari a zero: testare assenza di NaN, 0/0 e grafico fuorviante.
- Modifica allocazioni sotto/sopra il totale: testare residuo, blocco salvataggio e reset a recommended.
- Errori API distinti: testare messaggi per rete, dati mancanti e errore server senza esporre dettagli tecnici.

### Task 1: Contratto locale, accesso e route

**Files:**
- Modify: `client/src/config/functionalityItems.js`
- Modify: `client/src/router/routes.js`
- Create: `client/tests/pianoSmartNavigation.test.js`

**Interfaces:**
- Produces functionality item `id: 'piano-smart'`, label `Piano Smart`, description richiesta e route `/funzionalita/piano-smart`.
- Produces named route `piano-smart` con guard autenticato/onboarding ereditato da `AppLayout`.

- [ ] **Step 1: Write the failing test**

  Aggiungere test che importi `FUNCTIONALITY_ITEMS`, verifichi la nuova voce per placement `sheet`, route e descrizione, e controlli che le route esportate includano `name: 'piano-smart'`.

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && node --test tests/pianoSmartNavigation.test.js`
  Expected: FAIL perché voce e route non esistono.

- [ ] **Step 3: Write minimal implementation**

  Inserire la voce in `FUNCTIONALITY_ITEMS` con icona già supportata dal map delle funzionalità o con l'identificatore coerente più vicino; aggiungere route lazy sotto i children del layout.

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd client && node --test tests/pianoSmartNavigation.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git add client/src/config/functionalityItems.js client/src/router/routes.js client/tests/pianoSmartNavigation.test.js && git commit -m "feat: add piano smart navigation"`

### Task 2: API client e store state machine

**Files:**
- Create: `client/src/api/pianoSmart.api.js`
- Create: `client/src/stores/pianoSmart.store.js`
- Create: `client/tests/pianoSmartStore.test.js`

**Interfaces:**
- API exports `getReadiness()`, `createPreview(payload)`, `createPlan(payload)`, `listPlans()`, `getPlan(id)`, `updatePlan(id, payload)` usando il client Axios autenticato già presente.
- Store espone `state`, `input`, `readiness`, `preview`, `recommendedAllocations`, `finalAllocations`, `plans`, `selectedPlan`, `error`, `capitalToAllocate`, `allocationDifference`, `canSave`, più azioni `loadReadiness`, `generatePreview`, `savePlan`, `loadPlans`, `loadPlan`, `updateStatus`, `resetFinalAllocations`.

- [ ] **Step 1: Write the failing test**

  Coprire con fixture API: stato iniziale `idle`; `capitalToAllocate = max(amount - mandatoryExpenses, 0)`; recommended/final distinti; reset finale; differenza positiva/negativa; blocco `canSave` quando il totale non coincide; transizioni readiness/preview/saving/error. Mockare solo il modulo HTTP nel test.

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && node --test tests/pianoSmartStore.test.js`
  Expected: FAIL per modulo store/API assente.

- [ ] **Step 3: Write minimal implementation**

  Riutilizzare la configurazione Axios esistente, preservare importi nel transport, normalizzare solo valori necessari al feedback UI, classificare errori per status/rete e non inventare fallback runtime. Copiare le allocazioni recommended in una nuova struttura final al ricevimento della preview.

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd client && node --test tests/pianoSmartStore.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git add client/src/api/pianoSmart.api.js client/src/stores/pianoSmart.store.js client/tests/pianoSmartStore.test.js && git commit -m "feat: add piano smart api state"`

### Task 3: Wizard input, readiness e domande dinamiche

**Files:**
- Create: `client/src/components/piano-smart/PianoSmartWizard.vue`
- Create: `client/src/components/piano-smart/PianoSmartAmountStep.vue`
- Create: `client/src/components/piano-smart/PianoSmartContextStep.vue`
- Create: `client/src/components/piano-smart/PianoSmartQuestions.vue`
- Create: `client/tests/pianoSmartWizard.test.js`

**Interfaces:**
- Wizard riceve store state/actions e emette `preview-requested` quando input e risposte sono pronti.
- Question renderer accetta `questions` dal backend e restituisce `manualContextAnswers` senza mutare dati globali WALLT.

- [ ] **Step 1: Write the failing test**

  Testare amount negativo/vuoto/non numerico, selezione source/recurring, default UX modificabile, mandatory expenses, capitale temporaneo, loading readiness, domande vuote e renderer per `currency`, `number`, `select`, `yes/no`.

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && node --test tests/pianoSmartWizard.test.js`
  Expected: FAIL perché componenti e validazioni non esistono.

- [ ] **Step 3: Write minimal implementation**

  Implementare massimo tre step, con label associate, errori inline e messaggio `Analizzo la tua situazione…`; usare enum/mapping dal contratto reale quando disponibile e mantenere il questionario dinamico.

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd client && node --test tests/pianoSmartWizard.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git add client/src/components/piano-smart client/tests/pianoSmartWizard.test.js && git commit -m "feat: add piano smart wizard"`

### Task 4: Preview e risultato accessibile

**Files:**
- Create: `client/src/components/piano-smart/PianoSmartResult.vue`
- Create: `client/src/components/piano-smart/PianoSmartAllocationBar.vue`
- Create: `client/src/components/piano-smart/PianoSmartAllocationCard.vue`
- Create: `client/src/components/piano-smart/PianoSmartReasons.vue`
- Create: `client/src/components/piano-smart/PianoSmartDataUsed.vue`
- Create: `client/tests/pianoSmartResult.test.js`

**Interfaces:**
- Result riceve preview backend e rende cinque categorie, importo iniziale, mandatory expenses, capitale allocato, warning, reasons e data confidence.
- Allocation bar rende dati testuali accessibili anche quando percentuali sono zero.

- [ ] **Step 1: Write the failing test**

  Testare tutte le cinque categorie, spiegazioni backend, warning storico limitato, accordion dati utilizzati, zero-capital e assenza goal senza creare dati fittizi.

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && node --test tests/pianoSmartResult.test.js`
  Expected: FAIL per componenti assenti.

- [ ] **Step 3: Write minimal implementation**

  Usare testo backend per reasons/explanations, non mostrare raw reason code, renderizzare una lista/barra segmentata con importi e percentuali testuali e trattare `allocatableCapital === 0` come stato dedicato.

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd client && node --test tests/pianoSmartResult.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git add client/src/components/piano-smart client/tests/pianoSmartResult.test.js && git commit -m "feat: add piano smart result"`

### Task 5: Personalizzazione e salvataggio

**Files:**
- Create: `client/src/components/piano-smart/PianoSmartCustomize.vue`
- Modify: `client/src/components/piano-smart/PianoSmartResult.vue`
- Modify: `client/src/stores/pianoSmart.store.js`
- Create: `client/tests/pianoSmartCustomize.test.js`

**Interfaces:**
- Customize modifica solo `finalAllocations`, mostra `recommendedAmount`, residuo o eccesso, emette save e reset.
- Store `savePlan` invia input originali e final allocations nel DTO reale, disabilitando il doppio submit durante `saving`.

- [ ] **Step 1: Write the failing test**

  Testare somma inferiore, somma superiore, somma esatta, reset recommended e save non invocato quando il totale è invalido.

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && node --test tests/pianoSmartCustomize.test.js`
  Expected: FAIL perché editor e guard di salvataggio non esistono.

- [ ] **Step 3: Write minimal implementation**

  Usare input monetari coerenti con WALLT, mantenere recommended immutato, mostrare `Ancora da distribuire` o `Hai superato il totale`, ripristinare con copia profonda e mostrare toast solo dopo successo.

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd client && node --test tests/pianoSmartCustomize.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git add client/src/components/piano-smart client/src/stores/pianoSmart.store.js client/tests/pianoSmartCustomize.test.js && git commit -m "feat: add piano smart customization"`

### Task 6: View principale, storico, dettaglio e azioni stato

**Files:**
- Create: `client/src/views/PianoSmartView.vue`
- Create: `client/src/components/piano-smart/PianoSmartHistory.vue`
- Create: `client/src/components/piano-smart/PianoSmartDetail.vue`
- Create: `client/tests/pianoSmartView.test.js`

**Interfaces:**
- View orchestra store, tab, dialog “Come funziona?”, wizard, result, history e detail.
- History usa `listPlans`; Detail usa `getPlan` e `updatePlan` per completare/archiviare secondo contratto reale.

- [ ] **Step 1: Write the failing test**

  Testare tab iniziale, empty state, caricamento lista, apertura dettaglio, testo del dialog, azioni status e messaggi di errore visibili.

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && node --test tests/pianoSmartView.test.js`
  Expected: FAIL perché view/history/detail non esistono.

- [ ] **Step 3: Write minimal implementation**

  Collegare i componenti precedenti in una pagina responsive, caricare storico solo nella tab dedicata, usare `DataState` dove compatibile e gestire focus/escape del dialog seguendo `HelpPanel`.

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd client && node --test tests/pianoSmartView.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git add client/src/views/PianoSmartView.vue client/src/components/piano-smart client/tests/pianoSmartView.test.js && git commit -m "feat: complete piano smart view"`

### Task 7: Help, responsive/accessibility polish e contratto reale

**Files:**
- Modify: `client/src/views/AiutoView.vue` o il catalogo help effettivamente usato
- Modify: `client/src/components/piano-smart/*.vue`
- Modify: `client/src/assets/styles/*.css` solo se necessario
- Create/Modify: `client/tests/pianoSmartHelp.test.js`

**Interfaces:**
- Help spiega cos'è Piano Smart, dati usati, domande mancanti, personalizzazione e assenza di spostamenti automatici.

- [ ] **Step 1: Write the failing test**

  Testare presenza del topic Help e verificare che i componenti abbiano label, focus e messaggi associati per i casi principali.

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && node --test tests/pianoSmartHelp.test.js`
  Expected: FAIL per topic Help e dettagli accessibilità mancanti.

- [ ] **Step 3: Write minimal implementation**

  Aggiungere contenuto Help nel pattern esistente, correggere responsive spacing/touch target, verificare contrasto e nessun overflow senza introdurre UI library o chart dependency.

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd client && node --test tests/pianoSmartHelp.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git add client/src/views/AiutoView.vue client/src/components/piano-smart client/src/assets/styles client/tests/pianoSmartHelp.test.js && git commit -m "docs: add piano smart help and accessibility"`

### Task 8: Integrazione col contratto backend e verifica finale

**Files:**
- Modify: `client/src/api/pianoSmart.api.js`
- Modify: `client/src/stores/pianoSmart.store.js`
- Modify: componenti Piano Smart solo per adattamenti DTO necessari
- Modify: `docs/PROJECT_STATUS.md` o documentazione frontend pertinente solo se richiesto dal repository

- [ ] **Step 1: Confrontare il contratto reale**

  Verificare endpoint, enum, DTO, formato monetario, errori, metadata obiettivi/sicurezza, data confidence e status action contro documentazione o branch backend disponibile.

- [ ] **Step 2: Scrivere test di regressione**

  Aggiungere fixture che riflettano le risposte reali e coprano recommended/final, zero-capital e status action.

- [ ] **Step 3: Applicare solo adattamenti necessari**

  Aggiornare il mapping API/store senza aggiungere logica finanziaria o endpoint alternativi.

- [ ] **Step 4: Eseguire la suite completa**

  Run: `cd client && npm test`
  Expected: tutte le suite passano.

- [ ] **Step 5: Eseguire build**

  Run: `cd client && npm run build`
  Expected: build Vite completata senza errori.

- [ ] **Step 6: Browser verification**

  Eseguire il flusso desktop e mobile reale: Funzionalità, wizard, readiness, domande, preview, cinque categorie, motivazioni, personalizzazione, reset, save, storico e dettaglio; controllare overflow e console senza nuovi runtime error.

- [ ] **Step 7: Commit**

  `git add client docs && git commit -m "test: verify piano smart frontend integration"`

## Self-review

- Copertura spec: accesso/route Task 1; API/state Task 2; wizard/readiness Task 3; risultato/dati/reasons Task 4; personalizzazione/save Task 5; storico/dettaglio/task status Task 6; Help/accessibilità/responsive Task 7; contratto, test, build e browser Task 8.
- Nessun placeholder operativo: ogni task indica file, comportamento, test e comando.
- Interfacce coerenti: lo store è l'unico punto che coordina API e stato; i componenti ricevono preview/input e non calcolano finanza.
- Review focus coperto: importi Task 2; domande Task 3; zero-capital Task 4; somme/reset Task 5; errori Task 2 e Task 6.
