# WALLT — Claude Code Operating Manual

> Manuale operativo per agenti AI che lavorano su questo repository.
> Ultimo aggiornamento: audit repository, agosto 2026.

## Project Overview

**WALLT** è un'applicazione web di gestione finanziaria personale in italiano. Permette di tracciare conti, movimenti, budget, obiettivi, investimenti e scommesse senza collegamento bancario automatico. L'utente inserisce o importa manualmente le transazioni.

Architettura: **SPA Vue 3** (`client/`) + **API REST Node.js/Express** (`server/`) su Vercel + **PostgreSQL Supabase** via Sequelize.

## Tech Stack

### Frontend (`client/`)
| Tecnologia | Versione | Uso |
|---|---|---|
| Vue.js | 3.5 | Framework (Composition API, `<script setup>`) |
| Vite | 8 | Build tool |
| Vue Router | 5 | Routing SPA |
| Pinia | 3 | State management |
| Tailwind CSS | 3.4 | Utility CSS |
| Axios | 1.18 | HTTP client |
| Chart.js + vue-chartjs | 4.5 / 5.3 | Grafici |
| dayjs | 1.11 | Date (locale `it`) |
| lucide-vue-next | 1.0 | Icone |

### Backend (`server/`)
| Tecnologia | Versione | Uso |
|---|---|---|
| Node.js | 22+ / 24+ | Runtime |
| Express | 5.2 | Web framework |
| Sequelize | 6.37 | ORM |
| pg + pg-hstore | 8.x / 2.x | Driver PostgreSQL |
| JWT (jsonwebtoken) | 9.0 | Autenticazione |
| bcrypt | 6.0 | Hash password |
| Passport + passport-google-oauth20 | 0.7 / 2.0 | Google OAuth |
| express-validator | 7.3 | Validazione input |
| express-rate-limit | 8.5 | Rate limiting |
| google-auth-library | 11.x | Verifica ID token Google (step-up OAuth) |
| helmet | 8.2 | Security headers |
| multer | 2.2 | Upload file (import) |
| web-push | 3.6 | Notifiche push del browser (VAPID) |
| node-cron | 4.5 | Spese ricorrenti |
| winston | 3.19 | Logging |
| Resend | 6.17 | Email (reset password) |
| csv-parse, xlsx, pdf-parse | — | Parsing estratti conto |

### Database
- **PostgreSQL Supabase** con Sequelize ORM
- Runtime Vercel sul Transaction Pooler (porta 6543); migrazioni sul Session Pooler (porta 5432)
- Migrazioni via `sequelize-cli` (25 file in `server/migrations/`)
- Auto-migrate all'avvio in `server.js`

### Authentication
- JWT Bearer (7 giorni) per API
- Google OAuth 2.0 (popup, stateless, no session)
- Step-up token (5 min) per operazioni sensibili
- Password reset via Resend + token SHA-256

### Styling
- CSS custom properties (`variables.css`) per dark/light theme
- Tailwind utility classes
- `useTheme.js` sincronizza tema con API e localStorage

### Branding e asset
- **Sorgente ufficiale del brand**: `client/brand-source/originals/` (JPG originali, non serviti pubblicamente, solo riferimento — non ridisegnare/modificare senza nuovi asset ufficiali).
- **Asset derivati usati nell'app**: `client/public/brand/wallt-logo-horizontal.png` (logo orizzontale, sfondo trasparente — usato in sidebar/header dove c'è spazio) e `client/public/brand/wallt-app-icon{,-96}.png` (icona quadrata, sfondo bianco pieno — usata come mark compatto in mobile-header, dashboard-header, pagine auth/onboarding/legal). Il wordmark "WALLT" nel logo è nero: su sfondo scuro va sempre mostrato dentro un contenitore chiaro (`.sidebar__logo-badge`), mai direttamente su superfici dark.
- **Favicon/PWA icons**: generati dall'icona quadrata, in `client/public/` (`favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `icon-192x192.png`, `icon-512x512.png`, `icon-maskable-512x512.png`) + `client/public/manifest.webmanifest`, collegati in `client/index.html`.
- Per rigenerare le icone da un nuovo master: ImageMagick (`brew install imagemagick`), non presente di default nel progetto.

