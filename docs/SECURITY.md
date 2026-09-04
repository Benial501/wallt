# WALLT — Security Audit

> Audit di sicurezza basato sul codice del repository (agosto 2026).
> Ultimo aggiornamento: FINAL PRODUCTION HARDENING — verifica dello stato reale del codice (non dei report precedenti, che contenevano descrizioni contraddittorie sullo step-up Google), test automatici cross-user (USER_A/USER_B), test di coerenza finanziaria e race condition, ricostruzione dello step-up Google reale, CSP, validazione config produzione, CI/CD.
> Nessun penetration test eseguito contro infrastruttura reale. Nessun valore di secret riportato.

## Riepilogo

WALLT ha una **baseline di sicurezza matura**: JWT con invalidazione su cambio password, bcrypt, express-validator, rate limiting (incluso fix IPv6), Helmet, CSP (meta tag SPA + Helmet API), CORS configurabile, magic-byte validation su upload, **step-up auth reale per gli account con password locale** (bcrypt) — ⚠️ **non più richiesto per gli account Google**, per scelta esplicita dell'utente (iterazione 4: vedi Step-up authentication e Operazioni sensibili), scoping `user_id` verificato empiricamente con test automatici cross-user su conti, movimenti, trasferimenti, import, budget, obiettivi, investimenti, scommesse, profilo e step-up (nessun IDOR sfruttabile trovato), e coerenza finanziaria (saldo/movimenti/trasferimenti/race condition) verificata con test dedicati.

**Vulnerabilità critiche trovate e corrette in questo audit**:
1. **Google OAuth account pre-hijacking**: un login Google si collegava automaticamente a un account locale pre-esistente con la stessa email, senza prova di proprietà. Un attaccante poteva pre-registrare l'email di una vittima e ottenere accesso permanente ai suoi dati. **Corretto** — vedi `services/googleAuth.service.js`.
2. **Cron ricorrenti: duplicazione di movimenti/doppio addebito**: il controllo anti-duplicazione del job mensile confrontava la descrizione sbagliata e non trovava mai un "già creato", quindi una riesecuzione nello stesso giorno duplicava il movimento e scalava il saldo due volte. **Corretto** — vedi `services/ricorrenti.service.js`.

**Aree di miglioramento principali residue**: rate limit dedicato su verify-password/google-challenge/verify-google presente ma non testabile end-to-end su infrastruttura reale; `xlsx` (parsing import) senza fix upstream pubblicato per ReDoS/prototype pollution (mitigato con cap righe/dimensione); nessuna verifica email alla registrazione locale (mitigata solo per il vettore Google); test di logica di business (non solo isolamento) mancanti su budget/obiettivi/investimenti/scommesse.

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
- Google OAuth 2.0 via Passport (`passport-google-oauth20`).
- `session: false` (stateless).
- Popup flow con origin allowlist (`oauthPopup.js`).
- COOP `unsafe-none` su route Google per compatibilità popup.
- Apple OAuth: placeholder (`providers` restituisce `apple: false`), **non implementato**.

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

> ⚠️ **Stato attuale (iterazione 4): lo step-up si applica SOLO agli account con password locale.** Su richiesta esplicita dell'utente, la ri-autenticazione Google è stata rimossa da tutte e tre le operazioni sensibili (delete account, reset transazioni, export dati). Il middleware in uso su quelle rotte è `requireStepUpUnlessOAuth`, che **salta** lo step-up quando l'utente non ha una password locale. Per gli account Google l'unica barriera oltre al JWT è ora la conferma testuale `ELIMINA`/`RESETTA` (e nessuna conferma sull'export). Il rischio accettato è descritto sotto; il record della decisione è in `docs/DECISIONS.md`.

Protegge le operazioni finanziarie distruttive con una riverifica recente dell'identità prima di agire, distinta dal semplice possesso di un JWT. Lo `step_up_token` (JWT, `type: step_up`, **5 minuti**, verificato via header `X-Step-Up-Token`, legato a `userId`) resta invariato nel formato.

**Utenti locali** — `POST /api/auth/verify-password`:
- `bcrypt.compare(password, user.password)` contro l'hash reale in DB.
- Un utente Google (senza password) che chiama questo endpoint riceve **400** (`code: 'google_stepup_required'`): non c'è modo di ottenere lo step-up locale su un account Google.

