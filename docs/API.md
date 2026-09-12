# WALLT — API Reference

> Inventario endpoint basato su `server/routes/` e `server/app.js`.
> Base URL: `/api` (prefisso comune a tutte le route).
> Auth: Bearer JWT in header `Authorization` salvo dove indicato.

## Rate Limiting globale

| Limiter | Scope | Limite |
|---|---|---|
| `apiLimiter` | Tutte `/api/*` | 1200 req / 15 min per user/IP (IPv6-safe) |
| `authLimiter` | login, register, forgot/reset password | 10 / 15 min per IP (IPv6-safe, persistente PostgreSQL tra istanze Vercel) |
| `stepUpLimiter` | verify-password, google/challenge, verify-google | 20 / 15 min per user |
| `exportLimiter` | export dati | 3 / ora per user |
| `deleteAccountLimiter` | delete account | 3 / ora per user |
| `importUploadLimiter` | upload import | 30 / 15 min per user |
| `importConfirmLimiter` | conferma import | 15 / ora per user |

---

## Health

### GET /api/health
- **Auth**: No
- **Risposta**: `{ status: "ok", message: "WALLT API attiva" }`
- **File**: `server/app.js`

---

## Vercel Cron

### GET /api/cron/ricorrenti
- **Auth**: Bearer `CRON_SECRET` dedicato; non usa il JWT utente
- **Azione**: processa le ricorrenze mensili dovute secondo `Europe/Rome`
- **Idempotenza**: vincolo PostgreSQL su ricorrenza e periodo `YYYY-MM`
- **Risposta**: `{ processed, skipped, failed }`
- **File**: `cron.routes.js` → `cron.controller.js` → `ricorrenti.service.js`

### GET /api/cron/notifiche
- **Auth**: Bearer `CRON_SECRET` dedicato; non usa il JWT utente
- **Azione**: genera le notifiche dovute per tutti gli utenti (promemoria,
  budget, ricorrenti, obiettivi, riepilogo settimanale), spedisce le push in
  attesa e pota le notifiche lette più vecchie di 90 giorni
- **Idempotenza**: unique `(user_id, dedupe_key)` su `notifiche`; può essere
  richiamata a qualunque frequenza senza creare duplicati
- **Risposta**: `{ utenti, create, duplicate, saltate, solo_in_app, rinviate, errori, push: {...}, potate }`
- **File**: `cron.routes.js` → `cron.controller.js` → `services/notifiche/NotificheGenerator.js`

---

## Notifiche

Tutte le rotte richiedono `Authorization: Bearer <jwt>` e operano solo sulle
notifiche dell'utente autenticato.

### GET /api/notifiche
- **Query**: `non_lette` (`true`/`false`), `limit` (1-100), `offset`
- **Risposta**: `{ notifiche[], totale, non_lette }`
- Le notifiche rinviate alle ore di silenzio non compaiono finché non sono dovute.
- `dedupe_key` non viene mai esposta.

### GET /api/notifiche/non-lette
- Endpoint leggero per il badge della campanella
- **Risposta**: `{ non_lette, notifiche[] }` (massimo 20)

### PUT /api/notifiche/:id/letta
- **Risposta**: `{ message, non_lette }` — `404` se la notifica non esiste o è di un altro utente

### PUT /api/notifiche/lette
- Segna come lette tutte le notifiche dovute dell'utente
- **Risposta**: `{ message, aggiornate, non_lette: 0 }`

### GET /api/notifiche/preferenze
- **Risposta**: `{ preferenze, chiave_pubblica_push }` — le preferenze vengono
  create con i default al primo accesso
- `chiave_pubblica_push` è la chiave VAPID pubblica (null se il push non è configurato)

### PUT /api/notifiche/preferenze
- **Body**: `promemoria_giornaliero_attivo`, `alert_budget_attivi`,
  `alert_ricorrenti_attivi`, `alert_obiettivi_attivi`,
  `riepilogo_settimanale_attivo`, `push_attive`, `orario_promemoria` (HH:MM),
  `quiet_hours_inizio`, `quiet_hours_fine`, `timezone` (IANA), `max_notifiche_giornaliere` (1-5)
