# WALLT — Architecture

> Documentazione architetturale basata sul codice del repository (audit agosto 2026).

## 1. Architettura generale

WALLT è un'applicazione **monorepo** con frontend SPA e backend API REST nello stesso repository Git.

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (SPA)                         │
│  Vue 3 + Vite + Pinia + Vue Router + Tailwind           │
│  localStorage: wallt_token, wallt_user, wallt_theme     │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS / HTTP
                       │ Axios (JSON, Bearer JWT)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Express 5 API Server (Node.js)                │
│  Porta: 3000 (default)                                   │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐  │
│  │ Helmet  │ │   CORS   │ │ RateLimit │ │ Passport  │  │
│  └─────────┘ └──────────┘ └───────────┘ └───────────┘  │
│  ┌─────────────────────────────────────────────────┐    │
│  │ authMiddleware → featureAccess → validation      │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         ▼                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Controllers (13) → Services → Sequelize ORM      │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         ▼                                │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │Supabase  │  │ Vercel Cron  │  │ Resend (email)  │   │
│  │PostgreSQL│  │ (ricorrenti) │  │ OpenAI (opt.)   │   │
│  └──────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Caratteristiche architetturali
- **Nessun containerizzazione** (no Docker, no docker-compose nel repo).
- **CI/CD di base**: `.github/workflows/ci.yml` (test backend + build frontend su push/PR verso `main`).
- **Nessun caching layer** (no Redis).
- **Nessun message queue**.
- **Cron serverless**: Vercel invoca una rotta autenticata una volta al giorno; `node-cron` resta solo per l'avvio locale tradizionale.
- **Migrazioni automatiche** all'avvio server SOLO fuori produzione (`server.js`, gated da `NODE_ENV`/`RUN_MIGRATIONS_ON_BOOT`); in produzione sono uno step di deploy separato.

## 2. Frontend

### Stack
Vue 3 Composition API (`<script setup>`), Vite 8, Pinia 3, Vue Router 5, Tailwind 3, Axios, Chart.js, dayjs, lucide-vue-next.

### Struttura
```
client/src/
├── main.js              # Bootstrap: Pinia, Router, theme init
├── App.vue              # Root: RouterView + WToast
├── router/index.js      # 19 route + guard globali
├── stores/              # 12 Pinia stores
├── views/               # 19 pagine (5 auth + 14 app)
├── components/
│   ├── common/          # WCard, WButton, WModal, WToast, WSkeleton, CategoryIcon
│   ├── layout/          # AppLayout (sidebar + bottom nav), BottomSheet
│   ├── dashboard/       # DashboardHeader, RecentTransactions (+ 4 componenti non usati)
│   ├── movimenti/       # MovimentoForm, MovimentoItem
│   ├── analisi/         # SuggerimentoCard, AnalisiMovimentoRow
│   └── custom/          # WOverviewCarousel (carousel principale dashboard)
├── composables/         # useTheme, useOAuthPopup, useValuta, useChartTheme, useNumberCounter
├── utils/               # axios, categorie, featureAccess, session, formatters, appIcons
└── assets/styles/       # variables.css, main.css, animations.css, theme-overrides.css
```

### Routing
- **Layout wrapper**: `AppLayout.vue` per tutte le route autenticate (`/` → children).
- **Guard globali** (`router/index.js`):
  - Token hydration con timeout 8s
  - Background `fetchMe` max ogni 60s
  - Redirect login se non autenticato
  - Redirect onboarding se incompleto
  - Feature gate scommesse/investimenti
- **Nessun lazy loading esplicito** per componenti (import dinamico `() => import(...)`).

### Gestione stato (Pinia)
| Store | Responsabilità |
|---|---|
| `auth.store` | User, token, login/logout, OAuth, feature access computed |
| `conti.store` | Conti, patrimonio, CRUD, trasferimenti |
| `movimenti.store` | Movimenti per data, recenti home, bilancio mese, CRUD |
| `budget.store` | Budget corrente, stato vs spesa |
| `obiettivi.store` | Obiettivi attivi/completati, contributi |
| `scommesse.store` | Piattaforme, movimenti, panoramica, analisi |
| `investimenti.store` | Portafoglio, movimenti, analisi, rendimenti |
| `analisi.store` | Distribuzione spese, confronto mesi, patrimonio, suggerimenti |
| `importazioni.store` | Preview import, upload, conferma |
| `profilo.store` | Profilo finanziario, budget suggerito |
| `ui.store` | Form movimento globale (entrata/uscita/trasferimento) |
| `toast.store` | Notifiche toast |

