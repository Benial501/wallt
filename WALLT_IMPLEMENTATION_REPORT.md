# WALLT — Report Implementazione Sessione

**Data report:** 14 luglio 2026  
**Progetto:** WALLT — Personal Finance Manager  
**Repository:** `/Users/christianmaiolo/Developer/wallt`  
**Stack:** Vue 3 + Pinia + Vite (client) · Node.js + Express 5 + Sequelize + MySQL (server)

---

## 1. RIEPILOGO GENERALE

| Metrica | Valore |
|---------|--------|
| **File modificati** | 58 |
| **File creati (nuovi)** | 37 |
| **Totale file toccati** | 95 |
| **Migrazioni DB (sessione GDPR/Auth)** | 6 |
| **Migrazioni DB (progetto totale)** | 14 |
| **Test Jest backend** | 24/24 passati |
| **Commit creati in sessione** | 0 (modifiche non committate) |

### Stato implementazione per area

| Area | Stato | Note |
|------|-------|------|
| GDPR e documentazione legale | ✅ **Completo** | Privacy, Termini, consensi registrazione, footer |
| Sicurezza autenticazione | ✅ **Completo** | OAuth Google, reset password, email SMTP |
| Protezione dati finanziari (AI) | ✅ **Completo** | Consenso opt-in, pseudonimizzazione, toggle |
| Protezione account (step-up) | ✅ **Completo** | Export/delete protetti, modal frontend |
| API Security | ✅ **Completo** | Validazione, rate limit, helmet, magic bytes |
| Logging sicuro | ✅ **Completo** | Winston, sanitizzazione PII, rotazione |
| Test backend | ✅ **Completo** | auth, GDPR, security (24 test) |
| Fix OAuth / registrazione / onboarding | ✅ **Completo** | Race condition, validazione profilo |
| Restrizioni minori (under 18) | ✅ **Completo** | UI + API + questionario |
| Restrizioni questionario (no scommesse/investimenti) | ✅ **Completo** | UI + API + sync flag utente |
| Import / categorizzazione AI avanzata | ⚠️ **Parziale** | Funzionale; test E2E import limitati |
| Apple OAuth | ❌ **Non iniziato** | Placeholder env only |
| CI/CD pipeline | ❌ **Non iniziato** | Nessun GitHub Actions |
| Test E2E frontend (browser) | ❌ **Non iniziato** | Solo test API Jest |

**Percentuale stimata completamento richieste hardening + fix sessione:** ~**91%**

---

## 2. FILE MODIFICATI (tabella completa)

