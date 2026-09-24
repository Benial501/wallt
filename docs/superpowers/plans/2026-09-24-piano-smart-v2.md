# Piano Smart V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolvere Piano Smart in un motore smart-v2 con capitale realmente distribuibile, tre scenari, proiezioni deterministiche, azioni preparatorie e compatibilità con smart-v1.

**Architecture:** Il backend costruisce un contesto di pianificazione a partire dal FinancialContext, genera scenari, proiezioni e azioni in servizi puri e salva uno snapshot V2 più una tabella azioni. Gli endpoint V1 restano invariati; il frontend visualizza DTO del backend e calcola localmente esclusivamente differenze in centesimi.

**Tech Stack:** Node.js, Express, Sequelize, PostgreSQL, Jest, Vue 3, Pinia e gli strumenti già presenti nel repository.

**Spec:** docs/superpowers/specs/2026-09-24-piano-smart-v2-design.md

## Global Constraints

- Il backend è l’unica fonte di verità per calcoli e proiezioni.
- Il motore V2 usa importi interi in centesimi e API con stringhe decimali.
- Preview e salvataggio non modificano saldi, movimenti, conti, debiti, obiettivi o investimenti.
- V1 resta leggibile e operativo; nessuna conversione automatica V1 → V2.
- Le azioni sono preparatorie; il flusso futuro “conferma ed esegui” è fuori perimetro.
- Tutte le query Piano Smart filtrano per user_id.

## Review Focus

- Mese corrente parziale e primo mese storico parziale: usare solo finestre dichiarate dal FinancialContext.
- Riserva stimata senza fondo sicurezza: distinguere stima da saldo osservato e usare null quando non calcolabile.
- Entrata ricorrente/occasionale: la ricorrente entra dal mese successivo, l’occasionale una sola volta.
- Debito senza tasso: mostrarlo senza assegnargli una priorità automatica.
- Piano V1 letto dalla UI V2: scenari, proiezioni e azioni non disponibili, mai ricostruiti silenziosamente.

### Task 1: Contratti, costanti e modelli V2

**Files:** Create server/constants/pianoSmartV2.js, server/models/PianoSmartAzione.js, server/migrations/20260924000032-create-piano-smart-azioni.js and server/tests/pianoSmartV2Contract.test.js; modify server/models/index.js.

- [ ] Scrivere test fallenti per scenari, stati azione, orizzonti e registrazione del modello.
- [ ] Eseguire cd server && npm test -- --runInBand tests/pianoSmartV2Contract.test.js e verificare il fallimento.
- [ ] Implementare costanti, modello, associazioni e migrazione con DECIMAL, foreign key e indici su user_id/plan_id.
- [ ] Verificare gli stati azione e il contratto monetario.
- [ ] Eseguire il test focalizzato e committare feat: add Piano Smart v2 contracts.

### Task 2: Contesto e capitale disponibile

**Files:** Create server/services/pianoSmartV2/planningContext.service.js, server/services/pianoSmartV2/money.js and server/tests/pianoSmartV2PlanningContext.test.js.

**Interfaces:** buildPlanningContext({ context, input }) restituisce capital, situation, dataQuality e warnings. capital contiene receivedCents, mandatoryCents, minimumReserveCents, distributableCents, freeCents e reserveSource.

- [ ] Scrivere test per gap del fondo, riserva prudenziale senza fondo, riserva non disponibile, entrata ricorrente e occasionale.
- [ ] Eseguire la suite focalizzata e verificare il fallimento.
- [ ] Implementare conversione in centesimi e mapping del contesto senza duplicare query o medie.
- [ ] Aggiungere test per somme esatte, obblighi superiori all’entrata, mese parziale e origine del dato.
- [ ] Eseguire test focalizzati e test esistenti su denaro e finestre.
- [ ] Committare feat: calculate Piano Smart v2 available capital.

### Task 3: Scenari e destinazioni

**Files:** Create server/services/pianoSmartV2/scenario.service.js, server/services/pianoSmartV2/validation.service.js and server/tests/pianoSmartV2Scenarios.test.js.

**Interfaces:** generateScenarios({ planningContext, financialContext }) restituisce tre DTO ordinati; validateScenarioSelection({ scenario, allocations, snapshot }) valida la scelta contro lo snapshot.