### Stato delle letture: `creaRisorsa` + `DataState`

Nasce da un difetto concreto: più store azzeravano i dati nel gestore dell'errore (`catch { lista.value = [] }`), e la vista mostrava lo stato vuoto — "Nessun budget per settembre" in `BudgetView`, "Aggiungi il tuo primo conto" in `ContiView` — al posto di un errore di rete. L'utente leggeva una perdita di dati dove c'era solo una richiesta fallita.

**`client/src/utils/risorsa.js`** — la factory `creaRisorsa(fetcher, { iniziale, vuotoSe })` restituisce `{ data, loading, error, lastUpdated, stato, carica, riprova, reset }`. `stato` è un `computed` a cinque valori, valutati in quest'ordine — l'ordine è vincolante, non un dettaglio stilistico:

1. `caricamento` — `loading` è vero e non c'è mai stato un caricamento riuscito (`lastUpdated === null`).
2. `errore` — un fallimento senza dati precedenti.
3. `errore-con-dati` — un fallimento con dati precedenti ancora validi a schermo.
4. `vuoto` — nessun errore, e il predicato `vuotoSe` (o quello di default: array vuoto oppure `null`/`undefined`) dice che non c'è nulla.
5. `pronto` — tutti gli altri casi.

`caricamento` precede `errore` così un "Riprova" dopo un fallimento senza dati mostra di nuovo lo scheletro invece di lasciare il pannello d'errore fino alla risposta successiva. Con dati precedenti, invece, `errore-con-dati` sopravvive al tentativo in corso: il dato a schermo resta quello vecchio finché non arriva quello nuovo, evitando un lampeggio fra "Riprova" e "dati aggiornati".

**Due invarianti** rendono la macchina a stati affidabile:

- Un fallimento non tocca mai `data` né `lastUpdated` (commento `INVARIANTE` nel `catch` di `carica()`): è la proprietà che rende impossibile, per costruzione, confondere di nuovo un errore di rete con una perdita di dati.
- Solo un successo cancella un errore precedente: `error` non viene mai azzerato da un evento diverso da un nuovo caricamento riuscito, quindi `errore-con-dati` resta visibile per tutta la durata reale del problema, non per un istante.

`carica()` inoltre non lancia mai: un fallimento è uno stato (`error`), non un'eccezione, quindi nessun chiamante deve incatenare `.catch()` per evitare una rejection non gestita — chi ha bisogno di sapere com'è andata legge `error`, oppure il valore di ritorno (`undefined` in caso di fallimento).

**Guardia di sequenza.** Ogni chiamata a `carica()` incrementa un contatore `sequenza` e ne cattura il valore; la risposta viene applicata solo se quel valore coincide ancora con `sequenza` al momento dell'arrivo. Senza questa guardia una richiesta lenta partita prima potrebbe sovrascrivere una richiesta veloce partita dopo — concretamente, la dashboard lancia fino a otto caricamenti in parallelo e li rilancia tutti insieme dopo un salvataggio, quindi il rischio non è teorico. `reset()` incrementa a sua volta `sequenza`: invalida le richieste ancora in volo, così una risposta che arriva dopo un logout non può ripopolare la risorsa con i dati dell'utente precedente.

**Perché la logica sta in `risorsa.js` e non in `DataState.vue`.** `risorsa.js` è JavaScript puro sopra `ref`/`computed`, senza dipendenze dal DOM: per questo è testabile con il test runner nativo del progetto (`node --test`, vedi `client/tests/risorsa.test.js`) senza montare nulla. Il progetto non ha — per scelta, non per lacuna — un framework di test per componenti Vue: nessun `@vue/test-utils`, `vitest` o `jsdom` fra le dipendenze di `client/package.json`, il cui script `test` esegue solo `node --test tests/*.test.js`. Per questo `DataState.vue` non decide nulla: riceve `stato` già calcolato via prop e si limita a scegliere quale blocco di markup mostrare. Qualunque logica finisse dentro il componente resterebbe non testata; lasciandola in `risorsa.js`, resta testata lì dove il progetto sa già testare.