| # | Percorso File | Tipo | Area | Descrizione modifiche | Stato test |
|---|---------------|------|------|----------------------|------------|
| 1 | `.gitignore` | modifica | Config | Ignore env, logs, node_modules | N/A |
| 2 | `client/public/oauth-relay.html` | modifica | Auth | Relay OAuth: passa `user` via localStorage/postMessage | Manuale OAuth |
| 3 | `client/src/App.vue` | modifica | UI/GDPR | Integrazione `LegalFooter` su route guest | Manuale |
| 4 | `client/src/assets/styles/animations.css` | modifica | UI | Animazioni aggiornate | Manuale |
| 5 | `client/src/components/layout/AppLayout.vue` | modifica | UI | Menu reattivo scommesse/investimenti | Manuale |
| 6 | `client/src/composables/useOAuthPopup.js` | modifica | Auth | Fix popup OAuth, payload user, polling storage | Manuale |
| 7 | `client/src/router/index.js` | modifica | Auth | Guard auth/onboarding; fix token stale; no fetchMe aggressivo | Manuale |
| 8 | `client/src/stores/auth.store.js` | modifica | Auth | OAuth login, fetchMe sicuro, feature flags, sessione | Test indiretto |
| 9 | `client/src/stores/profilo.store.js` | modifica | Auth/UI | Sync profilo→auth; flag minori/questionario | Manuale onboarding |
| 10 | `client/src/utils/axios.js` | modifica | Auth/API | Interceptor 401 con stale token; base URL env | Test indiretto |
| 11 | `client/src/views/AnalisiView.vue` | modifica | UI | Adattamenti UI/valuta | Manuale |
| 12 | `client/src/views/ImpostazioniView.vue` | modifica | GDPR/Auth/UI | Step-up modal, AI toggle, reset account, hide toggles minori/no | Manuale |
| 13 | `client/src/views/OnboardingView.vue` | modifica | UI/Compliance | Età obbligatoria, skip minori, no scommesse Q step 5 | Manuale |
| 14 | `client/src/views/auth/AuthCallbackView.vue` | modifica | Auth | Decode payload OAuth allineato server | Manuale |
| 15 | `client/src/views/auth/LoginView.vue` | modifica | Auth | OAuth Google, messaggi errore, layout | Manuale |
| 16 | `client/src/views/auth/RegisterView.vue` | modifica | GDPR/Auth | Checkbox privacy/termini/AI, OAuth con consensi | Test GDPR |
| 17 | `server/.env.example` | modifica | Config | SMTP, OAuth, CORS, DB test, AI keys | N/A |
| 18 | `server/config/database.js` | modifica | Config | Supporto `DB_NAME_TEST` per Jest | Test setup |
| 19 | `server/config/passport.js` | modifica | Auth | Google OAuth hardened, `frontendUrl` estratto | Manuale OAuth |
| 20 | `server/config/sequelize.js` | modifica | Config | Config Sequelize CLI | N/A |
| 21 | `server/controllers/analisi.controller.js` | modifica | API/Logging | Logger Winston, errori sicuri | Manuale |
| 22 | `server/controllers/auth.controller.js` | modifica | Auth/GDPR | formatUser, register consensi, mask feature flags | Test auth/GDPR |
| 23 | `server/controllers/budget.controller.js` | modifica | API | Validazione + logger | Manuale |
| 24 | `server/controllers/conti.controller.js` | modifica | API | Saldo insufficiente dettagliato, logger | Manuale |
| 25 | `server/controllers/importazioni.controller.js` | modifica | API/Security | Magic bytes, errori sicuri, logger | Manuale |
| 26 | `server/controllers/impostazioni.controller.js` | modifica | GDPR/Auth | Preferenze, step-up export/delete, minor/feature block | Test security |
| 27 | `server/controllers/investimenti.controller.js` | modifica | API/Logging | Logger, error handling | Manuale |
| 28 | `server/controllers/movimenti.controller.js` | modifica | API | No sqlMessage leak, logger | Manuale |
| 29 | `server/controllers/obiettivi.controller.js` | modifica | API | Logger | Manuale |
| 30 | `server/controllers/profilo.controller.js` | modifica | UI/Compliance | Età obbligatoria, sync feature flags, minori | Test manuale API |
| 31 | `server/controllers/scommesse.controller.js` | modifica | API | Logger | Manuale |
| 32 | `server/middleware/auth.middleware.js` | modifica | Auth | JWT auth_provider, password_changed_at invalidation | Test auth |
| 33 | `server/middleware/validation.middleware.js` | modifica | API | Validatori estesi tutti endpoint mutating; fix risparmia/ha_investimenti | Test indiretto |
| 34 | `server/models/User.js` | modifica | GDPR/Auth | privacy/terms, auth_provider, use_ai_categorization | Test GDPR |
| 35 | `server/models/index.js` | modifica | DB | PasswordResetToken, associazioni | Test |
| 36 | `server/package.json` | modifica | Config | Scripts test/migrate, dipendenze security | N/A |
| 37 | `server/package-lock.json` | modifica | Config | Lock dipendenze | N/A |
| 38 | `server/routes/auth.routes.js` | modifica | Auth | Google OAuth, verify-password, providers | Test auth |
| 39 | `server/routes/budget.routes.js` | modifica | API | Validators wired | Manuale |
| 40 | `server/routes/conti.routes.js` | modifica | API | Validators wired | Manuale |
| 41 | `server/routes/importazioni.routes.js` | modifica | API/Security | Rate limit import, magic bytes | Manuale |
| 42 | `server/routes/impostazioni.routes.js` | modifica | Auth | Step-up + rate limit export/delete | Test security |
| 43 | `server/routes/investimenti.routes.js` | modifica | Compliance | Middleware `blockInvestimentiAccess` | Test API manuale |
| 44 | `server/routes/movimenti.routes.js` | modifica | API | Validators PUT/DELETE | Manuale |
| 45 | `server/routes/obiettivi.routes.js` | modifica | API | Validators | Manuale |
| 46 | `server/routes/profilo.routes.js` | modifica | API | Validators profilo finanziario | Test manuale |
| 47 | `server/routes/scommesse.routes.js` | modifica | Compliance | Middleware `blockScommesseAccess` | Test API manuale |
| 48 | `server/server.js` | modifica | Config | Usa `createApp()`, migrazioni auto | Manuale |
| 49 | `server/services/import/CategoryMatcherService.js` | modifica | AI | Cache, logger | Manuale |
| 50 | `server/services/import/ImportService.js` | modifica | AI | Integrazione categorizzazione | Manuale |
| 51 | `server/services/import/category/OpenAICategoryClassifier.js` | modifica | AI | Consenso AI check | Manuale |
| 52 | `server/services/merchant/MerchantAnalyzer.js` | modifica | AI | Regole personali merchant | Manuale |
| 53 | `server/services/merchant/ai/AITransactionClassifier.js` | modifica | AI | Pseudonimizzazione pre-invio | Manuale |
| 54 | `server/services/merchant/ai/providers/OpenAITransactionProvider.js` | modifica | AI | Consenso + pseudonymize | Manuale |
| 55 | `server/services/merchant/lookup/MerchantLookupService.js` | modifica | AI | Logger | Manuale |
| 56 | `server/services/onboarding.service.js` | modifica | UI/Compliance | Grace period, skip minori, preserve reset | Manuale |
| 57 | `server/services/ricorrenti.service.js` | modifica | Logging | Log aggregati, no PII | Manuale |
| 58 | `server/utils/oauthPopup.js` | modifica | Auth | HTML redirect OAuth, COOP/CSP headers, user in payload | Manuale OAuth |