- `push_attive: true` senza chiavi VAPID configurate → `503`
- `push_attive: false` elimina anche le sottoscrizioni push dell'utente

### POST /api/notifiche/push
- **Body**: `{ subscription: { endpoint, keys: { p256dh, auth } } }`
- Registra il dispositivo e attiva `push_attive` (la registrazione È il consenso)
- **Risposta**: `201 { message, preferenze }` — `503` se VAPID non è configurato

### DELETE /api/notifiche/push
- **Body**: `{ endpoint }` opzionale — senza endpoint rimuove tutti i dispositivi
  e disattiva `push_attive`
- **Risposta**: `{ message, rimosse, preferenze }`

### POST /api/notifiche/giornata-controllata
- Marca il giorno locale dell'utente come già controllato: nessun promemoria per quella data
- **Risposta**: `{ message, giorno }`

### POST /api/notifiche/prova
- **Endpoint diagnostico: nessun pulsante nella UI lo chiama.** Serve a
  verificare la consegna push su un dispositivo reale senza aspettare il cron
  né costruire ad arte le condizioni di un avviso vero. Si invoca a mano con
  il JWT dell'utente.
- Crea e consegna subito una notifica di prova all'utente autenticato
- Non consuma il limite giornaliero (`conta_nel_limite: false`) e non attende il cron
- Una sola prova al minuto per utente (dedupe key al minuto) → `429` oltre
- **Risposta**: `{ message, push_disponibile, push_attive, dispositivi, push, non_lette }`

### POST /api/notifiche/genera
- Rigenerazione on-demand per il solo utente autenticato (idempotente)
- **Risposta**: `{ esito, non_lette }`

---

## Authentication

### GET /api/auth/providers
- **Auth**: No
- **Risposta**: `{ google: boolean, apple: false }`
- **File**: `auth.routes.js` → inline

### POST /api/auth/register
- **Auth**: No
- **Rate limit**: authLimiter
- **Body**: `{ nome, email, password, privacy_accepted_at, terms_accepted_at, use_ai_categorization? }`
- **Validazione**: `validateRegister` (password: min 8, maiuscola, cifra, carattere speciale)
- **Risposta**: `{ token, user }`
- **Errori**: 400 (validazione), 409 (email esistente)
- **File**: `auth.controller.js` → `register`
- **Frontend**: `auth.store.js` → `RegisterView.vue`

### POST /api/auth/login
- **Auth**: No
- **Rate limit**: authLimiter
- **Body**: `{ email, password }`
- **Validazione**: `validateLogin`
- **Risposta**: `{ token, user }`
- **Errori**: 401 (credenziali errate), 400 (account OAuth-only)
- **File**: `auth.controller.js` → `login`
- **Frontend**: `auth.store.js` → `LoginView.vue`

### GET /api/auth/me
- **Auth**: Sì
- **Risposta**: `{ user }` (con profilo, feature flags, age masking)
- **File**: `auth.controller.js` → `me`
- **Frontend**: `auth.store.js` → `fetchMe` (router guard, ogni 60s)

### POST /api/auth/verify-password
- **Auth**: Sì + `stepUpLimiter` (20/15min per utente)
- **Solo utenti locali** (con password). Un utente Google che chiama questo endpoint riceve **400** (`code: 'google_stepup_required'`) — deve usare il flusso Google sotto.
- **Body**: `{ password }` — verificata con `bcrypt.compare` contro l'hash reale.
- **Validazione**: `validateVerifyPassword` (valida solo `body('password')`)
- **Risposta**: `{ step_up_token }` (JWT 5 min, type: step_up)
- **Errori**: 400 (account Google), 401 (password non valida), 404 (utente non trovato)
- **File**: `verifyPassword.controller.js`
- **Frontend**: `ImpostazioniView.vue` (export, delete, reset — ramo locale)