**`refreshAfterWrite` è diventato inerte.** Non fa parte di questo pattern, ma lo tocca da vicino: la sua funzione (`client/src/utils/afterWrite.js`) era segnalare, dopo una scrittura già riuscita, che un aggiornamento successivo della vista poteva essere fallito — restituiva `false` in quel caso, così chi chiamava poteva mostrare il toast `VISTA_NON_AGGIORNATA`. Da quando le funzioni di lettura che riceve sono quelle costruite su `creaRisorsa`, non lanciano più: `carica()` registra l'errore in `error` e restituisce `undefined` invece di rigettare. Il `Promise.allSettled` interno a `refreshAfterWrite` vede quindi sempre esiti `fulfilled`, e il suo valore di ritorno è ormai sempre `true`. Il caso più visibile è `client/src/views/ImportaView.vue:259-271`: `refreshAfterWrite` avvolge `fetchConti`/`fetchPatrimonio`/`fetchMovimenti`, tutte e tre wrapper diretti di `carica()`, e il controllo `if (!vistaAggiornata) toastStore.warning(...)` alla riga 271 non può più scattare. Lo stesso controllo si ripete in `MovimentoForm.vue:185`; gli altri punti che chiamano `refreshAfterWrite` (`conti.store.js`, `MovimentiView.vue`) non leggono nemmeno il valore di ritorno, quindi lì non c'è un ramo morto da segnalare — solo un booleano ormai ignorato.

Non è un difetto nascosto da correggere: la vista di destinazione dichiara ormai il proprio stato con `DataState`, più preciso di quanto lo sia mai stato quel toast generico. Ma va scritto, perché il booleano compila e "funziona" silenziosamente sempre uguale: chi lo trovasse senza questa nota potrebbe costruirci sopra credendolo ancora vivo. `afterWrite.js` resta nel repository: i percorsi di scrittura non ancora migrati a `creaRisorsa` lo usano ancora, quindi non va rimosso.

### Theming
- CSS custom properties in `variables.css` (dark/light)
- `useTheme.js` applica classe `html.dark`/`html.light`, persiste in localStorage + API
- Chart.js legge variabili CSS via `useChartTheme.js`

### Responsive
- Breakpoint mobile: `< 768px`
- Desktop: sidebar fissa
- Mobile: bottom navigation + BottomSheet per azioni

## 3. Backend

### Stack
Node.js, Express 5, Sequelize 6, PostgreSQL/Supabase, JWT, Passport, bcrypt, Winston, Vercel Cron.

### Struttura
```
server/
├── app.js                    # createApp() — middleware stack + route mounting
├── server.js                 # Entry: migrate, DB connect, email init, cron, listen
├── config/                   # database.js, sequelize.js, passport.js
├── constants/categorie.js      # Whitelist categorie (single source of truth backend)
├── controllers/              # 13 controller (thin: validazione → service → response)
├── middleware/               # 7 middleware
├── models/                   # 16 modelli + index.js (associazioni)
├── routes/                   # 12 route modules
├── services/
│   ├── import/               # Core import + categorizzazione
│   ├── importazioni/         # Nuova pipeline (detector → parser → delegate)
│   ├── merchant/             # Merchant intelligence + AI
│   ├── email/                # Resend integration
│   ├── accountReset.service.js
│   ├── scommesseContoSync.service.js
│   ├── ricorrenti.service.js
│   ├── passwordReset.service.js
│   ├── googleAuth.service.js
│   ├── onboarding.service.js
│   └── aiConsent.service.js
├── migrations/               # 25 migrazioni Sequelize
├── tests/                    # 18 suite Jest, incluse PostgreSQL/Vercel/cron/rate limit
└── utils/                    # logger, AppError, ageRestriction, featureAccess, oauthPopup
```

### Pattern architetturali
- **Controller → Service → Model**: controller sottili, logica nei services.
- **Middleware chain**: auth → featureAccess → validation → controller.
- **Error handling centralizzato**: `errorHandler.middleware.js` con `AppError` hierarchy.
- **Validazione centralizzata**: `validation.middleware.js` con express-validator.
- **Logging strutturato**: Winston con sanitizzazione dati sensibili.

### Dual import pipeline
```
Upload file
    ▼
importazioni/detectors/     → Rileva formato (CSV/Excel/PDF) e banca
    ▼
importazioni/parsers/       → Parsing specifico (Revolut, Intesa, Poste, Generic)
    ▼
importazioni/services/        → Orchestrazione
    ▼
import/ImportService.js      → Preview/confirm, duplicate check, balance update
    ▼
import/CategoryMatcherService → Categorizzazione a cascata
```