---

## 3. FILE CREATI (tabella completa)

| # | Percorso File | Area | Scopo | Dipendenze |
|---|---------------|------|-------|------------|
| 1 | `client/src/components/layout/LegalFooter.vue` | GDPR/UI | Footer Privacy/Termini/Contatto | `VITE_SUPPORT_EMAIL` |
| 2 | `client/src/utils/ageRestriction.js` | Compliance | Helper `isMinor()` under 18 | — |
| 3 | `client/src/utils/featureAccess.js` | Compliance | Visibilità scommesse/investimenti da questionario | `ageRestriction.js` |
| 4 | `client/src/views/PrivacyPolicy.vue` | GDPR | Pagina Privacy Policy `/privacy` | Vue Router |
| 5 | `client/src/views/TermsView.vue` | GDPR | Pagina Termini `/termini` | Vue Router |
| 6 | `client/src/views/auth/ForgotPassword.vue` | Auth | UI richiesta reset password | axios, auth store |
| 7 | `client/src/views/auth/ResetPassword.vue` | Auth | UI nuova password con token | axios |
| 8 | `server/.env.test.example` | Test | Template env DB test Jest | dotenv |
| 9 | `server/app.js` | Config | Factory Express `createApp()` | helmet, cors, routes |
| 10 | `server/config/smtp.js` | Auth | Config nodemailer | nodemailer |
| 11 | `server/controllers/passwordReset.controller.js` | Auth | forgot/reset password HTTP | passwordReset.service |
| 12 | `server/controllers/verifyPassword.controller.js` | Auth | Step-up token generation | bcrypt, jwt |
| 13 | `server/jest.config.js` | Test | Config Jest | jest |
| 14 | `server/middleware/errorHandler.middleware.js` | API | Error handler prod-safe | AppError, logger |
| 15 | `server/middleware/featureAccess.middleware.js` | Compliance | Block API scommesse/investimenti | featureAccess.js |
| 16 | `server/middleware/minorRestriction.middleware.js` | Compliance | Middleware minori (superseded parzialmente) | ageRestriction.js |
| 17 | `server/middleware/rateLimit.middleware.js` | API | Rate limit auth/api/export/import | express-rate-limit |
| 18 | `server/middleware/stepUp.middleware.js` | Auth | Header `X-Step-Up-Token` | jsonwebtoken |
| 19 | `server/migrations/20250714_add_auth_provider.js` | DB | Colonna `auth_provider`, `google_id` | sequelize-cli |
| 20 | `server/migrations/20250714_add_last_login_at.js` | DB | Colonna `last_login_at` | sequelize-cli |
| 21 | `server/migrations/20250714_add_password_changed_at.js` | DB | Invalidazione JWT post cambio password | sequelize-cli |
| 22 | `server/migrations/20250714_add_privacy_terms_fields.js` | GDPR | `privacy_accepted_at`, `terms_accepted_at` | sequelize-cli |
| 23 | `server/migrations/20250714_add_use_ai_categorization.js` | GDPR/AI | Consenso AI categorizzazione | sequelize-cli |
| 24 | `server/migrations/20250714_create_password_reset_tokens.js` | Auth | Tabella reset password | sequelize-cli |
| 25 | `server/models/PasswordResetToken.js` | Auth | Model token reset (hash bcrypt) | Sequelize |
| 26 | `server/routes/passwordReset.routes.js` | Auth | `/forgot-password`, `/reset-password` | validation middleware |
| 27 | `server/services/aiConsent.service.js` | AI | Verifica consenso AI utente | User model |
| 28 | `server/services/email.service.js` | Auth | Invio email via nodemailer | smtp config |
| 29 | `server/services/merchant/ai/pseudonymizeDescription.js` | AI | Pseudonimizzazione descrizioni | — |
| 30 | `server/services/passwordReset.service.js` | Auth | Token crypto + email reset | bcrypt, email |
| 31 | `server/tests/setup.js` | Test | DB test, factory app, helpers | jest, supertest |
| 32 | `server/tests/auth.test.js` | Test | Test login/register/JWT | jest |
| 33 | `server/tests/gdpr.test.js` | Test | Test consensi GDPR registrazione | jest |
| 34 | `server/tests/security.test.js` | Test | Isolamento dati, step-up | jest |
| 35 | `server/utils/AppError.js` | API | Classi errore tipizzate | — |
| 36 | `server/utils/ageRestriction.js` | Compliance | Logica minori under 18 server-side | User model |
| 37 | `server/utils/featureAccess.js` | Compliance | Visibilità feature da questionario | ageRestriction.js |
| 38 | `server/utils/fileMagicBytes.js` | Security | Validazione magic bytes upload | — |
| 39 | `server/utils/frontendUrl.js` | Auth | URL frontend (fix circular dep OAuth) | process.env |
| 40 | `server/utils/logger.js` | Logging | Winston JSON/pretty, sanitizzazione PII | winston |