### Servizi esterni (opzionali)
| Servizio | Stato | File |
|---|---|---|
| Resend (email) | Richiesto per reset password | `services/email/EmailService.js` |
| Google OAuth | Opzionale (env-gated) | `config/passport.js` |
| OpenAI | Opzionale (categorizzazione) | `services/import/category/OpenAICategoryClassifier.js` |
| Google Places / Foursquare / OSM | Stub (non implementati) | `services/merchant/lookup/providers/` |
| Web Push (VAPID) | Opzionale: senza `VAPID_*` il centro notifiche in-app funziona lo stesso | `services/notifiche/PushService.js` |

## Repository Structure

```
wallt/
├── client/                 # Frontend Vue 3 + Vite
│   ├── src/
│   │   ├── components/     # UI riutilizzabili (common, dashboard, movimenti, analisi, layout, custom)
│   │   ├── views/          # Pagine (auth, dashboard, conti, movimenti, import, budget, analisi, ecc.)
│   │   ├── stores/         # 12 Pinia stores
│   │   ├── composables/    # useTheme, useOAuthPopup, useValuta, useChartTheme, useNumberCounter
│   │   ├── router/         # Vue Router con guard globali
│   │   └── utils/          # axios, categorie, featureAccess, session, formatters, appIcons
│   └── public/             # oauth-relay.html
├── server/                 # Backend Node.js + Express
│   ├── app.js              # Factory Express (createApp)
│   ├── server.js           # Entry point (DB, cron, listen)
│   ├── config/             # database, sequelize, passport
│   ├── constants/          # categorie.js (whitelist categorie)
│   ├── controllers/        # 13 controller
│   ├── middleware/         # auth, validation, rateLimit, stepUp, featureAccess, errorHandler
│   ├── models/             # 16 modelli Sequelize + index.js (associazioni)
│   ├── migrations/         # 25 migrazioni
│   ├── routes/             # 12 route modules
│   ├── services/           # Business logic (import, merchant, email, reset, sync, cron, notifiche)
│   ├── tests/              # Jest (auth, security, gdpr, profilo, import, categorization, isolation, googleStepUp, financialConsistency, ricorrenti, excelParser, validateEnv)
│   └── utils/              # logger, AppError, ageRestriction, featureAccess, oauthPopup
├── docs/                   # Documentazione tecnica (questa cartella)
├── CLAUDE.md               # Questo file
└── README.md               # Overview prodotto
```

## Architecture

```
Browser (Vue SPA)
    │  Axios (JWT Bearer)
    ▼
Express API (/api/*)
    ├── authMiddleware (JWT)
    ├── featureAccess (scommesse/investimenti)
    ├── validation (express-validator)
    ├── rateLimit
    └── Controllers → Services → Sequelize → PostgreSQL/Supabase
```

- **Monorepo** con frontend e backend separati ma nello stesso repository.
- **Nessun SSR**: il frontend è una SPA statica servita da Vite.
- **Nessun WebSocket**: comunicazione solo REST.
- **Cron**: su Vercel è Vercel Cron che chiama `GET /api/cron/ricorrenti` e `GET /api/cron/notifiche` con `Authorization: Bearer $CRON_SECRET`; `node-cron` resta solo per il server locale (`server.js`). Il job notifiche è idempotente. **L'esecuzione oraria vera è su GitHub Actions** (`.github/workflows/notifiche-cron.yml`, ogni ora al minuto 5, richiede il secret `CRON_SECRET` sul repository): con un solo passaggio giornaliero l'`orario_promemoria` scelto dall'utente non sarebbe rispettato, perché tutto verrebbe consegnato quando passa il job. Il cron Vercel giornaliero (`0 19 * * *` UTC) resta come rete di sicurezza.
- **Import pipeline duale**: `services/import/` (core) + `services/importazioni/` (nuova pipeline con detector/parser bancari).

## Important Business Rules

