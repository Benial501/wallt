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
| Movimenti periodici (settimanale, mensile, annuale) | MovimentoForm, procedura Programmate | ricorrenti.service; conferma manuale per le entrate | Suite non aggiunte in questa sessione |
| Spese/entrate programmate e acquisti a rate | Procedura guidata nella sezione Programmate | API programmazioni, piani, conferma e stato in ritardo | Suite non aggiunte in questa sessione |
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
| Step-up auth: password locale oppure riverifica Google/Apple nativa o web | ImpostazioniView | verifyPassword.controller, googleStepUp.controller, appleStepUp.controller | auth.test.js, gdpr.test.js, googleStepUp.test.js, appleAuth.test.js |
| Export dati GDPR | ImpostazioniView | impostazioni.controller | gdpr.test.js |
| Delete account | ImpostazioniView | accountReset.service | gdpr.test.js |
| Reset account (unico endpoint, elimina movimenti e azzera saldi conti, protetto da step-up) | ImpostazioniView | accountReset.service (`deleteAllTransactions`) | gdpr.test.js |
| Tema dark/light | useTheme, ImpostazioniView | impostazioni.controller | — |
| Restrizioni minori (<18) | featureAccess.js, router | featureAccess.middleware | profilo.test.js |
| Feature flags (scommesse/investimenti) | ImpostazioniView, router | User model + middleware | profilo.test.js |
| Privacy/Termini statici | PrivacyPolicy, TermsView | — | — |
| Transazioni recenti home | RecentTransactions | movimenti.controller (ordine=caricamento) | — |
| Categoria trasferimento_denaro | categorie.js | constants/categorie.js | — |
| Saldo effettivo (quanto è davvero spendibile) | WOverviewCarousel.vue (slide patrimonio in DashboardView) | conti.controller (`getPatrimonioTotale`, delega) → `services/liquidita.service.js` | `saldoEffettivo.test.js` |
| Conti nascosti (fuori dallo spendibile, dentro il patrimonio) | ContiView | conti.controller, `services/liquidita.service.js` | `saldoEffettivo.test.js` |
| Spese programmate legacy (`una_tantum`) | RicorrenteForm.vue, sezione Programmate | `services/ricorrenti.service.js` (cron), `muoveSaldo` | `ricorrenti.test.js`, `saldoEffettivo.test.js` |

## Partially Implemented Features

| Feature | Stato | Dettaglio |
|---|---|---|
| Spese ricorrenti | Implementata | Cadenze settimanali, mensili e annuali; le uscite si registrano alla scadenza, le entrate restano in attesa di conferma. |
| Merchant Intelligence | Parziale | Dizionario locale + regole personali funzionanti; lookup esterni (Google Places, Foursquare, OSM) sono stub |
| Apple OAuth | Parziale | Endpoint `/providers` restituisce `apple: false`; nessuna implementazione |
| Budget suggerito da profilo | Parziale | API `GET /profilo/budget-suggerito` esiste; frontend non la chiama |
| Sezione Programmate | Implementata | Procedura guidata unificata, pagamenti futuri manuali, rate, regole ricorrenti e promemoria; le entrate possono essere confermate o segnate in ritardo. |
| CI/CD | Base | `.github/workflows/ci.yml`: test backend + build frontend su ogni push/PR verso `main`. Deploy resta manuale. |
| Test coverage | Parziale | 44 suite; 542 test. Isolamento cross-user, coerenza finanziaria (saldo/trasferimenti/race condition), step-up Google, cron ricorrenti, config produzione coperti. Non coperta: logica di business di budget/obiettivi/investimenti/scommesse (solo isolamento) |

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
| ~~Session reset incompleto~~ | ~~Medium~~ | `session.js` | **Risolto** (`f565764`): i sette store che alimentano la dashboard leggono ora da `creaRisorsa`, e `resetPiniaStores()` richiama il `reset()` di ciascuno invece di elencarne i campi a mano — quel `reset()` azzera anche le risorse interne (`recentiHome`, `panoramica`/`analisi` di scommesse) |
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

**Frontend**: 85 test unitari (`client/tests/*.test.js`, `node --test`), fra cui `risorsa.test.js` sulla macchina a stati di `creaRisorsa` (guardia di sequenza, invarianti su errore/dati) e i test sul gesto di scorrimento delle righe movimento. Nessun test di componente (nessun framework configurato, per scelta — vedi `docs/ARCHITECTURE.md`), nessun E2E.