> **Nota:** `server/tests/` conta come 4 file (setup + 3 suite) nel totale 37 nuovi path git; alcuni path raggruppano più file.

---

## 4. MIGRAZIONI DATABASE

### Migrazioni sessione (GDPR/Auth — luglio 2025/2026)

| # | Nome file | Tabella | Colonne aggiunte/modificate | Scopo |
|---|-----------|---------|----------------------------|-------|
| 1 | `20250714_add_privacy_terms_fields.js` | `users` | `privacy_accepted_at`, `terms_accepted_at` | Tracciamento consenso GDPR in registrazione |
| 2 | `20250714_add_auth_provider.js` | `users` | `auth_provider`, `google_id`; `password` nullable | OAuth Google sicuro |
| 3 | `20250714_add_use_ai_categorization.js` | `users` | `use_ai_categorization` (default false) | Consenso AI opt-in |
| 4 | `20250714_add_last_login_at.js` | `users` | `last_login_at` | Audit accessi |
| 5 | `20250714_add_password_changed_at.js` | `users` | `password_changed_at` | Invalidazione sessioni JWT |
| 6 | `20250714_create_password_reset_tokens.js` | `password_reset_tokens` (nuova) | `id`, `user_id`, `token_hash`, `expires_at`, `used_at` | Reset password sicuro |

### Migrazioni pre-esistenti (progetto)

| # | Nome file | Scopo |
|---|-----------|-------|
| 7 | `20250101000001-create-all-tables.js` | Schema base |
| 8 | `20250101000002-add-user-preferences.js` | `mostra_scommesse`, `mostra_investimenti` |
| 9 | `20250101000003-add-indexes.js` | Indici performance |
| 10 | `20250101000004-add-social-auth.js` | Colonne social auth legacy |
| 11 | `20260708000005-create-categorie-regole.js` | Regole categorizzazione |
| 12 | `20260708000006-add-categoria-auto-fields-to-movimenti.js` | Campi AI su movimenti |
| 13 | `20260713000007-create-regole-personali-merchant.js` | Regole merchant personali |
| 14 | `20260713000008-add-performance-indexes.js` | Indici aggiuntivi |