1. **Saldo conti**: aggiornato atomicamente su create/update/delete movimenti e trasferimenti. `deltaSaldo(tipo, importo)` = entrata `+importo`, uscita `-importo`.
2. **Trasferimenti interni** (`tipo: 'trasferimento'`): non contano come spesa/entrata. Creano un singolo `Movimento` con `conto_id` + `conto_destinazione_id`. Aggiornano saldi di entrambi i conti in transazione DB.
3. **Categoria `trasferimento_denaro`** (uscita): diversa dal tipo movimento `trasferimento`. Serve a categorizzare bonifici/P2P verso altre persone.
4. **Soft-delete conti**: `attivo: false` invece di eliminazione fisica. Creazione conto con stesso nome riattiva conto inattivo.
5. **Scommesse ↔ Conti sync**: creazione piattaforma scommesse crea/aggiorna un `Conto` tipo `scommesse` e viceversa (`scommesseContoSync.service.js`).
6. **Onboarding obbligatorio**: utente non può accedere alle pagine protette finché `profilo.onboarding_completato` non è true.
7. **Restrizioni minori** (`fascia_eta === 'under_18'`): blocco accesso a scommesse e investimenti (frontend + backend).
8. **Feature flags utente**: `mostra_scommesse`, `mostra_investimenti` controllano visibilità UI (oltre alle restrizioni profilo).
9. **Reset account** (`POST /api/impostazioni/reset-account`): **unico endpoint standalone** di reset, implementato da `deleteAllTransactions`. Elimina solo movimenti/operazioni e azzera i saldi dei conti, mantenendo conti, profilo e account utente. Non esiste un endpoint separato "reset transazioni": è la stessa operazione. **Delete account** (`DELETE /api/impostazioni/account`) è l'unica operazione che elimina anche l'utente stesso; usa internamente `deleteAllUserData` (cancellazione dati finanziari più ampia — scommesse, investimenti, budget, obiettivi) come step interno della cancellazione completa, ma `deleteAllUserData` **non è esposta come endpoint standalone**.
10. **Categorizzazione import**: pipeline a cascata (Revolut → regole merchant personali → regole utente → regole globali → matcher a parole chiave legacy → storico → AI locale). OpenAI (opzionale) non è uno step sequenziale: viene applicato in post-processing, in batch, solo ai risultati con confidenza bassa (<55). Il fallback a categoria generica scatta solo per dati di input mancanti, non come step finale della cascata.
11. **Spese ricorrenti**: cron giornaliero 09:00 Europe/Rome, ma **solo frequenza `mensile`** è processata.
12. **Patrimonio totale**: somma saldi conti attivi + investimenti attivi.
13. **JWT invalidation**: token emessi prima di `password_changed_at` vengono rifiutati.
14. **Notifiche — limite anti-spam**: massimo `max_notifiche_giornaliere` (default 2) notifiche "contate" per utente al giorno, di cui **al più una `normale`**: il secondo slot è riservato alle `urgente` (budget superato, pagamento imminente, sicurezza). Oltre il limite la notifica viene comunque creata ma con `conta_nel_limite = false` e canale `in_app`: resta nel centro notifiche e non genera push. Il promemoria giornaliero fa eccezione e viene **saltato** (consegnarlo il giorno dopo non avrebbe senso).
15. **Notifiche — deduplica**: ogni notifica ha una `dedupe_key` (`userId` implicito + tipo + riferimento + periodo) con UNIQUE su `(user_id, dedupe_key)`. È il vincolo che rende il cron sicuro da rieseguire a qualunque frequenza.
16. **Notifiche — fuso orario e ore di silenzio**: limite giornaliero, orario del promemoria e ore di silenzio sono calcolati nel fuso dell'utente (default `Europe/Rome`), mai in quello del processo (che su Vercel è UTC). Una notifica generata nelle ore di silenzio (default 22:00→08:00) non viene persa: `programmata_per` slitta al primo orario consentito e la notifica resta invisibile fino ad allora.
17. **Notifiche — privacy**: il payload push non contiene mai importi, saldi o categorie: solo titolo, una frase generica per tipo e la route da aprire. I dettagli si vedono in app, dopo il login.
18. **Categorie eliminabili per utente**: le predefinite stanno in un catalogo statico condiviso (`constants/catalogoCategorie.json`) e non sono cancellabili. L'utente può però eliminarle *per sé*: una riga in `categorie_default_nascoste` le marca `attiva: false` in `categorie.service.list()`. Da lì l'esclusione si propaga da sola — `CategoryMatcherService._finalize` scarta ogni risultato non presente in `list(userId)` e ripiega su `da_verificare`, quindi la cascata non può riassegnare una categoria eliminata. Lo storico resta leggibile perché `list(..., { includeArchived: true })` continua a restituirla. **Non serve toccare i singoli step della cascata**: la giuntura è una sola.
19. **Categorie di sistema**: `CATEGORIE_SISTEMA_IDS` (`da_verificare`, `altro_entrata`, `investimento`, `rendimento_investimenti`, `deposito_scommesse`, `prelievo_scommesse`) non sono eliminabili, perché WALLT le scrive da sé (fallback import, saldo iniziale conto, movimenti investimenti e scommesse). Chi aggiunge un punto in cui il codice crea un movimento con una categoria fissa deve aggiungerla a quell'elenco. `trasferimento_denaro` non è di sistema: nessuno la scrive in automatico.

