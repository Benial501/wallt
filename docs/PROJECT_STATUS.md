# WALLT — Project Status

> Fotografia dello stato attuale del progetto (audit agosto 2026).

## Implemented Features

Funzionalità realmente implementate e collegate end-to-end (frontend + backend):

| Feature | Frontend | Backend | Test |
|---|---|---|---|
| Registrazione email/password | LoginView, RegisterView | auth.controller | auth.test.js |
| Login email/password | LoginView | auth.controller | auth.test.js |
| Google OAuth (popup) | useOAuthPopup, AuthCallbackView | passport.js, googleAuth.service | auth.test.js (mock) |
| Onboarding questionario | OnboardingView | profilo.controller | profilo.test.js |
| Dashboard patrimonio | DashboardView, WOverviewCarousel | conti.controller | — |
| Gestione conti CRUD | ContiView | conti.controller | — |
| Trasferimenti tra conti | MovimentoForm (trasferimento) | conti.controller.trasferimento | — |
| Movimenti CRUD | MovimentiView, MovimentoForm | movimenti.controller | security.test.js (parziale) |
| Movimenti ricorrenti (mensile) | MovimentoForm (flag ricorrente) | ricorrenti.service (cron) | — |
| Budget mensile | BudgetView | budget.controller | — |
| Obiettivi risparmio | ObiettiviView | obiettivi.controller | — |
| Analisi spese/patrimonio | AnalisiView | analisi.controller | — |
| Suggerimenti automatici | SuggerimentoCard | analisi.controller | — |
| Import estratti conto | ImportaView | importazioni/ + import/ | — |
| Categorizzazione AI (locale) | ImportaView (preview) | CategoryMatcherService | — |
| Categorizzazione OpenAI (opz.) | — | OpenAICategoryClassifier | — |
| Scommesse (piattaforme + movimenti) | ScommesseView | scommesse.controller | — |
| Scommesse ↔ Conti sync | ContiView, ScommesseView | scommesseContoSync.service | — |
| Investimenti (portafoglio) | InvestimentiView | investimenti.controller | — |
| Reset password (Resend) | ForgotPassword, ResetPassword | passwordReset.service | auth.test.js |
| Step-up auth: bcrypt per gli account con password locale; ⚠️ **saltato** per gli account Google (`requireStepUpUnlessOAuth`, iterazione 4) | ImpostazioniView | verifyPassword.controller, stepUp.middleware | auth.test.js, gdpr.test.js, googleStepUp.test.js |
| Export dati GDPR | ImpostazioniView | impostazioni.controller | gdpr.test.js |
| Delete account | ImpostazioniView | accountReset.service | gdpr.test.js |
| Reset account (unico endpoint, elimina movimenti e azzera saldi conti, protetto da step-up) | ImpostazioniView | accountReset.service (`deleteAllTransactions`) | gdpr.test.js |
| Tema dark/light | useTheme, ImpostazioniView | impostazioni.controller | — |
| Restrizioni minori (<18) | featureAccess.js, router | featureAccess.middleware | profilo.test.js |
| Feature flags (scommesse/investimenti) | ImpostazioniView, router | User model + middleware | profilo.test.js |
| Privacy/Termini statici | PrivacyPolicy, TermsView | — | — |
| Transazioni recenti home | RecentTransactions | movimenti.controller (ordine=caricamento) | — |
| Categoria trasferimento_denaro | categorie.js | constants/categorie.js | — |

## Partially Implemented Features

| Feature | Stato | Dettaglio |
|---|---|---|
| Spese ricorrenti | Parziale | Solo `mensile` è supportata (API/UI ora limitate a questa, coerenti col cron — vedi Known Bugs risolti). Colonna DB resta ENUM a 4 valori per retrocompatibilità storica, ma non più raggiungibile via API. |
| Merchant Intelligence | Parziale | Dizionario locale + regole personali funzionanti; lookup esterni (Google Places, Foursquare, OSM) sono stub |
| Apple OAuth | Parziale | Endpoint `/providers` restituisce `apple: false`; nessuna implementazione |
| Budget suggerito da profilo | Parziale | API `GET /profilo/budget-suggerito` esiste; frontend non la chiama |
| Movimenti ricorrenti UI | Parziale | API `GET /movimenti/ricorrenti` esiste; nessuna view la usa |
| CI/CD | Base | `.github/workflows/ci.yml`: test backend + build frontend su ogni push/PR verso `main`. Deploy resta manuale. |
| Test coverage | Parziale | 12 suite (auth, security, gdpr, profilo, import, categorization, isolation, googleStepUp, financialConsistency, ricorrenti, excelParser, validateEnv); 125 test. Isolamento cross-user, coerenza finanziaria (saldo/trasferimenti/race condition), step-up Google, cron ricorrenti, config produzione coperti. Non coperta: logica di business di budget/obiettivi/investimenti/scommesse (solo isolamento) |

