# Vercel and Supabase Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere WALLT distribuibile come frontend Vue e API Express su due progetti Vercel collegati alla stessa repository, usando PostgreSQL Supabase come database e mantenendo costo iniziale zero.

**Architecture:** `client/` e `server/` restano applicazioni autonome e diventano due root directory Vercel. Sequelize viene migrato da MySQL a PostgreSQL; il runtime usa il Transaction Pooler Supabase, le migrazioni usano il Session Pooler e l'API Express viene esportata da una funzione Vercel senza processi persistenti.

**Tech Stack:** Vue 3, Vite 8, Node.js 22+, Express 5, Sequelize 6, PostgreSQL/`pg`, Supabase, Vercel Functions e Vercel Cron, Jest 30.

**Spec:** `docs/superpowers/specs/2026-08-30-vercel-supabase-deployment-design.md`

## Global Constraints

- Una sola repository GitHub e due progetti Vercel con root `client/` e `server/`.
- Nessun costo ricorrente iniziale e nessun nuovo servizio esterno obbligatorio.
- Nessun dato locale deve essere caricato automaticamente su Supabase.
- Nessuna credenziale o URL database deve entrare nel frontend, nei log o in Git.
- Il runtime usa `DATABASE_URL`; le migrazioni usano `MIGRATION_DATABASE_URL`.
- Le migrazioni non partono automaticamente nelle funzioni Vercel.
- Autenticazione WALLT, JWT, Google OAuth e step-up restano invariati a livello di comportamento.
- L'isolamento tramite `user_id` e la coerenza dei saldi devono continuare a passare tutti i test.
- Il job ricorrente deve essere autenticato, idempotente e basato sul fuso `Europe/Rome`.
- I ruoli pubblici Supabase non devono poter leggere o modificare le tabelle WALLT.

---

### Task 1: Configurazione PostgreSQL e dipendenze

**Files:**
- Create: `server/tests/databaseConfig.test.js`
- Modify: `server/config/database.js`
- Modify: `server/config/sequelize.js`
- Modify: `server/config/validateEnv.js`
- Modify: `server/tests/validateEnv.test.js`
- Modify: `server/package.json`
- Modify: `server/package-lock.json`

**Interfaces:**
- Consumes: `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `DB_*`, `NODE_ENV`.
- Produces: configurazioni Sequelize PostgreSQL coerenti per development, test, production e migration CLI.

- [ ] **Step 1: Scrivere test fallenti per selezione URL e SSL**

I test devono verificare che production richieda `DATABASE_URL`, che test preferisca `TEST_DATABASE_URL`, che development possa usare `DB_*`, che production abiliti SSL e che la configurazione non contenga mai `dialect: 'mysql'`.

```js
expect(config.production.url).toBe('postgres://runtime');
expect(config.production.dialect).toBe('postgres');
expect(config.production.dialectOptions.ssl.rejectUnauthorized).toBe(false);
expect(config.test.url).toBe('postgres://test');
```

- [ ] **Step 2: Eseguire i test e verificare il rosso**

Run: `cd server && npm test -- --runInBand tests/databaseConfig.test.js tests/validateEnv.test.js`

Expected: fallimento perché la configurazione è ancora MySQL e `DATABASE_URL` non è validata.

- [ ] **Step 3: Implementare configurazione PostgreSQL minima**

`database.js` deve costruire configurazioni con `dialect: 'postgres'`, pool serverless ridotto e URL quando disponibile:

```js
const pooled = { max: 2, min: 0, idle: 0, acquire: 10000, evict: 1000 };
const ssl = process.env.NODE_ENV === 'production'
  ? { ssl: { require: true, rejectUnauthorized: false } }
  : undefined;
