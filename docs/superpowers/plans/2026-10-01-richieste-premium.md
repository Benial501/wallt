# Richieste Premium — piano di implementazione

> **Per chi esegue:** usa `superpowers:executing-plans` o
> `superpowers:subagent-driven-development`. Gli step hanno checkbox.

**Obiettivo:** distinguere «tutti gli utenti» da «chi ha davvero chiesto
Premium», con una tabella dedicata `premium_access_requests`, le rotte per
crearla/leggerla/annullarla lato utente e approvarla/rifiutarla lato
amministratore — senza toccare l'architettura Premium/Bank Sync esistente.

**Architettura:** estensione, non riscrittura. La catena
`Subscription → Entitlements → canUseFeature → Features` resta l'unica
autorità sui permessi (Regola 23); una richiesta **non è** un permesso e non
concede niente da sé. L'approvazione amministrativa passa da
`grantEntitlement(source: 'admin')`, che per costruzione **non** consuma i 25
posti `beta_25`. Il claim della beta continua a funzionare come prima e
registra in più una riga `auto_approved_beta`, così il pannello admin sa chi
ha manifestato interesse ed è entrato automaticamente.

**Stack:** Express 5 + Sequelize 6 + PostgreSQL; Vue 3 `<script setup>` +
Pinia; Jest (backend), `node:test` (contratto client).

**Spec:** il brief dell'utente del 2026-10-01 (punti 1–20), riportato nei
vincoli qui sotto.

## Vincoli globali

- `premium_access_requests` con i campi del brief: `id`, `user_id`,
  `requested_feature`, `status`, `requested_at`, `reviewed_at`,
  `reviewed_by`, `decision_reason`, `created_at`, `updated_at`.
- Stati ammessi: `pending`, `approved`, `rejected`, `cancelled`,
  `auto_approved_beta`. Nessun altro.
- `UNIQUE(user_id, requested_feature)` imposto **dal database** (Coding
  Rule 22): una richiesta per utente e feature, mai duplicati.
- Il client non invia mai `user_id`, `status`, `requested_at`,
  `reviewed_by`, `reviewed_at`, `source`. Il server li determina.
- Approvare **non** consuma un posto `beta_25`: la concessione è
  `source: 'admin'` e passa da `grantEntitlement`, che rifiuta `beta_25`.
- Rifiutare **non** tocca gli entitlement già posseduti per altre ragioni, e
  **non** cancella la richiesta: resta lo storico della decisione.
- Revoca ≠ rifiuto: due operazioni distinte, due eventi di audit distinti.
- Audit: `premium_request_created`, `premium_request_approved`,
  `premium_request_rejected`, `premium_request_cancelled`,
  `premium_beta_auto_approved`, con `user_id` (soggetto) e `actor_user_id`
  (chi agisce) distinti e `metadata` sanitizzato.
- Rate limit dedicato sull'endpoint di richiesta.
- Nessun pagamento: gli unici accessi a Bank Sync restano `beta_25` e
  `admin`.
- Vocabolario duplicato client/server e sorvegliato da
  `client/tests/entitlementsContratto.test.js` (stesso principio della
  Regola 23).
- Italiano per ogni testo rivolto all'utente; inglese solo per gli
  identificatori di codice.

---

## Struttura dei file

**Server — nuovi**
- `migrations/20261001000044-create-premium-access-requests.js` — tabella,
  CHECK sugli stati, UNIQUE, indici, RLS + revoca privilegi (obbligatoria:
  vedi area sensibile "Migrazioni DB").
- `models/PremiumAccessRequest.js` — modello Sequelize.
- `services/premiumRequests.service.js` — **punto sorgente unico** del ciclo
  di vita di una richiesta (Regola 20 applicata alle richieste).
- `controllers/premium.controller.js` — le tre rotte dell'utente.
- `routes/premium.routes.js` — montaggio `/api/premium`.
- `tests/premiumRichieste.test.js` — la suite del brief (punto 16).

