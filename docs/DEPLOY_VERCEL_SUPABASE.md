# Pubblicare WALLT con Vercel e Supabase

Questa è la procedura più semplice per una beta gratuita multiutente. Si usa una sola repository GitHub, ma si creano due progetti Vercel: uno per il sito e uno per l’API. Il browser non riceve mai la password del database.

## Prima di iniziare

Servono:

- la repository WALLT su GitHub;
- un account Supabase;
- un account personale Vercel;
- Node.js 22 o 24 sul computer solo per eseguire le migrazioni.

Non copiare mai password, URL Supabase, `JWT_SECRET`, `CRON_SECRET` o `GOOGLE_CLIENT_SECRET` in GitHub o nelle variabili del progetto frontend.

## 1. Creare il database Supabase

1. Apri [Supabase Dashboard](https://supabase.com/dashboard) e seleziona **New project**.
2. Scegli una regione europea vicina agli utenti.
3. Genera una password database lunga e salvala nel password manager.
4. Attendi che il progetto sia pronto e premi **Connect**.
5. Copia due URI diverse:
   - **Transaction pooler**, porta `6543`: sarà `DATABASE_URL` su Vercel;
   - **Session pooler**, porta `5432`: sarà usata una sola volta come `DATABASE_MIGRATION_URL`.

La porta `6543` è adatta alle funzioni serverless; la porta `5432` mantiene una sessione stabile durante le migrazioni. Usa esattamente gli URI mostrati dal pannello, sostituendo il segnaposto password se richiesto.

## 2. Creare le tabelle

Questa operazione parte da un database Supabase vuoto. Non copia utenti o dati dal database locale.

1. Nel file locale ignorato `server/.env`, aggiungi temporaneamente:

```env
DATABASE_MIGRATION_URL=<incolla_qui_il_session_pooler_supabase_porta_5432>
```

2. Dal terminale, nella cartella `server`, esegui:

```bash
npm ci
npm run migrate:production
```

3. Prima di applicare, controlla lo stato con `npm run migrate:production:status`: elenca le migrazioni gia applicate e quelle pendenti senza modificare nulla.
4. Il comando deve terminare senza errori. Poi elimina `DATABASE_MIGRATION_URL` dal file locale oppure conservala solo nel password manager.

Le migrazioni abilitano RLS e revocano l’accesso ai ruoli pubblici `anon` e `authenticated`. WALLT accede alle tabelle soltanto dal backend con la connessione PostgreSQL; non creare policy pubbliche Supabase.

## 3. Creare i due progetti Vercel

Importa la stessa repository GitHub due volte da [Vercel Dashboard](https://vercel.com/dashboard).

### Progetto API

- Nome suggerito: `wallt-api`
- Root Directory: `server`
- Framework Preset: `Other`
- Install Command: lascia il valore automatico (`npm install`)
- Build Command e Output Directory: lascia vuoti
- Node.js: 22 o successivo

### Progetto sito

- Nome suggerito: `wallt-web`
- Root Directory: `client`
- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js: 22 o successivo

È normale che il primo deploy dell’API fallisca finché non sono presenti le variabili obbligatorie. Dopo la creazione, copia da **Settings → Domains** i due domini HTTPS definitivi.

## 4. Configurare le variabili Vercel

In **Settings → Environment Variables** del progetto API aggiungi i valori per Production, Preview e Development quando servono:

```env
NODE_ENV=production
DATABASE_URL=<transaction_pooler_supabase_porta_6543>
JWT_SECRET=<valore_casuale_di_almeno_32_caratteri>
CRON_SECRET=<secondo_valore_casuale_diverso_di_almeno_32_caratteri>
CORS_ORIGINS=https://<dominio-wallt-web>
API_URL=https://<dominio-wallt-api>
PASSWORD_RESET_URL=https://<dominio-wallt-web>/reset-password
RUN_MIGRATIONS_ON_BOOT=false
```

### Certificato TLS Supabase

WALLT verifica sempre il certificato del database: la verifica non va disattivata per far partire il deploy.

Se la connessione fallisce con `SELF_SIGNED_CERT_IN_CHAIN` o `unable to verify the first certificate`, scarica il root certificate da **Supabase Dashboard → Project Settings → Database → SSL Configuration** e incolla il contenuto PEM in una variabile del progetto API:

```env
DATABASE_SSL_CA=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
```

Equivale a `sslmode=verify-full`. Solo come workaround temporaneo e dichiarato esiste `DATABASE_SSL_NO_VERIFY=true`, che disattiva la verifica del certificato: non lasciarla attiva.

Non aggiungere `DATABASE_MIGRATION_URL` al progetto Vercel. Genera `JWT_SECRET` e `CRON_SECRET` separatamente con il password manager; non riutilizzare la password Supabase.

Nel progetto sito aggiungi soltanto variabili pubbliche:

```env
VITE_API_URL=https://<dominio-wallt-api>/api
VITE_GOOGLE_CLIENT_ID=<client_id_google_pubblico_opzionale>
```

`VITE_API_URL` deve terminare con `/api` e usare HTTPS. Non inserire nel frontend password o secret.

## 5. Opzioni email e Google

Il sito funziona anche senza Google e OpenAI. Per rendere utilizzabile “Password dimenticata” servono nel progetto API:

```env
RESEND_API_KEY=<chiave_resend>
EMAIL_FROM=WALLT <noreply@<dominio-verificato>>
```

Per attivare Google OAuth, aggiungi nel progetto API:

```env
GOOGLE_CLIENT_ID=<client_id_google>
GOOGLE_CLIENT_SECRET=<client_secret_google>
GOOGLE_CALLBACK_URL=https://<dominio-wallt-api>/api/auth/google/callback
```

Nel client OAuth di Google Cloud configura:

- origine JavaScript autorizzata: `https://<dominio-wallt-web>`;
- URI di reindirizzamento: `https://<dominio-wallt-api>/api/auth/google/callback`.

Il valore pubblico `VITE_GOOGLE_CLIENT_ID` deve essere lo stesso `GOOGLE_CLIENT_ID`; il secret resta soltanto nel progetto API.

## 6. Pubblicare e controllare

1. Da Vercel esegui **Redeploy** prima sull’API e poi sul sito.
2. Apri `https://<dominio-wallt-api>/api/health`. Deve rispondere con `status: ok`.
3. Apri il sito in una finestra anonima.
4. Registra due utenti con email diverse.
5. Completa l’onboarding e crea un conto per ciascuno.
6. Verifica che ciascun utente veda soltanto i propri conti e movimenti.
7. Controlla **Vercel → wallt-api → Settings → Cron Jobs**: deve comparire `/api/cron/ricorrenti` una volta al giorno.
8. Controlla **Supabase → Database → Tables**: le tabelle devono avere RLS attivo.

Se il browser mostra un errore CORS, correggi `CORS_ORIGINS` usando il dominio frontend esatto, senza slash finale, e ridistribuisci l’API.

## 7. Limiti gratuiti da conoscere

Al 30 agosto 2026:

- Supabase Free include 500 MB di database; oltre tale quota il database può entrare in sola lettura. I progetti con poca attività possono essere sospesi dopo circa una settimana e il piano Free non include backup automatici scaricabili.
- Vercel Hobby consente cron una volta al giorno con precisione oraria, non al minuto.
- Vercel Hobby è riservato a uso personale e non commerciale. Il numero di utenti, da solo, non rende il progetto commerciale; pubblicità, abbonamenti, vendite o altre entrate richiedono il passaggio a un piano compatibile.
- I piani gratuiti non offrono SLA: una beta può avere pause o limiti temporanei.

Controlla periodicamente [Vercel Usage](https://vercel.com/docs/pricing/manage-and-optimize-usage) e la dimensione database in Supabase. Valuta un upgrade prima di monetizzare, vicino a 400 MB, quando una pausa sarebbe dannosa o quando il traffico causa limiti ripetuti.

Il piano Supabase Free non fornisce backup automatici: prima di accogliere dati importanti prepara esportazioni PostgreSQL periodiche e conservale fuori da Supabase.

## 8. Aggiornamenti e rollback

Per aggiornare lo schema dopo nuove migrazioni:

1. salva il Session pooler in `DATABASE_MIGRATION_URL` nel solo `server/.env` locale;
2. esegui `npm run migrate:production`;
3. pubblica il nuovo codice su Vercel.

Esegui sempre le migrazioni prima del deploy che usa le nuove colonne. Non attivare `RUN_MIGRATIONS_ON_BOOT` su Vercel.

Per tornare al codice precedente usa **Deployments → Instant Rollback** in entrambi i progetti. Un rollback Vercel non annulla automaticamente le migrazioni database e non aggiorna automaticamente il cron: verifica manualmente **Settings → Cron Jobs** dopo il rollback.

## 9. Notifiche: cron e push del browser

### Cron

`server/vercel.json` dichiara due cron, entrambi protetti da `CRON_SECRET`:

| Path | Schedule (UTC) | Cosa fa |
|---|---|---|
| `/api/cron/ricorrenti` | `0 7 * * *` | Crea i movimenti ricorrenti dovuti |
| `/api/cron/notifiche` | `0 19 * * *` | Genera le notifiche, spedisce le push in coda, pota lo storico |

`0 19 * * *` UTC corrisponde alle 20:00 (ora solare) o 21:00 (ora legale) a
Roma: sempre dopo l'orario di promemoria predefinito (20:00) e fuori dalle ore
di silenzio. Due cron è il massimo del piano Hobby.

Il job è **idempotente** (unique su `notifiche.dedupe_key`): può essere
richiamato a qualunque frequenza senza creare duplicati. Su piano Pro conviene
passare a `"schedule": "0 * * * *"`, così l'`orario_promemoria` scelto
dall'utente viene rispettato al minuto e le notifiche rinviate dalle ore di
silenzio partono entro l'ora invece che il giorno dopo. È l'unica modifica
necessaria: nessun cambio di codice.

Con la schedulazione giornaliera, un `orario_promemoria` successivo all'ora del
cron non viene mai raggiunto nella stessa giornata: la UI propone orari fino
alle 21:00 e lo spiega, ma è bene saperlo prima di cambiare lo schedule.

Verifica dopo il deploy: **Vercel → Settings → Cron Jobs** deve elencare
entrambi i job. Per una prova manuale:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<api>.vercel.app/api/cron/notifiche
```

### Notifiche push (opzionali)

Senza chiavi VAPID il centro notifiche in-app funziona normalmente: si
disattivano solo le notifiche di sistema del browser. Per abilitarle:

1. genera la coppia di chiavi **una sola volta**:

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

2. imposta su Vercel (progetto API, ambiente Production) `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (`mailto:...` o un URL `https:`);
3. ridistribuisci l'API. La chiave pubblica viene servita al browser da
   `GET /api/notifiche/preferenze`: nessuna variabile da configurare nel
   progetto frontend.

Rigenerare le chiavi invalida tutte le sottoscrizioni esistenti: gli utenti
dovranno riattivare le push dalle impostazioni. Il service worker
(`client/public/sw.js`) viene servito da Vercel come file statico alla radice
del dominio: è la posizione richiesta perché lo scope copra tutta l'app.

Le notifiche di sistema non contengono mai importi, saldi o categorie — solo
titolo, una frase generica e la pagina da aprire.

## Deployment attuale (4 settembre 2026)

Valori reali di questa installazione, da usare al posto dei segnaposto:

| Cosa | Valore |
|---|---|
| Frontend | `https://wallt-client-dusky.vercel.app` |
| Backend | `https://wallt-api.vercel.app` |
| Progetto Vercel frontend | `wallt` (scope `benial502`, root `client`) |
| Progetto Vercel backend | `wallt-api` (scope `benial502`, root `server`) |
| Progetto Supabase | `qcekvokpoexzywvkxykq`, regione `eu-central-2`, PostgreSQL 17 |
| Pooler runtime | `aws-1-eu-central-2.pooler.supabase.com:6543` |
| Pooler migrazioni | `aws-1-eu-central-2.pooler.supabase.com:5432` |

`wallt.vercel.app` **non appartiene a questo progetto**: il nome era gia'
occupato da un'altra applicazione. Non usarlo in `CORS_ORIGINS`.

Il database contiene anche una tabella `quotes` estranea a WALLT, residuo
di un altro esperimento sullo stesso progetto Supabase. Non e' usata dal
codice ed e' l'unica tabella dello schema `public` ancora accessibile ai
ruoli `anon`/`authenticated`.

### Trappole incontrate durante il primo deploy

- **`Please install pg package manually`**: Sequelize carica il driver con un
  require dinamico che il bundler Vercel non traccia. Risolto in
  `config/sequelize.js` con `dialectModule: pg`.
- **`DOMMatrix is not defined`**: `pdf-parse` importa `pdfjs-dist`, che
  pretende globali del browser assenti sul runtime Vercel. Risolto caricando
  il parser PDF alla prima chiamata invece che all'import.
- **`SELF_SIGNED_CERT_IN_CHAIN`**: la catena TLS di Supabase e' firmata dalla
  "Supabase Root 2021 CA", che Node non conosce. Serve `DATABASE_SSL_CA`.
- Le variabili d'ambiente si applicano **solo ai deployment creati dopo** il
  salvataggio: dopo un Save serve sempre un Redeploy.

## Fonti operative

- [Connessioni PostgreSQL Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Limiti e prezzi Supabase](https://supabase.com/pricing)
- [Backup Supabase](https://supabase.com/docs/guides/platform/backups)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Limiti Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Protezione Vercel Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