```

`sequelize.js` deve usare `new Sequelize(config.url, options)` quando `url` è presente e la firma username/password solo per configurazione locale.

- [ ] **Step 4: Sostituire il driver**

Run: `cd server && npm uninstall mysql2 && npm install pg pg-hstore`

Expected: `package.json` e lock contengono `pg`/`pg-hstore` e non `mysql2`.

- [ ] **Step 5: Eseguire i test mirati**

Run: `cd server && npm test -- --runInBand tests/databaseConfig.test.js tests/validateEnv.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/config server/tests/databaseConfig.test.js server/tests/validateEnv.test.js server/package.json server/package-lock.json
git commit -m "refactor: configure PostgreSQL connections"
```

### Task 2: Migrazioni PostgreSQL e hardening Supabase

**Files:**
- Create: `server/migrations/20260830000010-harden-supabase-access.js`
- Create: `server/tests/migrations.postgres.test.js`
- Modify: `server/migrations/20250101000001-create-all-tables.js`
- Modify: `server/migrations/20250101000004-add-social-auth.js`
- Modify: `server/migrations/20250714_add_auth_provider.js`
- Modify: `server/migrations/20260708000005-create-categorie-regole.js`

**Interfaces:**
- Consumes: PostgreSQL QueryInterface e database vuoto.
- Produces: schema completo migrabile da zero, senza dipendenza da sintassi MySQL e senza accesso Data API pubblico.

- [ ] **Step 1: Scrivere test di migrazione fallente**

Il test deve creare un database/schema PostgreSQL vuoto, eseguire tutte le migrazioni, controllare le tabelle attese e verificare che una seconda lettura dello stato non tenti di ricrearle.

```js
expect(tableNames).toEqual(expect.arrayContaining([
  'users', 'profili_utente', 'conti', 'movimenti', 'password_reset_tokens',
]));
expect(columns.users.password.allowNull).toBe(true);
```

- [ ] **Step 2: Eseguire il test e verificare il rosso**

Run: `cd server && npm test -- --runInBand tests/migrations.postgres.test.js`

Expected: fallimento su driver/configurazione o sintassi booleana MySQL.

- [ ] **Step 3: Rendere portabile lo schema iniziale**

Sostituire gli `ENUM` delle migrazioni con `STRING` e mantenere le whitelist nei modelli/validator. Correggere il seed con `attiva = true`. Conservare `DECIMAL`, `DATEONLY`, indici e foreign key.

- [ ] **Step 4: Rendere idempotenti le migrazioni duplicate social auth**

Usare `describeTable('users')` prima di aggiungere `auth_provider` e `google_id`, evitando di catturare indiscriminatamente errori PostgreSQL. L'update deve restare:

```sql
UPDATE users
SET auth_provider = 'google', password = NULL
WHERE google_id IS NOT NULL
```

- [ ] **Step 5: Aggiungere hardening Supabase**

La nuova migrazione deve iterare sulle tabelle WALLT, abilitare RLS e revocare privilegi a `anon`/`authenticated` solo se i ruoli esistono:

```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.<table> FROM anon, authenticated;
```

La migrazione locale non deve fallire quando i ruoli Supabase non esistono.

- [ ] **Step 6: Eseguire migrazione e rollback su PostgreSQL**

Run: `cd server && npm test -- --runInBand tests/migrations.postgres.test.js`

Expected: PASS su up completo e rollback controllato.

- [ ] **Step 7: Commit**

```bash
git add server/migrations server/tests/migrations.postgres.test.js
git commit -m "refactor: migrate schema to PostgreSQL"
```

### Task 3: Infrastruttura test PostgreSQL e CI

**Files:**
- Modify: `server/tests/setup.js`
- Modify: `server/tests/env.js`
- Modify: `server/.env.test.example`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: PostgreSQL locale o service container GitHub Actions.
- Produces: `wallt_test` isolato e suite Jest completa eseguita su PostgreSQL.

- [ ] **Step 1: Scrivere/aggiornare il setup in modo che fallisca senza PostgreSQL**

Il setup deve usare `pg.Client`, collegarsi al database amministrativo `postgres`, validare `DB_NAME_TEST` con `/^[a-zA-Z0-9_]+$/` e creare il database di test soltanto se assente.

```js
const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DATABASE]);
if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
```

- [ ] **Step 2: Aggiornare CI da MySQL a PostgreSQL**

Il service container deve usare PostgreSQL, health check `pg_isready`, porta 5432 e variabili innocue dedicate ai test.

- [ ] **Step 3: Eseguire la suite completa**

Run: `cd server && npm test -- --runInBand`

Expected: 12+ suite e 125+ test PASS su PostgreSQL.

- [ ] **Step 4: Commit**

```bash
git add server/tests/setup.js server/tests/env.js server/.env.test.example .github/workflows/ci.yml
git commit -m "test: run backend suite on PostgreSQL"
```

### Task 4: Entry point Express per Vercel

**Files:**
- Create: `server/api/index.js`
- Create: `server/vercel.json`
- Create: `server/tests/vercelHandler.test.js`
- Modify: `server/server.js`
- Modify: `server/app.js`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `createApp({ enableRateLimit })`, configurazione produzione e Sequelize.
- Produces: handler CommonJS Vercel che serve tutte le rotte Express senza avviare cron o migrazioni.

- [ ] **Step 1: Scrivere test fallenti dell'handler**

Il test deve importare `server/api/index.js`, verificare che esporti una funzione/app Express e chiamare `/api/health` con Supertest senza aprire una porta.

```js
const handler = require('../api');
expect(typeof handler).toBe('function');
await request(handler).get('/api/health').expect(200);
```

- [ ] **Step 2: Eseguire il test e verificare il rosso**

Run: `cd server && npm test -- --runInBand tests/vercelHandler.test.js`

Expected: FAIL perché `server/api/index.js` non esiste.

- [ ] **Step 3: Implementare handler e routing Vercel**

`server/api/index.js` deve validare la produzione e poi esportare `createApp()`; non deve chiamare `listen`, `execSync`, `db:migrate` o `avviaCronRicorrenti`.

`server/vercel.json` deve riscrivere `/(.*)` verso `/api`, configurare durata massima compatibile con Hobby e dichiarare il cron giornaliero.

- [ ] **Step 4: Mantenere server locale separato**

`server/server.js` continua a gestire `listen`, migrazioni locali opzionali e `node-cron` soltanto fuori da Vercel.

- [ ] **Step 5: Verificare handler e server locale**

Run: `cd server && npm test -- --runInBand tests/vercelHandler.test.js tests/validateEnv.test.js`

Expected: PASS senza socket HTTP aperti dal test handler.

- [ ] **Step 6: Commit**

```bash
git add server/api server/vercel.json server/tests/vercelHandler.test.js server/server.js server/app.js server/package.json
git commit -m "feat: add Vercel Express entry point"
```

### Task 5: Cron ricorrenti autenticato e idempotente

**Files:**
- Create: `server/controllers/cron.controller.js`
- Create: `server/routes/cron.routes.js`
- Create: `server/middleware/cronAuth.middleware.js`
- Create: `server/migrations/20260830000011-add-recurring-idempotency.js`
- Create: `server/tests/cron.test.js`
- Modify: `server/app.js`
- Modify: `server/models/Movimento.js`
- Modify: `server/services/ricorrenti.service.js`
- Modify: `server/vercel.json`

**Interfaces:**
- Consumes: `CRON_SECRET`, data corrente Europe/Rome, movimenti ricorrenti.
- Produces: `GET /api/cron/ricorrenti` e `processaRicorrenti()` con riepilogo `{ processed, skipped, failed }`.

- [ ] **Step 1: Scrivere test fallenti di autenticazione e doppia esecuzione**

I test devono coprire 401 senza secret, 401 con secret errato, 200 con secret corretto e una sola operazione creata da due esecuzioni nello stesso mese.

```js
await request(app).get('/api/cron/ricorrenti').expect(401);
await request(app).get('/api/cron/ricorrenti')
  .set('Authorization', `Bearer ${process.env.CRON_SECRET}`)
  .expect(200);