### POST /api/auth/google/challenge
- **Auth**: Sì + `stepUpLimiter`
- **Solo utenti Google OAuth** (primo passo dello step-up Google, prima del pulsante "Continua con Google").
- **Body**: nessuno.
- **Risposta**: `{ nonce, challenge, expires_in }` — `challenge` è un JWT firmato (`type: google_stepup_challenge`, legato a `req.userId`, scadenza 2 minuti) che incapsula `nonce`; `nonce` va passato a Google Identity Services.
- **Errori**: 400 se l'utente non è un account Google collegato.
- **File**: `googleStepUp.controller.js` → `getGoogleStepUpChallenge`
- **Frontend**: `useGoogleStepUp.js`

### POST /api/auth/verify-google
- **Auth**: Sì + `stepUpLimiter`
- **Body**: `{ credential, challenge }` — `credential` è l'ID token JWT restituito da Google Identity Services, `challenge` è il valore ottenuto da `google/challenge`.
- **Validazione**: `validateGoogleStepUpVerify` (entrambi i campi stringa non vuota)
- **Azione**: verifica il challenge (firma/scadenza/type/userId), verifica che il nonce non sia già stato consumato (single-use in-memory), verifica crittograficamente l'ID token con `google-auth-library` (firma, audience, issuer, scadenza), verifica `payload.nonce` contro il challenge, verifica freschezza (`iat` recente), verifica `payload.sub === user.google_id` (utente caricato da `req.userId`, mai dal body).
- **Risposta**: `{ step_up_token }` (stesso formato/durata del flusso locale)
- **Errori**: 400 (account non Google/credenziale mancante), 401 (credenziale non valida/scaduta/nonce errato/non recente), 403 (challenge non valido/scaduto/già usato/di un altro utente, oppure identità Google non corrispondente)
- **File**: `googleStepUp.controller.js` → `verifyGoogleStepUp`
- **Frontend**: `useGoogleStepUp.js`

### GET /api/auth/google
- **Auth**: No
- **Query**: `origin` (frontend URL per popup relay)
- **Azione**: Redirect a Google OAuth
- **File**: `auth.routes.js` → Passport

### GET /api/auth/google/callback
- **Auth**: No
- **Azione**: Callback Google → JWT → HTML popup con hash payload
- **File**: `auth.routes.js` → Passport callback

### POST /api/auth/forgot-password
- **Auth**: No
- **Rate limit**: authLimiter
- **Body**: `{ email }`
- **Validazione**: `validateForgotPassword`
- **Risposta**: Messaggio generico (non rivela se email esiste)
- **File**: `passwordReset.controller.js`
- **Frontend**: `ForgotPassword.vue`

### POST /api/auth/reset-password/verify
- **Auth**: No
- **Rate limit**: authLimiter
- **Body**: `{ token }`
- **Risposta**: `{ valid: true, email_masked, nome }` o errore
- **File**: `passwordReset.controller.js`
- **Frontend**: `ResetPassword.vue`

### POST /api/auth/reset-password
- **Auth**: No
- **Rate limit**: authLimiter
- **Body**: `{ token, password }`
- **Validazione**: `validateResetPassword`
- **Risposta**: `{ success: true }`
- **File**: `passwordReset.controller.js`
- **Frontend**: `ResetPassword.vue`

---

## Profilo

### GET /api/profilo
- **Auth**: Sì
- **Risposta**: `{ profilo }`
- **File**: `profilo.controller.js`
- **Frontend**: `profilo.store.js`

### PUT /api/profilo
- **Auth**: Sì
- **Body**: Campi profilo finanziario (onboarding)
- **Validazione**: `validateUpdateProfiloFinanziario`
- **Risposta**: `{ profilo }`
- **File**: `profilo.controller.js`
- **Frontend**: `OnboardingView.vue`, `profilo.store.js`

### GET /api/profilo/budget-suggerito
- **Auth**: Sì
- **Risposta**: Budget suggerito basato su profilo
- **File**: `profilo.controller.js`
- **Frontend**: `profilo.store.js` (`fetchBudgetSuggerito` — **non chiamato da nessuna view**)

### POST /api/profilo/skip-onboarding
- **Auth**: Sì
- **Risposta**: `{ profilo }` con onboarding_completato=true
- **File**: `profilo.controller.js`
- **Frontend**: `OnboardingView.vue`