**Lint**: nessun linter configurato (né backend né frontend).

**Verifica ramo iOS e target Android**: suite client (251 test), build Vite e sincronizzazione Capacitor iOS verificate; suite server (88 suite, 1133 test) eseguita su PostgreSQL `wallt_test`. La compilazione Xcode e il test su iPhone richiedono un host con Xcode completo e non sono stati eseguiti in questo ambiente. CI: `.github/workflows/ci.yml` esegue suite backend e test/build frontend su ogni push/PR.

**Target Android nativo**: Capacitor Android è configurato con splash di sistema vettoriale (AnimatedVectorDrawable da Android 12), passaggio alla sequenza SVG/CSS esistente e audio nativo senza gesto. La PWA installata da Chrome e il suo manifest restano invariati; per vedere la nuova apertura va installato il pacchetto Android nativo. Build Gradle e prova su dispositivo restano da eseguire su un ambiente con Android SDK/Android Studio; autenticazione Google/Apple nativa Android non rientra in questa modifica e va verificata prima di una distribuzione pubblica.

## Production Readiness

### Voto: 5/10

| Criterio | Voto | Note |
|---|---|---|
| Funzionalità core | 8/10 | Tutte le feature principali implementate |
| Sicurezza | 7/10 | Step-up con provider per tutti gli account; rate limit dedicato; CSP SPA; residui: rotazione credenziali infrastrutturali dove necessaria, xlsx senza fix upstream (mitigato) |
| Test | 7/10 | 88 suite backend incluso isolamento cross-user, coerenza finanziaria e race condition; 244 test client; build web verificata |
| DevOps | 2/10 | No CI/CD, no Docker, no backup, deploy manuale |
| Documentazione | 6/10 | README + report interni; ora docs/ completa |
| Performance | 5/10 | Nessun caching, dashboard fa 8+ API call |
| Monitoring | 1/10 | Solo Winston file log, nessun APM/uptime |
| Scalabilità | 4/10 | Monolite Node, cron interno, no worker |

**Motivazione**: isolamento cross-user, coerenza finanziaria e step-up provider-verified coperti da test automatici; CI/CD di base presente. Per distribuire iOS restano prerequisiti esterni: account Apple Developer e Google Cloud, identificativi OAuth e configurazione Vercel/produzione, compilazione/firma Xcode, test su iPhone, valutazione App Store e icona ufficiale 1024×1024. Restano inoltre backup/monitoraggio e test di logica di business su budget/obiettivi/investimenti/scommesse.

---

## Audit per categoria

| Categoria | Voto | Motivazione |
|---|---|---|
| Architettura | 6/10 | Monolite funzionale ma dual import pipeline e logica duplicata |
| Qualità codice | 6/10 | Convenzioni consistenti, ma dead code e duplicazioni |
| Frontend | 7/10 | Vue 3 ben strutturato, componenti orfani, no test |
| Backend | 7/10 | Pattern controller→service solido, gap test e import duale |
| Database | 7/10 | Schema coerente, migrazioni duplicate, no backup |
| API | 7/10 | 98 endpoint ben organizzati, gap validazione GET |
| Autenticazione | 8/10 | JWT + OAuth Google/Apple + step-up provider-verified per account OAuth + invalidazione password |
| Sicurezza | 7/10 | Step-up provider-verified per operazioni sensibili; rate limit dedicato, CSP SPA e config produzione validata all'avvio; restano prerequisiti infrastrutturali e rilascio iOS |
| Performance | 5/10 | Nessun caching, troppe API call per pagina |
| UX | 7/10 | UI italiana completa, responsive, tema dark/light |
| Gestione errori | 7/10 | Centralizzata backend, frontend con toast ma inconsistente |
| Manutenibilità | 5/10 | Dual import, categorie in 6+ file, no lint, no CI |
| Duplicazioni | 4/10 | Feature access, import, formatValuta, toBool, isMobile |
| Technical debt | 5/10 | Accumulo moderato, gestibile con refactoring mirato |
| Bug potenziali | 6/10 | Nessun bug critico noto, cache leak su logout |
| Testing | 6/10 | 542 test backend (isolamento cross-user, coerenza finanziaria, race condition, step-up Google, cron), zero frontend |
| Scalabilità | 4/10 | Single process, cron interno, no caching layer |

---

## Problemi trovati