expect(await Movimento.count({ where: { ricorrenza_periodo: '2026-08' } })).toBe(1);
```

- [ ] **Step 2: Eseguire e verificare il rosso**

Run: `cd server && npm test -- --runInBand tests/cron.test.js tests/ricorrenti.test.js`

Expected: FAIL perché route e colonne idempotenza non esistono.

- [ ] **Step 3: Aggiungere identità mensile univoca**

Aggiungere `ricorrenza_origine_id` nullable e `ricorrenza_periodo` stringa `YYYY-MM`, con indice univoco composto. Il movimento automatico deve valorizzare entrambi; una violazione unique viene trattata come skip, non come errore finanziario.

- [ ] **Step 4: Rendere esplicito Europe/Rome**

Estrarre giorno e periodo usando `Intl.DateTimeFormat(..., { timeZone: 'Europe/Rome' })`; non usare il timezone implicito dell'istanza Vercel.

- [ ] **Step 5: Implementare middleware e controller cron**

Confrontare il Bearer token con `crypto.timingSafeEqual`, senza loggare il valore, e restituire soltanto il riepilogo numerico.

- [ ] **Step 6: Eseguire i test**

Run: `cd server && npm test -- --runInBand tests/cron.test.js tests/ricorrenti.test.js tests/financialConsistency.test.js`

Expected: PASS e nessun doppio movimento/saldo.

- [ ] **Step 7: Commit**

```bash
git add server/controllers/cron.controller.js server/routes/cron.routes.js server/middleware/cronAuth.middleware.js server/migrations/20260830000011-add-recurring-idempotency.js server/tests/cron.test.js server/app.js server/models/Movimento.js server/services/ricorrenti.service.js server/vercel.json
git commit -m "feat: secure recurring cron on Vercel"
```

### Task 6: Rate limiting persistente degli endpoint auth

**Files:**
- Create: `server/models/AuthRateLimit.js`
- Create: `server/services/authRateLimit.service.js`
- Create: `server/migrations/20260830000012-create-auth-rate-limits.js`
- Create: `server/tests/authRateLimit.test.js`
- Modify: `server/middleware/rateLimit.middleware.js`
- Modify: `server/models/index.js`
- Modify: `server/app.js`

**Interfaces:**
- Consumes: route, IP normalizzato, finestra temporale e limite.
- Produces: middleware `persistentAuthLimiter` condiviso tra istanze serverless.

- [ ] **Step 1: Scrivere test fallenti multi-istanza**

Creare due app Express separate contro lo stesso DB, inviare tentativi alternati e verificare che il limite sia cumulativo e restituisca 429.

```js
await hit(appA, 5);
await hit(appB, 5);
await request(appA).post('/api/auth/login').send(payload).expect(429);
```

- [ ] **Step 2: Eseguire e verificare il rosso**

Run: `cd server && npm test -- --runInBand tests/authRateLimit.test.js`

Expected: FAIL perché il limiter attuale è soltanto in memoria.

- [ ] **Step 3: Creare tabella e servizio atomico**

La tabella deve usare chiave hash SHA-256, route, `window_start`, contatore e unique composto. Il servizio deve incrementare atomicamente con transazione/UPSERT PostgreSQL e cancellare finestre scadute senza memorizzare IP in chiaro.

- [ ] **Step 4: Collegare il middleware soltanto alle rotte auth pubbliche**

Login, registrazione e reset password usano il limiter persistente; limiter API generale e step-up autenticato restano in memoria come protezione aggiuntiva.

- [ ] **Step 5: Eseguire test auth e sicurezza**

Run: `cd server && npm test -- --runInBand tests/authRateLimit.test.js tests/auth.test.js tests/security.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/models/AuthRateLimit.js server/services/authRateLimit.service.js server/migrations/20260830000012-create-auth-rate-limits.js server/tests/authRateLimit.test.js server/middleware/rateLimit.middleware.js server/models/index.js server/app.js
git commit -m "feat: persist authentication rate limits"
```

### Task 7: Frontend Vercel, CSP e configurazione pubblica

**Files:**
- Create: `client/vercel.json`
- Create: `client/tests/config.test.js` oppure test Node equivalente previsto dagli script client
- Modify: `client/index.html`
- Modify: `client/.env.example`
- Modify: `client/package.json`
- Modify: `client/package-lock.json`
- Modify: file Axios effettivo individuato sotto `client/src/utils/`

**Interfaces:**
- Consumes: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`.
- Produces: build SPA Vercel con fallback routing e CSP limitata all'API configurata.