---

## Conti

### GET /api/conti
- **Auth**: Sì
- **Risposta**: `{ conti[], patrimonio_totale }`
- **File**: `conti.controller.js`
- **Frontend**: `conti.store.js` → `ContiView.vue`, `DashboardView.vue`

### POST /api/conti
- **Auth**: Sì
- **Body**: `{ nome, tipo, saldo_iniziale?, icona?, colore? }`
- **Validazione**: `validateConto`
- **Risposta**: `{ conto }` (o riattivazione conto inattivo con stesso nome)
- **File**: `conti.controller.js`
- **Frontend**: `ContiView.vue`

### PUT /api/conti/:id
- **Auth**: Sì
- **Body**: `{ nome?, tipo?, icona?, colore?, saldo? }`
- **Validazione**: `validateUpdateConto`
- **Risposta**: `{ conto }`
- **File**: `conti.controller.js`
- **Frontend**: `ContiView.vue`

### DELETE /api/conti/:id
- **Auth**: Sì
- **Validazione**: `validateDeleteConto`
- **Azione**: Soft-delete (`attivo: false`)
- **File**: `conti.controller.js`
- **Frontend**: `ContiView.vue`

### GET /api/conti/patrimonio
- **Auth**: Sì
- **Risposta**: `{ totale, totale_conti, totale_investimenti, variazione_importo, variazione_percentuale }`
- **File**: `conti.controller.js`
- **Frontend**: `conti.store.js` → `DashboardView.vue`

### POST /api/conti/trasferimento
- **Auth**: Sì
- **Body**: `{ conto_origine_id, conto_destinazione_id, importo, data, nota? }`
- **Validazione**: `validateTrasferimento`
- **Risposta**: `{ success, conto_origine, conto_destinazione }`
- **Errori**: 400 (saldo insufficiente), 404 (conto non trovato)
- **File**: `conti.controller.js` → `trasferimento`
- **Frontend**: `conti.store.js` → `MovimentoForm.vue` (tipo trasferimento)

---

## Movimenti

### GET /api/movimenti
- **Auth**: Sì
- **Query**: `tipo`, `categoria`, `conto_id`, `da`, `a`, `page`, `limit`, `ordine` (`caricamento`), `solo_conti_attivi`
- **Risposta**: `{ gruppi[], movimenti[], pagination }`
- **File**: `movimenti.controller.js`
- **Frontend**: `movimenti.store.js`, `DashboardView.vue` (recenti con `ordine=caricamento`)

### POST /api/movimenti
- **Auth**: Sì
- **Body**: `{ tipo, importo, categoria, conto_id, data, descrizione?, ricorrente?, ricorrente_frequenza?, ricorrente_giorno? }`
- **Validazione**: `validateMovimento`
- **Risposta**: `{ movimento }`
- **Errori**: 400 (saldo insufficiente per uscita)
- **File**: `movimenti.controller.js`
- **Frontend**: `MovimentoForm.vue`

### PUT /api/movimenti/:id
- **Auth**: Sì
- **Body**: Campi opzionali (importo, categoria, data, descrizione, conto_id, tipo)
- **Validazione**: `validateUpdateMovimento`
- **Azione**: Ricalcola saldo conto (vecchio e nuovo se conto cambia)
- **File**: `movimenti.controller.js`
- **Frontend**: `MovimentoForm.vue` (edit mode)

### DELETE /api/movimenti/:id
- **Auth**: Sì
- **Validazione**: `validateDeleteMovimento`
- **Azione**: Elimina movimento, ripristina saldo
- **File**: `movimenti.controller.js`
- **Frontend**: `MovimentiView.vue`

### GET /api/movimenti/bilancio
- **Auth**: Sì
- **Query**: `mese`, `anno`
- **Risposta**: `{ entrate, uscite, saldo }`
- **File**: `movimenti.controller.js`
- **Frontend**: `movimenti.store.js` → `DashboardView.vue`