**Server — modificati**
- `constants/entitlements.js` — stati, etichette, feature richiedibili.
  Nessun `require` (il contratto client deve restare caricabile in CI).
- `services/auditLog.service.js` — i cinque eventi nuovi.
- `services/betaSlots.service.js` — registra `auto_approved_beta` dopo un
  claim riuscito, senza poter far fallire il claim.
- `controllers/admin.controller.js` — elenco, contatori, approva, rifiuta.
- `routes/admin.routes.js` — tre rotte nuove sotto il `requireAdmin` di
  router.
- `middleware/validation.middleware.js` — tre validator.
- `middleware/rateLimit.middleware.js` — `premiumRequestLimiter`.
- `models/index.js` — associazioni.
- `app.js` — `app.use('/api/premium', premiumRoutes)`.
- `tests/setup.js` — la tabella nuova nell'elenco del TRUNCATE.

**Client — nuovi**
- `src/components/premium/RichiestaPremium.vue` — il riquadro "Richiedi
  accesso / Richiesta inviata", usato dal modale e dalle impostazioni.

**Client — modificati**
- `src/utils/entitlements.js` — stati e etichette (duplicati sorvegliati).
- `src/stores/piano.store.js` — risorsa `richiesta` + azioni.
- `src/stores/admin.store.js` — risorsa richieste + approva/rifiuta.
- `src/components/premium/PremiumModal.vue` — sostituisce il pulsante
  disabilitato con la richiesta.
- `src/components/impostazioni/PianoAbbonamento.vue` — stato della richiesta.
- `src/views/AdminView.vue` — sezione "Richieste Premium".
- `tests/entitlementsContratto.test.js` — contratto esteso.

---

## Task 1 — Vocabolario condiviso

**Files:** `server/constants/entitlements.js`,
`client/src/utils/entitlements.js`, `client/tests/entitlementsContratto.test.js`

**Produces:** `RICHIESTA_PENDING | APPROVED | REJECTED | CANCELLED |
AUTO_APPROVED_BETA`, `RICHIESTA_STATI`, `RICHIESTA_STATI_APERTI`,
`RICHIESTA_ETICHETTE`, `isRichiestaStato(v)`, `FEATURE_RICHIEDIBILI`.

- [ ] Aggiungi le costanti al server, senza `require`.
- [ ] Duplicale nel client con le etichette italiane.
- [ ] Estendi il test di contratto: stati uguali, ogni stato ha un'etichetta,
      i moduli del server restano importabili senza Sequelize.
- [ ] `cd client && npm test` → verde.

## Task 2 — Migrazione e modello

**Files:** `server/migrations/20261001000044-…`,
`server/models/PremiumAccessRequest.js`, `server/models/index.js`,
`server/tests/setup.js`

- [ ] Scrivi la migrazione con CHECK, `UNIQUE(user_id, requested_feature)`,
      indici su `(status, requested_at)` e `(user_id)`, RLS + REVOKE.
- [ ] `down` che fa `dropTable`.
- [ ] Modello + associazioni (`richiestePremium`, `revisore`).
- [ ] Tabella nell'elenco TRUNCATE di `tests/setup.js`.
- [ ] `npm run migrate` locale, poi `migrate:undo`, poi di nuovo `migrate`.
- [ ] `npx jest tests/migrazioniReali.test.js` → verde (RLS obbligatoria).

## Task 3 — Service (TDD)

**Files:** `server/services/premiumRequests.service.js`,
`server/services/auditLog.service.js`, `server/tests/premiumRichieste.test.js`

**Produces:**
`creaRichiesta({userId, feature}) → {richiesta, creata, giaPresente, stato}`,
`richiesteUtente(userId)`, `annullaRichiesta({userId, id})`,
`registraAutoApprovata({userId, feature})` (non lancia mai),
`approva({id, actorUserId, motivo})`, `rifiuta({id, actorUserId, motivo})`,
`elenco({stato, limite})`, `contatori()`.