- [ ] **Step 1: Individuare e testare la configurazione API**

Il test deve verificare che l'URL venga normalizzato senza slash finale e che in produzione non sia accettato un URL `http://` diverso da localhost.

- [ ] **Step 2: Eseguire e verificare il rosso**

Run: comando test client aggiunto in `package.json`.

Expected: FAIL prima dell'helper di normalizzazione/configurazione.

- [ ] **Step 3: Configurare fallback SPA e header**

`client/vercel.json` deve servire i file reali e usare `index.html` come fallback, senza riscrivere asset esistenti. La CSP mantiene Google Identity Services e inserisce `%VITE_API_URL%` in `connect-src`.

- [ ] **Step 4: Verificare assenza secret nel bundle**

Run: `cd client && npm run build && rg -n '(DB_PASSWORD|GOOGLE_CLIENT_SECRET|JWT_SECRET|DATABASE_URL)' dist`

Expected: build PASS e `rg` senza risultati.

- [ ] **Step 5: Commit**

```bash
git add client/vercel.json client/index.html client/.env.example client/package.json client/package-lock.json client/src client/tests
git commit -m "feat: configure Vue app for Vercel"
```

### Task 8: Esempi ambiente e guida operativa

**Files:**
- Modify: `server/.env.example`
- Modify: `server/.env.test.example`
- Modify: `docs/API.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/PROJECT_STATUS.md`
- Create: `docs/DEPLOY_VERCEL_SUPABASE.md`

