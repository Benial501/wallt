# Report — Reset Password con Resend

**Data:** 14 luglio 2026  
**Stato:** Implementazione completata e verificata

---

## Riepilogo

Il sistema di recupero password basato su SMTP/Ethereal/nodemailer è stato **sostituito completamente** con **Resend**.

| Aspetto | Prima | Dopo |
|---------|-------|------|
| Provider email | nodemailer + SMTP/Ethereal | **Resend API** |
| Hash token | bcrypt | **SHA-256** |
| Dev fallback (link in pagina) | Sì | **Rimosso** — solo email reale |
| Config | `SMTP_*` | `RESEND_API_KEY`, `EMAIL_FROM` |

---

## File creati

| File | Descrizione |
|------|-------------|
| `server/services/email/EmailService.js` | Inizializzazione Resend, invio generico e reset password |
| `server/services/email/templates/PasswordResetTemplate.js` | Template HTML/text con logo WALLT, CTA, link fallback, scadenza 30 min |
| `server/migrations/20260714180000-update-password-reset-token-sha256.js` | `token_hash` → VARCHAR(64) + indice `(user_id, expires_at)` |
| `PASSWORD_RESET_RESEND_REPORT.md` | Questo report |

## File modificati

| File | Modifica |
|------|----------|
| `server/services/passwordReset.service.js` | SHA-256, Resend, OAuth Google/Apple |
| `server/controllers/passwordReset.controller.js` | Messaggi generici, OAuth dedicato, 503 se email non pronta |
| `server/models/PasswordResetToken.js` | `token_hash` STRING(64) |
| `server/server.js` | `EmailService.initEmailService()` al boot |
| `server/app.js` | Rate limit su `/reset-password` |
| `server/middleware/validation.middleware.js` | Token formato `[a-f0-9]{64}` |
| `server/package.json` | +`resend`, −`nodemailer` |
| `server/.env.example` | Documentazione Resend |
| `server/.env.test.example` | Variabili Resend per test |
| `server/tests/auth.test.js` | Stub EmailService + 3 test aggiuntivi |
| `client/src/views/auth/ForgotPassword.vue` | UI produzione, messaggio OAuth |
| `client/src/views/auth/ResetPassword.vue` | *(già esistente, compatibile dark mode)* |

## File eliminati

| File | Motivo |
|------|--------|
| `server/services/email.service.js` | Sostituito da `EmailService.js` |
| `server/config/smtp.js` | Non più necessario |

---

## Flusso implementato

```
1. POST /api/auth/forgot-password { email }
   ├─ EmailService pronto? → altrimenti 503
   ├─ Utente non trovato → 200 messaggio generico (no leak)
   ├─ Account OAuth senza password → messaggio Google/Apple
   └─ Utente locale:
       ├─ crypto.randomBytes(32) → token hex 64 char
       ├─ SHA-256(token) salvato in DB, scadenza 30 min
       └─ Email Resend con template WALLT

2. GET /reset-password?token=...
   └─ Pagina Vue con form nuova password

3. POST /api/auth/reset-password { token, newPassword }
   ├─ Valida token SHA-256 + scadenza + non usato
   ├─ bcrypt nuova password
   └─ Invalida tutti i token attivi dell'utente
```

---

## Sicurezza

- Token mai salvato in chiaro (solo SHA-256)
- Lookup token O(1) per hash (non scan di tutta la tabella)
- Risposta identica se email inesistente
- `express-rate-limit`: 10 req/15 min su forgot + reset
- Validazione express-validator su email, token, password
- Account Google/Apple senza password locale → messaggio dedicato

---

## Configurazione richiesta (`server/.env`)

```env
RESEND_API_KEY=<resend_api_key>
EMAIL_FROM="WALLT <noreply@tuodominio.com>"
PASSWORD_RESET_URL=http://localhost:5173/reset-password
```

**Senza `RESEND_API_KEY` o `EMAIL_FROM`:**
- Log errore chiaro all'avvio
- Servizio email **disabilitato** (server API resta attivo)
- `POST /forgot-password` → **503**

---

## Test eseguiti

```
npm run migrate   → OK (migration SHA-256 applicata)
npm test          → 27/27 passed (+3 nuovi test reset password)
```

### Nuovi test

1. Non rivela esistenza email
2. Messaggio dedicato account Google
3. 503 se servizio email non pronto

### Test manuale API

```bash
# Senza RESEND_API_KEY configurata:
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"utente@example.com"}'
# → 503 "Impossibile inviare l'email di reset..."
```

---

## Frontend

| Route | Componente | Stato |
|-------|------------|-------|
| `/forgot-password` | `ForgotPassword.vue` | Aggiornato — messaggio generico + hint spam |
| `/reset-password` | `ResetPassword.vue` | Già presente — dark mode, validazione password |

---

## Prossimi passi consigliati

1. **Inserire `RESEND_API_KEY` reale** in `server/.env` e verificare dominio su [resend.com](https://resend.com)
2. **Verificare dominio mittente** — `EMAIL_FROM` deve usare un indirizzo verificato su Resend
3. **Apple Sign-In** — quando implementato, aggiungere `apple` all'enum `auth_provider` in User (il service è già pronto)
4. **Email transazionali aggiuntive** — benvenuto, conferma email, alert sicurezza (riusando `EmailService`)
5. **Monitoraggio** — loggare `messageId` Resend per debug consegna

---

## Note operative

Per ricevere email reali:

1. Crea account Resend
2. Verifica dominio (o usa sandbox Resend per test verso email verificate)
3. Aggiungi API key in `server/.env`
4. Riavvia il server: log atteso → `[email] Servizio Resend inizializzato`