**Utenti Google OAuth** — ⚠️ **non più richiesto sulle operazioni sensibili**. Il meccanismo descritto qui sotto resta implementato e testato (endpoint `POST /api/auth/google/challenge` e `POST /api/auth/verify-google` attivi, composable `useGoogleStepUp.js` presente ma non più usato dalla UI): è stato solo **disattivato come requisito**, così che riattivarlo sia una modifica di una riga nelle rotte. Descrizione del meccanismo, per riferimento:
1. `POST /api/auth/google/challenge` (autenticato): genera un nonce casuale (192 bit) incapsulato in un JWT "challenge" (`type: google_stepup_challenge`, legato a `req.userId`, scadenza **2 minuti**). Rifiuta (400) se l'utente non è un account Google collegato.
2. Il frontend (`useGoogleStepUp.js`) inizializza Google Identity Services con quel nonce e mostra il **pulsante ufficiale "Continua con Google"** — richiede sempre un click esplicito, nessun One Tap silenzioso.
3. Google restituisce un ID token JWT firmato che incorpora il nonce.
4. `POST /api/auth/verify-google { credential, challenge }` (`googleStepUp.controller.js` + `googleStepUp.service.js`) verifica, in ordine:
   - il `challenge` (firma, scadenza, `type`, `userId === req.userId`) — mai fidarsi di valori dal body per l'identità;
   - che il nonce del challenge **non sia già stato consumato** (single-use, tracking in-memory — vedi limite noto sotto);
   - l'ID token con `google-auth-library` (`verifyIdToken`): firma RS256 contro le chiavi pubbliche di Google, `audience === GOOGLE_CLIENT_ID`, issuer, scadenza — verificati dalla libreria ufficiale;
   - `payload.nonce === nonce del challenge`;
   - `payload.iat` non più vecchio di 120s e non nel futuro oltre 10s di clock-skew (freschezza della credenziale);
   - `payload.sub === user.google_id`, dove `user` è caricato da `req.userId` (JWT WALLT già autenticato) — **mai** da valori inviati nel body.
5. Solo dopo tutti i controlli il nonce viene marcato consumato ed emesso lo `step_up_token`.

**Le stringhe `ELIMINA`/`RESETTA` non sono un meccanismo di autenticazione**: sono stringhe pubbliche, note a chiunque legga la UI. Proteggono dall'azione accidentale, non da un attaccante. Dall'iterazione 4 sono però, per gli account Google, l'**unica** barriera oltre al JWT su reset e delete — vedi il rischio accettato qui sotto.

**Limite noto — challenge single-use solo in-memory**: il tracking dei nonce consumati (`googleStepUp.service.js`) vive in una `Map` del processo Node corrente, non in DB/Redis (scelta deliberata, coerente con lo store in-memory già usato da `express-rate-limit`). Conseguenze: un riavvio del server azzera lo stato (non una regressione, solo un ritorno temporaneo al comportamento "nessun nonce già visto"); un deploy multi-istanza (oggi non presente — single process) non condividerebbe il tracking tra istanze. Non blocca l'uso attuale.

**Storia di questa decisione**: implementata inizialmente in questa forma, poi rimossa su richiesta esplicita per semplicità (tornando alle sole frasi pubbliche), poi **reimplementata in questo audit** esattamente in questa forma dopo una nuova richiesta esplicita di hardening pre-produzione. Vedi `docs/DECISIONS.md` per il record completo, incluse le motivazioni di ciascuna fase.

- Usato per: export dati, delete account, **reset account**.
- **NON usato per**: cambio password, trasferimenti (per design — non distruttivi o già protetti da altri controlli).

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
| stepUpLimiter | verify-password, google/challenge, verify-google | 20 / 15 min | userId |
| exportLimiter | export | 3 / ora | userId |
| deleteAccountLimiter | delete account | 3 / ora | userId |
| importUploadLimiter | upload | 30 / 15 min | userId |
| importConfirmLimiter | conferma import | 15 / ora | userId |

