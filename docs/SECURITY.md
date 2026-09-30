# WALLT — Security Audit

> Audit di sicurezza basato sul codice del repository (agosto 2026).
> Ultimo aggiornamento: 30 settembre 2026 — verifica del backend OAuth iOS, Sign in with Apple, challenge persistenti e step-up provider-verified; Xcode e i test su iPhone non sono disponibili in questo ambiente.
> Nessun penetration test eseguito contro infrastruttura reale. Nessun valore di secret riportato.

## Riepilogo

WALLT ha una **baseline di sicurezza matura**: JWT con invalidazione su cambio password, bcrypt, express-validator, rate limiting (incluso fix IPv6), Helmet, CSP (meta tag SPA + Helmet API), CORS configurabile, magic-byte validation su upload, **step-up auth reale per tutti gli account** — bcrypt per chi ha una password locale, ID token fresco Google o Apple per gli account OAuth, con challenge persistenti monouso in PostgreSQL, scoping `user_id` verificato empiricamente con test automatici cross-user su conti, movimenti, trasferimenti, import, budget, obiettivi, investimenti, scommesse, profilo e step-up (nessun IDOR sfruttabile trovato), e coerenza finanziaria (saldo/movimenti/trasferimenti/race condition) verificata con test dedicati.

**Vulnerabilità critiche trovate e corrette in questo audit**:
1. **Google OAuth account pre-hijacking**: un login Google si collegava automaticamente a un account locale pre-esistente con la stessa email, senza prova di proprietà. Un attaccante poteva pre-registrare l'email di una vittima e ottenere accesso permanente ai suoi dati. **Corretto** — vedi `services/googleAuth.service.js`.
2. **Cron ricorrenti: duplicazione di movimenti/doppio addebito**: il controllo anti-duplicazione del job mensile confrontava la descrizione sbagliata e non trovava mai un "già creato", quindi una riesecuzione nello stesso giorno duplicava il movimento e scalava il saldo due volte. **Corretto** — vedi `services/ricorrenti.service.js`.

**Aree di miglioramento principali residue**: test su provider Apple/Google reali, Xcode e iPhone ancora da eseguire dopo la configurazione degli account esterni; `xlsx` (parsing import) senza fix upstream pubblicato per ReDoS/prototype pollution (mitigato con cap righe/dimensione); nessuna verifica email alla registrazione locale (mitigata solo per il vettore Google); test di logica di business (non solo isolamento) mancanti su budget/obiettivi/investimenti/scommesse.

---

## Autenticazione

### Implementazione
- **JWT Bearer** con `jsonwebtoken`, secret da `JWT_SECRET` env.
- Payload: `{ userId, auth_provider }`, expiry **7 giorni**.
- Verifica in `auth.middleware.js`: estrae token, verifica firma, carica user da DB.
- **Invalidazione**: confronto `token.iat` vs `user.password_changed_at` — token emessi prima del cambio password vengono rifiutati.
- **Nessun refresh token**: scadenza = re-login manuale.

### Password
- **bcrypt** con 10 rounds (`auth.controller.js`, `impostazioni.controller.js`, `passwordReset.service.js`).
- Policy registrazione/reset: min 8 char, maiuscola, cifra, carattere speciale.
- Policy cambio password (`validatePassword`): min 8, maiuscola, cifra — **senza carattere speciale** (inconsistenza).

### OAuth
- Google web OAuth 2.0 via Passport (`passport-google-oauth20`), stateless e popup con origin allowlist (`oauthPopup.js`).
- Google iOS usa il Google Sign-In SDK ufficiale e invia al server un ID token verificato con l’audience del client OAuth web configurato come `GOOGLE_CLIENT_ID`.
- Apple usa Authentication Services su iOS e Sign in with Apple JS sul web/PWA. Il server scambia l’authorization code e verifica firma, issuer, audience, nonce, scadenza e coerenza del `sub`.
- L’identità Apple è conservata in `users.apple_id` univoco; non viene collegata a un account per il solo match email. Alla prima registrazione sono richiesti email verificata e consensi.
- Apple compare in `/auth/providers` solo se la configurazione server Apple è completa.
- Le sfide OAuth sono salvate come digest SHA-256 in PostgreSQL, vincolate a provider/scopo/piattaforma/utente e scadenza; il consumo è atomico e monouso anche tra istanze Vercel.

