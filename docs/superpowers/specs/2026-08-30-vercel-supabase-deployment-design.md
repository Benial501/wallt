# WALLT su Vercel e Supabase — Specifica di deployment

## Obiettivo

Rendere WALLT distribuibile online usando una sola repository GitHub, due progetti Vercel e un progetto Supabase Free, senza costi ricorrenti iniziali e senza pubblicare credenziali o dati locali.

L'applicazione resta gratuita e non monetizzata durante l'uso del piano Vercel Hobby. Prima di introdurre pagamenti, pubblicità interna, affiliazioni o altre forme di guadagno dovrà essere rivalutato il piano Vercel.

## Architettura scelta

La stessa repository alimenta due progetti Vercel indipendenti:

- `wallt-web`: root directory `client/`, build Vue/Vite e pubblicazione della SPA;
- `wallt-api`: root directory `server/`, API Express eseguita come Vercel Function Node.js.

Il database è PostgreSQL gestito da Supabase. Il browser non si collega direttamente a Supabase e non riceve URL completi con password, service key o credenziali database. Tutte le richieste applicative continuano a passare dall'API WALLT, che mantiene JWT, Google OAuth, autorizzazione e isolamento tramite `user_id`.

## Database PostgreSQL

### Connessioni

Il backend userà due URL distinti:

- `DATABASE_URL`: Supabase Transaction Pooler, porta 6543, per il traffico serverless Vercel;
- `MIGRATION_DATABASE_URL`: Supabase Session Pooler, porta 5432, usato esclusivamente per migrazioni e attività amministrative deliberate.

Entrambe le connessioni richiederanno SSL. Sequelize avrà un pool molto piccolo per ogni istanza serverless, con timeout e chiusura delle connessioni inattive, così da non esaurire il limite di Supabase.

In sviluppo e nei test sarà ancora possibile usare PostgreSQL locale tramite le normali variabili `DB_*`. MySQL e `mysql2` verranno rimossi al termine della migrazione.

### Schema e migrazioni

Le migrazioni Sequelize saranno rese compatibili con PostgreSQL. In particolare verranno verificati:

- tipi `ENUM` e relativa rimozione in rollback;
- query SQL scritte manualmente;
- chiavi esterne, indici e vincoli univoci;
- campi `DECIMAL`, date e timestamp;
- migrazioni duplicate relative all'autenticazione sociale;
- ordine di creazione e cancellazione delle tabelle.

Le migrazioni non verranno eseguite automaticamente all'avvio delle funzioni Vercel. Saranno lanciate come operazione separata usando `MIGRATION_DATABASE_URL`, prima del deploy applicativo.

Il database Supabase di produzione partirà vuoto. Nessun utente, movimento, saldo, email o altro dato presente nel database locale verrà caricato automaticamente.

### Protezione Supabase

Tutte le tabelle applicative resteranno nel database PostgreSQL, ma non saranno utilizzabili direttamente dai ruoli pubblici `anon` e `authenticated` di Supabase. Verrà applicata una migrazione di hardening che abilita RLS senza politiche pubbliche oppure revoca i privilegi Data API equivalenti, mantenendo l'accesso soltanto al ruolo backend configurato.

L'isolamento tra utenti continuerà a essere implementato dall'API WALLT e coperto dai test cross-user già presenti. Le credenziali database non compariranno mai nel frontend, nei log o nella repository.

## Backend Vercel

### Entry point serverless

`server/app.js` resterà la factory Express condivisa. Verrà aggiunto un entry point sotto `server/api/` che:

1. valida le variabili di produzione;
2. inizializza l'app una sola volta per istanza calda;
3. verifica la disponibilità della connessione senza eseguire migrazioni;
4. esporta l'handler Express a Vercel;
5. restituisce errori JSON senza dettagli interni o credenziali.

`server/server.js` resterà disponibile per lo sviluppo locale persistente, ma non avvierà il processo Vercel.

### Importazioni

Gli estratti conto continueranno a essere elaborati in memoria. Il limite resta 5 MB e non verranno scritti file permanenti nel filesystem effimero di Vercel. CSV, XLS/XLSX e PDF resteranno supportati. La funzione API avrà durata e memoria configurate entro i limiti del piano utilizzato; file che superano il limite verranno rifiutati con un messaggio chiaro.

### Rate limiting

Il limiter in memoria viene mantenuto come protezione locale, ma non viene considerato sufficiente da solo in un ambiente distribuito. Per gli endpoint pubblici di autenticazione verrà aggiunto un rate limit persistente basato su PostgreSQL oppure una protezione equivalente disponibile nel piano Vercel. La soluzione non introdurrà un servizio esterno a pagamento.

## Movimenti ricorrenti

`node-cron` non sarà avviato dentro le funzioni Vercel. Verrà creato un endpoint interno giornaliero che richiama `processaRicorrenti()`.

L'endpoint:

- accetta soltanto richieste Vercel Cron con `Authorization: Bearer <CRON_SECRET>`;
- non è disponibile agli utenti normali;
- mantiene il controllo anti-duplicazione nel database;
- usa esplicitamente il fuso `Europe/Rome` per determinare il giorno applicativo;
- restituisce un riepilogo privo di dati personali.

`vercel.json` pianificherà una sola esecuzione al giorno, compatibile con Vercel Hobby. La precisione oraria non è garantita dal piano gratuito, ma l'elaborazione resta idempotente.

## Frontend Vercel

Il progetto `wallt-web` userà `client/` come root directory. La build resta `npm run build` e l'output `dist/`.

La configurazione includerà:

- fallback SPA verso `index.html`;
- `VITE_API_URL` con URL pubblico di `wallt-api`;
- `VITE_GOOGLE_CLIENT_ID` pubblico;
- CSP compatibile con API WALLT e Google Identity Services;
- nessun secret server-side nel bundle;
- manifest, favicon e asset esistenti invariati.

## Autenticazione e domini

L'autenticazione WALLT esistente viene mantenuta. Non viene introdotto Supabase Auth.

Per la produzione saranno configurati:

- `APP_URL`: URL del frontend;
- `API_URL`: URL dell'API;
- `CORS_ORIGINS`: solo frontend di produzione e localhost autorizzati;
- `GOOGLE_CALLBACK_URL`: callback dell'API Vercel;
- origini JavaScript e redirect URI corrispondenti nella Google Cloud Console;
- `PASSWORD_RESET_URL`: pagina reset del frontend;
- `JWT_SECRET`: valore casuale lungo e distinto da sviluppo/test;
- `CRON_SECRET`: valore casuale distinto dal JWT;
- credenziali Resend soltanto se il reset email viene abilitato.

Le Preview Deployment Vercel non saranno automaticamente autorizzate in CORS o Google OAuth: l'ambiente di produzione userà domini stabili e una whitelist esplicita.

## Variabili d'ambiente

I file `.env` reali restano ignorati da Git. I file `.env.example` saranno aggiornati con nomi e commenti, senza valori sensibili.

Vercel API conterrà almeno:

- `NODE_ENV=production`;
- `DATABASE_URL`;
- `JWT_SECRET`;
- `CRON_SECRET`;
- `APP_URL`, `API_URL`, `CORS_ORIGINS`;
- variabili Google OAuth, se abilitate;
- variabili Resend, se abilitate.

`MIGRATION_DATABASE_URL` sarà disponibile soltanto nel contesto controllato usato per le migrazioni e non sarà necessaria al normale runtime API.

Vercel Web conterrà solamente variabili pubbliche `VITE_*`.

## Test e criteri di accettazione

La migrazione è accettata soltanto quando:

1. tutte le migrazioni completano su un database PostgreSQL vuoto;
2. tutti i test backend passano con PostgreSQL;
3. la suite cross-user conferma l'isolamento di conti, movimenti, budget, obiettivi, investimenti e scommesse;
4. create/update/delete e trasferimenti mantengono i saldi corretti;
5. il job ricorrente resta idempotente;
6. upload CSV/XLS/XLSX/PDF rispetta limiti e validazioni;
7. il frontend esegue una build di produzione senza segreti;
8. l'API serverless risponde a `/api/health`;
9. login locale, login Google, reset password e step-up funzionano con i domini di produzione;
10. una scansione finale non rileva `.env`, password, token o URL database versionati.

Saranno aggiunti test specifici per configurazione PostgreSQL, handler serverless, autenticazione cron e variabili di produzione.

## Deployment e rollback

Ordine operativo:

1. creare o selezionare il progetto Supabase;
2. applicare migrazioni e hardening su database vuoto;
3. distribuire `wallt-api` e verificare health/database;
4. distribuire `wallt-web` con l'URL API definitivo;
5. configurare Google OAuth e Resend;
6. eseguire test manuali con due utenti separati;
7. abilitare il cron soltanto dopo la verifica delle operazioni normali.

Un errore applicativo può essere annullato ripristinando il precedente deployment Vercel. Le migrazioni devono avere rollback verificato quando tecnicamente sicuro; le migrazioni distruttive richiederanno sempre un backup e un intervento deliberato.

## Limiti accettati della soluzione gratuita

- Supabase Free può sospendere un progetto con attività insufficiente.
- Il database ha un limite gratuito di 500 MB e non include i backup gestiti del piano Pro.
- Vercel Hobby non può essere usato per monetizzazione commerciale.
- Il cron Hobby è giornaliero e con precisione oraria limitata.
- Non esiste uno SLA di disponibilità.

Prima del lancio verrà documentata una procedura di backup logico cifrato. Quando WALLT inizierà a monetizzare o avrà utenti sufficienti da richiedere maggiore affidabilità, i primi upgrade raccomandati saranno database con backup gestiti e piano Vercel compatibile con uso commerciale.
