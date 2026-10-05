# WALLT — Claude Code Operating Manual

> Manuale operativo per agenti AI che lavorano su questo repository.
> Ultimo aggiornamento: audit repository, agosto 2026.

## Lingua di lavoro

**Tutto in italiano, sempre.** Vale per le risposte in chat, il ragionamento mostrato,
i piani e le todo list, i messaggi di commit, le descrizioni di PR, la documentazione in
`docs/`, i commenti nel codice, i messaggi d'errore e i testi di UI.

Unica eccezione, per non rompere il codice esistente: **gli identificatori restano in
inglese** (nomi di variabili, funzioni, file, chiavi API, enum), come già previsto dalla
Coding Rule 7. Italiano tutto ciò che sta attorno al codice, inglese solo il codice stesso.

## Project Overview

**WALLT** è un'applicazione web di gestione finanziaria personale in italiano. Permette di tracciare conti, movimenti, budget, obiettivi, investimenti e scommesse. L'utente inserisce o importa manualmente le transazioni; dal **ottobre 2026** può anche collegare un conto bancario via Open Banking (**Bank Sync**, Regola 24), funzione a permesso governata dagli entitlement (Regola 23).

Architettura: **SPA Vue 3** (`client/`) + **API REST Node.js/Express** (`server/`) su Vercel + **PostgreSQL Supabase** via Sequelize.

## Tech Stack

### Frontend (`client/`)
| Tecnologia | Versione | Uso |
|---|---|---|
| Vue.js | 3.5 | Framework (Composition API, `<script setup>`) |
| Vite | 8 | Build tool |
| Vue Router | 5 | Routing SPA |
| Pinia | 3 | State management |
| Tailwind CSS | 3.4 | Utility CSS |
| Axios | 1.18 | HTTP client |
| Chart.js + vue-chartjs | 4.5 / 5.3 | Grafici |
| dayjs | 1.11 | Date (locale `it`) |
| lucide-vue-next | 1.0 | Icone |

### Backend (`server/`)
| Tecnologia | Versione | Uso |
|---|---|---|
| Node.js | 22+ / 24+ | Runtime |
| Express | 5.2 | Web framework |
| Sequelize | 6.37 | ORM |
| pg + pg-hstore | 8.x / 2.x | Driver PostgreSQL |
| JWT (jsonwebtoken) | 9.0 | Autenticazione |
| bcrypt | 6.0 | Hash password |
| Passport + passport-google-oauth20 | 0.7 / 2.0 | Google OAuth |
| express-validator | 7.3 | Validazione input |
| express-rate-limit | 8.5 | Rate limiting |
| google-auth-library | 11.x | Verifica ID token Google (step-up OAuth) |
| helmet | 8.2 | Security headers |
| multer | 2.2 | Upload file (import) |
| web-push | 3.6 | Notifiche push del browser (VAPID) |
| node-cron | 4.5 | Spese ricorrenti |
| winston | 3.19 | Logging |
| Resend | 6.17 | Email (reset password) |
| csv-parse, xlsx, pdf-parse | — | Parsing estratti conto |

### Database
- **PostgreSQL Supabase** con Sequelize ORM
- Runtime Vercel sul Transaction Pooler (porta 6543); migrazioni sul Session Pooler (porta 5432)
- Migrazioni via `sequelize-cli` (52 file in `server/migrations/`)
- Auto-migrate all'avvio in `server.js`

### Authentication
- JWT Bearer (7 giorni) per API
- Google OAuth 2.0 (popup, stateless, no session)
- Step-up token (5 min) per operazioni sensibili
- Password reset via Resend + token SHA-256

### Styling
- CSS custom properties (`variables.css`) per dark/light theme
- Tailwind utility classes
- `useTheme.js` sincronizza tema con API e localStorage