### P-1: reset-account/delete-account/export senza riverifica identità per OAuth — CHIUSO (30 settembre 2026)
- **Severity**: High; il rischio è chiuso nel codice di questo ramo.
- **Area**: Sicurezza
- **Files**: `server/middleware/stepUp.middleware.js`, `server/routes/impostazioni.routes.js`, `client/src/views/ImpostazioniView.vue`.
- **Stato attuale**: le tre rotte usano `requireStepUp` per tutti. Gli account con password locale riverificano con bcrypt; quelli Google e Apple con un token fresco verificato dal backend, ottenuto via SDK nativo su iOS o integrazione web. La conferma testuale `ELIMINA`/`RESETTA` resta come dichiarazione d'intenzione, non come autorizzazione.
- **Quanto era concreto**: alla chiusura, in produzione esistevano 3 account Google e 2 locali; i 3 Google non avevano alcuna password, quindi erano esattamente e solamente loro gli account esposti.
- **Storia**: la verifica Google è stata in passato rimossa dopo un errore `invalid_client` di Google Identity Services. Questo ramo la ripristina con verifica nativa iOS e web, aggiunge Apple e challenge persistenti condivisi tra istanze. Il record storico è in `docs/DECISIONS.md`.
- **Prerequisiti di rilascio**: configurare gli identificativi Google e Apple negli ambienti corretti e applicare la migrazione prima di pubblicare il backend/app. Per i dettagli vedere `docs/DEPLOY_VERCEL_SUPABASE.md`.
- **Verificato con**: suite `googleStepUp.test.js`, `appleAuth.test.js`, `nativeOAuth.test.js`, `auth.test.js`, `gdpr.test.js` e test PostgreSQL delle migrazioni.
- **Risk of modification**: Low — nessuna modifica alla logica finanziaria di `resetAccount()`/`deleteAllTransactions`.
- **Priority**: ~~P0~~ chiuso lato codice; restano configurazione dei provider, migrazione e gates App Store.