## Missing / Planned Features

Deducibili da codice, commenti o documentazione esistente ma **non implementati**:

| Feature | Fonte | Note |
|---|---|---|
| Apple Sign-In | `.env.example`, `/providers` | Placeholder only |
| 2FA TOTP | WALLT_IMPLEMENTATION_REPORT.md | Menzionato come futuro |
| Cookie banner | WALLT_IMPLEMENTATION_REPORT.md | Da confermare legalmente |
| Dashboard admin | WALLT_IMPLEMENTATION_REPORT.md | Audit consensi |
| i18n documenti legali | WALLT_IMPLEMENTATION_REPORT.md | Solo italiano attualmente |
| OpenAPI/Swagger spec | Assente nel repo | — |
| Docker/containerization | Assente nel repo | — |
| Backup DB automatizzato | Assente nel repo | — |
| E2E test (Playwright/Cypress) | Assente nel repo | — |
| Linting frontend (ESLint) | Assente nel repo | — |

## Known Bugs

| Bug | Gravità | File | Dettaglio |
|---|---|---|---|
| Session reset incompleto | Medium | `session.js` | Logout non pulisce `recentiHome` (movimenti.store) né `panoramica`/`analisi` (scommesse.store); lo store `analisi` principale viene invece resettato correttamente |
| ~~Cron ricorrenti: doppio addebito su riesecuzione~~ | ~~High~~ | `ricorrenti.service.js` | **Risolto**: il controllo anti-duplicazione confrontava la descrizione sbagliata e non trovava mai un "già creato" — ogni riesecuzione nello stesso giorno duplicava il movimento e scalava il saldo due volte. Corretto + guardia di rientranza contro esecuzioni sovrapposte. Vedi `tests/ricorrenti.test.js`. |
| Logout cache leak cross-user | Medium | `session.js`, `movimenti.store.js` | Dati precedente utente visibili brevemente dopo login diverso |
| `fetchBudgetSuggerito` mai chiamato | Low | `profilo.store.js` | API esistente ma UI non la usa |
| `fetchRicorrenti` mai chiamato | Low | `movimenti.store.js` | API esistente ma UI non la usa |
| Componenti dashboard orfani | Low | `SummaryCards.vue`, ecc. | Creati ma mai importati |
| `minorRestriction.middleware.js` non usato | Low | `middleware/` | Dead code, logica duplicata in featureAccess |
| Migrazioni duplicate auth | Low | `migrations/` | Due migrazioni per auth_provider |

## Technical Debt

| Item | Area | Dettaglio |
|---|---|---|
| Dual import pipeline | Backend | `import/` + `importazioni/` con re-export |
| Feature access duplicata | Full-stack | Logica in client + server separatamente |
| `toBool()` duplicato | Frontend | `auth.store.js` + `featureAccess.js` |
| `formatValuta` duplicato | Frontend | `useValuta.js` + `formatters.js` |
| `isMobile` + resize listener | Frontend | Ripetuto in 5+ view senza composable |
| OAuth relay duplicato | Frontend | `oauth-relay.html` + `AuthCallbackView.vue` |
| Categorie whitelist in 6+ file | Backend | Aggiornare tutti per nuova categoria |
| Nessun lint frontend | Tooling | Nessun ESLint/Prettier configurato |
| ~~Nessuna CI/CD~~ | DevOps | **Risolto**: `.github/workflows/ci.yml` (test backend + build frontend su push/PR); deploy resta manuale |
| ~~Auto-migrate all'avvio~~ | Backend | **Risolto**: disabilitato di default quando `NODE_ENV=production` (vedi `server.js`, `RUN_MIGRATIONS_ON_BOOT`) |
| Merchant lookup stubs | Backend | 3 provider placeholder |
| `authStore._lastFetchMeAt` hack | Frontend | Proprietà interna settata dal router |