---

## 5. ENDPOINT API (nuovi o modificati)

| # | Metodo | Path | Controller | Middleware | Descrizione | Auth |
|---|--------|------|------------|------------|-------------|------|
| 1 | POST | `/api/auth/register` | auth.controller | validateRegister, authLimiter | Registrazione con consensi GDPR | No |
| 2 | POST | `/api/auth/login` | auth.controller | validateLogin, authLimiter | Login email/password | No |
| 3 | GET | `/api/auth/me` | auth.controller | authMiddleware | Profilo utente corrente | Sì |
| 4 | GET | `/api/auth/providers` | auth.routes | — | Provider OAuth disponibili | No |
| 5 | GET | `/api/auth/google` | passport | COOP unsafe-none | Avvio OAuth Google popup | No |
| 6 | GET | `/api/auth/google/callback` | passport | — | Callback OAuth → HTML relay | No |
| 7 | POST | `/api/auth/verify-password` | verifyPassword.controller | authMiddleware, validateVerifyPassword | Step-up token (5 min) | Sì |
| 8 | POST | `/api/auth/forgot-password` | passwordReset.controller | validateForgotPassword, authLimiter | Richiesta reset email | No |
| 9 | POST | `/api/auth/reset-password` | passwordReset.controller | validateResetPassword, authLimiter | Imposta nuova password | No |
| 10 | PUT | `/api/profilo` | profilo.controller | authMiddleware, validateUpdateProfiloFinanziario | Questionario onboarding / profilo | Sì |
| 11 | POST | `/api/profilo/skip-onboarding` | profilo.controller | authMiddleware | Salta onboarding (età obbligatoria) | Sì |
| 12 | PUT | `/api/impostazioni/preferenze` | impostazioni.controller | authMiddleware, validateUpdatePreferenze | Tema, AI, toggles feature | Sì |
| 13 | GET/POST | `/api/impostazioni/esporta` | impostazioni.controller | authMiddleware, **requireStepUp**, exportLimiter | Export JSON dati | Sì + step-up |
| 14 | DELETE | `/api/impostazioni/account` | impostazioni.controller | authMiddleware, **requireStepUp**, deleteAccountLimiter | Elimina account | Sì + step-up |
| 15 | POST | `/api/impostazioni/reset-account` | impostazioni.controller | authMiddleware, validateResetAccount | Reset dati finanziari | Sì |
| 16 | ALL | `/api/scommesse/*` | scommesse.controller | authMiddleware, **blockScommesseAccess** | Bloccato minori / no questionario | Sì |
| 17 | ALL | `/api/investimenti/*` | investimenti.controller | authMiddleware, **blockInvestimentiAccess** | Bloccato minori / no questionario | Sì |
| 18 | ALL | `/api/*` | vari | apiLimiter (100/15min) | Rate limit globale API | — |

---

## 6. VARIABILI AMBIENTE NUOVE