### Branding e asset
- **Sorgente ufficiale del brand**: `client/brand-source/originals/` (JPG originali, non serviti pubblicamente, solo riferimento — non ridisegnare/modificare senza nuovi asset ufficiali).
- **Asset derivati usati nell'app**: `client/public/brand/wallt-logo-horizontal.png` (logo orizzontale, sfondo trasparente — usato in sidebar/header dove c'è spazio) e `client/public/brand/wallt-app-icon{,-96}.png` (icona quadrata, sfondo bianco pieno — usata come mark compatto in mobile-header, dashboard-header, pagine auth/onboarding/legal). Il wordmark "WALLT" nel logo è nero: su sfondo scuro va sempre mostrato dentro un contenitore chiaro (`.sidebar__logo-badge`), mai direttamente su superfici dark.
- **Favicon/PWA icons**: in `client/public/` (`favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `icon-192x192.png`, `icon-512x512.png`, `icon-maskable-512x512.png`) + `client/public/manifest.webmanifest`, collegati in `client/index.html`. **Non sono tutte della stessa famiglia**: favicon e `apple-touch-icon.png` derivano dall'icona quadrata a sfondo bianco, mentre le tre icone PWA (`icon-192x192`, `icon-512x512`, `icon-maskable-512x512`) hanno **fondo scuro `#06060A`**, lo stesso di `background_color` nel manifest e della splash animata. Non è una scelta estetica: installata come PWA, Android genera una propria splash screen con l'icona dell'app ingrandita al centro, e quella schermata non è disattivabile dal manifest — con l'icona a fondo bianco compariva un riquadro bianco gigante prima dell'animazione. Condividendo il fondo, la splash di sistema diventa invisibile. Chi riallinea queste tre icone al bianco fa ricomparire il riquadro. iOS non genera alcuna splash per le PWA, quindi `apple-touch-icon.png` resta bianca di proposito: lì il fondo scuro non avrebbe alcuna funzione e l'icona sparirebbe sugli sfondi scuri. La maskable deve tenere il simbolo dentro la safe zone (80% centrale): a piena area il wordmark viene tagliato dai launcher con maschera circolare.
- Per rigenerare le icone: `rsvg-convert` (SVG→PNG, conserva i gradienti) e ImageMagick (`magick`), entrambi presenti sulla macchina di sviluppo ma non dipendenze del progetto. Il tracciato vettoriale del simbolo è già nel repository, nell'SVG della splash in `client/index.html`: è la sorgente da cui sono state generate le tre icone PWA, senza ridisegnare il marchio.

### Servizi esterni (opzionali)
| Servizio | Stato | File |
|---|---|---|
| Resend (email) | Richiesto per reset password | `services/email/EmailService.js` |
| Google OAuth | Opzionale (env-gated) | `config/passport.js` |
| OpenAI | Opzionale (categorizzazione) | `services/import/category/OpenAICategoryClassifier.js` |
| Google Places / Foursquare / OSM | Stub (non implementati) | `services/merchant/lookup/providers/` |
| Web Push (VAPID) | Opzionale: senza `VAPID_*` il centro notifiche in-app funziona lo stesso | `services/notifiche/PushService.js` |
| Sentry (errori) | Opzionale: senza `SENTRY_DSN`/`VITE_SENTRY_DSN` gli errori restano nei log e l'app è identica | `services/monitoraggio.service.js`, `client/src/utils/monitoraggio.js` |
| Vercel Web Analytics | Opzionale, solo in produzione: script servito dal dominio stesso, senza cookie né banner | `client/src/utils/monitoraggio.js` |
| Enable Banking (Open Banking) | **Provider predefinito.** Opzionale: senza `ENABLE_BANKING_APPLICATION_ID`/`ENABLE_BANKING_PRIVATE_KEY` Bank Sync risponde `PROVIDER_NON_CONFIGURATO` e il resto di WALLT è identico. Autenticazione a JWT RS256 firmato con chiave privata, **nessuna dipendenza npm** (`crypto` + `fetch` globali) | `services/bankSync/providers/EnableBankingProvider.js` |
| GoCardless Bank Account Data | **Non più ottenibile**: dal luglio 2025 il provider ha disabilitato i nuovi account. L'adapter resta registrato per chi ha già un account e nel caso riaprano | `services/bankSync/providers/GoCardlessBankProvider.js` |
| Billing (Stripe/Paddle) | **Non implementato.** `NessunBillingProvider` dichiara `disponibile: false`, e l'interfaccia mostra "Disponibile prossimamente" invece di una CTA che finga un acquisto | `services/billing/BillingProvider.js` |

## Repository Structure

```
wallt/
├── client/                 # Frontend Vue 3 + Vite
│   ├── src/
│   │   ├── components/     # UI riutilizzabili (common, dashboard, movimenti, analisi, layout, custom)
│   │   ├── views/          # Pagine (auth, dashboard, conti, movimenti, import, budget, analisi, ecc.)
│   │   ├── stores/         # 12 Pinia stores
│   │   ├── composables/    # useTheme, useOAuthPopup, useValuta, useChartTheme, useNumberCounter
│   │   ├── router/         # Vue Router con guard globali
│   │   └── utils/          # axios, categorie, featureAccess, session, formatters, appIcons
│   └── public/             # oauth-relay.html
├── server/                 # Backend Node.js + Express
│   ├── app.js              # Factory Express (createApp)
│   ├── server.js           # Entry point (DB, cron, listen)
│   ├── config/             # database, sequelize, passport
│   ├── constants/          # categorie.js (whitelist categorie)
│   ├── controllers/        # 25 controller
│   ├── middleware/         # auth, validation, rateLimit, stepUp, featureAccess, errorHandler
│   ├── models/             # 34 modelli Sequelize + index.js (associazioni)
│   ├── migrations/         # 52 migrazioni
│   ├── routes/             # 19 route modules
│   ├── services/           # Business logic (import, merchant, email, reset, sync, cron, notifiche, pianoSmart)
│   ├── tests/              # Jest (auth, security, gdpr, profilo, import, categorization, isolation, googleStepUp, financialConsistency, ricorrenti, excelParser, validateEnv)
│   └── utils/              # logger, AppError, ageRestriction, featureAccess, oauthPopup
├── docs/                   # Documentazione tecnica (questa cartella)
├── CLAUDE.md               # Questo file
└── README.md               # Overview prodotto
```

## Architecture

```
Browser (Vue SPA)
    │  Axios (JWT Bearer)
    ▼
Express API (/api/*)
    ├── authMiddleware (JWT)
    ├── featureAccess (scommesse/investimenti)
    ├── validation (express-validator)
    ├── rateLimit
    └── Controllers → Services → Sequelize → PostgreSQL/Supabase
```

- **Monorepo** con frontend e backend separati ma nello stesso repository.
- **Nessun SSR**: il frontend è una SPA statica servita da Vite.
- **Nessun WebSocket**: comunicazione solo REST.
- **Cron**: su Vercel è Vercel Cron che chiama `GET /api/cron/ricorrenti` e `GET /api/cron/notifiche` con `Authorization: Bearer $CRON_SECRET`; `node-cron` resta solo per il server locale (`server.js`). Il job notifiche è idempotente. **L'esecuzione oraria vera è su GitHub Actions** (`.github/workflows/notifiche-cron.yml`, ogni ora al minuto 5, richiede il secret `CRON_SECRET` sul repository): con un solo passaggio giornaliero l'`orario_promemoria` scelto dall'utente non sarebbe rispettato, perché tutto verrebbe consegnato quando passa il job. Il cron Vercel giornaliero (`0 19 * * *` UTC) resta come rete di sicurezza.
- **Import pipeline duale**: `services/import/` (core) + `services/importazioni/` (nuova pipeline con detector/parser bancari).

## Important Business Rules

1. **Saldo conti**: aggiornato atomicamente su create/update/delete movimenti e trasferimenti. `deltaSaldo(tipo, importo)` = entrata `+importo`, uscita `-importo`.
2. **Trasferimenti interni** (`tipo: 'trasferimento'`): non contano come spesa/entrata. Creano un singolo `Movimento` con `conto_id` + `conto_destinazione_id`. Aggiornano saldi di entrambi i conti in transazione DB.
3. **Categoria `trasferimento_denaro`** (uscita): diversa dal tipo movimento `trasferimento`. Serve a categorizzare bonifici/P2P verso altre persone.
4. **Soft-delete conti**: `attivo: false` invece di eliminazione fisica. Creazione conto con stesso nome riattiva conto inattivo.
5. **Scommesse ↔ Conti sync**: creazione piattaforma scommesse crea/aggiorna un `Conto` tipo `scommesse` e viceversa (`scommesseContoSync.service.js`).
6. **Onboarding obbligatorio**: utente non può accedere alle pagine protette finché `profilo.onboarding_completato` non è true.
7. **Restrizioni minori** (`fascia_eta === 'under_18'`): blocco accesso a scommesse e investimenti (frontend + backend).
8. **Feature flags utente**: `mostra_scommesse`, `mostra_investimenti` controllano visibilità UI (oltre alle restrizioni profilo).
9. **Reset account** (`POST /api/impostazioni/reset-account`): **unico endpoint standalone** di reset, implementato da `deleteAllTransactions`. Elimina solo movimenti/operazioni e azzera i saldi dei conti, mantenendo conti, profilo e account utente. Non esiste un endpoint separato "reset transazioni": è la stessa operazione. **Delete account** (`DELETE /api/impostazioni/account`) è l'unica operazione che elimina anche l'utente stesso; usa internamente `deleteAllUserData` (cancellazione dati finanziari più ampia — scommesse, investimenti, budget, obiettivi) come step interno della cancellazione completa, ma `deleteAllUserData` **non è esposta come endpoint standalone**.
10. **Categorizzazione import**: pipeline a cascata (Revolut → regole merchant personali → regole utente → regole globali → matcher a parole chiave legacy → storico → AI locale). OpenAI (opzionale) non è uno step sequenziale: viene applicato in post-processing, in batch, solo ai risultati con confidenza bassa (<55). Il fallback a categoria generica scatta solo per dati di input mancanti, non come step finale della cascata.
11. **Spese ricorrenti**: cron giornaliero 09:00 Europe/Rome, ma **solo frequenza `mensile`** è processata. **Spese programmate**: `ricorrente_frequenza: 'una_tantum'` + `ricorrente_data` è un caso a parte, un addebito unico a data fissa (non periodico). Il cron la addebita quando `oggi >= ricorrente_data`, non solo quel giorno esatto: se il cron salta un giorno (deploy, downtime) recupera al passaggio successivo invece di perdere l'occorrenza. La stessa finestra vale per `mensile` (`oggi >= ricorrente_giorno`): il cron passa alle 09:00, quindi senza di essa una regola creata più tardi perdeva l'addebito del mese in corso, e un mese saltato per downtime o saldo insufficiente non veniva più recuperato — la chiave di deduplica `YYYY-MM` resta la garanzia che il periodo sia addebitato una volta sola. `settimanale` e `annuale` restano sull'uguaglianza esatta. Nella stessa transazione dell'addebito chiude il promemoria a `stato_ricorrenza: 'terminata'`, così smette di comparire fra gli impegni — un promemoria rimasto `attiva` dopo l'addebito bloccherebbe due volte lo stesso euro. Fino a quando non è addebitata pesa sul saldo effettivo (Regola 20) se cade entro 30 giorni da oggi, **oppure è già passata**: una data scaduta e mai addebitata è l'impegno più certo che esista, non va esclusa dall'orizzonte. **`muoveSaldo(movimento)`** (`ricorrenti.service.js`) è il predicato che decide se una riga muove davvero denaro: falso per l'origine di **qualunque** ricorrenza (`ricorrente: true`, qualsiasi frequenza), vero per tutto il resto — comprese le occorrenze generate dal cron, che hanno `ricorrente: false` e sono quindi l'unico movimento vero. Una ricorrenza è una REGOLA, non un movimento avvenuto — crearla NON scala il conto, lo fa solo il cron quando genera la sua occorrenza. È anche ciò che la UI dichiara: «Crei una regola: WALLT registra da sola il movimento a ogni scadenza». Lo leggono sia chi scrive i saldi (`movimenti.controller.js`: create/update/delete) sia chi li riepiloga (`conti.controller.js`, per la variazione mensile del patrimonio): se questi punti divergessero da `muoveSaldo`, la stessa spesa verrebbe contata un numero di volte diverso a seconda di chi la guarda (è successo due volte: prima per le spese programmate — corretto in `d20cf0b` — e poi identico per le frequenze periodiche, dove creare una mensile scalava subito il conto, il cron la riaddebitava nello stesso periodo e il saldo effettivo la sottraeva una terza volta come impegno; la guardia di idempotenza non poteva vederlo perché l'origine ha `ricorrenza_origine_id` null e non conta come occorrenza del proprio periodo). In `updateMovimento` il predicato entra nel calcolo dell'impatto vecchio e nuovo, non nel tipo/importo grezzo: convertire un movimento da/verso una ricorrenza deve restare bilanciato, e una regola non può far fallire l'aggiornamento per saldo insufficiente. Le conversioni seguono il predicato: togliere la ricorrenza addebita il conto, renderlo ricorrente restituisce il denaro, cambiare frequenza fra due ricorrenze non muove nulla.
12. **Patrimonio totale**: somma saldi conti attivi + investimenti attivi.
13. **JWT invalidation**: token emessi prima di `password_changed_at` vengono rifiutati.
14. **Notifiche — limite anti-spam**: massimo `max_notifiche_giornaliere` (default 2) notifiche "contate" per utente al giorno, di cui **al più una `normale`**: il secondo slot è riservato alle `urgente` (budget superato, pagamento imminente, sicurezza). Oltre il limite la notifica viene comunque creata ma con `conta_nel_limite = false` e canale `in_app`: resta nel centro notifiche e non genera push. Il promemoria giornaliero fa eccezione e viene **saltato** (consegnarlo il giorno dopo non avrebbe senso).
15. **Notifiche — deduplica**: ogni notifica ha una `dedupe_key` (`userId` implicito + tipo + riferimento + periodo) con UNIQUE su `(user_id, dedupe_key)`. È il vincolo che rende il cron sicuro da rieseguire a qualunque frequenza.
16. **Notifiche — fuso orario e ore di silenzio**: limite giornaliero, orario del promemoria e ore di silenzio sono calcolati nel fuso dell'utente (default `Europe/Rome`), mai in quello del processo (che su Vercel è UTC). Una notifica generata nelle ore di silenzio (default 22:00→08:00) non viene persa: `programmata_per` slitta al primo orario consentito e la notifica resta invisibile fino ad allora.
17. **Notifiche — privacy**: il payload push non contiene mai importi, saldi o categorie: solo titolo, una frase generica per tipo e la route da aprire. I dettagli si vedono in app, dopo il login.
18. **Categorie eliminabili per utente**: le predefinite stanno in un catalogo statico condiviso (`constants/catalogoCategorie.json`) e non sono cancellabili. L'utente può però eliminarle *per sé*: una riga in `categorie_default_nascoste` le marca `attiva: false` in `categorie.service.list()`. Da lì l'esclusione si propaga da sola — `CategoryMatcherService._finalize` scarta ogni risultato non presente in `list(userId)` e ripiega su `da_verificare`, quindi la cascata non può riassegnare una categoria eliminata. Lo storico resta leggibile perché `list(..., { includeArchived: true })` continua a restituirla. **Non serve toccare i singoli step della cascata**: la giuntura è una sola.
19. **Categorie di sistema**: `CATEGORIE_SISTEMA_IDS` (`da_verificare`, `altro_entrata`, `investimento`, `rendimento_investimenti`, `deposito_scommesse`, `prelievo_scommesse`) non sono eliminabili, perché WALLT le scrive da sé (fallback import, saldo iniziale conto, movimenti investimenti e scommesse). Chi aggiunge un punto in cui il codice crea un movimento con una categoria fissa deve aggiungerla a quell'elenco. `trasferimento_denaro` non è di sistema: nessuno la scrive in automatico.
20. **Patrimonio, liquidità, essenzialità, fondo di sicurezza e debiti**: ogni calcolo ha un unico punto sorgente, sul modello della Regola 18 per le categorie. `services/financialSummary.service.js` è l'unico calcolo di patrimonio (conti attivi + investimenti attivi, Regola 12) e di patrimonio netto (patrimonio − `passivita_totale`, somma dei `Debito.saldo_residuo` attivi) — prima di questa introduzione il patrimonio era duplicato in 4 file e uno di questi era divergiuto. `services/liquidita.service.js` calcola la liquidità libera come overlay di sola lettura (saldo conti − liquidità allocata su obiettivi non completati − impegni ricorrenti mensili non ancora addebitati nel periodo corrente): non sposta né crea nulla, serve solo a non contare due volte lo stesso euro. Lo stesso service calcola anche il **saldo effettivo** — "quanto posso davvero spendere": conti attivi **non nascosti** meno gli stessi due impegni (obiettivi non completati, ricorrenze non ancora addebitate, spese programmate incluse entro l'orizzonte di 30 giorni — Regola 11). `Conto.nascosto` significa "fuori da tutto ciò che è spendibile": il conto resta nel patrimonio totale (Regola 12, invariato) ma esce dal saldo effettivo mostrato in home **e** dal capitale allocabile di Piano Smart (`liquidita_allocabile`, che alimenta `liquidity.allocatable` in `financialContext.service.js`) — nasconderlo non è cancellarlo, è dire "questo euro esiste ma non è nella disponibilità quotidiana". `GET /conti/patrimonio` espone `saldo_effettivo` **delegando** a `calcolaLiquidita`, mai ricalcolandolo: le due chiamate (patrimonio e liquidità) girano in parallelo nello stesso controller proprio per evitare che la home mostri due numeri disallineati per lo stesso concetto. `services/essenzialita.service.js` gestisce il campo `essenzialita` (`essenziale`/`semi_essenziale`/`discrezionale`) sulle categorie personali. `services/fondoSicurezza.service.js` calcola i mesi di copertura di un importo rispetto alla media delle spese essenziali mensili — solo la matematica, indipendente da dove i soldi siano tenuti. Chi tocca uno di questi concetti aggiorna il service centrale, non i punti che lo consumano.