Tutti i limiter con fallback IP (`apiLimiter`, `authLimiter`) usano l'helper ufficiale `ipKeyGenerator` di `express-rate-limit` per normalizzare gli indirizzi IPv6. Per le rotte auth pubbliche la chiave viene trasformata in SHA-256 e il contatore viene incrementato atomicamente nella tabella `auth_rate_limits`; l'IP non è salvato in chiaro e il limite non si azzera cambiando istanza Vercel.

### Nome problema: verify-password/google-challenge/verify-google senza rate limit dedicato — RISOLTO
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

### Nome problema: .env.test era committato in git con una password DB reale — PARZIALMENTE RISOLTO, AZIONE MANUALE RICHIESTA
- **Severity**: High.
- **Priority**: P0 (azione manuale residua).
- **Files**: `.gitignore`, `server/.env.test`.
- **Description**: contrariamente a quanto documentato in precedenza, `server/.env.test` **era effettivamente tracciato in git** (commit `ef77e88` e `6968646`), non ignorato. Il valore di `DB_PASSWORD` nel file coincide con quello reale usato in `server/.env` (verificato per confronto, valore non riportato qui). `JWT_SECRET`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` nel file sembrano invece valori placeholder/test distinti da quelli reali.
- **Impact**: la password del database MySQL locale/di sviluppo è stata esposta nella history del repository. Se questo repository è (o diventa) pubblico, o se chiunque ne ha clonato una copia, quella password deve considerarsi compromessa.
- **Fix applicata in questo audit**: `server/.env.test` rimosso dal tracking (`git rm --cached`, file locale conservato), `.gitignore` aggiornato con `.env.test` e `**/.env.test`. Questo impedisce che il problema si ripeta da qui in avanti, **ma non rimuove il valore dalla history esistente**.
- **ROTATE REQUIRED**: cambiare la password dell'utente MySQL usato in sviluppo/test (`DB_PASSWORD` in `server/.env` e `server/.env.test`) prima del lancio, indipendentemente da dove sia ospitato il DB di produzione (che deve comunque avere credenziali proprie, mai condivise con dev/test).
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
| Delete account | **Locali**: JWT + step-up bcrypt + rate limit + password. **Google**: JWT + conferma `ELIMINA` + rate limit | ⚠️ Account Google: nessuna riverifica di identità (iterazione 4) |
| Export dati | **Locali**: JWT + step-up bcrypt + rate limit. **Google**: JWT + rate limit | ⚠️ Account Google: nessuna riverifica di identità, e nessuna conferma testuale |
| Reset account (unico endpoint, elimina movimenti e azzera saldi) | **Locali**: JWT + step-up bcrypt + password. **Google**: JWT + conferma `RESETTA` | ⚠️ Account Google: nessuna riverifica di identità. Inoltre nessun rate limit dedicato sull'endpoint stesso |
| Cambio password | JWT + password attuale | Invalida JWT precedenti |
| Trasferimento | JWT + validazione + ownership + row-level locking (verificato con test di race condition) | No step-up (per design — non distruttivo, reversibile con un altro trasferimento) |
| Import | JWT + rate limit + file validation + ownership per-conto | No step-up (per design) |

### Nome problema: reset-account/delete-account/export senza riverifica di identità per utenti Google — RISCHIO ACCETTATO (riaperto)
- **Severity**: High per gli account Google. Non applicabile agli account locali, che mantengono lo step-up bcrypt reale.
- **Files**: `server/middleware/stepUp.middleware.js` (`requireStepUpUnlessOAuth`), `server/routes/impostazioni.routes.js`, `client/src/views/ImpostazioniView.vue`.
- **Storia**: risolto nell'audit precedente con la ri-autenticazione Google, poi **riaperto deliberatamente** su richiesta esplicita dell'utente (iterazione 4, vedi `docs/DECISIONS.md`). Causa scatenante: il client OAuth in Google Cloud non ha origini JavaScript autorizzate, quindi Google Identity Services rispondeva `401 invalid_client — no registered origin` e lo step-up era inutilizzabile in pratica. L'utente ha scelto la rimozione invece della configurazione dell'origin.
- **Impatto**: chi ottiene un JWT WALLT valido di un utente Google (XSS, furto del token da `localStorage`, sessione lasciata aperta su un dispositivo condiviso) può esportare tutti i dati finanziari, azzerare le transazioni ed eliminare l'account senza possedere le credenziali Google. Le stringhe `ELIMINA`/`RESETTA` sono pubbliche e non costituiscono un ostacolo per un attaccante.
- **Mitigazioni residue**: `deleteAccountLimiter` (3/15min), `exportLimiter`, scadenza JWT 7 giorni, invalidazione su `password_changed_at`.
- **Come richiudere il gap** (tre passi, tutti necessari):
  1. Registrare `http://localhost:5173` e il dominio di produzione tra le **origini JavaScript autorizzate** del client OAuth in Google Cloud (il redirect URI è già a posto: il login Google funziona).
  2. Aggiungere `https://accounts.google.com` a **`style-src`** nella CSP di `client/index.html`. Verificato in questo intervento: con la CSP attuale il foglio di stile del pulsante GIS (`https://accounts.google.com/gsi/style`) viene bloccato — `script-src`, `frame-src` e `connect-src` lo consentono già, `style-src` no.
  3. Rimettere `requireStepUp` al posto di `requireStepUpUnlessOAuth` sulle tre rotte in `impostazioni.routes.js` e ripristinare il pulsante Google nei tre modali di `ImpostazioniView.vue`. Backend, composable `useGoogleStepUp.js` e test del meccanismo sono rimasti in essere.