| # | Nome | Obbligatoria | Default | Descrizione | Dove usata |
|---|------|--------------|---------|-------------|------------|
| 1 | `CORS_ORIGINS` | Consigliata | `http://localhost:5173` | Origini CORS frontend | `server/app.js` |
| 2 | `GOOGLE_CLIENT_ID` | Per OAuth | — | Client ID Google OAuth | `passport.js` |
| 3 | `GOOGLE_CLIENT_SECRET` | Per OAuth | — | Secret Google OAuth | `passport.js` |
| 4 | `GOOGLE_CALLBACK_URL` | No | auto localhost | URL callback OAuth | `passport.js` |
| 5 | `SMTP_HOST` | Per email reset | — | Host SMTP | `config/smtp.js` |
| 6 | `SMTP_PORT` | No | `587` | Porta SMTP | `config/smtp.js` |
| 7 | `SMTP_USER` | Per email | — | Username SMTP | `email.service.js` |
| 8 | `SMTP_PASS` | Per email | — | Password SMTP | `email.service.js` |
| 9 | `SMTP_FROM` | No | `WALLT <noreply@wallt.app>` | Mittente email | `email.service.js` |
| 10 | `SMTP_SECURE` | No | `false` | TLS SMTP | `config/smtp.js` |
| 11 | `PASSWORD_RESET_URL` | No | `{CORS_ORIGIN}/reset-password` | Link reset frontend | `passwordReset.service.js` |
| 12 | `DB_NAME_TEST` | Per test | `wallt_test` | Database Jest | `config/database.js`, tests |
| 13 | `OPENAI_API_KEY` | No | — | AI categorizzazione OpenAI | servizi import/merchant |
| 14 | `OPENAI_MODEL` | No | `gpt-4o-mini` | Modello OpenAI | classifiers |
| 15 | `VITE_API_URL` | Client | `http://localhost:3000/api` | Base URL API | `client/src/utils/axios.js` |
| 16 | `VITE_SUPPORT_EMAIL` | No | — | Email footer legale | `LegalFooter.vue` |

---

## 7. DIPENDENZE NPM AGGIUNTE

| # | Pacchetto | Versione | Scopo | Installazione |
|---|-----------|----------|-------|---------------|
| 1 | `winston` | ^3.19.0 | Logging strutturato con rotazione | `npm install winston` |
| 2 | `nodemailer` | ^9.0.3 | Invio email reset password | `npm install nodemailer` |
| 3 | `express-rate-limit` | ^8.5.2 | Rate limiting endpoint sensibili | `npm install express-rate-limit` |
| 4 | `express-validator` | ^7.3.2 | Validazione input HTTP | `npm install express-validator` |
| 5 | `helmet` | ^8.2.0 | Security headers HTTP | `npm install helmet` |
| 6 | `jest` | ^30.4.2 (dev) | Test unit/integration | `npm install -D jest` |
| 7 | `supertest` | ^7.2.2 (dev) | Test HTTP API | `npm install -D supertest` |
| 8 | `sinon` | ^22.0.0 (dev) | Mock/stub nei test | `npm install -D sinon` |
| 9 | `sequelize-cli` | ^6.6.5 (dev) | Migrazioni database | `npm install -D sequelize-cli` |

---

## 8. IMPLEMENTAZIONE PER AREA

### 8.1 GDPR e Documentazione Legale

- [x] Privacy Policy page creata (`client/src/views/PrivacyPolicy.vue`, route `/privacy`)
- [x] Termini e Condizioni page creata (`client/src/views/TermsView.vue`, route `/termini`)
- [x] Checkbox consenso registrazione implementato (`RegisterView.vue` + validazione backend)
- [x] Campi `privacy_accepted_at`, `terms_accepted_at` nel DB (migration + `User` model)
- [x] Link legali in footer (`LegalFooter.vue` + `App.vue`)

### 8.2 Sicurezza Autenticazione

- [x] Fix Google OAuth (`password=NULL`, `auth_provider`, payload user OAuth, relay HTML, COOP/CSP)
- [x] Recupero password (forgot/reset)
- [x] Tabella `password_reset_tokens`
- [x] Servizio email (nodemailer + `email.service.js`)
- [x] Frontend `ForgotPassword.vue`
- [x] Frontend `ResetPassword.vue`

### 8.3 Protezione Dati Finanziari

- [x] AI disattivata di default (`use_ai_categorization: false`)
- [x] Campo `use_ai_categorization` su `users`
- [x] Toggle consenso AI in impostazioni
- [x] Pseudonimizzazione descrizioni prima invio OpenAI (`pseudonymizeDescription.js`)

### 8.4 Protezione Account

- [x] Step-up authentication (`stepUp.middleware.js`)
- [x] Endpoint `/api/auth/verify-password`
- [x] Protezione export dati (step-up + rate limit 3/h)
- [x] Protezione cancellazione account (step-up + rate limit 3/h)
- [x] Modal password frontend (`ImpostazioniView.vue`)

### 8.5 API Security