21. **Piano Smart**: il motore di ripartizione è deterministico e **non calcola nessuna metrica finanziaria propria**. `services/pianoSmart/profile.service.js` traduce `getFinancialContext` in otto fasce, `allocation.service.js` le trasforma in pesi e centesimi. Tre vincoli che non vanno erosi: (a) tutti i numeri del motore stanno in `services/pianoSmart/config.js`, versionato `smart-v1` — una costante numerica di dominio fuori da lì rende un piano salvato non più riproducibile; (b) il motore lavora in **centesimi interi** e l'invariante è `somma(allocazioni) == capitale allocabile` ESATTA, verificata da `validation.service.js` su ogni piano prodotto (una violazione lancia, non viene corretta); (c) una fascia `null` (metrica assente) **non applica** il suo modificatore, mentre una fascia che dichiara di non poter concludere (`income.stability === 'insufficiente'`) ne applica uno prudente — non sapere quanto si spende non autorizza a dire che si spende il giusto. **Piano Smart non muove denaro**: creare o modificare un piano non tocca saldi, movimenti, obiettivi, investimenti o debiti. Il fondo di emergenza non può essere un obiettivo eleggibile per la quota `goals`, e dal settembre 2026 non serve più escluderlo a mano: è un conto (Regola 22), non un obiettivo. Il motivo resta valido — ha già la categoria `safety` con il cap sul gap, e lasciarlo in entrambe faceva arrivare al fondo più di quanto gli mancasse. Il vocabolario degli enum è duplicato in `client/src/utils/pianoSmart.js` e sorvegliato da `client/tests/pianoSmartContratto.test.js`, che confronta i due file (stesso principio della Regola 15). `PATCH` deve restare in `Access-Control-Allow-Methods` di `app.js`: senza, il browser blocca il cambio di stato dopo un preflight riuscito, e supertest non se ne accorge. Vedi `docs/piano-smart-api-contract.md`.