**Attenzione**: `importazioni/services/CategoryMatcher.js` re-esporta `import/CategoryMatcherService`. Modifiche alla categorizzazione vanno fatte nel layer `import/`.

## 4. Comunicazione frontend/backend

```
Frontend                          Backend
────────                          ───────
axios.js                          app.js
  baseURL: VITE_API_URL/api         CORS_ORIGINS check
  Authorization: Bearer <token>     authMiddleware → req.userId
  timeout: 12000ms                  express-validator
  401 → performLogout()             rateLimit
                                    errorHandler
```

- **Nessun WebSocket**, **nessun SSE**, **nessun GraphQL**.
- **Nessun refresh token**: JWT 7 giorni, re-login manuale.
- **Step-up token**: header `X-Step-Up-Token` per export/delete/reset-account. Ottenuto via `POST /auth/verify-password` (bcrypt reale, utenti locali) o via `POST /auth/google/challenge` + `POST /auth/verify-google` (utenti Google, ID token verificato crittograficamente con `google-auth-library`) — vera ri-autenticazione per entrambi i tipi di utente, vedi `docs/SECURITY.md`.

## 5. Flusso dei dati

### Creazione movimento
```
MovimentoForm.vue → movimenti.store.createMovimento()
  → POST /api/movimenti
  → movimenti.controller.createMovimento()
    → Sequelize transaction:
      1. Verifica conto attivo (user_id)
      2. Verifica saldo (uscita)
      3. Movimento.create()
      4. Conto.saldo += deltaSaldo(tipo, importo)
      5. CategoryLearningService (se categoria modificata)
    → Response: movimento creato
  → Frontend: refresh conti, patrimonio, movimenti
```

### Import estratto conto
```
ImportaView.vue → importazioni.store.upload(file)
  → POST /api/importazioni/upload (multer 5MB)
  → importazioni.controller.uploadPreview()
    → FileFormatDetector → BankFormatDetector
    → Parser specifico → TransactionNormalizer
    → CategoryMatcherService (per ogni transazione)
    → DuplicateChecker
  → Response: preview con categorie suggerite

ImportaView.vue → importazioni.store.conferma(transactions)
  → POST /api/importazioni/conferma
  → import/ImportService.confirmImport()
    → Crea movimenti in bulk
    → Aggiorna saldi conti
  → Response: conteggio importati
```

### Trasferimento tra conti
```
MovimentoForm.vue (tipo=trasferimento) → conti.store.trasferimento()
  → POST /api/conti/trasferimento
  → conti.controller.trasferimento()
    → Transaction DB:
      1. Lock conti origine/destinazione
      2. Verifica saldo origine
      3. Aggiorna saldi (origine -, destinazione +)
      4. Sync piattaforma scommesse se tipo=scommesse
      5. Movimento.create(tipo='trasferimento')
```

## 6. Servizi esterni

| Servizio | Integrazione | Obbligatorio | Note |
|---|---|---|---|
| Supabase PostgreSQL | Sequelize + pg | Sì | DATABASE_URL (runtime), DATABASE_MIGRATION_URL (solo migrazioni) |
| Resend | EmailService.js | Per reset password | RESEND_API_KEY, EMAIL_FROM |
| Google OAuth | passport.js | No | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET |
| Google Identity Services + google-auth-library | googleStepUp.service.js | No (solo per step-up utenti Google) | GOOGLE_CLIENT_ID (backend), VITE_GOOGLE_CLIENT_ID (frontend, pubblico) |
| OpenAI | OpenAICategoryClassifier | No | OPENAI_API_KEY — fallback AI locale |
| Google Places | Stub | No | Non implementato |
| Foursquare | Stub | No | Non implementato |
| OpenStreetMap | Stub | No | Non implementato |

## 7. Diagramma logico del sistema

```
                    ┌──────────────┐
                    │    User      │
                    └──────┬───────┘
                           │ 1:1
                    ┌──────▼───────┐
                    │ ProfiloUtente│
                    └──────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼──────┐
    │   Conto   │   │  Budget   │   │ Obiettivo  │
    │ (multi)   │   │ Mensile   │   │ (multi)    │
    └─────┬─────┘   └─────┬─────┘   └─────┬──────┘
          │               │               │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼──────┐
    │ Movimento │   │ BudgetCat │   │ Contributo │
    │ (multi)   │   │ (multi)   │   │ (multi)    │
    └───────────┘   └───────────┘   └────────────┘
          │
    ┌─────▼──────────────┐
    │ PiattaformaScommesse│ ←── sync bidirezionale ──→ Conto (tipo=scommesse)
    │ (multi)            │
    └─────┬──────────────┘
          │
    ┌─────▼──────────────┐
    │ MovimentoScommesse │
    └────────────────────┘

    ┌──────────────┐         ┌─────────────────────┐
    │ Investimento │────────▶│ MovimentoInvestimento│
    │ (multi)      │         │ (multi)              │
    └──────────────┘         └─────────────────────┘

    ┌────────────────┐  ┌─────────────────────────┐
    │ CategorieRegola│  │ RegolaPersonaleMerchant │
    │ (user+global)  │  │ (per user)              │
    └────────────────┘  └─────────────────────────┘
```