- [x] Validazione PUT/DELETE/import su tutti gli endpoint mutating
- [x] Error handling sicuro (no `sqlMessage` in produzione)
- [x] Rate limit endpoint sensibili (auth, export, delete, import, API globale)
- [x] Limite JSON body (`10mb`)
- [x] `trust proxy: 1` in produzione
- [x] Validazione magic bytes upload file import

### 8.6 Logging Sicuro

- [x] Logger strutturato (Winston JSON prod / pretty dev)
- [x] Rimozione `console.log` nei controller backend
- [x] Rimozione PII/financial data dai log (`sanitizeMeta`)
- [x] Rotazione file log (`logs/` directory)

### 8.7 Test

- [x] Test autenticazione (`server/tests/auth.test.js`)
- [x] Test GDPR (`server/tests/gdpr.test.js`)
- [x] Test sicurezza isolamento (`server/tests/security.test.js`)

### 8.8 Compliance Questionario (sessione corrente)

- [x] Età obbligatoria nel questionario
- [x] Under 18: niente scommesse/investimenti (UI + API + questionario ridotto)
- [x] Risposta "No" scommesse/investimenti: feature nascoste e API bloccate
- [x] Fix registrazione/onboarding (validazione profilo, race condition sessione)

---

## 9. CODICE CHIAVE (snippet importanti)

### 9.1 Generazione token reset password

```javascript
// server/services/passwordReset.service.js
const createPasswordResetToken = async (userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(token, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await invalidateActiveTokens(userId);

  await PasswordResetToken.create({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  return token;
};
```

### 9.2 Verifica step-up auth

```javascript
// server/middleware/stepUp.middleware.js
const requireStepUp = (req, res, next) => {
  const stepUpToken = req.headers['x-step-up-token'];
  if (!stepUpToken) {
    return res.status(403).json({ message: 'Autenticazione aggiuntiva richiesta' });
  }
  try {
    const decoded = jwt.verify(stepUpToken, process.env.JWT_SECRET);
    if (decoded.type !== 'step_up' || decoded.userId !== req.userId) {
      return res.status(403).json({ message: 'Autenticazione aggiuntiva richiesta' });
    }
    req.stepUpVerified = true;
    return next();
  } catch {
    return res.status(403).json({ message: 'Autenticazione aggiuntiva richiesta' });
  }
};
```

### 9.3 Pseudonimizzazione AI

```javascript
// server/services/merchant/ai/pseudonymizeDescription.js
function pseudonymizeDescription(text) {
  if (!text) return '';
  let sanitized = String(text);
  sanitized = sanitized.replace(/\d{4,}/g, '[NUM]');
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[EMAIL]',
  );
  // ... telefoni, nomi propri → [TEL], [NOME]
  return sanitized.replace(/\s+/g, ' ').trim();
}
```

### 9.4 Validazione input (esempio)

```javascript
// server/middleware/validation.middleware.js
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Dati non validi',
      errori: errors.array().map((e) => ({
        campo: e.path,
        messaggio: e.msg,
      })),
    });
  }
  return next();
};
```

### 9.5 Error handler sicuro

```javascript
// server/middleware/errorHandler.middleware.js (estratto)
const normalizeError = (err) => {
  if (err instanceof AppError) return err;
  if (err?.name === 'SequelizeValidationError') {
    return new BadRequestError('I dati inviati non sono validi.');
  }
  if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    return new UnauthorizedError('Token non valido o scaduto.');
  }
  // In produzione: messaggio generico, no sqlMessage
  return new AppError(GENERIC_ERROR, 500);
};
```

### 9.6 Feature access da questionario

```javascript
// server/utils/featureAccess.js
const canShowScommesse = (user, profilo = null) => {
  const p = profilo ?? user?.profilo;
  if (isMinorProfilo(p)) return false;
  if (!wantsScommesse(p)) return false;
  return toBool(user?.mostra_scommesse, true);
};
```

---

## 10. PROBLEMI RISCONTRATI