## Authentication

- **Registrazione**: email/password + consenso privacy/termini obbligatorio. Crea `User` + `ProfiloUtente`.
- **Login**: bcrypt compare → JWT 7 giorni.
- **Google OAuth**: popup flow → `oauth-relay.html` / `AuthCallbackView` → postMessage → `completeOAuthLogin`. Un login Google si collega automaticamente (`google_id`) a un account esistente con la stessa email **solo se** quell'account non ha già una password locale — altrimenti l'auto-collegamento viene rifiutato (`google_account_exists_local`), per evitare account pre-hijacking (vedi `docs/SECURITY.md`, `googleAuth.service.js`).
- **Protezione route**: `authMiddleware` su tutte le API tranne auth pubbliche.
- **Step-up**: JWT WALLT già autenticato → riverifica identità recente → `step_up_token` (JWT, 5 min, `type: step_up`) → header `X-Step-Up-Token` per operazioni sensibili (`reset-account`, `delete-account`, `esporta`). Il middleware sulle tre rotte è **`requireStepUpUnlessOAuth`**, non `requireStepUp`:
  - **Utenti con password locale**: step-up richiesto. `POST /api/auth/verify-password` → `bcrypt.compare` sulla password reale.
  - **Utenti Google OAuth** (senza password): ⚠️ **step-up SALTATO** (iterazione 4, scelta esplicita dell'utente). L'unica barriera oltre al JWT è la conferma testuale `ELIMINA`/`RESETTA` validata dai controller — l'export non ha nemmeno quella. Le stringhe sono pubbliche: non sono autenticazione.
  - Il meccanismo di ri-autenticazione Google (`POST /api/auth/google/challenge`, `POST /api/auth/verify-google`, `googleStepUp.service.js`, `client/src/composables/useGoogleStepUp.js`) è **ancora presente e testato ma non più richiesto**: il composable è codice non usato dalla UI. Non rimuoverlo senza chiedere — è tenuto apposta per poter riattivare lo step-up con una modifica di una riga per rotta.
  - Causa della rimozione: il client OAuth in Google Cloud non ha **origini JavaScript autorizzate**, quindi Google Identity Services risponde `401 invalid_client — no registered origin`. Il redirect URI è invece registrato (il login Google funziona).
- Vedi `docs/SECURITY.md` (rischio accettato, come richiudere il gap) e `docs/DECISIONS.md` per la storia completa (implementata → rimossa → reimplementata → rimossa).

## Database

14 tabelle principali + 2 tabelle regole (categorie, merchant) + `categorie_personali` e `categorie_default_nascoste`. Vedi `docs/DATABASE.md`.

Entità core: `users` → `conti` → `movimenti`. Entità satellite: budget, obiettivi, scommesse, investimenti, regole categorizzazione.

## API

~75 endpoint REST sotto `/api/*` (incluse le 7 rotte `/api/categorie` e le due dello step-up Google, `POST /api/auth/google/challenge` e `POST /api/auth/verify-google`). Vedi `docs/API.md` per inventario completo.

Comunicazione: Axios con `baseURL = VITE_API_URL` normalizzato da `client/src/config/api.js` (default `http://localhost:3000/api`), header `Authorization: Bearer <token>`.

Configurazione DB: `server/config/database.js` accetta `DATABASE_URL` **oppure** i parametri `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`, mai una miscela dei due. La verifica TLS è attiva di default (`DATABASE_SSL_CA` per il root cert Supabase).

## Coding Rules

1. Prima di modificare codice, comprendere l'implementazione esistente.
2. Identificare tutti i file coinvolti (controller, service, model, store, view, validation).
3. Non riscrivere architettura funzionante senza necessità.
4. Preferire modifiche piccole e sicure.
5. Non introdurre dipendenze inutili.
6. Non duplicare logica già esistente (attenzione: import ha due layer `import/` e `importazioni/`).
7. Rispettare naming convention e struttura attuale (italiano per messaggi utente, inglese per codice).
8. Verificare possibili regressioni su saldi, trasferimenti, sync scommesse-conti.
9. Eseguire `npm test` in `server/` quando si modificano API o middleware.
10. Segnalare chiaramente tutti i file modificati.
11. Non modificare funzionalità non collegate al task.
12. Non eliminare codice apparentemente inutilizzato senza verificarne l'utilizzo (es. `minorRestriction.middleware.js`).
13. Verificare sempre autenticazione, autorizzazione e validazione quando si modificano API.
14. Preservare retrocompatibilità quando possibile.
15. Le categorie di movimento sono definite in `server/constants/categorie.js` (backend) e `client/src/utils/categorie.js` (frontend) — aggiornare entrambi.
16. Non confondere `tipo: 'trasferimento'` (movimento) con categoria `trasferimento_denaro` (uscita).

## Sensitive Areas

| Area | Perché è delicata | File chiave |
|---|---|---|
| **Gestione saldo** | Ogni movimento modifica `Conto.saldo` in transazione | `movimenti.controller.js`, `conti.controller.js` |
| **Trasferimenti** | Doppio aggiornamento saldo + sync scommesse | `conti.controller.js` (`trasferimento`) |
| **Import estratti conto** | Crea movimenti in bulk, aggiorna saldi, categorizzazione AI | `import/ImportService.js`, `importazioni/` |
| **Reset/Delete account** | Operazioni distruttive irreversibili | `accountReset.service.js`, `impostazioni.controller.js` |
| **OAuth popup** | Flusso multi-window con postMessage e relay | `oauthPopup.js`, `useOAuthPopup.js`, `oauth-relay.html` |
| **Scommesse ↔ Conti sync** | Bidirezionale, può creare/eliminare conti | `scommesseContoSync.service.js` |
| **Categorizzazione** | Whitelist in 6+ file server + frontend. `categorie.service.list()` è l'unico filtro che tiene fuori dalla cascata le categorie eliminate dall'utente: cambiarne la semantica le fa riapparire ovunque | `constants/categorie.js`, `categorie.service.js`, `CategoryMatcherService.js` |
| **Cron ricorrenti** | Crea movimenti automaticamente ogni giorno | `ricorrenti.service.js` |
| **Migrazioni DB** | Auto-run all'avvio SOLO fuori produzione (disabilitato quando `NODE_ENV=production`, vedi `RUN_MIGRATIONS_ON_BOOT`); 25 file con possibili duplicati. Su Supabase si lanciano a mano con `npm run migrate:production` (`NODE_ENV=migration` + `DATABASE_MIGRATION_URL`) | `server.js`, `migrations/` |
| **Feature access minori** | Logica duplicata frontend/backend | `featureAccess.js` (client + server), `ageRestriction.js` |
| **Notifiche** | Regole anti-spam, deduplica e fuso orario: una modifica sbagliata trasforma il sistema in spam. Il calcolo del budget è condiviso con l'API budget | `services/notifiche/`, `services/budgetStato.service.js` |
| **Hook budget post-movimento** | `valutaBudgetDopoMovimento` è chiamata (awaited) dopo il commit in `createMovimento`/`updateMovimento` e dopo l'import: deve restare fuori dalla transazione e non lanciare mai | `movimenti.controller.js`, `importazioni.controller.js`, `NotificheGenerator.js` |

## Known Issues

1. **Dual import architecture**: `services/import/` e `services/importazioni/` con re-export — rischio di modificare il file sbagliato.
2. ~~**Cron ricorrenti processa solo `mensile`**~~ — **Risolto**: API/validazione ora accettano solo `ricorrente_frequenza: 'mensile'` (l'unica realmente processata dal cron), coerente con la UI. La colonna DB resta un ENUM a 4 valori per retrocompatibilità con eventuali righe storiche, ma non è più possibile crearne di nuove con `giornaliera`/`settimanale`/`annuale`. Corretto anche un bug per cui il controllo anti-duplicazione del cron confrontava la descrizione sbagliata e non preveniva mai un doppio addebito in caso di doppia esecuzione nello stesso giorno (vedi `docs/SECURITY.md`).
3. **Merchant lookup providers**: tutti stub (Google Places, Foursquare, OSM).
4. **Codice morto**: `minorRestriction.middleware.js`, componenti dashboard non usati, `PlaceholderView.vue`.
5. ~~**`.env.test` non in `.gitignore`**~~ — **Risolto**: aggiunto a `.gitignore` e rimosso dal tracking git. Era stato committato in 2 commit con una password DB reale (locale/dev): quella password va considerata compromessa e ruotata prima del lancio (MANUAL ACTION, vedi `docs/SECURITY.md`).
6. **Operazioni distruttive senza riverifica di identità per gli account Google** (rischio accettato esplicitamente, iterazione 4): `reset-account`, `delete-account` ed `esporta` richiedono lo step-up solo agli utenti con password locale. Per gli account Google bastano JWT + stringa pubblica. Da richiudere prima della produzione: registrare l'origin JavaScript in Google Cloud e rimettere `requireStepUp` sulle tre rotte in `impostazioni.routes.js`. Vedi Authentication, `docs/SECURITY.md` e `docs/DECISIONS.md`.
7. **Test coverage**: 33 suite — 407 test (fra cui `categorieDefault` per l'eliminazione per-utente delle predefinite, `confrontoPeriodi` per gli intervalli dei periodi nelle Analisi e `analisiConfronto` per i due endpoint che li usano). Isolamento cross-user, coerenza saldi/movimenti/trasferimenti (incluse race condition), step-up Google, cron ricorrenti e config produzione coperti. Non coperti: budget/obiettivi/investimenti/scommesse a livello di logica di business (solo isolamento).
8. **Migrazioni duplicate**: `add-social-auth` e `add_auth_provider` fanno cose simili.
9. **Session reset incompleto**: logout non pulisce `recentiHome` nello store `movimenti`, né i campi `panoramica`/`analisi` interni allo store `scommesse`. Lo store `analisi` principale viene invece resettato correttamente.
10. ~~**Nessuna CI/CD**~~ — **Risolto**: `.github/workflows/ci.yml` esegue test backend con un service container PostgreSQL + test/build frontend su ogni push/PR su `main`.

## Current Roadmap

Vedi `docs/PROJECT_STATUS.md` sezione Roadmap per priorità P0–P3.

Priorità immediate:
- P0: nessuna azione codice residua — restano solo azioni infrastrutturali (rotazione password DB, config produzione, Google Cloud, backup), vedi `docs/PROJECT_STATUS.md`
- P1: Test di logica di business su budget/obiettivi/investimenti/scommesse (oggi coperti solo per isolamento)
- P2: Consolidare import pipeline, rimuovere codice morto, verifica email alla registrazione
- P3: Apple OAuth, 2FA, merchant lookup reali

## Before modifying code

1. Read `CLAUDE.md`.
2. Read the relevant documentation in `/docs`.
3. Inspect the existing implementation.
4. Identify affected files.
5. Understand possible side effects (saldi, sync, categorie).
6. Implement the smallest safe change.
7. Run available validation: `cd server && npm test` (richiede PostgreSQL); `npm run test:unit` esegue solo le suite che non toccano il database.
8. Review the diff.
9. Report what changed and any remaining risks.