## Architectural Weaknesses

### AW-1: Dual import pipeline
- **Gravità**: High
- **File**: `server/services/import/`, `server/services/importazioni/`
- **Descrizione**: Due layer di import con re-export incrociati. Modifiche alla categorizzazione o al flusso import richiedono capire quale layer è attivo.
- **Perché è un problema**: Rischio di fix nel posto sbagliato, duplicazione logica.
- **Soluzione consigliata**: Consolidare in un unico modulo con adapter per formati bancari.
- **Rischio modifica**: High

### AW-2: ~~Nessuna CI/CD~~ — RISOLTO
- **Gravità**: era High.
- **File**: `.github/workflows/ci.yml`.
- **Descrizione**: pipeline GitHub Actions su push/PR verso `main`: test backend con PostgreSQL effimero + test/build frontend, più `npm audit` informativo su entrambi.
- **Rischio modifica**: Low

### AW-3: Cron nel processo principale
- **Gravità**: Medium
- **File**: `server/services/ricorrenti.service.js`, `server/server.js`
- **Descrizione**: Il cron gira nel processo Express. Se il server crasha o è in restart, le ricorrenti non vengono processate.
- **Perché è un problema**: Affidabilità in produzione con PM2 restart o deploy.
- **Soluzione consigliata**: Worker separato o job scheduler esterno.
- **Rischio modifica**: Medium

### AW-4: JWT senza refresh token
- **Gravità**: Medium
- **File**: `server/controllers/auth.controller.js`
- **Descrizione**: Token valido 7 giorni, nessun meccanismo di refresh. Scadenza = re-login.
- **Perché è un problema**: UX su sessioni lunghe; token rubato valido per 7 giorni.
- **Soluzione consigliata**: Refresh token rotation o riduzione expiry.
- **Rischio modifica**: High (impatta tutto il frontend)

### AW-5: Feature access logic duplicata
- **Gravità**: Medium
- **File**: `client/src/utils/featureAccess.js`, `server/utils/featureAccess.js`, `server/middleware/featureAccess.middleware.js`
- **Descrizione**: Stessa logica (minori, scommesse, investimenti) implementata separatamente su client e server.
- **Perché è un problema**: Disallineamento possibile tra frontend e backend.
- **Soluzione consigliata**: Backend come source of truth, frontend legge flags da `/auth/me`.
- **Rischio modifica**: Medium

### AW-6: Auto-migrate all'avvio
- **Gravità**: Medium
- **File**: `server/server.js`
- **Descrizione**: `execSync('npx sequelize-cli db:migrate')` ad ogni avvio server.
- **Perché è un problema**: In produzione con più istanze, race condition sulle migrazioni.
- **Soluzione consigliata**: Migrazioni come step separato nel deploy.
- **Rischio modifica**: Low

### AW-7: Componenti frontend orfani
- **Gravità**: Low
- **File**: `PlaceholderView.vue`, `SummaryCards.vue`, `CategoryCarousel.vue`, `CategoryCard.vue`, `GlassBalanceCard.vue`
- **Descrizione**: Componenti creati ma mai importati/usati.
- **Perché è un problema**: Confusione per sviluppatori, dead code.
- **Soluzione consigliata**: Rimuovere o integrare.
- **Rischio modifica**: Low

### AW-8: Nessun caching API
- **Gravità**: Low
- **File**: Tutti i controller
- **Descrizione**: Ogni navigazione ricarica tutti i dati da API. Dashboard fa 8+ chiamate parallele.
- **Perché è un problema**: Performance e rate limit (risolto parzialmente con cache Pinia `recentiHome`).
- **Soluzione consigliata**: Cache Pinia più aggressiva con invalidazione selettiva.
- **Rischio modifica**: Medium