### Nome problema: Google OAuth account pre-hijacking — RISOLTO
- **Severity**: Critical (era exploitable pre-fix).
- **Priority**: P0.
- **Files**: `server/services/googleAuth.service.js`, `server/routes/auth.routes.js`, `server/tests/auth.test.js`.
- **Description**: `resolveGoogleUser` collegava automaticamente (`google_id`) un login Google riuscito a QUALSIASI account esistente con la stessa email, incluso un account locale (`auth_provider: 'local'`) con password già impostata. WALLT non richiede verifica email alla registrazione locale.
- **Attack scenario**: un attaccante registra su WALLT un account locale con l'email `vittima@gmail.com` (email reale della vittima, password scelta dall'attaccante). Quando la vittima usa "Accedi con Google" per la prima volta con il suo vero account Google verificato, il sistema trova l'account esistente per email e collega semplicemente `google_id`, senza creare un nuovo account né richiedere prova di proprietà. La password impostata dall'attaccante al momento della registrazione continua a funzionare (`auth_provider` resta `'local'` perché una password è già presente): l'attaccante ha quindi accesso permanente a tutti i dati finanziari che la vittima inserirà da quel momento in poi tramite login Google.
- **Impact**: compromissione totale dell'account (conti, movimenti, saldi, budget, obiettivi, scommesse, investimenti) per qualunque utente che si registri per la prima volta su WALLT via Google, se un attaccante ne conosce l'email in anticipo (attacco mirato, non richiede altro che l'indirizzo email pubblico della vittima).
- **Fix applicata**: `resolveGoogleUser` non collega più automaticamente un login Google a un account trovato per email quando quell'account è locale (`auth_provider: 'local'`, con password) e non ha ancora un `google_id`. In quel caso lancia `GoogleAccountLinkingError` (`code: 'google_account_exists_local'`), il callback OAuth restituisce un errore dedicato (non un token), e il frontend mostra un messaggio che invita l'utente a fare login con la password (o "Password dimenticata" per riprenderne il controllo se non la conosce — il reset password via email è un canale verificato, quello dell'attaccante non riceve l'email). Il collegamento automatico resta permesso solo quando non esiste già una password locale (account creato da un precedente login Google, o mai completato) — caso in cui non c'è nulla da "rubare".
- **Verificato con**: `server/tests/auth.test.js` (2 test: rifiuto del collegamento su account locale esistente + collegamento consentito tra due login Google con lo stesso `google_id`), più l'intera suite di regressione (74/74 test verdi).
- **Modification risk**: Low — non tocca il login Google per un nuovo utente né il caso già collegato; l'unico cambiamento visibile è che un login Google su un'email già registrata localmente ora fallisce con un messaggio esplicito invece di collegarsi silenziosamente.
- **Nota**: la causa di fondo (nessuna verifica email alla registrazione locale) resta. Il fix elimina il vettore di attacco via OAuth, ma un utente potrebbe comunque pre-registrare l'email altrui per impedirne la registrazione autonoma (denial of registration, non compromissione dati) finché non implementa una verifica email. Non affrontato in questo intervento — vedi Roadmap P2.

### Step-up authentication

Lo step-up si applica a tutte le operazioni sensibili: export dati, reset transazioni e cancellazione account. Il token temporaneo è un JWT `type: step_up`, valido 5 minuti e vincolato sia a `userId` sia ad `auth_provider`; `requireStepUp` rifiuta token di altro utente/provider o scaduti.

- **Account locali**: `POST /api/auth/verify-password` verifica la password con bcrypt.
- **Account Google**: `POST /api/auth/google/challenge` → `POST /api/auth/verify-google`; il client web usa Google Identity Services, iOS l’SDK nativo. Il server controlla firma, audience, issuer, nonce, freschezza e `sub` già collegato all’utente.
- **Account Apple**: `POST /api/auth/apple/step-up/challenge` → `POST /api/auth/apple/step-up/verify`; il server controlla code exchange, entrambi gli ID token, firma, audience, nonce, freschezza e `sub` uguale all’identità Apple già collegata.
- I challenge e i nonce non sono conservati in chiaro: PostgreSQL conserva solo SHA-256, con binding a provider, scopo, piattaforma, utente (per step-up) e TTL di 120 secondi. L’aggiornamento di consumo è atomico, quindi richieste concorrenti e istanze serverless non possono usare due volte lo stesso challenge.
- `POST /api/auth/verify-password` rifiuta account OAuth con `oauth_stepup_required`; questi account non possono ottenere uno step-up digitando solo la password o una conferma testuale.
- `ELIMINA` e `RESETTA` restano conferme UX richieste dal controller, ma non sostituiscono la prova d’identità.

La verifica Google web richiede `VITE_GOOGLE_CLIENT_ID` sul client e il dominio registrato come origine JavaScript nel client OAuth Google Cloud. L’accesso Apple richiede la configurazione Apple completa lato server, servizi e chiavi descritti in `docs/DEPLOY_VERCEL_SUPABASE.md`. Senza configurazione provider l’endpoint non emette token e le operazioni sensibili restano protette.

**Limiti di verifica di questo audit**: i test backend verificano challenge, binding, replay, provider e identità; l’accesso ai sistemi Apple/Google, Xcode, firma e verifica su iPhone richiede le configurazioni e gli account esterni e non è stato effettuato qui.

---

## Autorizzazione

### Pattern IDOR
- **Tutti i controller** filtrano per `user_id: req.userId` su read/write by ID.
- Transfer verifica ownership di entrambi i conti.
- Import verifica ownership di tutti i `conto_id`.
- Test GDPR confermano isolamento cross-user (`gdpr.test.js`).

### Feature access
- `blockScommesseAccess` / `blockInvestimentiAccess` su route modules.
- Controlli: minori (`fascia_eta === 'under_18'`), risposta questionario, preferenze utente.
- `minorRestriction.middleware.js` esiste ma **non è collegato a nessuna route** (dead code).

---

## CORS

- Origini da `CORS_ORIGINS` env (default `http://localhost:5173`).
- `credentials: true`.
- Metodi: GET, POST, PUT, DELETE, OPTIONS.
- Headers permessi: `Content-Type`, `Authorization`, `X-Step-Up-Token`.

### Nome problema: CORS origins da env
- **Severity**: Info (configurazione corretta)
- **Files**: `server/app.js`
- **Description**: CORS configurato via env, non hardcoded.
- **Impact**: Sicuro se `CORS_ORIGINS` è configurato correttamente in produzione.
- **Recommended fix**: Verificare che in produzione contenga solo domini autorizzati.
- **Modification risk**: Low

---

## Helmet / Security Headers / CSP

- Helmet attivo su `server/app.js` con:
  - `crossOriginOpenerPolicy: same-origin-allow-popups` (override `unsafe-none` sulle route `/api/auth/google*` per compatibilità popup OAuth)
  - `crossOriginResourcePolicy: cross-origin`
  - `referrerPolicy: no-referrer`
  - HSTS in production (1 anno, includeSubDomains, preload)
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `X-Powered-By` rimosso — default Helmet, non disattivati.
- Body parser limit: 10 MB.

### CSP — dove si applica davvero
Il backend Express (`app.js`) **non serve il frontend**: la SPA Vue è un sito statico separato (Vite dev server / hosting statico in produzione). La CSP di Helmet quindi protegge solo le risposte HTML dell'API stessa (pagina di redirect OAuth in `oauthPopup.js`, che imposta comunque una propria CSP più stretta per quella singola risposta, ed eventuali pagine di errore) — **non** la pagina che il browser dell'utente effettivamente renderizza.

La CSP che conta per l'app è quindi impostata **nella SPA stessa**, via `<meta http-equiv="Content-Security-Policy">` in `client/index.html` (funziona su qualunque hosting statico, senza bisogno di configurazione lato server):
```
default-src 'self';
script-src 'self' https://accounts.google.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' %VITE_API_URL% https://accounts.google.com;
frame-src https://accounts.google.com;
object-src 'none'; base-uri 'self'; form-action 'self'
```
- `script-src` **non** include `'unsafe-inline'` né `'unsafe-eval'` — il bundle Vite è tutto in file esterni.
- `style-src` include `'unsafe-inline'` (richiesto dal boot-splash inline in `index.html` e dai binding `:style` di Vue) — rischio molto minore di un `script-src` permissivo.
- `https://accounts.google.com` è necessario in `script-src` (libreria GSI), `frame-src` (il pulsante "Continua con Google" è un iframe embedded) e `connect-src` (chiamate della libreria GSI).
- `%VITE_API_URL%` viene sostituito da Vite al build time con il valore reale (`client/.env.production`) — **verificare che non sia rimasto il placeholder** prima del deploy (vedi checklist produzione).
- Verificato in questo audit: nessuna violazione CSP in console con l'app avviata in locale (pagina di login/registrazione, boot-splash, font). Il flusso Google reale (login popup + step-up con pulsante GSI) **non è stato verificabile end-to-end** senza un client OAuth Google reale — vedi checklist QA manuale.

### Nome problema: CSP assente lato Helmet — RISOLTO dove conta (la SPA), lasciato OFF lato API di proposito
- **Severity**: era documentato Medium; impatto reale sull'app era nullo, perché Helmet protegge solo le risposte dell'API, non la SPA che il browser renderizza.
- **Files**: `client/index.html` (CSP reale della SPA, nuova, vedi sopra). `server/app.js` **non modificato**: `contentSecurityPolicy: false` resta invariato, deliberatamente — l'unica risposta HTML dell'API (`oauth-relay`) imposta già una propria CSP esplicita e più stretta via `res.setHeader` in `oauthPopup.js`, che sovrascriverebbe comunque quella di Helmet; tutte le altre risposte sono JSON, dove la CSP del browser non si applica. Abilitare una CSP Helmet generica qui non aggiungerebbe protezione reale e introdurrebbe complessità/rischio di regressione non giustificati.
- **Status**: risolto dove conta davvero (la SPA). Verifica visiva in locale eseguita (nessuna violazione CSP in console); verifica del flusso Google reale in produzione richiede QA manuale (vedi sezione dedicata) perché questo ambiente non ha accesso a un client OAuth Google reale.

---

## Rate Limiting

| Limiter | Scope | Limite | Key |
|---|---|---|---|
| apiLimiter | `/api/*` | 1200 / 15 min | userId o IP (IPv6-safe) |
| authLimiter | login, register, forgot/reset | 10 / 15 min | IP normalizzato e hashato; contatore PostgreSQL condiviso tra istanze |
| stepUpLimiter | verify-password, challenge/verifica Google e Apple step-up | 20 / 15 min | userId |
| exportLimiter | export | 3 / ora | userId |
| deleteAccountLimiter | delete account | 3 / ora | userId |
| importUploadLimiter | upload | 30 / 15 min | userId |
| importConfirmLimiter | conferma import | 15 / ora | userId |

Tutti i limiter con fallback IP (`apiLimiter`, `authLimiter`) usano l'helper ufficiale `ipKeyGenerator` di `express-rate-limit` per normalizzare gli indirizzi IPv6. Per le rotte auth pubbliche la chiave viene trasformata in SHA-256 e il contatore viene incrementato atomicamente nella tabella `auth_rate_limits`; l'IP non è salvato in chiaro e il limite non si azzera cambiando istanza Vercel.

### Nome problema: endpoint step-up senza rate limit dedicato — RISOLTO
- **Severity**: era Medium.
- **Files**: `server/middleware/rateLimit.middleware.js`, `server/app.js`.
- **Description**: nessuno dei tre endpoint di step-up aveva un rate limiter dedicato — solo l'`apiLimiter` globale (1200/15min) si applicava.
- **Fix applicata**: nuovo `stepUpLimiter` (20/15min per utente autenticato), montato in `app.js` sulle tre route (gated da `enableRateLimit`, coerente con `authLimiter`).
- **Modification risk**: Low.

### Nome problema: rate limit IPv6 bypass su login/register/forgot-password — RISOLTO
- **Severity**: era Medium.
- **Files**: `server/middleware/rateLimit.middleware.js`.
- **Description**: la chiave di fallback per utenti non autenticati usava `req.ip` grezzo. `express-rate-limit` v8 segnala questo pattern come vulnerabile: indirizzi IPv6 diversi dello stesso blocco `/64` (un attaccante può ruotarne facilmente molti) ottenevano ciascuno un contatore separato, bypassando di fatto il limite anti brute-force.
- **Fix applicata**: uso dell'helper ufficiale `ipKeyGenerator` per normalizzare l'IP quando non c'è un `userId`.
- **Modification risk**: Low.

### Nome problema: reset-account senza rate limit
- **Severity**: Medium
- **Files**: `server/routes/impostazioni.routes.js`
- **Description**: `POST /api/impostazioni/reset-account` non ha rate limiter.
- **Impact**: Tentativi ripetuti di reset con password rubata.
- **Recommended fix**: Rate limiter + step-up auth.
- **Modification risk**: Low

---

## Input Validation

- `express-validator` centralizzato in `validation.middleware.js`.
- `.escape()` su stringhe (descrizioni, note, categorie) — mitigazione XSS stored.
- Validazione su tutti gli endpoint mutanti.
- **Gap**: GET endpoints con query params non validati da middleware (parsing difensivo nei controller).

### Nome problema: Password change policy inconsistente
- **Severity**: Low
- **Files**: `validation.middleware.js` (`validatePassword` vs `validateRegister`)
- **Description**: Cambio password non richiede carattere speciale.
- **Impact**: Password più deboli possibili dopo registrazione.
- **Recommended fix**: Allineare policy.
- **Modification risk**: Low

---

## SQL Injection

- Sequelize ORM con query parametrizzate.
- Test esplicito in `security.test.js` (SQL injection su movimento ID → 404, non errore DB).
- **Nessuna query raw SQL** trovata nei controller.

---

## XSS

- `.escape()` su input stringa via express-validator.
- Test in `security.test.js` (script tag in descrizione → escaped).
- Frontend Vue con binding automatico (no `v-html` trovato nelle view principali).
- CSP disabilitato (vedi sopra).

---

## CSRF

- API stateless JWT (no cookie di sessione).
- CSRF non applicabile al pattern Bearer token.
- OAuth state parameter usato per CSRF protection nel flow Google.

---

## File Upload

- Multer `memoryStorage` (no scrittura su disco — nessun path traversal possibile, nessun temp file da ripulire).
- Max 5 MB, whitelist estensioni (.csv, .xls, .xlsx, .pdf).
- Magic-byte validation post-upload (`fileMagicBytes.js`).
- Rate limited per user (`importUploadLimiter`/`importConfirmLimiter`).
- Import confirm valida ownership conto (rifiuta l'intero batch se anche un solo `conto_id` non appartiene all'utente — verificato con test IDOR dedicato).

### Nome problema: Nessun antivirus su upload
- **Severity**: Low
- **Files**: `importazioni.controller.js`
- **Description**: File validati per formato ma non scansionati.
- **Impact**: Basso (file processati in memoria, non eseguiti).
- **Recommended fix**: Non necessario per il caso d'uso attuale.
- **Modification risk**: N/A

### Nome problema: xlsx (SheetJS) — vulnerabilità note senza fix pubblicato su npm — ACCEPTED RISK, mitigato
- **Severity**: High (upstream); Medium nel contesto WALLT date le mitigazioni.
- **Files**: `server/services/import/ExcelParserService.js` (usato sia da `services/import/` sia, via re-export, da `services/importazioni/parsers/ExcelParser.js`).
- **Description**: `xlsx@0.18.5` (ultima versione pubblicata su npm) ha due advisory note: ReDoS nel parsing dei formati numero (GHSA-5pgg-2g8v-p4x9) e prototype pollution (GHSA-4r6h-8v6p-xvw6). SheetJS non pubblica più fix su npm per queste versioni (le release successive sono distribuite solo dal loro CDN privato); non esiste un fix installabile via `npm audit fix` o `npm install xlsx@latest`.
- **Valutato e scartato**: sostituire la libreria (es. `exceljs`) — costo/rischio non ragionevoli in un singolo intervento autonomo, dato che `ExcelParserService.js` ha logica di header-detection e mappatura colonne costruita sulla forma di output specifica di SheetJS, usata da entrambe le pipeline di import; un cambio di libreria richiederebbe re-test estensivo su formati reali di estratti conto che non è possibile eseguire in questa sessione. Installare una versione da un registry/CDN non ufficiale è stato scartato perché introdurrebbe un rischio di supply-chain probabilmente peggiore della vulnerabilità nota.
- **Mitigazioni applicate in questo audit**: `xlsx.read()` ora usa l'opzione `sheetRows: 20000` (limita le righe effettivamente parse-ate), e il parser rifiuta esplicitamente (errore chiaro, non un tentativo silenzioso) un file che raggiunge quel limite, invece di provare a processarlo. Si somma al cap di 5MB già esistente sull'upload e alla validazione MIME/magic-byte a monte.
- **Rischio residuo**: un file .xlsx piccolo ma specificamente crafted per innescare il ReDoS in una singola cella di number-format resta teoricamente possibile entro i limiti di dimensione/righe. Impatto: denial-of-service (CPU) sul processo Node che gestisce la richiesta, non furto/corruzione dati — mitigato ulteriormente da `importUploadLimiter` (30/15min per utente) che limita la frequenza di tentativi.
- **Status**: ACCEPTED RISK con mitigazioni. Rivalutare se SheetJS pubblica un fix su npm, o se il volume di import giustifica la migrazione a un parser alternativo.
- **Tests**: `server/tests/excelParser.test.js` (parsing valido, rifiuto file oversize, rifiuto buffer non-XLSX).

---

## Secrets e .env

### .gitignore
Ignora: `.env`, `**/.env`, `.env.local`, `.env.production`, `.env.development`, `.env.test`, `**/.env.test` (le ultime due aggiunte in questo audit).

### File env nel repository
| File | Tracciato | Contenuto |
|---|---|---|
| `server/.env.example` | Sì | Placeholder sicuri |
| `server/.env.test.example` | Sì | Placeholder test |
| `server/.env.test` | **Rimosso dal tracking in questo audit** (era tracciato in 2 commit) | Credenziali test locali |

### Nome problema: .env.test era committato in git con una password DB reale — CHIUSO (30 settembre 2026)
- **Severity**: High.
- **Priority**: P0 (azione manuale residua).
- **Files**: `.gitignore`, `server/.env.test`.
- **Description**: contrariamente a quanto documentato in precedenza, `server/.env.test` **era effettivamente tracciato in git** (commit `ef77e88` e `6968646`), non ignorato. Il valore di `DB_PASSWORD` nel file coincide con quello reale usato in `server/.env` (verificato per confronto, valore non riportato qui). `JWT_SECRET`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` nel file sembrano invece valori placeholder/test distinti da quelli reali.
- **Impact**: la password del database MySQL locale/di sviluppo è stata esposta nella history del repository. Se questo repository è (o diventa) pubblico, o se chiunque ne ha clonato una copia, quella password deve considerarsi compromessa.
- **Fix applicata in questo audit**: `server/.env.test` rimosso dal tracking (`git rm --cached`, file locale conservato), `.gitignore` aggiornato con `.env.test` e `**/.env.test`. Questo impedisce che il problema si ripeta da qui in avanti, **ma non rimuove il valore dalla history esistente**.
- **Rotazione eseguita il 30 settembre 2026.** Due precisazioni rispetto a come il problema era descritto qui sopra:
  1. **Il database non è più MySQL.** Dal 4 settembre 2026 lo sviluppo gira su PostgreSQL: la password MySQL originariamente esposta non apre più nulla di questo progetto.
  2. **I commit `ef77e88` e `6968646` non esistono in questo repository**, che nasce dalla pubblicazione sanitizzata `6213708`. La history pubblica su GitHub è stata riscansionata per intero: contiene solo file `.example` con segnaposto. Il repository originale non esiste più.

  La password del ruolo PostgreSQL locale è stata comunque cambiata e allineata in `server/.env` e `server/.env.test`, incluso il valore dentro `TEST_DATABASE_URL`.
- **Quanto conta davvero, in locale**: `pg_hba.conf` usa `trust` per le connessioni da `127.0.0.1`, quindi PostgreSQL **non verifica alcuna password** in sviluppo. Cambiare `DB_PASSWORD` non protegge l'ambiente locale: a proteggerlo (o no) è quel file. Per un ambiente locale realmente autenticato occorre passare a `scram-sha-256` in `pg_hba.conf` e riavviare il servizio — modifica alla configurazione della macchina, non del progetto.
- **Produzione non toccata**: `server/.env` non contiene `DATABASE_URL` e punta a `127.0.0.1`. Le credenziali Supabase esistono solo come variabili d'ambiente su Vercel e non sono mai transitate da questi file.
- **Azione manuale opzionale**: se questo repository ha mai avuto un remote pubblico o condiviso con terzi, valutare una pulizia della history (`git filter-repo` o BFG Repo-Cleaner) per rimuovere il valore dai commit `ef77e88` e `6968646`. Non eseguito automaticamente in questo audit (richiede riscrittura history, esplicitamente esclusa dal mandato).
- **Modification risk della fix applicata**: Low — nessun impatto sul comportamento dell'app; i test continuano a leggere `server/.env.test` dal filesystem locale indipendentemente dal tracking git.

### Secrets in codice
- Nessun secret reale trovato nei file tracciati da git.
- `JWT_SECRET` in `.env.example` è placeholder.

---

## Logging

- Winston con sanitizzazione (`logger.js`):
  - Redact: password, token, JWT, email (parziale), importi finanziari, descrizioni transazioni.
  - File: `server/logs/error.log`, `combined.log` (rotazione 10MB, 5 file).
- Produzione: nessuno stack trace nelle risposte API.
- Sviluppo: stack trace incluso nelle risposte (rischio se `NODE_ENV` misconfigurato).

### Nome problema: Stack trace in development mode
- **Severity**: Low
- **Files**: `errorHandler.middleware.js`
- **Description**: Se `NODE_ENV !== 'production'`, le risposte API includono stack trace.
- **Impact**: Info leakage se deployato con NODE_ENV sbagliato.
- **Recommended fix**: Verificare NODE_ENV in produzione.
- **Modification risk**: Low

---

## Operazioni sensibili

| Operazione | Protezioni | Gap |
|---|---|---|
| Delete account | JWT + step-up provider-verified + deleteAccountLimiter + conferma d’intenzione | Richiede configurazione del provider per gli account OAuth |
| Export dati | JWT + step-up provider-verified + exportLimiter | Richiede configurazione del provider per gli account OAuth |
| Reset account | JWT + step-up provider-verified + conferma d’intenzione | Usa il rate limit API generale oltre allo step-up |
| Cambio password | JWT + password attuale | Invalida JWT precedenti |
| Trasferimento | JWT + validazione + ownership + row-level locking (verificato con test di race condition) | No step-up (per design — non distruttivo, reversibile con un altro trasferimento) |
| Import | JWT + rate limit + file validation + ownership per-conto | No step-up (per design) |

### Nome problema: operazioni sensibili senza riverifica per account OAuth — RISOLTO

Le tre rotte applicano `requireStepUp` a utenti locali, Google e Apple. Gli account sociali riverificano l’identità con il provider; challenge, nonce e step-up sono vincolati all’utente e al provider. Per Apple, il `sub` autenticato deve essere quello già collegato. Le stringhe `ELIMINA` e `RESETTA` non autorizzano mai da sole un’operazione.

**Verificato con**: suite backend completa e test specifici Google/Apple, challenge concorrenti, binding identità e provider, endpoint sensibili.

---

## Password Reset

- Token: 64 char hex random, SHA-256 hash in DB.
- TTL: 30 minuti, single-use (`used_at`).
- `forgot-password`: risposta generica (non rivela se email esiste).
- OAuth-only accounts: messaggio specifico (rivela provider).
- Rate limited (authLimiter).

---

## GDPR

- Consenso privacy/termini obbligatorio alla registrazione.
- Export dati completo (JSON) con step-up reale.
- Delete account completo con step-up reale.
- Reset account (movimenti + saldi) con step-up reale.
- Test isolamento dati tra utenti (`gdpr.test.js`, `isolation.test.js`).

---

## Production config validation

`server/config/validateEnv.js`, chiamato prima delle configurazioni dipendenti dall'ambiente sia dal server locale sia dall'handler Vercel: se `NODE_ENV=production` e manca una variabile critica (`JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`, `CRON_SECRET`), se un secret è troppo corto, se solo una tra `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` è impostata, o se Google è configurato senza `GOOGLE_CALLBACK_URL`/`API_URL`, il processo termina subito senza stampare alcun valore sensibile.

## CI/CD

`.github/workflows/ci.yml`: su ogni push/PR verso `main`, esegue in parallelo la suite backend con un PostgreSQL effimero e i test/build del frontend, più `npm audit --audit-level=critical` informativo. Le credenziali presenti nel workflow valgono soltanto per il database temporaneo del job.

## Sicurezza Supabase e Vercel

- Il browser conosce soltanto `VITE_API_URL` e l'eventuale Google Client ID pubblico; non riceve URL o password PostgreSQL.
- Il runtime API usa il Transaction Pooler Supabase con pool Sequelize massimo 2 connessioni per istanza.
- Le migrazioni usano un Session Pooler separato tramite `DATABASE_MIGRATION_URL`, che non deve essere configurato su Vercel.
- Tutte le tabelle WALLT hanno RLS attivo e i privilegi sono revocati ai ruoli Data API `anon` e `authenticated`; l'accesso passa soltanto dal backend, che si connette con il ruolo proprietario (non soggetto a RLS: per questo non serve nessuna policy, e il lint `rls_enabled_no_policy` a livello INFO è lo stato atteso, non un difetto). L'affermazione non è più una convenzione da ricordare: `server/tests/migrazioniReali.test.js` verifica che dopo l'intera catena di migrazioni **nessuna** tabella dello schema `public` resti senza RLS (vedi il problema qui sotto).
- `/api/cron/ricorrenti` usa `CRON_SECRET` con confronto constant-time. L'indice `uniq_movimenti_ricorrenza_periodo` impedisce doppi addebiti anche tra istanze concorrenti.
- In ambiente Vercel Winston usa solo la console e non prova a scrivere nel filesystem della funzione.

## Altri fix applicati (cumulativo, tutte le sessioni di hardening pre-produzione)

- **Google OAuth account pre-hijacking** (Critical, risolto): vedi sezione OAuth sopra.
- **`piani_smart_azioni` esposta alla Data API Supabase** (Critical, risolto il 29 settembre 2026): la migrazione `20260924000032-create-piano-smart-azioni` è l'unica creazione di tabella del progetto che ha dimenticato l'hardening applicato da tutte le altre (`20260830000010`, `20260907000017`, `20260917000024/25`, e la gemella `20260924000031-create-piani-smart`). La tabella è rimasta cinque giorni su un database con dati reali con RLS **disattiva** e `anon`/`authenticated` in possesso di tutti i privilegi — `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` — quindi leggibile e distruggibile da chiunque avesse la chiave anon, che è pubblica per definizione. Contiene `user_id`, importi e testi delle azioni consigliate dei piani. Segnalata dal security advisor Supabase come `rls_disabled_in_public` (ERROR). Risolto applicando `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `REVOKE ALL` su Supabase e portando lo stesso hardening nella migrazione di creazione (per i database nuovi) e in `20260929000040-harden-piano-smart-azioni-access` (per quelli già migrati). La causa vera non era la singola dimenticanza ma il fatto che nessun test la intercettasse: il controllo RLS esistente guardava una tabella per volta, ora `migrazioniReali.test.js` asserisce l'assenza di tabelle senza RLS in tutto lo schema, così ogni tabella futura è coperta senza doverla aggiungere a un elenco (stesso principio di `corsMetodi` per CORS).
- **`quotes`: privilegi Data API su una tabella estranea a WALLT** (Low, risolto il 29 settembre 2026): tabella non prodotta da nessuna migrazione né modello del progetto (`id`, `text`, `author`, `created_at`, `is_favorite`, 294 righe), residuo di un altro uso dello stesso progetto Supabase. RLS era già attiva — quindi nessun dato è mai stato leggibile via Data API — ma `anon`/`authenticated` conservavano i privilegi, e la tabella era discoverable nello schema GraphQL (lint `pg_graphql_anon_table_exposed`). Privilegi revocati subito; la tabella è stata poi **eliminata** su richiesta esplicita (`DROP TABLE public.quotes`, senza `CASCADE`, così una dipendenza inattesa avrebbe fatto fallire l'operazione invece di propagarla). Le righe risalivano al 23-24 settembre **2025**, un anno prima che WALLT nascesse su questo database, ed erano dati generati (`Questa è la citazione numero N` / `Autore N`). Backup completo con `pg_dump` (schema + 294 righe) prodotto prima del drop e consegnato fuori dal repository: un dump di dati altrui non va committato.
- **Step-up Google/Apple OAuth**: il flusso Google era stato rimosso nella decisione storica dell’iterazione 4; questo ramo lo ripristina e aggiunge Apple. Le operazioni sensibili richiedono ora una riverifica provider-verified per entrambi.
- **Cron ricorrenti: doppio addebito su riesecuzione stesso giorno** (Medium/data-integrity, risolto): `ricorrenti.service.js` confrontava la descrizione sbagliata nel controllo anti-duplicazione (quella originale del movimento ricorrente, non quella generata `${descrizione} (automatico)`), quindi il controllo "già creato" non trovava mai nulla e ogni riesecuzione del job nello stesso giorno duplicava il movimento automatico e scalava il saldo due volte. Aggiunta anche una guardia di rientranza (`isRunning`) contro esecuzioni sovrapposte del job. Riprodotto e corretto con `server/tests/ricorrenti.test.js` (8 test, incluso un test esplicito di doppia esecuzione).
- **Frequenze ricorrenti promesse dalla UI ma ignorate dal backend** (Medium/onestà funzionale, risolto): la UI offriva `giornaliera`/`settimanale`/`mensile`/`annuale`, ma il cron processa solo `mensile` (le altre tre richiederebbero campi schema non esistenti — giorno della settimana, mese dell'anno — per essere implementate correttamente). Corretto restringendo UI e validazione API a `mensile`, l'unica realmente supportata, invece di lasciare un'illusione di funzionalità.
- **Rate limit IPv6 bypass** (Medium, risolto): vedi sezione Rate Limiting sopra.
- **Rate limit dedicato su verify-password/google-challenge/verify-google** (Medium, risolto): vedi sezione Rate Limiting sopra.
- **Import: crash su conto_id non valido** (Medium/data-integrity, risolto): `ImportService.confirmImport` faceva `await t.rollback()` e poi lanciava un errore ricatturato dal blocco `catch` esterno, che tentava un secondo `t.rollback()` sulla stessa transazione già chiusa, causando un 500 non gestito invece di un pulito 400. Riprodotto con un test che importa transazioni su un `conto_id` di un altro utente — vedi `server/tests/isolation.test.js`. Corretto rimuovendo il rollback duplicato.
- **Auto-migrate a ogni avvio anche in produzione** (Medium, risolto): `server.js` eseguiva `npx sequelize-cli db:migrate` a ogni avvio del processo, senza distinguere l'ambiente. Su un deploy multi-istanza questo causerebbe migrazioni concorrenti sullo stesso DB; un `DB_NAME` misconfigurato applicherebbe silenziosamente migrazioni al database sbagliato. Corretto: in produzione (`NODE_ENV=production`) l'auto-migrate è disabilitato di default — le migrazioni vanno eseguite come step di deploy separato, prima dell'avvio del processo applicativo. Override esplicito via `RUN_MIGRATIONS_ON_BOOT=true` per chi accetta comunque il rischio su un singolo processo.
- **Production config validation assente** (Medium, risolto): vedi sopra.
- **CSP assente per la SPA** (era documentato Medium lato Helmet, impatto reale nullo lì; risolto dove conta — vedi sezione Helmet/CSP sopra).
- **`npm audit`**: corrette senza breaking change `ip-address` (server, High, SSRF/trust-boundary bypass in un parser IP usato da `express-rate-limit`) e `nanoid`/`postcss` (client, High, build-time). Non risolte: `uuid` (server, Moderate, transitiva via Sequelize, fix disponibile solo forzando un downgrade breaking di Sequelize — non applicato) e `xlsx` (server, High, ReDoS/prototype pollution — nessun fix disponibile su npm, mitigato con `sheetRows` + cap dimensione, vedi sezione File Upload).
- **`GOOGLE_CALLBACK_URL` con fallback placeholder in produzione**: ora bloccato esplicitamente da `validateProductionEnv` se Google è configurato senza (vedi sopra) — non più un footgun silenzioso.
- **`.env.test` committato in git con password DB reale** (High, tracking risolto, rotazione manuale richiesta): vedi sezione Secrets sopra.
- **Nessuna CI/CD**: risolto, vedi sopra.

## Riepilogo vulnerabilità per severity

| Severity | Count | Esempi |
|---|---|---|
| Critical | 0 | — (erano Critical, entrambi **risolti**: Google OAuth account pre-hijacking; `piani_smart_azioni` esposta alla Data API Supabase, 24→29 settembre 2026) |
| High | 1 | `.env.test` con password DB reale nella history Git (tracking risolto, **rotazione manuale ancora richiesta** — vedi Secrets) |
| Medium | 1 | `xlsx` senza fix upstream (ReDoS/prototype pollution, mitigato) |
| Low | 4 | Password policy inconsistente, stack trace dev, no query validation GET, no antivirus upload |
| Info | 2 | CORS config, OAuth-only email reveal |

**Risolti cumulativamente (tutte le sessioni)**: Google OAuth account pre-hijacking (Critical), step-up provider-verified Google/Apple per operazioni sensibili, doppio addebito cron ricorrenti (Medium), frequenze ricorrenti promesse ma ignorate (Medium), rate limit IPv6 bypass (Medium), rate limit step-up assente (Medium), crash import su conto_id non valido (Medium), auto-migrate in produzione (Medium), config validation produzione assente (Medium), CSP SPA assente (Medium), CI/CD assente, 3 dipendenze npm vulnerabili con fix non-breaking. **Aperto con azione manuale**: rotazione password DB (`.env.test` in history). **Richiuso nel ramo iOS**: step-up Google e Apple è obbligatorio sulle operazioni sensibili; le sfide sono persistenti e monouso.