### P-2: .env.test committato in git con password DB reale — CHIUSO (30 settembre 2026)
- **Severity**: High (era documentato Medium sottostimando l'impatto: il file era effettivamente tracciato, non solo a rischio).
- **Area**: Sicurezza / Secrets
- **Files**: `.gitignore`, `server/.env.test`
- **Description**: `server/.env.test` era tracciato in git (2 commit), con un `DB_PASSWORD` identico a quello reale usato in `server/.env`.
- **Why it is a problem**: quella password del database deve considerarsi compromessa se il repository è mai stato o diventa condiviso/pubblico.
- **Fix applicata**: rimosso dal tracking (`git rm --cached`), `.gitignore` aggiornato.
- **Verifica del 30 settembre 2026**: i due commit citati (`ef77e88`, `6968646`) **non esistono in questo repository**, che nasce da `6213708` ("publish sanitized WALLT project"). La scansione dell'intera history non trova alcun valore reale: gli unici file d'ambiente mai tracciati sono `.example`, con segnaposto (`postgres`, `test_jwt_secret…`, `test_resend…`). Il repository GitHub è pubblico, quindi il controllo era dovuto — ed è pulito. Il repository originale, dove quei commit esistevano, non esiste più.
- **Rotazione eseguita comunque**: la password del ruolo PostgreSQL locale è stata cambiata e allineata in `.env` e `.env.test` (compreso `TEST_DATABASE_URL`, dove la password compare dentro l'URL). Suite completa verde dopo il cambio: 86 suite, 1116 test.
- **Nota sull'efficacia reale**: il PostgreSQL locale usa `trust` in `pg_hba.conf` per tutte le connessioni da 127.0.0.1, quindi **nessuna password viene verificata** in sviluppo — la vecchia continua a "funzionare" come qualunque altra stringa. La rotazione ha cambiato la password del ruolo (rilevante se il metodo passasse a `scram-sha-256`), non il livello di protezione dell'ambiente locale, che dipende da `pg_hba.conf`.
- **Credenziali di produzione**: non sono toccate. `server/.env` non contiene `DATABASE_URL` e punta a `127.0.0.1`; le credenziali Supabase vivono solo nelle variabili d'ambiente su Vercel.
- **Risk of modification**: Low
- **Priority**: ~~P0~~ chiuso.

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

### P-6: Cron ricorrenti incompleto — RISOLTO
- Il cron supporta le cadenze settimanali, mensili, annuali e una tantum; le entrate periodiche attendono la conferma manuale.

### P-7: Session reset incompleto — RISOLTO
- **Severity**: Medium (era aperto).
- **Area**: Frontend
- **Files**: `client/src/utils/session.js`
- **Description**: Logout non puliva `recentiHome` (movimenti.store) né i campi `panoramica`/`analisi` interni allo store `scommesse`. Lo store `analisi` principale veniva invece resettato correttamente in `resetPiniaStores()`.
- **Fix applicata** (`f565764`): da quando i sette store che alimentano la dashboard leggono da `creaRisorsa`, `resetPiniaStores()` richiama il `reset()` di ciascuno invece di elencarne i campi a mano, e quel `reset()` azzera anche le risorse interne — il sintomo sparisce insieme alla causa.
- **Risk of modification**: Low
- **Priority**: Risolto

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

### Nota metriche finanziarie (23 settembre 2026)

La semantica delle finestre è centralizzata in
`server/services/finestraMesi.service.js`: richiesta, osservata e mesi
completi utilizzabili restano distinti. Fondo sicurezza e stabilità entrate
usano il denominatore effettivo dei mesi completi; il mese corrente e il
primo mese parziale sono esclusi, mentre gli zeri dei mesi chiusi osservati
restano validi. La completezza delle registrazioni manuali non è verificabile.

Il fondo espone anche lo storico limitato e non include le semi-essenziali.
La stabilità richiede almeno tre mesi e CV popolazione <= 0,25. Ricorrenti
sospese/terminate non sono impegni; debiti e ricorrenti non sono riconciliati
automaticamente perché lo schema non contiene il legame tra i due insiemi.

**Sotto-progetto A** della proposta di evoluzione UX di WALLT — blocchi 1 e 2: stato delle letture negli store (`creaRisorsa` + `DataState`, vedi `docs/ARCHITECTURE.md`) e terminologia unica del patrimonio (`client/src/content/glossario.js`) — è **completo** (spec: `docs/superpowers/specs/2026-09-10-fondamenta-dati-e-patrimonio-design.md`). Restano da fare come sotto-progetti separati, con spec proprie:
- blocco 3 — selettore di periodo, tooltip e valori del grafico principale;
- blocco 4 — ricerca testuale e ordinamento dei movimenti (richiede lavoro sull'API);
- blocco 5 — revisione di contrasto, dimensioni tipografiche e `prefers-reduced-motion`;
- blocco 6 — centro movimenti ricorrenti, controllo qualità degli import, budget suggerito dallo storico, previsioni di cassa.

**Financial Brain** (backend, spec: `docs/superpowers/plans/2026-09-17-financial-foundation-backend.md`) è **completo**: calcolo del patrimonio centralizzato in `financialSummary.service.js`, modello di liquidità libera/allocata (`liquidita.service.js`, `GET /api/conti/liquidita`), classificazione di essenzialità delle spese per categoria personale (`essenzialita.service.js`), fondo di sicurezza come tipo di obiettivo con mesi di copertura (`fondoSicurezza.service.js`, `GET /api/obiettivi/:id/copertura`), modello Debiti/Passività (`Debito`, CRUD `/api/debiti`) e patrimonio netto (patrimonio − passività) su `GET /api/conti/patrimonio`. Su questa base Piano Smart è implementato con riepilogo corrente, confronti dei movimenti registrati, flussi ricorrenti, obiettivi, simulazione read-only e piani V1/V2; la guida aggiornata è consultabile in Aiuto. Restano espliciti i limiti dello storico manuale e delle stime; non sono implementati previsioni probabilistiche o esecuzioni automatiche di operazioni.

### P0 — Critical

| Task | Obiettivo | File/Area | Difficoltà | Rischio | Dipendenze |
|---|---|---|---|---|---|
| Step-up su reset-account/delete-account/export | Proteggere operazioni distruttive | `impostazioni.routes.js`, `verifyPassword.controller.js`, `googleStepUp.*`, `appleStepUp.controller.js` | Medium | Low | **CHIUSO** nel ramo iOS (vedi P-1) |
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
| ~~Fix session reset~~ | ~~Pulire `recentiHome` (movimenti.store) e `panoramica`/`analisi` (scommesse.store)~~ | `session.js` | — | — | **Risolto** (`f565764`) |
| ~~Cron tutte le frequenze~~ | ~~Supportare le cadenze esposte dalla UI~~ | `ricorrenti.service.js` | — | — | **Risolto** |
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