### GET /api/movimenti/ricorrenti
- **Auth**: Sì
- **Risposta**: `{ movimenti[] }` (ricorrente=true)
- **File**: `movimenti.controller.js`
- **Frontend**: `movimenti.store.js` (`fetchRicorrenti` — **non chiamato da nessuna view**)

---

## Categorie

Catalogo unificato: le predefinite arrivano da `constants/catalogoCategorie.json`
(condivise, 112 voci), le personali dalla tabella `categorie_personali`.
`categorie.service.list()` è l'unico punto che le fonde ed è ciò su cui filtra
tutta la cascata di categorizzazione (`CategoryMatcherService._finalize`).

### GET /api/categorie
- **Auth**: Sì
- **Query**: `archiviate=true` include le categorie eliminate/archiviate
- **Risposta**: `{ categorie[], icone[] }` — ogni voce ha `isDefault`, `sistema`, `attiva`
- **File**: `categorie.routes.js`
- **Frontend**: `utils/categorie.js` → `CategorieView.vue`, `MovimentoForm.vue`

### POST /api/categorie
- **Auth**: Sì
- **Body**: `{ nome, tipo, icona?, colore? }`
- **Risposta**: `{ categoria }` — 409 se il nome collide con una predefinita dello stesso tipo
- **File**: `categorie.routes.js`

### PUT /api/categorie/:id
- **Auth**: Sì
- **Body**: `{ nome, tipo, icona?, colore? }`
- **Azione**: solo categorie personali; 409 se cambia `tipo` a una categoria già usata
- **File**: `categorie.routes.js`

### DELETE /api/categorie/:id
- **Auth**: Sì
- **Azione**: archivia la categoria personale (`attiva: false`) e disattiva le regole che la usano
- **File**: `categorie.routes.js`

### POST /api/categorie/:id/ripristina
- **Auth**: Sì
- **Azione**: riattiva una categoria personale archiviata
- **Risposta**: `{ categoria }` o 404
- **File**: `categorie.routes.js`

### DELETE /api/categorie/default
- **Auth**: Sì
- **Body**: `{ categorie: [{ id, tipo }] }`
- **Azione**: elimina per l'utente una o più predefinite (riga in `categorie_default_nascoste`).
  I movimenti esistenti restano; la categoria sparisce dagli elenchi e la cascata smette di assegnarla.
- **Risposta**: `{ eliminate, message }`; **409** se il batch contiene una categoria di sistema
  (`da_verificare`, `altro_entrata`, `investimento`, `rendimento_investimenti`,
  `deposito_scommesse`, `prelievo_scommesse`) — in quel caso non viene eliminato nulla
- **File**: `categorie.routes.js`
- **Frontend**: `CategorieView.vue` (selezione multipla)

### POST /api/categorie/default/ripristina
- **Auth**: Sì
- **Body**: `{ categorie: [{ id, tipo }] }`
- **Risposta**: `{ ripristinate, message }`
- **File**: `categorie.routes.js`

## Budget

### GET /api/budget/:anno/:mese
- **Auth**: Sì
- **Risposta**: `{ budget, categorie[] }` o 404
- **File**: `budget.controller.js`
- **Frontend**: `budget.store.js` → `BudgetView.vue`

### GET /api/budget/:anno/:mese/stato
- **Auth**: Sì
- **Risposta**: `{ categorie[] }` con speso vs budget per categoria
- **File**: `budget.controller.js`
- **Frontend**: `budget.store.js` → `DashboardView.vue`, `BudgetView.vue`

### POST /api/budget
- **Auth**: Sì
- **Body**: `{ mese, anno, importo_totale, categorie[] }`
- **Validazione**: `validateBudget`
- **File**: `budget.controller.js`
- **Frontend**: `BudgetView.vue`

### PUT /api/budget/:id
- **Auth**: Sì
- **Body**: `{ importo_totale?, categorie[]? }`
- **Validazione**: `validateUpdateBudget`
- **File**: `budget.controller.js`
- **Frontend**: `BudgetView.vue`

---

## Obiettivi

### GET /api/obiettivi
- **Auth**: Sì
- **Risposta**: `{ attivi[], completati[] }`
- **File**: `obiettivi.controller.js`
- **Frontend**: `obiettivi.store.js` → `ObiettiviView.vue`