## Duplicate / Dead Code

| File | Tipo | Note |
|---|---|---|
| `server/middleware/minorRestriction.middleware.js` | Dead code | Mai importato da route |
| `client/src/views/PlaceholderView.vue` | Dead code | Non nel router |
| `client/src/composables/useGoogleStepUp.js` | Inutilizzato **di proposito** | Non più importato da nessuna view dopo l'iterazione 4 (rimozione step-up Google). **Non rimuovere senza chiedere**: è tenuto insieme al backend `googleStepUp.*` per poter riattivare lo step-up con una modifica minima. Vedi `docs/DECISIONS.md` |
| `client/src/components/dashboard/SummaryCards.vue` | Dead code | Mai importato |
| `client/src/components/dashboard/CategoryCarousel.vue` | Dead code | Mai importato |
| `client/src/components/dashboard/CategoryCard.vue` | Dead code | Solo usato da CategoryCarousel (anch'esso morto) |
| `client/src/components/dashboard/GlassBalanceCard.vue` | Dead code | Sostituito da WOverviewCarousel |
| `client/src/assets/main.css` | Dead code | Scaffold Vue, non importato |
| `server/services/merchant/lookup/providers/*.js` | Stub | Tutti ritornano null |
| `importLimiter` in rateLimit.middleware.js | Deprecated | Alias non usato |

## Testing Status

| Suite | File | Test | Copertura |
|---|---|---|---|
| Auth | `tests/auth.test.js` | Register, login, reset password, OAuth mock, step-up locale | Auth completo |
| Security | `tests/security.test.js` | 401, SQL injection, XSS, rate limit | Parziale |
| GDPR | `tests/gdpr.test.js` | Export isolation, delete/reset step-up, cross-user | GDPR base |
| Profilo | `tests/profilo.test.js` | Onboarding, feature flags, minori | Profilo base |
| Import | `tests/import.test.js` | DuplicateChecker, riesportazione mensile con transazioni sovrapposte | Import base |
| Categorization | `tests/categorization.test.js` | matchesKeyword, CategoryMatcher, CategoryKnowledgeBase, LocalAIClassifier | Categorizzazione base |
| Isolation (IDOR/BOLA) | `tests/isolation.test.js` | USER_A vs USER_B su conti, movimenti, trasferimenti, import, budget, obiettivi, investimenti, scommesse, step-up token, profilo — lettura/modifica/cancellazione con ID sostituiti nell'URL/body | Isolamento cross-user completo sulle risorse finanziarie principali |

**Non testato** (logica di business, non isolamento): CRUD conti/movimenti al di là dell'ownership, budget, obiettivi, scommesse, investimenti, analisi, merchant/AI, cron, sync scommesse-conti.

**Frontend**: nessun test (né unit né E2E).

**Lint**: nessun linter configurato (né backend né frontend).

**Build**: `npm run build` in client/ (verificato — nessun errore). `npm test` in server/ (125 test, richiede MySQL test DB). CI: `.github/workflows/ci.yml` esegue entrambi su ogni push/PR.

## Production Readiness

### Voto: 5/10

| Criterio | Voto | Note |
|---|---|---|
| Funzionalità core | 8/10 | Tutte le feature principali implementate |
| Sicurezza | 6/10 | Step-up reale solo per gli account con password locale (⚠️ saltato per Google, rischio accettato); rate limit dedicato; CSP SPA; residui: riverifica identità Google, rotazione password DB (.env.test in history), xlsx senza fix upstream (mitigato) |
| Test | 6/10 | 12 suite backend incluso isolamento cross-user, coerenza finanziaria e race condition; nessun test frontend |
| DevOps | 2/10 | No CI/CD, no Docker, no backup, deploy manuale |
| Documentazione | 6/10 | README + report interni; ora docs/ completa |
| Performance | 5/10 | Nessun caching, dashboard fa 8+ API call |
| Monitoring | 1/10 | Solo Winston file log, nessun APM/uptime |
| Scalabilità | 4/10 | Monolite Node, cron interno, no worker |

**Motivazione**: L'app è funzionalmente solida per il lancio: isolamento cross-user, coerenza finanziaria (incluse race condition) verificati con test automatici, CI/CD di base presente. ⚠️ Lo step-up reale copre però i soli account con password locale: per gli account Google le operazioni distruttive non hanno riverifica di identità (rischio accettato, iterazione 4). Restano azioni infrastrutturali esterne al codice (rotazione password DB, **origini JavaScript autorizzate nel client OAuth Google Cloud**, config hosting produzione, backup, monitoring) e test di logica di business su budget/obiettivi/investimenti/scommesse (oggi coperti solo per isolamento). Vedi `docs/SECURITY.md` per il report completo del final production hardening.

---

## Audit per categoria

| Categoria | Voto | Motivazione |
|---|---|---|
| Architettura | 6/10 | Monolite funzionale ma dual import pipeline e logica duplicata |
| Qualità codice | 6/10 | Convenzioni consistenti, ma dead code e duplicazioni |
| Frontend | 7/10 | Vue 3 ben strutturato, componenti orfani, no test |
| Backend | 7/10 | Pattern controller→service solido, gap test e import duale |
| Database | 7/10 | Schema coerente, migrazioni duplicate, no backup |
| API | 7/10 | 64 endpoint ben organizzati, gap validazione GET |
| Autenticazione | 7/10 | JWT + OAuth + step-up reale per i soli account con password locale (⚠️ nessuna riverifica per gli account Google) + invalidazione password |
| Sicurezza | 6/10 | Baseline solida, ma nessuna riverifica di identità sulle operazioni distruttive per gli account Google (rischio accettato); rate limit dedicato, CSP SPA, config produzione validata all'avvio; residuo rotazione password DB |
| Performance | 5/10 | Nessun caching, troppe API call per pagina |
| UX | 7/10 | UI italiana completa, responsive, tema dark/light |
| Gestione errori | 7/10 | Centralizzata backend, frontend con toast ma inconsistente |
| Manutenibilità | 5/10 | Dual import, categorie in 6+ file, no lint, no CI |
| Duplicazioni | 4/10 | Feature access, import, formatValuta, toBool, isMobile |
| Technical debt | 5/10 | Accumulo moderato, gestibile con refactoring mirato |
| Bug potenziali | 6/10 | Nessun bug critico noto, cache leak su logout |
| Testing | 6/10 | 125 test backend (isolamento cross-user, coerenza finanziaria, race condition, step-up Google, cron), zero frontend |
| Scalabilità | 4/10 | Single process, cron interno, no caching layer |

---

## Problemi trovati

### P-1: reset-account/delete-account/export senza riverifica identità per Google — RIAPERTO, RISCHIO ACCETTATO
- **Severity**: High per gli account Google (nessun impatto sugli account con password locale).
- **Area**: Sicurezza
- **Files**: `server/middleware/stepUp.middleware.js`, `server/routes/impostazioni.routes.js`, `client/src/views/ImpostazioniView.vue`.
- **Stato attuale**: le tre rotte usano `requireStepUpUnlessOAuth`. Gli utenti con password locale mantengono lo step-up bcrypt reale; per gli account Google lo step-up è saltato e resta solo la conferma testuale `ELIMINA`/`RESETTA` (l'export non ha nemmeno quella).
- **Storia**: ri-autenticazione Google implementata → rimossa per semplicità → reimplementata nel final production hardening → **rimossa di nuovo su richiesta esplicita** (iterazione 4). Causa scatenante: il client OAuth in Google Cloud non ha origini JavaScript autorizzate, quindi Google Identity Services risponde `401 invalid_client — no registered origin` e lo step-up era inutilizzabile. Vedi `docs/DECISIONS.md` per il record completo delle quattro iterazioni.
- **Come richiudere**: registrare `http://localhost:5173` e il dominio di produzione tra le origini JavaScript autorizzate del client OAuth, poi rimettere `requireStepUp` sulle tre rotte e ripristinare il pulsante Google nei modali. Backend, composable e test del meccanismo sono stati mantenuti apposta.
- **Verificato con**: `server/tests/googleStepUp.test.js` (18 test, 4 dei quali fissano il comportamento attuale) + `auth.test.js`, `gdpr.test.js`.
- **Risk of modification**: Low — nessuna modifica alla logica finanziaria di `resetAccount()`/`deleteAllTransactions`.
- **Priority**: P0 da richiudere prima del lancio con dati reali.

### P-2: .env.test committato in git con password DB reale — TRACKING RISOLTO, ROTAZIONE MANUALE RICHIESTA
- **Severity**: High (era documentato Medium sottostimando l'impatto: il file era effettivamente tracciato, non solo a rischio).
- **Area**: Sicurezza / Secrets
- **Files**: `.gitignore`, `server/.env.test`
- **Description**: `server/.env.test` era tracciato in git (2 commit), con un `DB_PASSWORD` identico a quello reale usato in `server/.env`.
- **Why it is a problem**: quella password del database deve considerarsi compromessa se il repository è mai stato o diventa condiviso/pubblico.
- **Fix applicata**: rimosso dal tracking (`git rm --cached`), `.gitignore` aggiornato.
- **MANUAL ACTION REQUIRED**: ruotare la password DB usata in dev/test prima del lancio (vedi `docs/SECURITY.md`).
- **Risk of modification**: Low
- **Priority**: P0 (azione manuale residua, non più codice)

### P-3: Dual import pipeline
- **Severity**: High
- **Area**: Architettura
- **Files**: `server/services/import/`, `server/services/importazioni/`
- **Description**: Due layer di import con re-export incrociati.
- **Why it is a problem**: Confusione su dove modificare, rischio fix nel posto sbagliato.
- **Possible consequences**: Bug in import non risolti correttamente.
- **Recommended solution**: Consolidare in un unico modulo.
- **Risk of modification**: High
- **Priority**: P1

### P-4: Test coverage insufficiente
- **Severity**: High
- **Area**: Testing
- **Files**: `server/tests/` (5 suite, tutte su auth/GDPR/profilo/security)
- **Description**: Nessun test su conti, movimenti, import, budget, trasferimenti.
- **Why it is a problem**: Regressioni non rilevate su logica finanziaria critica.
- **Possible consequences**: Bug su saldi, trasferimenti, import.
- **Recommended solution**: Aggiungere test per movimenti.controller e conti.controller.
- **Risk of modification**: Low
- **Priority**: P1

### P-5: Nessuna CI/CD
- **Severity**: Medium
- **Area**: DevOps
- **Files**: Nessun `.github/workflows/`
- **Description**: Nessuna pipeline automatica.
- **Why it is a problem**: Test e build non eseguiti automaticamente su PR.
- **Possible consequences**: Regressioni mergeate senza controllo.
- **Recommended solution**: GitHub Actions con `npm test` su PR.
- **Risk of modification**: Low
- **Priority**: P1

### P-6: Cron ricorrenti incompleto
- **Severity**: Medium
- **Area**: Backend
- **Files**: `server/services/ricorrenti.service.js`
- **Description**: Modello supporta 4 frequenze, cron processa solo mensile.
- **Why it is a problem**: Utente può creare ricorrenti giornaliere/settimanali/annuali che non vengono mai eseguite.
- **Possible consequences**: Aspettativa utente non soddisfatta.
- **Recommended solution**: Implementare tutte le frequenze o limitare UI a mensile.
- **Risk of modification**: Medium
- **Priority**: P2

### P-7: Session reset incompleto
- **Severity**: Medium
- **Area**: Frontend
- **Files**: `client/src/utils/session.js`
- **Description**: Logout non pulisce `recentiHome` (movimenti.store) né i campi `panoramica`/`analisi` interni allo store `scommesse`. Lo store `analisi` principale viene invece resettato correttamente in `resetPiniaStores()`.
- **Why it is a problem**: Dati utente precedente visibili brevemente.
- **Possible consequences**: Leak dati tra sessioni sullo stesso browser.
- **Recommended solution**: Reset completo di tutti gli store in `resetPiniaStores()`.
- **Risk of modification**: Low
- **Priority**: P2

### P-8: Feature access logic duplicata
- **Severity**: Medium
- **Area**: Architettura
- **Files**: `client/src/utils/featureAccess.js`, `server/utils/featureAccess.js`
- **Description**: Stessa logica implementata separatamente.
- **Why it is a problem**: Disallineamento frontend/backend possibile.
- **Possible consequences**: Utente vede feature che API blocca (o viceversa).
- **Recommended solution**: Backend come source of truth.
- **Risk of modification**: Medium
- **Priority**: P2

### P-9: Auto-migrate in produzione
- **Severity**: Medium
- **Area**: Database
- **Files**: `server/server.js`
- **Description**: Migrazioni eseguite ad ogni avvio server.
- **Why it is a problem**: Race condition con istanze multiple.
- **Possible consequences**: Corruzione schema DB.
- **Recommended solution**: Migrazioni come step deploy separato.
- **Risk of modification**: Low
- **Priority**: P2

### P-10: Codice morto
- **Severity**: Low
- **Area**: Manutenibilità
- **Files**: Vedi sezione Duplicate / Dead Code
- **Description**: 8+ file/componenti non utilizzati.
- **Why it is a problem**: Confusione per sviluppatori.
- **Possible consequences**: Modifiche al file sbagliato.
- **Recommended solution**: Rimuovere dopo verifica.
- **Risk of modification**: Low
- **Priority**: P3

---

## Roadmap

### P0 — Critical

| Task | Obiettivo | File/Area | Difficoltà | Rischio | Dipendenze |
|---|---|---|---|---|---|
| ~~Step-up su reset-account/delete-account/export~~ | ~~Proteggere operazioni distruttive~~ | `impostazioni.routes.js`, `verifyPassword.controller.js`, `googleStepUp.*` | — | — | **Risolto** (reale per locali e Google) |
| ~~.env.test in .gitignore~~ | ~~Prevenire leak credenziali~~ | `.gitignore` | — | — | **Risolto** (tracking; rotazione password DB resta MANUAL ACTION) |

### P1 — High Priority

| Task | Obiettivo | File/Area | Difficoltà | Rischio | Dipendenze |
|---|---|---|---|---|---|
| Test movimenti + conti | Coprire logica saldo e trasferimenti | `server/tests/` | Medium | Low | — |
| CI/CD GitHub Actions | Test automatici su PR | `.github/workflows/` | Low | Low | — |
| ~~Rate limit verify-password/google-challenge/verify-google~~ | ~~Prevenire brute-force step-up~~ | `rateLimit.middleware.js`, `app.js` | — | — | **Risolto** (`stepUpLimiter`, 20/15min per utente) |
| Rate limit reset-account | Limitare tentativi reset | `impostazioni.routes.js` | Low | Low | — |

### P2 — Medium Priority

| Task | Obiettivo | File/Area | Difficoltà | Rischio | Dipendenze |
|---|---|---|---|---|---|
| Consolidare import pipeline | Unificare import/ e importazioni/ | `server/services/` | High | High | Test import (P1) |
| Fix session reset | Pulire `recentiHome` (movimenti.store) e `panoramica`/`analisi` (scommesse.store) | `session.js` | Low | Low | — |
| Cron tutte le frequenze | O implementare o limitare UI | `ricorrenti.service.js` | Medium | Medium | — |
| Rimuovere codice morto | Pulizia componenti e middleware | client + server | Low | Low | — |
| Migrazioni come step deploy | Rimuovere auto-migrate | `server.js` | Low | Low | CI/CD (P1) |
| Allineare password policy | Carattere speciale anche su change | `validation.middleware.js` | Low | Low | — |

### P3 — Future Improvements

| Task | Obiettivo | File/Area | Difficoltà | Rischio | Dipendenze |
|---|---|---|---|---|---|
| Apple Sign-In | OAuth provider aggiuntivo | auth, passport | High | Medium | — |
| 2FA TOTP | Autenticazione a due fattori | auth | High | High | — |
| Merchant lookup reali | Implementare provider esterni | `merchant/lookup/` | Medium | Low | — |
| E2E test Playwright | Test browser automatizzati | nuovo | High | Low | CI/CD (P1) |
| ESLint + Prettier | Linting frontend e backend | config | Low | Low | — |
| Docker setup | Containerizzazione | nuovo | Medium | Low | — |
| Backup DB automatizzato | Protezione dati | nuovo | Low | Low | Deploy (P1) |
| Refresh token JWT | Migliorare UX sessioni lunghe | auth | High | High | — |
| CSP in produzione | Security header | `app.js` | Medium | Medium | — |
| Dashboard admin | Audit consensi GDPR | nuovo | High | Low | — |
