# Piano Smart Situazione Attuale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aggiungere a Piano Smart un riepilogo autenticato della situazione corrente, con margine disponibile, previsione del mese, suggerimenti prioritari e visione secondaria di patrimonio, debiti e obiettivi, mantenendo intatto il wizard V2.

**Architecture:** Il backend compone un nuovo snapshot read-only usando `getFinancialContext` e i servizi finanziari esistenti. Un endpoint dedicato restituisce valori osservati/stimati/non stimabili e azioni deterministiche; lo store Vue conserva la risposta e la view la presenta prima del flusso “Crea piano”.

**Tech Stack:** Node.js, Express, Sequelize services, Jest; Vue 3 Composition API, Pinia, Axios, CSS esistente.

**Spec:** `docs/superpowers/specs/2026-09-25-piano-smart-situazione-attuale-design.md`

## Global Constraints

- Il backend resta l'unica fonte di verità per contesto finanziario, calcoli e suggerimenti.
- Il riepilogo non modifica saldi, movimenti, conti, obiettivi o piani.
- Ogni lettura è autenticata e isolata per `user_id`.
- I valori distinguono osservato, stimato, manuale e non stimabile.
- Gli importi monetari usano centesimi nei calcoli e stringhe decimali nell'API.
- Il wizard Piano Smart V2 esistente resta compatibile.
- La UI mostra massimo tre suggerimenti principali.

## Review Focus

- Nessun movimento o mese parziale: il riepilogo deve restituire stato leggibile senza inventare dati.
- Spese ricorrenti e impegni futuri: non devono essere confuse con il saldo disponibile.
- Margine nullo o negativo: non deve diventare una disponibilità positiva per arrotondamento.
- Dati insufficienti: ogni previsione deve esporre motivo e affidabilità.
- Utente diverso: nessun riepilogo o piano può attraversare l'isolamento per `user_id`.

### Task 1: Motore read-only della situazione corrente

**Files:**
- Create: `server/services/pianoSmartV2/currentSituation.service.js`
- Test: `server/tests/pianoSmartCurrentSituation.test.js`

**Interfaces:**
- Consumes: `financialContext`, data corrente e ricorrenze già aggregate nel contesto.
- Produces: `buildCurrentSituation({ context, now })` con `current`, `forecast`, `financialDirection`, `suggestions`, `dataQuality`, `warnings`.

- [ ] Scrivere test per liquidità, spese mensili, impegni, margine e limite giornaliero.
- [ ] Scrivere test per margine zero, periodo senza dati e mese parziale.
- [ ] Implementare calcoli in centesimi senza mutare il contesto finanziario.
- [ ] Implementare suggerimenti deterministici con massimo tre elementi e motivazione/effetto.
- [ ] Eseguire `cd server && npx jest tests/pianoSmartCurrentSituation.test.js --runInBand`.

### Task 2: Endpoint API di riepilogo

**Files:**
- Modify: `server/controllers/pianoSmartV2.controller.js`
- Modify: `server/routes/pianoSmartV2.routes.js`
- Test: `server/tests/pianoSmartV2Api.test.js` o nuova suite dedicata

**Interfaces:**
- Consumes: `buildCurrentSituation` e `getFinancialContext(req.userId)`.
- Produces: `GET /api/piano-smart/v2/current-situation` autenticato.

- [ ] Aggiungere il test di risposta autenticata e il test di mancata fuga cross-user.
- [ ] Aggiungere controller read-only con gestione dell'errore coerente alle route V2.
- [ ] Aggiungere route prima delle route parametriche `/:id`.
- [ ] Verificare che il controller non chiami create/update/delete su modelli finanziari.
- [ ] Eseguire la suite API Piano Smart V2.

### Task 3: Store e API client frontend

**Files:**
- Modify: `client/src/api/pianoSmart.api.js`
- Modify: `client/src/stores/pianoSmart.store.js`
- Test: `client/tests/pianoSmart.test.js` oppure test store esistente

**Interfaces:**
- Consumes: `GET /api/piano-smart/v2/current-situation`.
- Produces: stato Pinia `currentSituation`, `loadCurrentSituation()`, loading/error states e reset coerente.

- [ ] Aggiungere la chiamata API senza duplicare calcoli nel client.
- [ ] Aggiungere caricamento idempotente e gestione errori secondo `creaRisorsa`.
- [ ] Aggiungere test per successo, errore e reset.
- [ ] Eseguire test frontend e build client.

### Task 4: Nuova gerarchia della view

**Files:**
- Modify: `client/src/views/PianoSmartView.vue`
- Modify: relativo stylesheet della view
- Create or modify: componenti `client/src/components/piano-smart/` solo se necessari per mantenere la view leggibile

**Interfaces:**
- Consumes: `currentSituation` dallo store e wizard V2 esistente.
- Produces: pagina iniziale “Situazione attuale”, con ingresso secondario “Crea piano”.

- [ ] Mostrare prima margine disponibile, limite giornaliero e previsione.
- [ ] Mostrare massimo tre suggerimenti con effetto e motivazione.
- [ ] Mostrare sotto patrimonio, debiti, fondo sicurezza e obiettivi.
- [ ] Rendere espliciti loading, errore e dati insufficienti.
- [ ] Mantenere accessibili tab, pulsanti, layout mobile e storico dei piani.
- [ ] Verificare con build frontend e controllo manuale della view.

### Task 5: Collegamento controllato con Home e documentazione

**Files:**
- Modify: `client/src/views/DashboardView.vue` o componente Home effettivamente responsabile del riepilogo, solo dopo verifica dell'implementazione.
- Modify: `docs/piano-smart-v2-api-contract.md`
- Modify: `docs/PROJECT_STATUS.md`

**Interfaces:**
- Consumes: snapshot corrente già servito dall'endpoint.
- Produces: eventuale riuso del solo valore “quanto puoi spendere”, senza duplicare l'intera analisi.

- [ ] Verificare il componente Home reale prima di modificarlo.
- [ ] Riutilizzare il dato API senza introdurre una seconda formula.
- [ ] Aggiornare contratto API e stato progetto.
- [ ] Eseguire `cd server && npm test` e il build frontend completo.