- **Verificato con**: `server/tests/googleStepUp.test.js` (18 test — il meccanismo Google resta coperto; 4 test nuovi fissano il comportamento attuale: account Google reset/delete senza step-up, conferma errata comunque rifiutata, utenti locali ancora sotto step-up).
- **Modification risk**: Low — nessuna modifica alla logica finanziaria di `resetAccount()`/`deleteAllTransactions`/`deleteAllUserData`.

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
- Tutte le tabelle WALLT hanno RLS attivo e i privilegi sono revocati ai ruoli Data API `anon` e `authenticated`; l'accesso passa soltanto dal backend.
- `/api/cron/ricorrenti` usa `CRON_SECRET` con confronto constant-time. L'indice `uniq_movimenti_ricorrenza_periodo` impedisce doppi addebiti anche tra istanze concorrenti.
- In ambiente Vercel Winston usa solo la console e non prova a scrivere nel filesystem della funzione.

## Altri fix applicati (cumulativo, tutte le sessioni di hardening pre-produzione)

- **Google OAuth account pre-hijacking** (Critical, risolto): vedi sezione OAuth sopra.
- **Step-up Google OAuth**: reimplementato in questo audit, poi **rimosso di nuovo su richiesta esplicita** (iterazione 4). Torna a essere un rischio accettato per gli account Google — vedi sezione Step-up authentication e Operazioni sensibili.
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
| Critical | 0 | — (Google OAuth account pre-hijacking era Critical: **risolto**) |
| High | 2 | `.env.test` con password DB reale committata in history (tracking risolto, **rotazione manuale ancora richiesta** — vedi Secrets); nessuna riverifica di identità sulle operazioni distruttive per gli account Google (**rischio accettato esplicitamente**, iterazione 4) |
| Medium | 2 | `xlsx` senza fix upstream (ReDoS/prototype pollution, mitigato); reset-account senza rate limit dedicato sull'endpoint stesso (solo sullo step-up che lo precede) |
| Low | 4 | Password policy inconsistente, stack trace dev, no query validation GET, no antivirus upload |
| Info | 2 | CORS config, OAuth-only email reveal |

**Risolti cumulativamente (tutte le sessioni)**: Google OAuth account pre-hijacking (Critical), step-up Google non reale (era High), doppio addebito cron ricorrenti (Medium), frequenze ricorrenti promesse ma ignorate (Medium), rate limit IPv6 bypass (Medium), rate limit step-up assente (Medium), crash import su conto_id non valido (Medium), auto-migrate in produzione (Medium), config validation produzione assente (Medium), CSP SPA assente (Medium), CI/CD assente, 3 dipendenze npm vulnerabili con fix non-breaking. **Aperto con azione manuale**: rotazione password DB (`.env.test` in history). **Riaperto per scelta di prodotto**: step-up Google (iterazione 4) — richiudibile registrando l'origin JavaScript in Google Cloud e ripristinando `requireStepUp` sulle tre rotte.