### POST /api/obiettivi
- **Auth**: Sì
- **Body**: `{ nome, importo_target, deadline?, icona? }`
- **Validazione**: `validateObiettivo`
- **File**: `obiettivi.controller.js`
- **Frontend**: `ObiettiviView.vue`

### PUT /api/obiettivi/:id
- **Auth**: Sì
- **Validazione**: `validateUpdateObiettivo`
- **File**: `obiettivi.controller.js`

### DELETE /api/obiettivi/:id
- **Auth**: Sì
- **Validazione**: `validateDeleteObiettivo`
- **File**: `obiettivi.controller.js`

### GET /api/obiettivi/:id/proiezione
- **Auth**: Sì
- **Validazione**: Nessun `validateIdParam`
- **Risposta**: Proiezione completamento obiettivo
- **File**: `obiettivi.controller.js`
- **Frontend**: `obiettivi.store.js`

### POST /api/obiettivi/:id/contributi
- **Auth**: Sì
- **Body**: `{ importo, data, nota? }`
- **Validazione**: `validateContributo`
- **File**: `obiettivi.controller.js`
- **Frontend**: `ObiettiviView.vue`

---

## Scommesse

> Tutte le route: `authMiddleware` + `blockScommesseAccess`

### GET /api/scommesse/panoramica
- **Risposta**: Overview piattaforme e saldi
- **Frontend**: `scommesse.store.js` → `ScommesseView.vue`

### GET /api/scommesse/analisi
- **Query**: `da`, `a`
- **Frontend**: `scommesse.store.js`

### GET /api/scommesse/piattaforme
### POST /api/scommesse/piattaforme
### PUT /api/scommesse/piattaforme/:id
### DELETE /api/scommesse/piattaforme/:id
- **Validazione**: validatePiattaforma/Update/Delete
- **Azione create**: Sync con Conto tipo scommesse
- **Frontend**: `ScommesseView.vue`

### GET /api/scommesse/movimenti
### POST /api/scommesse/movimenti
- **Validazione**: `validateMovimentoScommesse`
- **Frontend**: `ScommesseView.vue`

---

## Investimenti

> Tutte le route: `authMiddleware` + `blockInvestimentiAccess`

### GET /api/investimenti
### POST /api/investimenti
### PUT /api/investimenti/:id
### DELETE /api/investimenti/:id
- **Validazione**: validateInvestimento/Update/Delete
- **Frontend**: `InvestimentiView.vue`

### GET /api/investimenti/analisi
- **Query**: `da`, `a`
- **Frontend**: `investimenti.store.js`

### POST /api/investimenti/:id/movimenti
### GET /api/investimenti/:id/movimenti
- **Validazione**: `validateMovimentoInvestimento`
- **Frontend**: `InvestimentiView.vue`

---

## Analisi

### GET /api/analisi/distribuzione-spese
- **Query**: `da`, `a`
- **Risposta**: `{ categorie[], totale }`
- **Frontend**: `analisi.store.js` → `AnalisiView.vue`