**Interfaces:**
- Consumes: configurazione finale Tasks 1-7.
- Produces: procedura copiabile per creare Supabase, due progetti Vercel, variabili, migrazioni, OAuth, verifica e rollback.

- [ ] **Step 1: Aggiornare gli esempi senza valori reali**

Usare placeholder espliciti che non somiglino a token reali:

```env
DATABASE_URL=<supabase_transaction_pooler_url>
MIGRATION_DATABASE_URL=<supabase_session_pooler_url>
JWT_SECRET=<generate_a_random_value_of_at_least_32_chars>
CRON_SECRET=<generate_a_different_random_value>
```

- [ ] **Step 2: Scrivere guida pannello per pannello**

La guida deve indicare root directory, build/start settings, variabili Web/API, comando migrazioni, callback Google, CORS, health check e test manuale con due utenti. Non deve includere alcun valore reale.

- [ ] **Step 3: Documentare limiti gratuiti e upgrade trigger**

Indicare 500 MB Supabase, possibile pausa per inattività, cron giornaliero, assenza SLA e divieto di monetizzazione su Vercel Hobby.

- [ ] **Step 4: Scansionare documentazione e file tracciati**

Run: scansione repository per URL con password, token provider, chiavi private e `.env` reali; stampare soltanto nomi file.

Expected: nessun segreto e soltanto `.env.example` tracciati.

- [ ] **Step 5: Commit**

```bash
git add server/.env.example server/.env.test.example docs
git commit -m "docs: add Vercel and Supabase deployment guide"
```

### Task 9: Verifica end-to-end e preparazione pubblicazione

**Files:**
- Verify: intero repository

**Interfaces:**
- Consumes: implementazione completa.
- Produces: commit verificato e istruzioni finali per le sole operazioni manuali nei dashboard.

- [ ] **Step 1: Applicare migrazioni su PostgreSQL vuoto**

Run: creare database temporaneo PostgreSQL, eseguire `npm run migrate`, controllare stato migrazioni e tabelle.

Expected: tutte le migrazioni `up`, nessun errore.

- [ ] **Step 2: Eseguire suite backend completa**

Run: `cd server && npm test -- --runInBand`

Expected: tutte le suite PASS, zero test falliti.

- [ ] **Step 3: Eseguire build frontend**

Run: `cd client && npm run build`

Expected: exit 0.

- [ ] **Step 4: Verificare handler e route critiche**

Run: test Supertest per health, auth, cron, import, isolamento e coerenza finanziaria.

Expected: PASS.

- [ ] **Step 5: Verificare diff e segreti**

Run: `git diff --check`, inventario file tracciati, scansione secret ad alta confidenza e controllo che `git status` contenga soltanto modifiche previste.

Expected: nessun errore di whitespace, nessuna credenziale, nessun `.env` reale.

- [ ] **Step 6: Richiedere code review**

Usare `superpowers:requesting-code-review`, correggere rilievi bloccanti e ripetere Steps 1-5.

- [ ] **Step 7: Commit finale di eventuali correzioni**

```bash
git add -A
git commit -m "chore: finalize Vercel Supabase deployment"
```