22. **Fondo di emergenza**: è un **conto**, non un obiettivo. Un `Conto` con `tipo: 'emergenza'`, `nascosto: true` e la soglia in mesi di spese essenziali (`mesi_sicurezza_target`, valori 3/6/12). `services/fondoEmergenza.service.js` è il punto sorgente unico (Regola 20): risponde a "qual è il fondo, quanto contiene, quanti mesi copre, quanto manca", e `soglia_euro` non è mai un dato salvato ma sempre `mesi_target × spese essenziali mensili`, ricalcolato a ogni lettura. Da `nascosto` arriva gratis tutto il comportamento: il fondo resta nel patrimonio totale (Regola 12) ma esce dal saldo effettivo e dal capitale allocabile di Piano Smart, perché `liquidita.service.js` tratta così ogni conto nascosto — per questo l'introduzione del fondo **non ha toccato il calcolo dei saldi**. Non esiste un `Obiettivo` accanto al conto, e non deve esistere: `Obiettivo.importo_attuale` entra in `liquidita_allocata`, quindi conto nascosto più obiettivo sottrarrebbero lo stesso euro due volte dal saldo effettivo. Quattro vincoli applicati dal server: uno solo per utente (indice parziale `conti_un_solo_fondo_emergenza`, perché controllare e poi inserire non è atomico), `nascosto` non disattivabile, nessuna entrata o uscita diretta sul conto (solo trasferimenti — `POST /conti/trasferimento`, nessuna rotta nuova per muovere denaro), `tipo` non convertibile da o verso `emergenza`. `tipo_obiettivo: 'fondo_sicurezza'` è stato rimosso insieme a `GET /obiettivi/:id/copertura`: nessun dato reale li usava, perché il client non ha mai inviato quel tipo. Il contratto `emergencyFund` verso Piano Smart non ha cambiato forma, solo la fonte. Il vocabolario del server sta in `server/constants/fondoEmergenza.js` — un modulo senza `require`, come `constants/pianoSmart.js` — ed è duplicato in `client/src/utils/fondoEmergenza.js`, sorvegliato da `client/tests/fondoEmergenzaContratto.test.js`. Il test deve poter importare il lato server **senza Sequelize**: gira nel job "Frontend (build)" della CI, dove `npm ci` tocca solo `client/`. Finché leggeva le costanti dal service (che fa `require('../models')`) non riusciva nemmeno a caricarsi in CI — sei commit di verde apparente su un contratto mai verificato — e il conteggio dei test era l'unico indizio. Chi sposta una di queste costanti dentro un service rompe di nuovo la stessa cosa: un test del file lo impedisce. Vedi `docs/superpowers/specs/2026-09-26-fondo-emergenza-design.md`.

23. **Premium e permessi: il piano NON è l'autorizzazione**. La catena è `Subscription → Entitlements → canUseFeature → Features`, e non esiste (né deve esistere) un `user.premium`. L'unica domanda che il codice pone è `canUseFeature(userId, 'bank_sync')`: un utente può avere la stessa feature per cinque ragioni indipendenti (`beta_25`, `admin`, `premium_subscription`, `promotion`, `migration`) e nessuna è deducibile dalle altre. `services/entitlements.service.js` è il punto sorgente unico (Regola 20 applicata ai permessi): verifica tre condizioni — feature conosciuta, interruttore globale acceso (`app_config.bank_sync_enabled`), entitlement `active` e non scaduto — e la **scadenza si legge dalla data, non dalla colonna `status`**, così nessun cron è necessario perché una promozione scada puntuale. Il piano commerciale (`descriviPiano`) resta distinto: chi ha ricevuto la feature dallo staff legge `source: admin`, e mostrarlo come "Premium Beta" renderebbe impossibile sapere quanti dei posti beta sono davvero occupati. Dall'ottobre 2026 un amministratore legge il piano **`staff`** ("WALLT Premium — staff"): è **derivato da `users.ruolo`**, non è mai scritto in `subscriptions` (la cui CHECK ammette solo free/premium_beta/premium) e `FEATURE_PER_PIANO['staff']` è **vuoto** — lo staff riceve le feature da una concessione come chiunque altro, perché anche qui il piano dice *chi sei*, non *cosa puoi fare*. Esiste per non dover scegliere fra due bugie registrate nei dati: assegnare un posto `beta_25` al proprietario (falsando i 25 posti) o scrivergli un abbonamento inesistente (falsando la fatturazione futura). Un abbonamento reale vince comunque sul ruolo. **Chi riceve l'accesso dallo staff (o da una promozione) legge `premium`**, non più `free`: chiedere Premium, ottenerlo e continuare a leggere "WALLT Free" non dava modo di sapere di essere dentro. Non è il piano che torna a decidere — la direzione è l'opposta di quella vietata: il piano *racconta* un permesso già deciso da `canUseFeature`, nessuno lo legge per autorizzare, e la fatturazione si conta dalle `subscriptions` (`gratuito` resta true, `abbonamento` resta null). L'ordine di `derivaPiano` è: abbonamento → ruolo admin (`staff`) → posto `beta_25` (`premium_beta`) → qualunque altro diritto attivo (`premium`) → `free`. Il gradino `beta_25` prima di `premium` è ciò che tiene leggibile il conteggio dei 25 posti. `grantEntitlement` **rifiuta** `source: 'beta_25'` (quella strada passa solo dal lock) e non sovrascrive il `source` di un entitlement già attivo: sovrascrivere `beta_25` con `admin` libererebbe silenziosamente un posto. Il client non scrive mai `user_id`, `feature_key`, `source`, `plan` o `status`: `POST /bank-sync/claim-beta` non ha corpo. Vocabolario in `constants/entitlements.js` (nessun `require`), duplicato in `client/src/utils/entitlements.js` e sorvegliato da `client/tests/entitlementsContratto.test.js`.

    **I 25 posti beta** non hanno un contatore: la sorgente di verità è il `COUNT` delle righe `active` + `beta_25`, e il limite vive in `app_config.bank_sync_beta_limit` — mai cablato nel codice (un test lo verifica su client e server). Il `COUNT` da solo non basta: a isolamento READ COMMITTED due attivazioni simultanee leggono entrambe 24 e la quota diventa 26/25. La serializzazione arriva da `pg_advisory_xact_lock(hashtext('wallt:beta_slot:bank_sync'))` dentro la transazione di assegnazione — `_xact_` e non di sessione, così funziona attraverso il transaction pooler di Supabase e non può restare appeso. Verificato: togliendo il lock, 10 richieste simultanee su 1 posto ne assegnano 5. Una concessione `admin` **non** consuma la quota, ed è deliberato.