- [ ] Test rossi per: creazione, idempotenza, riapertura dopo `cancelled`,
      nessuna riapertura dopo `rejected`, approvazione che concede
      `source: 'admin'`, approvazione che non consuma `beta_25`, rifiuto che
      non tocca entitlement esistenti.
- [ ] Implementa il service.
- [ ] Test verdi.

## Task 4 — Rotte utente

**Files:** `server/controllers/premium.controller.js`,
`server/routes/premium.routes.js`, `server/app.js`,
`server/middleware/validation.middleware.js`,
`server/middleware/rateLimit.middleware.js`

- [ ] `GET /api/premium/richieste`, `POST /api/premium/request`,
      `DELETE /api/premium/richieste/:id` (solo le proprie).
- [ ] `user_id` ignorato se arriva dal client; `status`/`reviewed_by` idem.
- [ ] `premiumRequestLimiter` (10/ora, bypassabile nei test).
- [ ] Test: isolamento fra utenti, campi iniettati ignorati, 404 su id altrui.

## Task 5 — Claim beta che registra l'interesse

**Files:** `server/services/betaSlots.service.js`

- [ ] Dopo un claim `ASSEGNATO`, scrivi/aggiorna la richiesta a
      `auto_approved_beta` e registra `premium_beta_auto_approved`.
- [ ] La scrittura non può far fallire il claim.
- [ ] Test: i primi N si attivano da soli e compaiono come
      `auto_approved_beta`; l'utente oltre il limite ottiene `pending` e
      **nessun** entitlement.

## Task 6 — Rotte admin

**Files:** `server/controllers/admin.controller.js`,
`server/routes/admin.routes.js`, `server/middleware/validation.middleware.js`

- [ ] `GET /api/admin/richieste-premium`, `POST …/:id/approva`,
      `POST …/:id/rifiuta`, contatori in `GET /api/admin/riepilogo`.
- [ ] Tutte sotto il `requireAdmin` di router (404 a chi non è admin).
- [ ] Test: utente normale 404, non autenticato 401, JWT con `ruolo: admin`
      falsificato 404, admin ok; audit con soggetto e attore distinti.

## Task 7 — Client

**Files:** store, componenti, viste elencati sopra

- [ ] `piano.store`: risorsa richiesta + `richiediAccesso()`/`annulla()`.
- [ ] `admin.store`: risorsa richieste + `approvaRichiesta`/`rifiutaRichiesta`.
- [ ] `PremiumModal`: "Richiedi accesso a WALLT Premium" → "Richiesta
      inviata"; se già inviata, "Richiesta già inviata".
- [ ] `AdminView`: sezione con contatori, filtri, tabella, azioni.
- [ ] `npm run build` e `npm test` del client verdi.

## Task 8 — Verifica finale

- [ ] `cd server && npm test`
- [ ] `cd client && npm test && npm run build`
- [ ] `npm run migrate` / `migrate:undo` / `migrate` sul DB locale
- [ ] Smoke test nel browser con l'account admin
- [ ] Report finale con i punti 15 e 20 del brief

---

## Scelte da motivare nel codice

1. **`UNIQUE(user_id, requested_feature)` piena, non parziale.** Il brief
   chiede «almeno» questa. Una riga per utente e feature rende l'endpoint
   idempotente per costruzione e impedisce lo spam di righe
   `rejected → nuova pending`. Lo storico della decisione resta nella riga
   (`status`, `reviewed_at`, `reviewed_by`, `decision_reason`) e in
   `audit_logs`, che è la traccia completa.
2. **Riapertura solo da `cancelled`.** Annullare è un'azione dell'utente, non
   una decisione dello staff: ripresentarsi è legittimo. Riaprire una
   `rejected` cancellerebbe invece una decisione amministrativa, e il brief
   chiede esplicitamente che resti.
3. **La richiesta non autorizza niente.** Nessun punto del codice legge
   `premium_access_requests` per decidere un accesso: la domanda resta
   `canUseFeature`. È la stessa ragione per cui non esiste `user.premium`.
