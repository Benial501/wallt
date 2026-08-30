# WALLT — Architectural Decisions

> Decisioni architetturali dedotte dal codice del repository.
> Non tutte sono documentate esplicitamente — inferite da pattern e implementazione.

---

## Decision: Monorepo frontend + backend

### Context
Frontend Vue e backend Express nello stesso repository Git, con cartelle separate `client/` e `server/`.

### Current implementation
- `client/` e `server/` hanno `package.json` separati.
- Nessun workspace manager (no npm workspaces, no lerna).
- Deploy indipendente: frontend buildato come static files, backend come processo Node.

### Advantages
- Semplice da clonare e sviluppare.
- Un solo repo da versionare.
- Condivisione contesto tra frontend e backend.

### Disadvantages
- Nessuna condivisione tipi/interfaces tra client e server.
- Due `node_modules` separati.
- Deploy richiede due target distinti.

### Should it be changed?
**NO** — Adeguato per la dimensione attuale del progetto. Cambiare porterebbe complessità senza beneficio immediato.

---

## Decision: JWT stateless (no session, no refresh token)

### Context
Autenticazione API basata su JWT Bearer senza sessioni server-side.

### Current implementation
- Token JWT 7 giorni con payload `{ userId, auth_provider }`.
- Salvato in `localStorage` (`wallt_token`).
- Invalidazione solo su cambio password (`password_changed_at`).
- Step-up token separato (5 min) per operazioni sensibili.

### Advantages
- Semplice, scalabile orizzontalmente (no session store).
- Nessun Redis/database per sessioni.

### Disadvantages
- Token rubato valido fino a scadenza (7 giorni).
- Nessun refresh — utente deve ri-loggarsi.
- Revoca token impossibile senza cambio password.

### Should it be changed?
**MAYBE** — Per produzione con utenti reali, considerare refresh token rotation. Non urgente per beta.

---

## Decision: Step-up Google — implementato, rimosso, reimplementato, poi rimosso di nuovo

### Context
Le operazioni sensibili (reset-account, delete-account, export dati) richiedono `requireStepUp`. Per gli utenti locali lo step-up verifica bcrypt sulla password reale. Per gli utenti Google OAuth (senza password) l'alternativa più semplice è accettare una stringa pubblica concordata (CONFERMA/ELIMINA/RESETTA) — non una vera autenticazione, solo una conferma testuale.

### Iterazione 1 — vera ri-autenticazione
Progettata e implementata una vera ri-autenticazione crittografica: `POST /api/auth/google/challenge` (nonce 192 bit in un JWT "challenge", 2 minuti, legato a `req.userId`) → Google Identity Services (pulsante "Continua con Google" esplicito, no One Tap) → `POST /api/auth/verify-google` (verifica l'ID token con `google-auth-library`: firma, audience, issuer, scadenza, nonce, freschezza, single-use del challenge, `payload.sub === user.google_id`).

### Iterazione 2 — rimozione su richiesta esplicita
L'utente ha richiesto di rimuovere la verifica Google per tornare a "digita RESETTA/ELIMINA", mantenendo lo step-up reale solo per gli utenti locali. Motivazione dichiarata: semplicità, evitare la configurazione Google Cloud. Il rischio (riapertura del gap chiuso nell'iterazione 1) è stato segnalato esplicitamente prima di procedere, con 4 opzioni proposte; l'utente ha scelto la rimozione mantenendo lo step-up reale locale.

### Iterazione 3 — reimplementazione per il final production hardening
In una sessione successiva, esplicitamente inquadrata come "final production hardening" prima di affidare l'app a utenti reali con dati finanziari, l'utente ha richiesto di ripristinare la vera ri-autenticazione Google per lo step-up, con lo stesso design dell'iterazione 1, e di rimuovere le frasi pubbliche come meccanismo di autenticazione (restano solo conferme testuali UX). Motivazione: a differenza della richiesta di semplificazione dell'iterazione 2, qui la priorità esplicita è la sicurezza dei dati finanziari reali prima del lancio, e la complessità della configurazione Google Cloud è stata giudicata accettabile a fronte del rischio (accesso Google rubato/JWT rubato → compromissione dati finanziari senza barriera reale).