- [ ] Testare tre scenari, determinismo, somme esatte, cap obiettivi e una sola allocazione al fondo.
- [ ] Implementare pesi distinti Prudente, Bilanciato e Ambizioso riusando gli helper V1.
- [ ] Implementare destinazioni per liquidità, sicurezza, obiettivi, debiti, futuro e libertà.
- [ ] Verificare che il debito senza tasso non venga prioritizzato.
- [ ] Eseguire test V2 e tutte le suite V1 del motore.
- [ ] Committare feat: generate Piano Smart v2 scenarios.

### Task 4: Proiezioni e azioni

**Files:** Create server/services/pianoSmartV2/projection.service.js, server/services/pianoSmartV2/action.service.js, server/tests/pianoSmartV2Projection.test.js and server/tests/pianoSmartV2Actions.test.js.

**Interfaces:** projectScenario({ scenario, planningContext, financialContext, horizons }) restituisce metriche a 3, 6 e 12 mesi. createActions({ scenario, planningContext, projection }) restituisce al massimo cinque azioni da_fare.

- [ ] Testare ricorrenza dal mese successivo, una tantum, liquidità, fondo, obiettivi e debito.
- [ ] Implementare proiezioni lineari, deterministiche e non stimabili quando mancano dati.
- [ ] Implementare azioni ordinate con importo, destinazione, motivo e rischio.
- [ ] Testare storico insufficiente, tasso mancante e limite massimo di cinque azioni.
- [ ] Eseguire test V2 e quelli esistenti su contesto, fondo, debiti e obiettivi.
- [ ] Committare feat: add Piano Smart v2 projections and actions.

### Task 5: API, serializer e persistenza

**Files:** Create server/services/pianoSmartV2/serializer.js, server/controllers/pianoSmartV2.controller.js, server/routes/pianoSmartV2.routes.js, server/tests/pianoSmartV2Api.test.js and server/tests/pianoSmartV2Security.test.js; modify server/app.js.

- [ ] Scrivere test per preview, save, selezione scenario, proiezioni e aggiornamento azioni.
- [ ] Scrivere test di autenticazione, isolamento cross-user e assenza di scritture finanziarie.
- [ ] Implementare rotte V2 autenticate e salvataggio atomico di snapshot e azioni.
- [ ] Implementare aggiornamento scenario validato contro snapshot e transizioni da_fare verso completata o ignorata.
- [ ] Verificare stringhe decimali e invarianti in centesimi.
- [ ] Eseguire test V2 e npm test completo del server.
- [ ] Committare feat: expose Piano Smart v2 API.

### Task 6: Frontend V2

**Files:** Modify client/src/api/pianoSmart.api.js, client/src/stores/pianoSmart.store.js and client/src/views/PianoSmartView.vue. Create client/src/components/piano-smart-v2/PianoSmartSituation.vue, PianoSmartScenarios.vue, PianoSmartProjection.vue, PianoSmartActions.vue, PianoSmartDataQuality.vue and client/tests/pianoSmartV2.test.js.

- [ ] Testare situazione, capitale, scenari, proiezione non stimabile, azioni e fallback V1.
- [ ] Aggiungere API e stato V2 senza duplicare calcoli finanziari.
- [ ] Creare card responsive e accessibili in italiano.
- [ ] Integrare risultato, confronto proposta/scelta, obiettivi, debiti, azioni e limiti.
- [ ] Eseguire test Piano Smart esistenti, test V2, build e lint/check disponibili.
- [ ] Committare feat: add Piano Smart v2 frontend flow.

### Task 7: Documentazione e verifica finale

**Files:** Modify docs/API.md, docs/DATABASE.md and docs/piano-smart-api-contract.md. Create docs/piano-smart-v2-api-contract.md.

- [ ] Documentare payload, risposte, stati, denaro, snapshot, azioni e compatibilità V1.
- [ ] Eseguire npm test server, test frontend, build frontend e git diff --check.
- [ ] Verificare che non siano stati usati pull, push, deploy o migrazioni di produzione.
- [ ] Committare docs: document Piano Smart v2 contract.

## Execution Notes

Lavorare soltanto sul main locale. Non eseguire git pull, git push, deploy o migrazioni di produzione automaticamente. Preservare modifiche non correlate.