24. **Bank Sync**: le transazioni bancarie diventano **movimenti WALLT normali**, non un mondo separato. Non esiste una tabella `bank_transactions`: `syncEngine.service.js` scrive in `movimenti` con `tipo` entrata/uscita, importo positivo e `ricorrente: false`, quindi `muoveSaldo` è vero per loro (Regola 11) e patrimonio, liquidità, saldo effettivo, budget, analisi e Piano Smart le vedono senza che nessuno di quei file sia stato toccato. Deduplica, categorizzazione (`CategoryMatcherService`) e validazione categoria (`assertCategory`) sono **le stesse dell'import da file** — riscriverle avrebbe prodotto due cascate divergenti (Coding Rule 6) e avrebbe aperto una seconda strada per far riapparire una categoria eliminata dall'utente (Regola 18).
    - **Solo le transazioni `booked` entrano nei movimenti** (`STATI_IMPORTABILI`). È la garanzia più forte contro il doppio conteggio `pending → booked`: la coppia da riconciliare non esiste. Le `pending` vengono contate e riportate nell'esito, mai scritte.
    - **Idempotenza su tre livelli**: indice UNIQUE parziale `(bank_connection_id, external_transaction_id)` nel database; pre-interrogazione degli id già presenti; `DuplicateChecker` **solo** per le transazioni senza id stabile (con un id, due acquisti identici lo stesso giorno restano due movimenti, e il confronto per somiglianza li fonderebbe).
    - **Un solo conto sincronizzato per utente**, imposto da un indice UNIQUE **parziale** (`WHERE status <> 'revocata'`): un `UNIQUE(user_id)` ingenuo cancellerebbe lo storico. "Controlla e poi inserisci" non è atomico, quindi il limite sta nel database e non solo nel servizio.
    - **Il callback è protetto**: `state` casuale di 32 byte, conservato **solo come SHA-256**, a scadenza, monouso (consumo con UPDATE condizionale) e verificato contro l'utente **autenticato** — l'identità non è mai dedotta da un parametro della richiesta. Il completamento è una POST della SPA con il JWT, non una GET che il browser segue: un link costruito da un sito terzo non porta la sessione e non può collegare un conto a qualcun altro. `state_hash` resta dopo il successo perché un callback ripetuto sia idempotente; è azzerato quando la connessione diventa terminale.
    - **Nessuna credenziale bancaria, mai**: l'utente autentica sul dominio della banca. In `bank_connections` ci sono due identificatori opachi del provider e un IBAN **mascherato** (`mascheraIban`, ultime 4 cifre). Nessun access token, nessun refresh token: né GoCardless né Enable Banking ne richiedono uno da conservare (il JWT di Enable Banking lo firma il server a ogni giro e vive in memoria).
    - **Un errore non distrugge i dati precedenti**: su fallimento vengono scritti solo `error_code` e `last_error_at`; `last_successful_sync_at` resta, ed è ciò che permette alla UI di dire "ultimo aggiornamento riuscito ieri alle 22:10" invece di svuotare la pagina. Il saldo del conto arriva dalla banca (non dalla somma dei movimenti: la finestra importata è di 90 giorni) e non viene toccato se la lettura fallisce.
    - **Due interruttori distinti** in `app_config`: `bank_sync_enabled` (globale, d'emergenza: blocca tutti senza togliere il diritto a nessuno) e `bank_sync_beta_enabled` (solo le attivazioni gratuite). Spegnere l'uno non deve spegnere l'altro.
    - **Scollegare non cancella movimenti**: `Movimento.bank_connection_id` è `ON DELETE SET NULL`, non CASCADE. Cancellare i dati importati è un'azione separata, dietro `requireStepUp` come reset ed eliminazione account.
    - **L'adapter è sostituibile**: il resto di WALLT conosce solo l'interfaccia `BankProvider` e le forme normalizzate. `SandboxBankProvider` serve a sviluppo e test e `providers/index.js` **si rifiuta** di istanziarlo in produzione.

25. **Amministrazione**: il ruolo sta in `users.ruolo`, letto dal database **a ogni richiesta** (non dal JWT: revocare un admin avrebbe effetto solo alla scadenza del token; non da un confronto di email: legherebbe il privilegio a un dato che l'utente può cambiare). Nessuna rotta applicativa lo scrive — si concede con `server/scripts/concedi-ruolo-admin.js`, che richiede l'accesso al database. `requireAdmin` è applicato su **tutto** il router (`router.use`), non rotta per rotta, e risponde **404**: l'esistenza dell'area non è un'informazione utile a un utente normale. Ogni azione amministrativa è registrata in `audit_logs` con `user_id` (il soggetto) e `actor_user_id` (chi ha agito) distinti, e `metadata` passa da `sanitizeMeta` del logger — mai token, importi o descrizioni di transazione.


26. **Richieste di accesso a Premium**: `premium_access_requests` risponde a una domanda che l'elenco utenti non sa porre — non "chi HA Premium" ma "chi lo VUOLE". **Una richiesta non è un permesso**: nessun punto del codice la legge per decidere un accesso, la domanda resta `canUseFeature` (Regola 23). Approvare CHIAMA `grantEntitlement(source: 'admin')` ed è quella scrittura ad autorizzare — cambiare uno `status` a mano nel database non darebbe accesso a nessuno. Conseguenza che non va erosa: **approvare non consuma un posto `beta_25`**, perché `grantEntitlement` rifiuta quell'origine (solo `betaSlots.service` la scrive, dentro il lock). Per lo stesso motivo `POST /api/premium/request` crea una `pending` anche quando i posti sono liberi: una seconda strada verso una quota a numero chiuso la renderebbe incontabile. **`UNIQUE(user_id, requested_feature)` sta nel database** (Coding Rule 22): premere due volte il pulsante non crea due righe, e una richiesta rifiutata non si aggira presentandone un'altra. Una sola transizione riapre una riga, `cancelled → pending`: annullare è un'azione dell'utente, rifiutare è una decisione dello staff e il brief chiede che resti. **Rifiutare ≠ revocare**: il rifiuto non tocca nessun entitlement (un utente può avere Bank Sync per un posto beta o una promozione), e i due eventi di audit sono distinti — `premium_request_rejected` e `entitlement_revoked` — così una richiesta approvata e poi revocata resta ricostruibile come due fatti separati. Il claim della beta registra in più una riga `auto_approved_beta`, fuori dalla transazione e senza poter lanciare: il posto è già assegnato, e non riuscire a scrivere una riga di registro non deve trasformare un'attivazione riuscita in un errore. **Concedere il diritto dalla lista utenti chiude la richiesta aperta di quella persona** (`chiudiPerConcessione`): lasciarla `pending` segnalerebbe per sempre un lavoro già fatto. L'invariante è «se il diritto è stato concesso dallo staff, la richiesta risulta approvata», e vale anche su una `rejected` — concedere dopo aver negato è una decisione nuova che supera la precedente, la quale non si perde perché i due eventi restano distinti in `audit_logs`. Gli stati già concessi non si toccano: riscrivere un `auto_approved_beta` come approvazione manuale renderebbe illeggibile il conteggio dei 25. La chiusura non può far fallire la concessione, che è già avvenuta. **Revocare non riapre la richiesta**: revoca e rifiuto restano due cose diverse. Il client non invia mai `user_id`, `status`, `requested_at`, `reviewed_by`: li determina il server. Vocabolario in `constants/entitlements.js`, duplicato in `client/src/utils/entitlements.js` e sorvegliato da `client/tests/entitlementsContratto.test.js`.

## Authentication

- **Registrazione**: email/password + consenso privacy/termini obbligatorio. Crea `User` + `ProfiloUtente`.
- **Login**: bcrypt compare → JWT 7 giorni.
- **Google OAuth**: popup flow → `oauth-relay.html` / `AuthCallbackView` → postMessage → `completeOAuthLogin`. Un login Google si collega automaticamente (`google_id`) a un account esistente con la stessa email **solo se** quell'account non ha già una password locale — altrimenti l'auto-collegamento viene rifiutato (`google_account_exists_local`), per evitare account pre-hijacking (vedi `docs/SECURITY.md`, `googleAuth.service.js`).
- **Protezione route**: `authMiddleware` su tutte le API tranne auth pubbliche.
- **Step-up**: JWT WALLT già autenticato → riverifica identità recente → `step_up_token` (JWT, 5 min, `type: step_up`) → header `X-Step-Up-Token` per operazioni sensibili (`reset-account`, `delete-account`, `esporta`). Il middleware sulle tre rotte è **`requireStepUp`** per tutti, senza esenzioni:
  - **Utenti con password locale**: `POST /api/auth/verify-password` → `bcrypt.compare` sulla password reale.
  - **Utenti Google OAuth** (senza password): `POST /api/auth/google/challenge` → Google Identity Services → ID token → `POST /api/auth/verify-google` (`googleStepUp.service.js`, `client/src/composables/useGoogleStepUp.js`) → `step_up_token`. La conferma testuale `ELIMINA`/`RESETTA` resta nei modali, ma dichiara l'intenzione: **non autorizza più l'operazione**, perché è una stringa pubblica presente nel bundle.
  - **Dipendenza di configurazione**: il flusso Google richiede `VITE_GOOGLE_CLIENT_ID` nel client **e** l'origine JavaScript del dominio registrata nel client OAuth di Google Cloud. Senza, Google Identity Services risponde `401 invalid_client — no registered origin` e gli account Google non possono completare le tre operazioni. È la ragione per cui lo step-up era stato disattivato fra l'iterazione 4 e il settembre 2026: la rimozione non era una scelta di prodotto ma un ripiego su una configurazione mancante. Vedi `docs/DECISIONS.md` per le cinque iterazioni.
- Vedi `docs/SECURITY.md` (rischio accettato, come richiudere il gap) e `docs/DECISIONS.md` per la storia completa (implementata → rimossa → reimplementata → rimossa).

## Database

14 tabelle principali + 2 tabelle regole (categorie, merchant) + `categorie_personali`, `categorie_default_nascoste`, le due di Piano Smart (`piani_smart`, `piani_smart_allocazioni`) e le sei di WALLT Premium (`app_config`, `user_entitlements`, `subscriptions`, `audit_logs`, `bank_connections`, `premium_access_requests`). Vedi `docs/DATABASE.md`.

Entità core: `users` → `conti` → `movimenti`. Entità satellite: budget, obiettivi, scommesse, investimenti, regole categorizzazione.

## API

133 endpoint REST sotto `/api/*` (incluse le 3 rotte `/api/fondo-emergenza`, le 7 di `/api/categorie`, le due dello step-up Google, le 6 di Piano Smart e le 27 di WALLT Premium: 1 `/api/piano`, 10 `/api/bank-sync`, 3 `/api/premium`, 12 `/api/admin`, 1 `GET /api/cron/bank-sync`). Vedi `docs/API.md` per inventario completo e `docs/piano-smart-api-contract.md` per il contratto di Piano Smart.

Comunicazione: Axios con `baseURL = VITE_API_URL` normalizzato da `client/src/config/api.js` (default `http://localhost:3000/api`), header `Authorization: Bearer <token>`.

Configurazione DB: `server/config/database.js` accetta `DATABASE_URL` **oppure** i parametri `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`, mai una miscela dei due. La verifica TLS è attiva di default (`DATABASE_SSL_CA` per il root cert Supabase).

## Coding Rules

1. Prima di modificare codice, comprendere l'implementazione esistente.
2. Identificare tutti i file coinvolti (controller, service, model, store, view, validation).
3. Non riscrivere architettura funzionante senza necessità.
4. Preferire modifiche piccole e sicure.
5. Non introdurre dipendenze inutili.
6. Non duplicare logica già esistente (attenzione: import ha due layer `import/` e `importazioni/`).
7. Rispettare naming convention e struttura attuale (italiano per messaggi utente, inglese per codice).
8. Verificare possibili regressioni su saldi, trasferimenti, sync scommesse-conti.
9. Eseguire `npm test` in `server/` quando si modificano API o middleware.
10. Segnalare chiaramente tutti i file modificati.
11. Non modificare funzionalità non collegate al task.
12. Non eliminare codice apparentemente inutilizzato senza verificarne l'utilizzo (es. `minorRestriction.middleware.js`).
13. Verificare sempre autenticazione, autorizzazione e validazione quando si modificano API.
14. Preservare retrocompatibilità quando possibile.
15. Le categorie di movimento sono definite in `server/constants/categorie.js` (backend) e `client/src/utils/categorie.js` (frontend) — aggiornare entrambi.
16. Non confondere `tipo: 'trasferimento'` (movimento) con categoria `trasferimento_denaro` (uscita).
17. Le letture dall'API negli store passano da `creaRisorsa` (`client/src/utils/risorsa.js`). Un gestore d'errore non deve **mai** azzerare i dati già ottenuti: è la regola che ha reso indistinguibili "dati assenti" ed "errore di rete" (`catch { lista.value = [] }`). Le viste mostrano lo stato con `DataState` (`client/src/components/common/DataState.vue`), e lo stato vuoto va nello slot `vuoto`, mai in un `v-if="!dati && !loading"`.
18. Le etichette dei concetti finanziari si leggono da `client/src/content/glossario.js`, non si scrivono in linea. Lo stesso numero (conti attivi più investimenti attivi) aveva tre etichette diverse in punti diversi dell'app: "Saldo del conto", "Patrimonio totale" e "Patrimonio Totale" in un componente poi rimosso. "Patrimonio totale" = conti attivi + investimenti attivi; la componente "Conti" comprende anche scommesse e risparmio, per questo non si chiama "Disponibilità".
19. I token di leggibilità stanno in `client/src/assets/styles/variables.css` e sono verificati da `client/tests/contrasto.test.js`: ogni coppia testo/superficie dichiarata deve stare sopra 4.5:1 (3:1 per i bordi che delimitano un controllo). Aggiungere un token di testo significa aggiungerlo a `COPPIE`, altrimenti la suite fallisce. Il pavimento tipografico è `--text-xs` (14px) per l'informativo; sotto si scende solo con `--text-micro` e una deroga commentata sulla riga, sorvegliata da `client/tests/tipografia.test.js`.

20. `creaRisorsa` dentro un componente espone **ref di primo livello**, mai l'oggetto risorsa: nei componenti i ref annidati non si scompattano nel template, al contrario di quanto succede attraverso uno store Pinia. `client/src/composables/useAndamentoPatrimonio.js` è il riferimento; `client/tests/vistaValue.test.js` sorveglia i template.
21. I permessi si chiedono a `canUseFeature(userId, featureKey)` e a nient'altro. Nessun `user.premium`, nessun `isPremium`, nessun confronto di piano per decidere un accesso: il piano commerciale serve a *dire* all'utente cosa ha, l'entitlement è ciò che *autorizza* (Regola 23). Una nuova feature a pagamento si aggiunge a `FEATURE_KEYS` e al suo interruttore in `constants/appConfig.js`, non con un booleano sull'utente.
22. Un limite che il prodotto promette (un conto sincronizzato per utente, 25 posti beta) va imposto **dal database**, non solo dal servizio: "controlla e poi inserisci" non è atomico, e due richieste simultanee passano entrambe il controllo applicativo. Indice parziale per l'unicità, lock consultivo di transazione per le quote.
23. Attraverso il proxy di uno store Pinia i ref **annidati** sono già scompattati: `store.risorsa.data.value` da una vista vale `undefined`, e `store.risorsa.lastUpdated.value` su un `null` solleva. Dentro lo store `.value` è corretto; fuori si espongono getter calcolati (`conti.store.js`, `admin.store.js`, `bankSync.store.js` sono i riferimenti). È lo specchio della Regola 20.

## Sensitive Areas

| Area | Perché è delicata | File chiave |
|---|---|---|
| **Gestione saldo** | Ogni movimento modifica `Conto.saldo` in transazione, **tranne** l'origine di una ricorrenza, che è una regola e non un movimento avvenuto (`muoveSaldo`, Regola 11): create/update/delete e il riepilogo mensile devono leggere lo stesso predicato o la stessa uscita viene contata un numero di volte diverso a seconda del punto | `movimenti.controller.js`, `conti.controller.js`, `services/ricorrenti.service.js` (`muoveSaldo`) |
| **Trasferimenti** | Doppio aggiornamento saldo + sync scommesse | `conti.controller.js` (`trasferimento`) |
| **Import estratti conto** | Crea movimenti in bulk, aggiorna saldi, categorizzazione AI | `import/ImportService.js`, `importazioni/` |
| **Reset/Delete account** | Operazioni distruttive irreversibili | `accountReset.service.js`, `impostazioni.controller.js` |
| **OAuth popup** | Flusso multi-window con postMessage e relay | `oauthPopup.js`, `useOAuthPopup.js`, `oauth-relay.html` |
| **Scommesse ↔ Conti sync** | Bidirezionale, può creare/eliminare conti | `scommesseContoSync.service.js` |
| **Categorizzazione** | Whitelist in 6+ file server + frontend. `categorie.service.list()` è l'unico filtro che tiene fuori dalla cascata le categorie eliminate dall'utente: cambiarne la semantica le fa riapparire ovunque | `constants/categorie.js`, `categorie.service.js`, `CategoryMatcherService.js` |
| **Cron ricorrenti** | Crea movimenti automaticamente ogni giorno, ed è l'**unico** punto in cui una ricorrenza muove denaro (Regola 11); per una spesa programmata (`una_tantum`) l'addebito e la chiusura del promemoria (`stato_ricorrenza: 'terminata'`) devono stare nella stessa transazione, altrimenti un crash a metà lascia un impegno fantasma che blocca liquidità già spesa | `ricorrenti.service.js` |
| **Migrazioni DB** | Auto-run all'avvio SOLO fuori produzione (disabilitato quando `NODE_ENV=production`, vedi `RUN_MIGRATIONS_ON_BOOT`); 41 file con possibili duplicati. Su Supabase si lanciano a mano con `npm run migrate:production` (`NODE_ENV=migration` + `DATABASE_MIGRATION_URL`). **Ogni migrazione che crea una tabella deve abilitare RLS e revocare i privilegi ad `anon`/`authenticated`**: su Supabase lo schema `public` è raggiungibile dalla Data API con la chiave anon, che è pubblica per definizione, quindi una tabella creata senza hardening nasce leggibile e cancellabile da chiunque (è successo con `piani_smart_azioni`, esposta cinque giorni su dati reali). Non serve nessuna policy — l'API si connette come proprietario, che non è soggetto a RLS. Il guardrail è in `migrazioniReali.test.js`, che pretende zero tabelle senza RLS dopo l'intera catena | `server.js`, `migrations/`, `tests/migrazioniReali.test.js` |
| **Feature access minori** | Logica duplicata frontend/backend | `featureAccess.js` (client + server), `ageRestriction.js` |
| **Monitoraggio errori** | È un canale verso l'esterno come la push (Regola 17): importi, saldi, categorie, descrizioni, email e token non devono uscire. Lato client il filtro passa su **tutte** le stringhe dell'evento, non su un elenco di campi — un importo entra anche dal testo di un errore o dall'etichetta del pulsante cliccato; lato server si riusa `sanitizeMeta` del logger invece di scriverne un secondo. Solo i 5xx vengono segnalati: 4xx e 404 sono risposte previste | `client/src/utils/monitoraggio.js`, `services/monitoraggio.service.js`, `middleware/errorHandler.middleware.js` |
| **Notifiche** | Regole anti-spam, deduplica e fuso orario: una modifica sbagliata trasforma il sistema in spam. Il calcolo del budget è condiviso con l'API budget | `services/notifiche/`, `services/budgetStato.service.js` |
| **Hook budget post-movimento** | `valutaBudgetDopoMovimento` è chiamata (awaited) dopo il commit in `createMovimento`/`updateMovimento` e dopo l'import: deve restare fuori dalla transazione e non lanciare mai | `movimenti.controller.js`, `importazioni.controller.js`, `NotificheGenerator.js` |
| **Stato delle letture** | `creaRisorsa` garantisce che un errore non azzeri i dati e che una risposta sorpassata non sovrascriva una più recente. Cambiarne la semantica rimette in circolo il difetto per cui un errore di rete sembrava una perdita di dati | `utils/risorsa.js`, `components/common/DataState.vue` |
| **Filtri dei movimenti** | Un filtro che perde l'isolamento per utente è un difetto di sicurezza. `where.user_id` resta la prima condizione e i filtri si aggiungono | `movimenti.controller.js`, `validation.middleware.js`, `server/tests/movimentiFiltri.test.js` |
| **Piano Smart** | Motore deterministico: i numeri stanno tutti in `config.js` (versionato), gli importi in centesimi interi, l'invariante della somma è verificato a ogni piano. Spostare una costante fuori dalla config, o usare i float, rompe la riproducibilità di piani già salvati. Nessuna scrittura finanziaria: le sole tabelle scritte sono `piani_smart` e `piani_smart_allocazioni` | `services/pianoSmart/`, `controllers/pianoSmart.controller.js`, `docs/piano-smart-api-contract.md` |
| **Patrimonio/liquidità/essenzialità/fondo sicurezza** | Calcolo unico e condiviso da più endpoint (patrimonio, andamento, liquidità, copertura fondo sicurezza): duplicarlo in un controller lo fa divergere silenziosamente, come già successo prima di centralizzarlo. `GET /conti/patrimonio` espone `saldo_effettivo` delegando a `calcolaLiquidita`, mai ricalcolandolo | `services/financialSummary.service.js`, `services/liquidita.service.js`, `services/essenzialita.service.js`, `services/fondoSicurezza.service.js` |
| **Entitlement e posti beta** | `canUseFeature` è l'unica porta sui permessi: un `isPremium` sparso rimetterebbe in circolo il difetto che questa architettura esiste per evitare. L'assegnazione dei 25 posti è serializzata da un lock consultivo di transazione — toglierlo non rompe nessun test se non quelli di concorrenza, e produce silenziosamente più posti del limite | `services/entitlements.service.js`, `services/betaSlots.service.js`, `middleware/entitlement.middleware.js` |
| **Bank Sync** | Scrive movimenti in bulk e allinea saldi da una fonte esterna. Tre invarianti da non erodere: solo `booked` entra nei movimenti, la deduplica è garantita da un indice UNIQUE e non dalla sola logica, un errore del provider non tocca nessun dato già scritto. Il callback è la superficie più esposta: `state` hashato, monouso, legato all'utente autenticato | `services/bankSync/`, `controllers/bankSync.controller.js` |
| **Area amministrativa** | Concede diritti e scollega banche altrui. `requireAdmin` su tutto il router, ruolo letto dal database a ogni richiesta, ogni azione auditata con la distinzione soggetto/attore | `middleware/admin.middleware.js`, `controllers/admin.controller.js` |
| **Richieste Premium** | Una richiesta non autorizza nulla: approvarla concede l'entitlement, ed è quella scrittura a valere. Tre proprietà da non erodere: l'approvazione non consuma posti `beta_25`, il rifiuto non tocca gli entitlement, la UNIQUE sta nel database e non nel servizio | `services/premiumRequests.service.js`, `controllers/premium.controller.js`, `controllers/admin.controller.js` |
| **Fondo di emergenza** | È un conto nascosto, non un obiettivo (Regola 22): affiancargli un `Obiettivo` farebbe uscire lo stesso euro due volte dal saldo effettivo. I vincoli (uno per utente, `nascosto` non disattivabile, niente entrate/uscite dirette) stanno nel server, non nella UI | `services/fondoEmergenza.service.js`, `controllers/fondoEmergenza.controller.js`, `controllers/movimenti.controller.js`, `controllers/conti.controller.js` |

## Known Issues

1. **Dual import architecture**: `services/import/` e `services/importazioni/` con re-export — rischio di modificare il file sbagliato.
2. ~~**Cron ricorrenti processa solo `mensile`**~~ — **Risolto**: API/validazione ora accettano solo `ricorrente_frequenza: 'mensile'` (l'unica realmente processata dal cron), coerente con la UI. La colonna DB resta un ENUM a 4 valori per retrocompatibilità con eventuali righe storiche, ma non è più possibile crearne di nuove con `giornaliera`/`settimanale`/`annuale`. Corretto anche un bug per cui il controllo anti-duplicazione del cron confrontava la descrizione sbagliata e non preveniva mai un doppio addebito in caso di doppia esecuzione nello stesso giorno (vedi `docs/SECURITY.md`).
3. **Merchant lookup providers**: tutti stub (Google Places, Foursquare, OSM).
4. ~~**Codice morto**: componenti dashboard non usati, `PlaceholderView.vue`~~ — **Risolto** (`9655ac4`): nessuno dei cinque file era importato; rimossi anche perché `GlassBalanceCard.vue` conteneva "Patrimonio Totale", un'etichetta concorrente per lo stesso numero ora centralizzato nel glossario (Coding Rule 18). Resta `minorRestriction.middleware.js`, fuori dal perimetro di questo sotto-progetto (server, non toccato): vedi Coding Rule 12.
5. ~~**`.env.test` non in `.gitignore`**~~ — **Risolto**: aggiunto a `.gitignore` e rimosso dal tracking git. Era stato committato in 2 commit con una password DB reale (locale/dev): quella password va considerata compromessa e ruotata prima del lancio (MANUAL ACTION, vedi `docs/SECURITY.md`).
6. ~~**Operazioni distruttive senza riverifica di identità per gli account Google**~~ — **Risolto**: le tre rotte usano `requireStepUp` per tutti e gli account Google riverificano con Google Identity Services. Il difetto era concreto, non teorico: al momento della chiusura esistevano 3 account Google reali in produzione, nessuno con password locale, per i quali il solo token di sessione più una stringa pubblica bastavano a cancellare l'account — e per l'export nemmeno la stringa. **Attenzione all'ordine di attivazione**: il codice va pubblicato solo dopo che `VITE_GOOGLE_CLIENT_ID` è impostato su Vercel e l'origine JavaScript è registrata in Google Cloud, altrimenti quegli stessi account passano da esposti a bloccati.
7. **Test coverage**: 100 suite backend — 1365 test, più 277 test frontend (43 file). Fra cui `categorieDefault` (eliminazione per-utente delle predefinite), `confrontoPeriodi`/`analisiConfronto` (intervalli delle Analisi), `movimentiFiltri` (ricerca, ordinamento, isolamento), `debitiCrud`, `liquidita` e `saldoEffettivo` (saldo effettivo, conti nascosti, spese programmate — incluse le prove di regressione sul doppio addebito corrette dal commit `d20cf0b`), `ricorrenti` (che copre il doppio addebito delle frequenze periodiche passando dall'API reale: i test del cron creano l'origine con `Movimento.create` e scavalcherebbero il controller, dove viveva il difetto), le sei di WALLT Premium (`entitlements`, `betaSlot` — incluse due prove di concorrenza reale sull'ultimo posto, `bankSyncApi`, `bankSyncEngine`, `premiumSicurezza` — ventidue tentativi di attacco espliciti, e `premiumRichieste` — ciclo di vita delle richieste, isolamento, audit e convivenza con la quota beta), `enableBankingProvider` (adapter Open Banking: segno degli importi, transazioni fallite scartate, IBAN mascherato, paginazione — gira senza database), e le sette di Piano Smart: `pianoSmartMoney`, `pianoSmartProfile`, `pianoSmartEngine`, `pianoSmartInvarianti` (241 contesti generati × 9 importi), `pianoSmartScenari`, `pianoSmartApi`, `pianoSmartSecurity`. Le prime cinque sono pure e girano anche in `npm run test:unit`. `corsMetodi` verifica che ogni metodo montato nel router sia dichiarato in CORS. Isolamento cross-user, coerenza saldi/movimenti/trasferimenti (incluse race condition), step-up Google, cron ricorrenti e config produzione coperti. Non coperti: budget/obiettivi/investimenti/scommesse a livello di logica di business (solo isolamento).
8. **Migrazioni duplicate**: `add-social-auth` e `add_auth_provider` fanno cose simili.
9. ~~**Session reset incompleto**~~ — **Risolto**: logout non puliva `recentiHome` nello store `movimenti` né i campi `panoramica`/`analisi` interni allo store `scommesse` (lo store `analisi` principale era già a posto). Da quando i sette store che alimentano la dashboard leggono da `creaRisorsa`, `resetPiniaStores()` (`utils/session.js`) richiama il `reset()` di ciascuno invece di elencarne i campi a mano, e quel `reset()` azzera anche le risorse interne: il sintomo sparisce insieme alla causa (`f565764`).
10. ~~**Nessuna CI/CD**~~ — **Risolto**: `.github/workflows/ci.yml` esegue test backend con un service container PostgreSQL + test/build frontend su ogni push/PR su `main`.

## Current Roadmap

### Finestre finanziarie e qualità dello storico

Per la semantica ufficiale delle finestre consultare `AGENTS.md` e il codice
di `server/services/finestraMesi.service.js`. La finestra richiesta, quella
osservata e i mesi civili completi utilizzabili sono distinti. Il mese
corrente e il primo mese parziale sono esclusi dalle medie; i mesi precedenti
al primo movimento non sono zeri osservati. La completezza delle registrazioni
manuali non è verificabile.

Il fondo sicurezza usa fino a tre mesi completi e il denominatore effettivo,
esponendo periodo richiesto, periodo usato, mesi utilizzati e
`storico_limitato`; senza mesi utilizzabili restituisce dati insufficienti.
La stabilità delle entrate richiede tre mesi completi, conserva gli zeri dei
mesi osservati e usa CV popolazione con soglia 0,25. La pressione debitoria
usa solo reddito ricorrente sui medesimi mesi; debiti e ricorrenti non sono
riconciliati automaticamente.

I test Jest puntano al solo PostgreSQL locale `wallt_test` tramite
`TEST_DATABASE_URL`; il setup applica le migrazioni al database di test e non
tocca produzione.

Vedi `docs/PROJECT_STATUS.md` sezione Roadmap per priorità P0–P3.

Priorità immediate:
- P0: nessuna azione codice residua — restano azioni infrastrutturali (rotazione password DB, config produzione, Google Cloud, backup) e, per Bank Sync, le credenziali **Enable Banking** (registrazione self-service) prima di qualunque prova con una banca reale: GoCardless non apre più nuovi account. Vedi `docs/premium-bank-sync.md` e `docs/PROJECT_STATUS.md`
- P1: Test di logica di business su budget/obiettivi/investimenti/scommesse (oggi coperti solo per isolamento)
- P2: Consolidare import pipeline, rimuovere codice morto, verifica email alla registrazione
- P3: Apple OAuth, 2FA, merchant lookup reali

## Before modifying code

1. Read `CLAUDE.md`.
2. Read the relevant documentation in `/docs`.
3. Inspect the existing implementation.
4. Identify affected files.
5. Understand possible side effects (saldi, sync, categorie).
6. Implement the smallest safe change.
7. Run available validation: `cd server && npm test` (richiede PostgreSQL); `npm run test:unit` esegue solo le suite che non toccano il database.
8. Review the diff.
9. Report what changed and any remaining risks.