### GET /api/analisi/confronto-mesi
Confronto fra periodi. L'unità segue il periodo scelto nella pagina Analisi.
- **Query**: `unita` (`settimana` | `mese` | `anno`, default `mese`), `quantita` (2–12, default 6)
- **Query alternativa**: `da` + `a` → i mesi toccati dall'intervallo (periodo "Custom"); hanno la precedenza su `unita`/`quantita`
- **Query storica**: `mesi` (2–12) — equivalente a `quantita` con `unita=mese`, mantenuta perché client e API deployano separatamente
- **Risposta**: `{ mesi: [{ chiave, label, labelEsteso, da, a, entrate, uscite, saldo }], unita }`
  (la chiave `mesi` è storica: contiene i periodi qualunque sia l'unità)
- **File**: `analisi.controller.js`, intervalli in `services/confrontoPeriodi.service.js`
- **Frontend**: `analisi.store.js` → `AnalisiView.vue`

### GET /api/analisi/andamento-patrimonio
Un punto per periodo, con la stessa unità del confronto. Il patrimonio è ricostruito
a ritroso dal saldo di oggi: WALLT non conserva uno storico dei saldi.
- **Query**: `unita` (`settimana` | `mese` | `anno`, default `mese`), `quantita` (2–12, default 6)
- **Query alternativa**: `da` + `a` → i mesi toccati dall'intervallo (periodo "Custom")
- **Query storica**: `periodo` (`3m` | `6m` | `1a` | `tutto`), mappato sulle unità nuove
- **Risposta**: `{ punti: [{ data, fine, label, labelEsteso, delta, patrimonio }], unita, min, max, inizio, fine, variazione_importo, variazione_percentuale }`
- **Frontend**: `analisi.store.js` → `DashboardView.vue` (sparkline, 12 settimane), `AnalisiView.vue`

### GET /api/analisi/suggerimenti
- **Risposta**: Suggerimenti automatici basati su dati utente
- **Frontend**: `analisi.store.js` → `AnalisiView.vue`

---

## Importazioni

### POST /api/importazioni/upload
- **Auth**: Sì
- **Rate limit**: importUploadLimiter
- **Body**: multipart/form-data, campo `file` (max 5MB, .csv/.xls/.xlsx/.pdf)
- **Validazione**: magic-byte check post-upload
- **Risposta**: Preview con transazioni categorizzate
- **File**: `importazioni.controller.js`
- **Frontend**: `ImportaView.vue`

### POST /api/importazioni/conferma
- **Auth**: Sì
- **Rate limit**: importConfirmLimiter
- **Body**: `{ conto_id, transactions[] }`
- **Validazione**: `validateImportConferma`
- **Azione**: Crea movimenti in bulk, aggiorna saldo conto
- **File**: `importazioni.controller.js` → `import/ImportService.js`
- **Frontend**: `ImportaView.vue`

---

## Impostazioni

### PUT /api/impostazioni/profilo
- **Body**: `{ nome?, email?, avatar? }` — `avatar` è l'URL della foto Google, non l'immagine caricata
- **Validazione**: `validateUpdateProfilo`
- **Frontend**: `ImpostazioniView.vue`

### PUT /api/impostazioni/avatar
- **Auth**: Sì + avatarLimiter (20 / 15 min per utente)
- **Body**: `{ immagine: "data:image/webp;base64,..." }`
- **Validazione**: `parseAvatarDataUrl` (`utils/avatarImage.js`) — solo `image/webp|jpeg|png`, magic bytes coerenti col mime dichiarato, massimo 256 KB decodificati. SVG rifiutato di proposito.
- **Azione**: salva la versione canonica del data URL in `users.avatar_immagine`; non tocca `users.avatar`
- **Risposta**: `{ user, message }` — lo user completo senza password
- **Frontend**: `ImpostazioniView.vue` (il ridimensionamento a 256×256 avviene nel browser, `utils/avatar.js`)

### DELETE /api/impostazioni/avatar
- **Auth**: Sì + avatarLimiter
- **Azione**: azzera `users.avatar_immagine`; si torna alla foto Google se presente, altrimenti alle iniziali
- **Risposta**: `{ user, message }`
- **Frontend**: `ImpostazioniView.vue`

### PUT /api/impostazioni/password
- **Body**: `{ password_attuale, nuova_password }`
- **Validazione**: `validatePassword`
- **Azione**: Invalida JWT precedenti via `password_changed_at`
- **Frontend**: `ImpostazioniView.vue`

### PUT /api/impostazioni/preferenze
- **Body**: `{ tema?, valuta?, mostra_scommesse?, mostra_investimenti?, reminder? }`
- **Validazione**: `validateUpdatePreferenze`
- **Frontend**: `ImpostazioniView.vue`

### GET /api/impostazioni/esporta
### POST /api/impostazioni/esporta
- **Auth**: Sì + **requireStepUpUnlessOAuth** + exportLimiter
- **Header**: `X-Step-Up-Token` — richiesto **solo** per gli utenti con password locale. Gli account Google esportano con il solo JWT (iterazione 4, vedi `docs/SECURITY.md`).
- **Risposta**: JSON completo dati utente (GDPR export)
- **Frontend**: `ImpostazioniView.vue`

### POST /api/impostazioni/reset-account
- **Auth**: Sì + **requireStepUpUnlessOAuth** (step-up via `verify-password` per gli utenti con password locale; **saltato** per gli account Google — vedi `docs/SECURITY.md`)
- **Header**: `X-Step-Up-Token` — solo utenti locali
- **Body**: `{ password }` (locali) o `{ conferma: "RESETTA" }` (OAuth) — il campo si chiama `conferma`, non `frase`. Per gli account Google la conferma testuale è l'unica barriera oltre al JWT.
- **Validazione**: `validateResetAccount`
- **Azione**: **Unico endpoint standalone di reset.** Implementato da `deleteAllTransactions`: elimina movimenti/operazioni e azzera i saldi dei conti, mantenendo conti, profilo e account. Non esiste un endpoint separato "reset transazioni" — è la stessa operazione.
- **Frontend**: `ImpostazioniView.vue`

### DELETE /api/impostazioni/account
- **Auth**: Sì + **requireStepUpUnlessOAuth** + deleteAccountLimiter (step-up **saltato** per gli account Google)
- **Body**: `{ password }` (locali) o `{ conferma: "ELIMINA" }` (OAuth) — il campo si chiama `conferma`, non `frase`
- **Validazione**: `validateDeleteAccount`
- **Azione**: Cancellazione completa account + dati. Internamente usa `deleteAllUserData` (cancellazione dati finanziari più ampia: scommesse, investimenti, budget, obiettivi) come step prima di eliminare `ProfiloUtente` e `User`. `deleteAllUserData` non è esposta come endpoint standalone.
- **Frontend**: `ImpostazioniView.vue`

---

## Endpoint non utilizzati dal frontend

| Endpoint | Note |
|---|---|
| `GET /api/profilo/budget-suggerito` | Store method esiste, nessuna view lo chiama |
| `GET /api/movimenti/ricorrenti` | Store method esiste, nessuna view lo chiama |

## Incoerenze e problemi API

| Problema | Gravità | Dettaglio |
|---|---|---|
| `reset-account`/`delete-account`/`esporta` senza riverifica identità per gli account Google | High (rischio accettato) | Step-up bcrypt reale per gli utenti locali; per gli account Google `requireStepUpUnlessOAuth` lo salta e resta solo la stringa pubblica `RESETTA`/`ELIMINA` (nessuna conferma sull'export). Scelta esplicita, iterazione 4 — vedi `docs/SECURITY.md` e `docs/DECISIONS.md` |
| ~~`verify-password`/`google/challenge`/`verify-google` senza rate limit dedicato~~ | — | **Risolto**: `stepUpLimiter` (20/15min per utente) |
| Password change policy inconsistente | Low | Register richiede carattere speciale, change password no |
| `GET /obiettivi/:id/proiezione` senza validateIdParam | Low | ID non validato come intero |
| GET endpoints senza query validation | Low | `movimenti`, `analisi`, `bilancio` — parsing difensivo nei controller |
| Nessuna OpenAPI/Swagger spec | Info | Documentazione solo in codice e questi docs |

## Assistenza email

`POST /api/contatto` — **pubblico, senza autenticazione**. Email dichiarata dal
mittente (non verificata), categoria/oggetto/messaggio validati, 3 tentativi ogni
15 minuti per indirizzo IP. Inoltra al supporto segnalando che il mittente non e'
autenticato; non invia alcuna conferma all'indirizzo dichiarato, per non farne un
amplificatore di spam. Solo `POST`, altrimenti `405`.

`POST /api/support` — JWT obbligatorio, categoria/oggetto/messaggio validati,
3 tentativi ogni 15 minuti per utente. Invia la richiesta tramite Resend
e una conferma all'email dell'utente letta dal database. Nessuna tabella ticket
aggiuntiva. Contratto, errori e configurazione: [SUPPORT.md](SUPPORT.md).