Reimplementazione (ricostruita da zero, il design dell'iterazione 1 era stato interamente rimosso dal codice):
- `server/services/googleStepUp.service.js`: `generateChallenge`, `verifyGoogleStepUp`, tracking single-use in-memory dei nonce, `OAuth2Client` di `google-auth-library` istanziato in modo **lazy** (necessario per testabilità: `setupFilesAfterEnv` di Jest carica l'intero require-tree di `app.js` prima che il `jest.mock()` del singolo file di test abbia effetto).
- `server/controllers/googleStepUp.controller.js` + route `POST /api/auth/google/challenge` e `POST /api/auth/verify-google` in `auth.routes.js`, protette dal nuovo `stepUpLimiter`.
- `verifyPassword.controller.js`: rimossa `OAUTH_STEP_UP_PHRASES`; un utente Google che chiama `verify-password` riceve 400 (`code: 'google_stepup_required'`).
- `client/src/composables/useGoogleStepUp.js` (ricostruito): carica lo script Google Identity Services, ottiene il challenge, renderizza il pulsante ufficiale, scambia l'ID token con lo step_up_token.
- `client/src/views/ImpostazioniView.vue`: i tre modali (step-up generico/reset/delete) mostrano di nuovo il pulsante Google per gli account OAuth invece del solo campo testuale.
- `client/.env.example`: `VITE_GOOGLE_CLIENT_ID` ripristinato.

### Iterazione 4 — rimozione definitiva su richiesta esplicita (stato attuale)

**Causa scatenante, tecnica e verificata.** Testando l'app, lo step-up Google falliva con `Errore 401: invalid_client — no registered origin`. Diagnosi: il client OAuth in Google Cloud ha il **redirect URI** registrato (il login Google infatti funziona, verificato aprendo `/api/auth/google`: Google mostra la normale schermata "Continua su wallt") ma **nessuna origine JavaScript autorizzata**, che è ciò che Google Identity Services valida. Lo step-up era quindi inutilizzabile in pratica, non per un bug del codice.

Nota: prima di questa diagnosi era stato corretto un bug CSP indipendente (`connect-src` con path senza slash finale in `client/index.html`) che bloccava *tutte* le chiamate XHR, incluso `POST /api/auth/google/challenge`. Risolto quello, il fallimento residuo era la configurazione Google Cloud.

**Decisione dell'utente.** Poste tre opzioni — (A) registrare l'origin in Google Cloud, ~5 minuti, mantenendo la sicurezza; (B) rimuovere la verifica Google; (C) cancellare l'account direttamente dal DB di sviluppo — l'utente ha scelto **B**, con ambito **tutte e tre le operazioni sensibili** (delete account, reset transazioni, export dati), scelto esplicitamente in una domanda precedente.

**Implementazione** (meccanismo: salto dello step-up, non frase pubblica che genera un token):
- `server/middleware/stepUp.middleware.js`: nuovo `requireStepUpUnlessOAuth`. Salta lo step-up quando l'utente non ha una password locale utilizzabile (`isOAuthProvider(auth_provider) || !user.password`), altrimenti delega a `requireStepUp` invariato. Criterio basato sulla password e non sul solo `auth_provider`, così un account Google che in futuro impostasse una password tornerebbe automaticamente sotto step-up reale.
- `server/routes/impostazioni.routes.js`: le tre rotte usano `requireStepUpUnlessOAuth`.
- I controller `deleteAccount`/`resetAccount` **non sono stati toccati**: gestivano già il ramo OAuth con la sola conferma testuale.
- `client/src/views/ImpostazioniView.vue`: rimossi i tre contenitori del pulsante Google e i tre watcher; i modali reset/delete mostrano ora un pulsante esplicito abilitato dalla conferma testuale; l'export per gli account OAuth parte senza aprire il modale di verifica.
- **Scelta deliberata**: backend Google step-up (`googleStepUp.service.js`, `googleStepUp.controller.js`, le due rotte) e `client/src/composables/useGoogleStepUp.js` sono stati **mantenuti**, non cancellati. Il composable è ora codice non usato dalla UI. Motivo: l'iterazione 2 aveva cancellato tutto e l'iterazione 3 ha dovuto ricostruirlo da zero; mantenendolo, riattivare è una modifica di una riga per rotta.

**Perché non la frase pubblica come generatore di step_up_token** (design dell'iterazione 2): avrebbe prodotto la stessa sicurezza effettiva ma con più codice e una protezione solo apparente. Saltare esplicitamente lo step-up rende il trade-off leggibile nel codice.

### Stato del rischio
**Riaperto e accettato esplicitamente.** Per gli account Google le tre operazioni distruttive sono protette dal solo JWT più una stringa pubblica (`ELIMINA`/`RESETTA`; l'export non ha nemmeno quella). Chi ottiene un JWT valido può esportare tutti i dati, azzerare le transazioni ed eliminare l'account senza possedere le credenziali Google. Gli account con password locale mantengono lo step-up bcrypt reale, invariato.

Verificato con 18 test in `server/tests/googleStepUp.test.js`: il meccanismo Google resta coperto (nonce, sub, freschezza, single-use del challenge), due test sulla non-trasferibilità dello step-up sono stati ri-targettizzati sugli utenti locali — gli unici ancora soggetti — e 4 test nuovi fissano il comportamento attuale (Google reset/delete senza step-up, conferma errata comunque rifiutata, utenti locali ancora sotto step-up). Suite completa: 12 suite, 125 test.

### Should it be changed?
**Sì, se e quando l'app va in produzione con dati reali.** Il gap si richiude in due passi: registrare `http://localhost:5173` e il dominio di produzione tra le **origini JavaScript autorizzate** del client OAuth in Google Cloud, poi rimettere `requireStepUp` al posto di `requireStepUpUnlessOAuth` sulle tre rotte e ripristinare il pulsante Google nei modali. La lezione delle iterazioni 1→2→3→4 è che questa protezione viene rimossa ogni volta che la configurazione Google Cloud diventa un ostacolo pratico: se si vuole che regga, va configurata l'origin una volta per tutte.

---

## Decision: MySQL con Sequelize ORM

### Context
Database relazionale per dati finanziari strutturati con relazioni utente→conti→movimenti.

### Current implementation
- MySQL 8 con Sequelize 6.
- 15 modelli, 16 migrazioni.
- Auto-migrate all'avvio server **solo fuori produzione** (vedi decisione dedicata sotto); in produzione le migrazioni sono uno step di deploy separato.
- Transazioni DB con row-level locking (`SELECT ... FOR UPDATE`) per operazioni su saldo — verificato con test di race condition (`server/tests/financialConsistency.test.js`).

### Advantages
- Relazioni ben definite, transazioni ACID per saldi.
- Sequelize migrations per evoluzione schema.
- MySQL diffuso e economico da hostare.

### Disadvantages
- Sequelize overhead vs query raw.
- ~~Auto-migrate rischioso in produzione multi-istanza~~ — **Risolto** (vedi decisione dedicata sotto).
- Migrazioni duplicate (auth_provider).

### Should it be changed?
**NO** — Scelta corretta per dati finanziari relazionali.

---

## Decision: Auto-migrate disabilitato in produzione

### Context
`server.js` eseguiva `npx sequelize-cli db:migrate` a ogni avvio del processo, in qualunque ambiente. Su un deploy multi-istanza, più processi avviati in parallelo lancerebbero `db:migrate` in concorrenza sullo stesso DB (race condition sullo schema); un `DB_NAME` misconfigurato applicherebbe silenziosamente migrazioni al database sbagliato.

### Current implementation
`shouldAutoMigrate()` in `server.js`: auto-migrate attivo di default quando `NODE_ENV !== 'production'` (comodità dev/test invariata), disattivato di default quando `NODE_ENV === 'production'`. Override esplicito via `RUN_MIGRATIONS_ON_BOOT=true|false` per chi vuole forzare un comportamento specifico consapevolmente. In produzione, le migrazioni vanno eseguite come step di deploy separato (`npx sequelize-cli db:migrate`) prima di avviare il processo applicativo.

### Advantages
- Elimina la race condition su deploy multi-istanza.
- Un `DB_NAME` sbagliato in produzione fa fallire il deploy in modo esplicito (lo step di migrazione fallisce prima che l'app parta) invece di migrare silenziosamente il DB sbagliato.
- Nessuna migrazione DB, comportamento dev/test invariato.

### Disadvantages
- Richiede che chi fa il deploy aggiunga esplicitamente lo step "esegui le migrazioni" alla pipeline di release (documentato nella checklist di produzione — MANUAL ACTION).

### Should it be changed?
**NO** — pattern standard per deploy in produzione con più istanze.

---

## Decision: Saldo denormalizzato su Conto

### Context
Il saldo di ogni conto è memorizzato come campo `Conto.saldo` e aggiornato ad ogni movimento.

### Current implementation
- `createMovimento`: `Conto.saldo += deltaSaldo(tipo, importo)` in transazione.
- `updateMovimento`: ricalcola saldo vecchio e nuovo conto.
- `deleteMovimento`: ripristina saldo.
- `trasferimento`: aggiorna saldi origine e destinazione.
- Import: aggiorna saldo dopo bulk insert.

### Advantages
- Query patrimonio veloce (somma saldi, non ricalcolo da movimenti).
- Performance su dashboard e overview.

### Disadvantages
- Rischio disallineamento saldo se bug in logica aggiornamento.
- Nessun meccanismo di riconciliazione automatica.
- Modifiche a movimenti passati richiedono ricalcolo saldo.

### Should it be changed?
**NO** — Pattern standard per app finanziarie. Mitigare con test su saldo e possibile script di riconciliazione.

---

## Decision: Dual import pipeline

### Context
Due layer di servizi per import estratti conto: `services/import/` (core) e `services/importazioni/` (nuova pipeline con detector/parser bancari).

### Current implementation
- `importazioni/` rileva formato file e banca, delega parsing a parser specifici.
- `importazioni/services/ImportService` wrappa `import/ImportService`.
- `importazioni/services/CategoryMatcher` re-esporta `import/CategoryMatcherService`.
- Categorizzazione, duplicate check, e confirm restano in `import/`.

### Advantages
- Estensibilità: nuovi parser bancari senza toccare il core.
- Separazione detection/parsing da business logic.

### Disadvantages
- Confusione su quale layer modificare.
- Re-export creano dipendenze circolari concettuali.
- Duplicazione di alcuni file (CategoryMatcher, DuplicateChecker, TransactionNormalizer).

### Should it be changed?
**YES** — Consolidare in un unico modulo con adapter per formati bancari. Priorità P2 (dopo test import).

---

## Decision: Categorizzazione a cascata (non ML end-to-end)

### Context
Assegnazione automatica categoria alle transazioni importate o create.

### Current implementation
Pipeline in `CategoryMatcherService._matchSingle`, in ordine effettivo:
1. Regole Revolut (se import Revolut)
2. Regole personali merchant
3. Regole utente (CategorieRegola)
4. Regole globali (CategorieRegola, user_id=null)
5. **Matcher legacy a parole chiave** (`import/CategoryMatcher.js`, es. `esselunga/coop/conad`, `amazon/zalando`, ecc.) — step storico non sempre citato nella documentazione, eseguito dopo le regole globali e prima dello storico
6. Storico movimenti utente (CategoryHistoryMatcher)
7. AI locale (LocalAIClassifier — knowledge base + euristiche)

Il fallback a categoria generica (`altro_uscita`/`altro_entrata`) **non** è un ultimo step della cascata: scatta solo come early-exit quando mancano dati obbligatori in input (tipo/descrizione), prima ancora che la cascata venga eseguita.

OpenAI **non** è uno step sequenziale della cascata: è un **post-processing in batch** (`matchBatch`), applicato solo ai risultati con confidenza bassa (<55) provenienti dai passi precedenti (AI locale, fallback, default), e solo se l'utente ha attivato `use_ai_categorization`.

### Advantages
- Funziona offline senza API esterne.
- Regole utente hanno priorità (learning).
- OpenAI opzionale, non obbligatorio, applicato solo dove serve (bassa confidenza).
- Costo zero per default.

### Disadvantages
- Whitelist categorie in 6+ file da mantenere sincronizzati.
- Qualità categorizzazione dipende da knowledge base statica.
- Coesistenza di un matcher legacy a parole chiave e di regole più moderne (CategorieRegola) può generare ambiguità su quale step ha effettivamente categorizzato una transazione.
- OpenAI inviato solo descrizioni pseudonymizzate ma comunque dati finanziari.

### Should it be changed?
**NO** — Approccio pragmatico e adatto al budget. Migliorare knowledge base e regole nel tempo.

---

## Decision: Scommesse ↔ Conti sync bidirezionale

### Context
Le piattaforme scommesse devono apparire come conti nel patrimonio totale.

### Current implementation
- `scommesseContoSync.service.js`: creazione piattaforma → crea Conto tipo `scommesse`; creazione conto tipo `scommesse` → crea piattaforma.
- `conto_id` FK su `piattaforme_scommesse`.
- Trasferimenti da/verso conto scommesse aggiornano anche saldo piattaforma.

### Advantages
- Patrimonio unificato include scommesse.
- Utente vede scommesse sia in sezione dedicata che in conti.

### Disadvantages
- Logica sync complessa e fragile.
- Modifiche a conti o piattaforme richiedono sync.
- Rischio disallineamento saldi.

### Should it be changed?
**NO** — Funzionalità core richiesta. Mitigare con test di sync e transazioni atomiche (già presenti).

---

## Decision: Feature access duplicata client/server

### Context
Restrizioni su scommesse e investimenti basate su età, questionario e preferenze utente.

### Current implementation
- **Server**: `featureAccess.middleware.js` blocca API; `utils/featureAccess.js` per logica.
- **Client**: `utils/featureAccess.js` nasconde UI; router guard redirect.
- Entrambi implementano: `isMinor()`, `canAccessScommesse()`, `canAccessInvestimenti()`.

### Advantages
- Doppia protezione (UI + API).
- UX immediata (nasconde senza chiamata API).

### Disadvantages
- Logica duplicata, rischio disallineamento.
- Modifiche richiedono aggiornamento in due posti.

### Should it be changed?
**MAYBE** — Backend dovrebbe essere source of truth; frontend dovrebbe leggere flags da `/auth/me`. Non urgente ma da considerare.

---

## Decision: Soft-delete conti

### Context
Eliminazione conti non rimuove fisicamente il record.

### Current implementation
- `DELETE /api/conti/:id` → `attivo: false`.
- Creazione conto con stesso nome riattiva conto inattivo (`findInactiveContoByNome`).
- Movimenti associati restano nel DB.
- Query con `solo_conti_attivi: true` esclude conti inattivi.

### Advantages
- Recupero dati possibile.
- Storico movimenti preservato.
- Riattivazione automatica evita duplicati.

### Disadvantages
- Dati orfani (movimenti su conti inattivi).
- Patrimonio potenzialmente impreciso se non filtrato.

### Should it be changed?
**NO** — Scelta ragionevole per app finanziaria. Documentare comportamento.

---

## Decision: Cron interno per ricorrenti

### Context
Spese ricorrenti devono essere create automaticamente.

### Current implementation
- `node-cron` nel processo Express.
- Schedule: `0 9 * * *` (09:00 Europe/Rome).
- Solo frequenza `mensile` processata.
- Skip se saldo insufficiente (eccetto carte di credito).

### Advantages
- Nessuna infrastruttura aggiuntiva.
- Semplice da implementare.

### Disadvantages
- Se server down alle 09:00, ricorrenti saltate.
- PM2 restart durante cron può causare duplicati (mitigato da check giorno).
- Solo mensile implementato.

### Should it be changed?
**MAYBE** — Per produzione affidabile, considerare job scheduler esterno. Non urgente per beta.

---

## Decision: Vue 3 SPA senza SSR

### Context
Frontend come Single Page Application.

### Current implementation
- Vue 3 + Vite, build statica in `client/dist/`.
- Nessun SSR, nessun Nuxt/Quasar.
- SEO non rilevante (app dietro login).

### Advantages
- Semplice da deployare (static files su CDN).
- Performance buona con Vite.
- Nessuna complessità server-side rendering.

### Disadvantages
- First load dipende da bundle JS.
- Nessun SEO (non rilevante per questa app).

### Should it be changed?
**NO** — SSR non necessario per un'app finanziaria personale dietro autenticazione.

---

## Decision: Tema via CSS custom properties

### Context
Supporto dark/light mode.

### Current implementation
- `variables.css` definisce token per `html.dark` e `html.light`.
- `useTheme.js` applica classe, persiste in localStorage + API.
- Chart.js legge variabili CSS via `useChartTheme.js`.
- Tailwind usato per layout, CSS vars per colori semantici.

### Advantages
- Switch tema istantaneo senza re-render.
- Consistenza tra componenti Vue e Chart.js.
- Persistenza cross-device via API.

### Disadvantages
- Due sistemi di styling (Tailwind + CSS vars).
- `theme-overrides.css` necessario per fix light mode.

### Should it be changed?
**NO** — Approccio solido e funzionante.

---

## Decision: Resend per email (non SMTP diretto)

### Context
Invio email per reset password.

### Current implementation
- `EmailService.js` usa SDK Resend.
- Sandbox mode: redirect email a `RESEND_SANDBOX_EMAIL`.
- Template in `templates/PasswordResetTemplate.js`.
- Password reset token SHA-256 in DB.

### Advantages
- API semplice, deliverability gestita.
- Free tier generoso (3000 email/mese).
- Nessun server SMTP da configurare.

### Disadvantages
- Dipendenza da servizio esterno.
- Dominio deve essere verificato su Resend per produzione.

### Should it be changed?
**NO** — Scelta pragmatica per startup/beta.

---

## Decision: Whitelist categorie (non ENUM DB)

### Context
Categorie movimento (cibo_spesa, bollette, ecc.) non sono ENUM nel database.

### Current implementation
- `categoria` è `STRING(100)` nel DB.
- Whitelist in `server/constants/categorie.js` (backend) e `client/src/utils/categorie.js` (frontend).
- Validazione: `notEmpty()` ma non `isIn()` su categoria.
- AI classifiers hanno propria whitelist.

### Advantages
- Aggiungere categorie senza migrazione DB.
- Flessibilità per categorie custom/import.

### Disadvantages
- Sincronizzazione manuale tra 6+ file.
- Categoria non valida può essere salvata nel DB (nessun vincolo).

### Should it be changed?
**MAYBE** — Centralizzare whitelist e aggiungere validazione `isIn()` su API. Non urgente.

---

## Decision: Express 5 (non 4)

### Context
Framework HTTP backend.

### Current implementation
- Express 5.2.1 (`server/package.json`).
- Express 5 ha breaking changes rispetto a 4 (routing, error handling).

### Advantages
- Versione più recente con miglioramenti async.
- Supporto nativo promise rejection in middleware.

### Disadvantages
- Express 5 ancora relativamente nuovo.
- Meno risorse/community rispetto a Express 4.
- Alcune middleware di terze parti potrebbero non essere compatibili.

### Should it be changed?
**NO** — Già in uso e funzionante. Downgrade a Express 4 non porterebbe benefici.