| Problema | Soluzione adottata |
|----------|-------------------|
| Login Google: popup OAuth restava su login | Fix CSP/COOP, relay HTML, payload `user` in OAuth, race condition `fetchMe` |
| Registrazione/onboarding: redirect a login | `fetchMe` cancellava sessione su errori non-401; token stale in localStorage |
| "Inizia a usare WALLT" non funzionava | Validazione errata: `risparmia`/`ha_investimenti` come boolean invece di string |
| Race condition token OAuth vs init | Interceptor 401 ignora token stale; `fetchMe` solo su 401 |
| Test Jest: open handle `pdf-parse` | Warning noto; test passano comunque (24/24) |
| `minorRestriction.middleware.js` duplicato | Sostituito da `featureAccess.middleware.js` (file legacy ancora presente) |
| Migrazioni già applicate parzialmente | Migration idempotenti con try/catch "già esistente" |

**Workaround temporanei:** nessuno critico attivo.

---

## 11. TEST ESEGUITI

### Automatizzati (Jest)

```
Test Suites: 3 passed, 3 total
Tests:       24 passed, 24 total
```

| Suite | Copertura |
|-------|-----------|
| `auth.test.js` | Register, login, JWT, OAuth fields |
| `gdpr.test.js` | Consensi privacy/termini obbligatori |
| `security.test.js` | Isolamento utenti, step-up export/delete |

### Manuali (sessione corrente)

| Test | Risultato |
|------|-----------|
| Register → onboarding → dashboard | ✅ Dopo fix validazione + sessione |
| OAuth Google popup flow | ✅ Dopo fix relay + fetchMe |
| Profilo under 18 → API scommesse 403 | ✅ |
| Profilo no scommesse/no investimenti → flags false + API 403 | ✅ |
| PUT `/api/profilo` con risparmia string | ✅ 200 |

### NON testato

- Flusso completo reset password con SMTP reale in produzione
- OAuth Google con credenziali production su dominio reale
- Test E2E browser (Playwright/Cypress)
- Test upload import PDF/XLSX grandi file
- Test performance sotto carico
- Verifica legale testo Privacy/Termini da avvocato

---

## 12. COSA MANCA / NON IMPLEMENTATO

- **Apple OAuth** — richiesto in `.env.example` ma non implementato
- **CI/CD GitHub Actions** — nessuna pipeline automatica test/deploy
- **Test E2E frontend** — nessun test browser automatizzato
- **Audit penetration test** — non eseguito
- **DPA OpenAI / registro trattamenti** — documentazione legale da completare esternamente
- **Cookie banner** — non necessario se solo JWT localStorage (da confermare legalmente)
- **2FA TOTP** — non implementato (solo step-up password)
- **Rimozione file legacy** `minorRestriction.middleware.js` — duplicato, da eliminare in cleanup
- **Commit git** — tutte le modifiche sono ancora unstaged/uncommitted

---

## 13. PROSSIMI STEP CONSIGLIATI

### Priorità alta (bloccanti per produzione)

1. **Commit e push** di tutte le modifiche con review strutturata
2. **Configurare SMTP produzione** e testare flusso reset password end-to-end
3. **Configurare Google OAuth produzione** (dominio, callback URL, HTTPS)
4. **Eseguire migrazioni** su DB staging/produzione: `npm run migrate`
5. **Test manuale completo** registrazione → onboarding → dashboard su browser pulito

### Priorità media

6. Aggiungere **GitHub Actions** (lint + `npm test` su PR)
7. **Rimuovere** `minorRestriction.middleware.js` se non più referenziato
8. **Test E2E** login + onboarding + impostazioni (Playwright)
9. **Review legale** testi Privacy/Termini
10. Documentare procedura **backup DB** e disaster recovery

### Priorità bassa

11. Apple Sign-In
12. 2FA TOTP opzionale
13. Dashboard admin per audit consensi
14. Internazionalizzazione (i18n) documenti legali

---

## Appendice — Fix sessione corrente (14 lug 2026)

| Fix | File principali |
|-----|-----------------|
| OAuth Google login | `oauthPopup.js`, `useOAuthPopup.js`, `auth.store.js`, `oauth-relay.html`, `app.js` |
| Registrazione/onboarding | `validation.middleware.js`, `auth.store.js`, `router/index.js`, `OnboardingView.vue` |
| Restrizioni under 18 | `ageRestriction.js`, `OnboardingView.vue`, `featureAccess.js` |
| No scommesse/investimenti da questionario | `featureAccess.js`, `featureAccess.middleware.js`, `auth.store.js`, `ImpostazioniView.vue` |

---

*Report generato automaticamente dall'agente di implementazione WALLT.*
