# WALLT Premium + Bank Sync — contratto API e messa in produzione

> Riferimento operativo. Le regole architetturali stanno in `CLAUDE.md`
> (Regole 23, 24, 25 e Coding Rules 21–23); qui c'è il contratto delle rotte,
> la configurazione necessaria e cosa resta da fare prima della produzione.

## 1. Il modello in una riga

```
Subscription  →  Entitlements  →  canUseFeature()  →  Features
```

Il **piano** dice all'utente cosa ha. L'**entitlement** autorizza. Sono due
cose distinte e non vanno fuse: un utente a cui lo staff ha concesso Bank
Sync resta sul piano `free` con `source: admin`, perché altrimenti non si
saprebbe più quanti dei 25 posti beta sono davvero occupati.

Non esiste `user.premium`. Non deve esistere.

## 2. Tabelle

| Tabella | Cosa contiene | Vincoli che contano |
|---|---|---|
| `app_config` | solo le chiavi deliberatamente cambiate | i default stanno in `constants/appConfig.js`: tabella vuota = comportamento del codice |
| `user_entitlements` | il permesso, con la sua origine | `UNIQUE(user_id, feature_key)` — rende idempotente l'assegnazione di un posto |
| `subscriptions` | predisposta, **non usata** | `UNIQUE(billing_provider, provider_subscription_id)` parziale — idempotenza dei webhook futuri |
| `audit_logs` | eventi su permessi e connessioni | `user_id` (soggetto) ≠ `actor_user_id` (chi ha agito) |
| `bank_connections` | una connessione Open Banking | `UNIQUE(user_id) WHERE status <> 'revocata'` — un conto vivo per utente, storico conservato |
| `premium_access_requests` | chi ha **chiesto** Premium (≠ chi ce l'ha) | `UNIQUE(user_id, requested_feature)` — una riga per utente e feature, niente duplicati né spam |

Più quattro colonne su `movimenti` (`origine`, `bank_connection_id`,
`external_transaction_id`, `stato_banca`) e `users.ruolo`.

**Cosa NON c'è in `bank_connections`**: password, PIN, CVV, numeri di carta,
credenziali di home banking, access token, refresh token, IBAN completo.
L'utente autentica sul dominio della propria banca; WALLT riceve due
identificatori opachi e un IBAN mascherato (`IT•••3456`).

## 3. Rotte

### `GET /api/piano`
Piano, entitlement, posti beta e disponibilità dei pagamenti in **una sola**
risposta: tre letture separate potrebbero arrivare da momenti diversi e far
mostrare "Premium Beta attivo" accanto a "Bank Sync non disponibile".

```jsonc
{
  "piano": "free | premium_beta | premium",
  "piano_etichetta": "WALLT Free",
  "gratuito": true,
  "entitlements": [{ "feature_key": "bank_sync", "status": "active", "source": "beta_25" }],
  "bank_sync": { "attiva": false, "motivo": "nessun_entitlement", "source": null },
  "beta": { "attiva": true, "limite": 25, "occupati": 0, "disponibili": 25, "rivendicabile": true },
  "pagamenti_disponibili": false
}
```

Non esiste nessuna rotta con cui un utente possa cambiarsi il piano.

### `/api/bank-sync`

| Metodo | Rotta | Entitlement | Note |
|---|---|---|---|
| GET | `/status` | no | serve anche a chi non ce l'ha: è ciò che propone l'attivazione |
| GET | `/beta` | no | posti rimasti (dato aggregato, non personale) |
| POST | `/claim-beta` | **no** | è la rotta che serve a ottenerlo. **Nessun corpo**: feature e origine sono cablate |
| GET | `/istituti?paese=IT` | sì | elenco dal provider |
| POST | `/connect` | sì | `{ institution_id, sostituisci? }` → `{ url_autorizzazione, scade_il }` |
| POST | `/reconnect` | sì | l'istituto viene letto dalla connessione, **non** dal corpo |
| POST | `/callback` | sì | `{ state }` — autenticata, vedi §4 |
| POST | `/sync` | sì | sincronizzazione manuale |
| POST | `/disconnect` | **no** | chi ha perso il permesso deve poter revocare il consenso alla banca |
| DELETE | `/dati-importati` | no, ma **step-up** | distruttiva e separata dallo scollegamento |

Ordine dei middleware: `authMiddleware → rate limit → requireFeature →
validazione → controller`. Il rate limit sta dopo l'autenticazione perché la
sua chiave è `req.userId`: davanti ricadrebbe sull'IP, e un utente dietro NAT
aziendale consumerebbe la quota dei colleghi.

**Codici d'errore** (`constants/bankSync.js`, duplicati in
`client/src/utils/entitlements.js`): ogni codice ha un messaggio e un'azione.
`CONSENT_EXPIRED` → *Ricollega*; `BANK_UNAVAILABLE` → *Riprova*. Un 500
generico renderebbe le due situazioni indistinguibili.

### `/api/premium`
Le richieste di accesso dell'utente autenticato, e nient'altro.

| Rotta | Cosa fa |
|---|---|
| `GET /api/premium/richieste` | le **proprie** richieste, mai quelle di altri |
| `POST /api/premium/request` | crea (o ritrova) la propria richiesta — nessun corpo obbligatorio |
| `DELETE /api/premium/richieste/:id` | annulla la propria, solo se `pending` |

`user_id`, `status`, `requested_at` e `reviewed_by` li determina il server:
inviarli nel corpo non produce nessun effetto. Creare una richiesta **non
concede niente** e **non consuma un posto beta**, nemmeno quando ce ne sono:
i posti si prendono solo da `POST /bank-sync/claim-beta`, che è l'unico punto
che può scrivere `source: 'beta_25'` e lo fa dentro il lock.

Rate limit dedicato: 10 richieste/ora per utente. La `UNIQUE` protegge i dati,
il limite protegge il server — sono due cose diverse.

### `/api/admin`
`requireAdmin` su **tutto** il router. Risponde **404** a chi non è
amministratore. Riepilogo, lista utenti, concedi/revoca, scollega banca di un
utente, configurazione (l'interruttore d'emergenza), registro eventi e la
coda delle richieste Premium:

| Rotta | Cosa fa |
|---|---|
| `GET /api/admin/richieste-premium` | elenco + contatori per stato, filtrabile con `?stato=` |
| `POST /api/admin/richieste-premium/:id/approva` | `approved` + `grantEntitlement(source: 'admin')` |
| `POST /api/admin/richieste-premium/:id/rifiuta` | `rejected`, **senza toccare nessun entitlement** |

Approvare **non** consuma uno dei 25 posti: `grantEntitlement` rifiuta
`beta_25`, quindi la proprietà è garantita dal service dei permessi e non
dalla memoria di chi scrive la rotta. Rifiutare **non** è revocare: sono due
azioni con due eventi di audit distinti (`premium_request_rejected` e
`entitlement_revoked`), così una richiesta approvata e poi revocata resta
ricostruibile come due fatti separati.

Gli stati di una richiesta: `pending`, `approved`, `rejected`, `cancelled`,
`auto_approved_beta` (chi ha attivato la beta quando c'era ancora posto — lo
ha deciso la quota, non una persona, e infatti `reviewed_by` resta `null`).
Una riga `cancelled` può tornare `pending` se l'utente si ripresenta; una
`rejected` no, perché è una decisione dello staff e il suo storico resta.

### `GET /api/cron/bank-sync`
Worker a lotti, spento per default (`bank_sync_cron_enabled`). Seleziona le
connessioni arretrate, riverifica l'entitlement per ciascuna, rispetta un
backoff esponenziale sui fallimenti.

## 4. Il callback, in dettaglio

```
connect → state casuale (32 byte)   ──► salvato come SHA-256, con scadenza
                                    ──► redirect alla banca
banca   → ritorna su /banca/callback?state=…
SPA     → POST /api/bank-sync/callback { state }  CON il JWT
server  → 1. esiste una connessione con quell'hash?
          2. appartiene all'utente AUTENTICATO?      ← mai dedotta dalla richiesta
          3. non è scaduto?
          4. non è già stato usato?                  ← UPDATE condizionale
          5. la connessione è ancora `in_attesa`?
```

Il completamento è una **POST autenticata della SPA**, non una GET che il
browser segue. Non è una preferenza: il token di WALLT vive in `localStorage`,
non in un cookie, quindi una GET verso l'API non porterebbe alcuna identità — e
dedurre l'utente da un parametro dell'URL è esattamente ciò che apre
l'account linking attack. Un link costruito da un sito terzo non porta la
sessione e non può collegare un conto a qualcun altro.

Tutti i rifiuti restituiscono lo **stesso** messaggio: non si dice a chi
presenta uno `state` se quello `state` esista, a chi appartenga o sia solo
scaduto.

## 5. Variabili d'ambiente

### Enable Banking (provider predefinito)

| Variabile | Dove | Obbligatoria | Note |
|---|---|---|---|
| `ENABLE_BANKING_APPLICATION_ID` | server | per Bank Sync in produzione | l'UUID dell'applicazione registrata nel Control Panel; finisce nel `kid` del JWT. **Mai** prefisso `VITE_` |
| `ENABLE_BANKING_PRIVATE_KEY` | server | per Bank Sync in produzione | il contenuto del file `.pem` scaricato alla registrazione dell'applicazione. Vercel lo accetta multi-riga; l'adapter converte anche i `\n` letterali |
| `ENABLE_BANKING_BASE_URL` | server | no | default `https://api.enablebanking.com` |
| `APP_URL` | server | sì (già presente) | base dell'URL di ritorno dalla banca |

### GoCardless (solo per chi ha già un account)

| Variabile | Dove | Obbligatoria | Note |
|---|---|---|---|
| `GOCARDLESS_SECRET_ID` | server | solo con `bank_sync_provider = gocardless` | **mai** prefisso `VITE_` |
| `GOCARDLESS_SECRET_KEY` | server | idem | idem |
| `GOCARDLESS_BASE_URL` | server | no | default `https://bankaccountdata.gocardless.com/api/v2` |

Senza le credenziali del provider attivo, Bank Sync risponde
`PROVIDER_NON_CONFIGURATO` e il resto di WALLT è identico. **Nessuna nuova
dipendenza npm**: gli adapter usano `fetch` e `crypto` di Node 22.

### Perché il provider predefinito è cambiato

Dal **luglio 2025 GoCardless ha disabilitato i nuovi account** Bank Account
Data (`bankaccountdata.gocardless.com/new-signups-disabled`): chi ne ha già
uno continua a usarlo, ma non è più ottenibile da zero. L'adapter resta
registrato — non costa nulla e torna utile se riaprono — ma il default di
`bank_sync_provider` è ora `enablebanking`.

Enable Banking ha registrazione self-service, è gratuito per uso personale,
sandbox e valutazione, e si appoggia alla **propria licenza AISP**: WALLT non
deve diventare un TPP autorizzato. Il limite da conoscere è che la
*Restricted Production* copre solo i **Linked Accounts**, cioè i conti che si
collegano in prima persona: basta per provare la funzione sul proprio conto,
non per aprirla ai 25 utenti beta, che richiede un accordo commerciale.

Tre differenze che l'adapter assorbe, e che il resto di WALLT non vede:
autenticazione a **JWT RS256 firmato con chiave privata** (non una coppia
id/segreto, e nessuna credenziale viaggia mai in rete), banca identificata da
**nome + paese** invece che da un id opaco, e un **`code`** consegnato al
ritorno da scambiare con una sessione — per questo
`POST /api/bank-sync/callback` accetta un `code` facoltativo e
`handleCallback` può restituire un `providerConnectionId` nuovo.

## 6. Configurazione a runtime (`app_config`)

| Chiave | Default | A cosa serve |
|---|---|---|
| `bank_sync_enabled` | `true` | **interruttore d'emergenza**: a `false` nessuna sincronizzazione, per nessuno, senza togliere il diritto a nessuno e senza deploy |
| `bank_sync_beta_enabled` | `true` | solo le attivazioni gratuite. Distinto dal precedente di proposito |
| `bank_sync_beta_limit` | `25` | i posti. **Unico posto in cui questo numero esiste** |
| `bank_sync_provider` | `gocardless` | `sandbox` è rifiutato in produzione |
| `bank_sync_cooldown_secondi` | `300` | attesa fra due sync manuali della stessa connessione |
| `bank_sync_cron_enabled` | `false` | sincronizzazione pianificata |
| `bank_sync_cron_ore_minime` | `12` | ore dall'ultima sync riuscita |
| `bank_sync_cron_max_per_esecuzione` | `20` | dimensione del lotto |

## 6-bis. Il piano dello staff

Un amministratore legge il piano `staff` — «WALLT Premium — staff» — invece
di `free`. È **derivato da `users.ruolo`**: non viene mai scritto in
`subscriptions`, e `FEATURE_PER_PIANO['staff']` è vuoto, perché anche per lo
staff le feature arrivano da una concessione e non dal piano.

Esiste per non dover scegliere fra due alternative che sporcano i dati:
assegnare al proprietario un posto `beta_25` (e falsare il conteggio dei 25
posti promessi agli utenti) o scrivergli un abbonamento `premium` inesistente
(e falsare ogni futuro conteggio di fatturazione). Un abbonamento reale vince
comunque sul ruolo: un amministratore che paga è un cliente pagante.

## 7. Primo amministratore

```bash
NODE_ENV=migration node server/scripts/concedi-ruolo-admin.js io@example.com
NODE_ENV=migration node server/scripts/concedi-ruolo-admin.js --elenca
```

**Stato attuale (1 ottobre 2026)**: in produzione esiste **un solo**
amministratore, `#2 christian.sanmauro14@gmail.com` (account Google, nessuna
password locale). Il ruolo è stato concesso con lo script qui sopra dopo aver
applicato le migrazioni 41 e 42: prima di quelle la colonna `users.ruolo` non
esisteva, ed è la ragione per cui lo script non poteva funzionare. Nessun
altro account è stato modificato.

Richiede l'accesso al database, non un'API: una rotta che promuove
amministratori sarebbe la superficie più preziosa dell'applicazione, e il
primo admin non potrebbe comunque autorizzarsi da solo.

## 8. Rollout

```
sviluppo locale (provider sandbox)
  ↓
sandbox GoCardless con credenziali di test
  ↓
test automatici verdi (91 suite backend, 39 file frontend)
  ↓
un amministratore, un conto bancario reale proprio
  ↓
bank_sync_beta_limit = 1 → 3 → 5 → 25
```

`bank_sync_enabled = false` è la via di uscita in qualunque momento: blocca
tutto, non cancella niente, non richiede un deploy.

Mai credenziali bancarie reali in fase di prova: il sandbox del provider
copre autorizzazione, callback, conti, saldi, transazioni, scadenza del
consenso, errori e revoca.

## 9. Cosa resta da fare prima della produzione

1. **Credenziali Enable Banking** nelle variabili d'ambiente di Vercel
   (`ENABLE_BANKING_APPLICATION_ID`, `ENABLE_BANKING_PRIVATE_KEY`). Finché
   mancano, la funzione è inerte. Registrazione self-service sul Control
   Panel: si registra un'applicazione e il browser scarica la chiave `.pem`.
2. **Da uso personale a servizio**: la *Restricted Production* gratuita copre
   solo i conti collegati in prima persona. Aprirla ai 25 posti beta richiede
   un accordo commerciale con Enable Banking, sempre appoggiandosi alla loro
   licenza AISP.
3. **Informativa privacy e termini**: l'introduzione del collegamento bancario
   cambia la base giuridica del trattamento (dati di pagamento di terzi: la
   controparte di ogni transazione). `PrivacyPolicy.vue` e `TermsView.vue`
   vanno aggiornati **prima** del primo utente reale. Non è una formalità: è
   la condizione per poter trattare quei dati.
4. **Cron su Vercel**: aggiungere `GET /api/cron/bank-sync` a `vercel.json`
   (o al workflow GitHub Actions) quando si accende
   `bank_sync_cron_enabled`.
5. **Registrazione dell'URL di ritorno** presso il provider, se richiesto.
6. ~~**Deploy del codice Premium**~~ — **fatto** il 1 ottobre 2026
   (commit `3d9c18b`): schema, API e interfaccia sono in produzione.

### Perché le attivazioni beta sono spente

Subito dopo il deploy `bank_sync_beta_enabled` è stato portato a **false**
dall'area amministrativa, e va lasciato così finché i punti 1–3 non sono
chiusi. La ragione è concreta, non prudenziale: senza le credenziali
GoCardless `GET /bank-sync/istituti` risponde `PROVIDER_NON_CONFIGURATO`
(503), quindi un utente che attivasse la beta **brucerebbe uno dei 25 posti**
per poi trovare un vicolo cieco al passo successivo. Con l'interruttore
spento nessun posto si consuma, `bank_sync_enabled` resta acceso — i due
interruttori sono distinti apposta — e chi apre la schermata Premium vede
«Richiedi accesso a WALLT Premium», che registra l'interesse senza promettere
niente.

Per riaprirle: Amministrazione → Configurazione → `bank_sync_beta_enabled`.
Un click, nessun deploy.

## 10. Cosa resta da fare per WALLT Premium pagante

Il percorso è già tracciato e **non tocca Bank Sync**:

1. implementare un `BillingProvider` (Stripe o Paddle) con `verificaEvento`
   che **verifichi la firma** prima di guardare il corpo;
2. il webhook scrive la riga in `subscriptions` (idempotente grazie alla
   UNIQUE su `provider_subscription_id`);
3. chiama `allineaEntitlementDaSubscription(userId)` — già implementato e
   testato: concede ciò che il piano include, revoca solo ciò che aveva
   concesso lui, non tocca posti beta né concessioni amministrative;
4. `pagamentiDisponibili()` diventa `true` e la schermata Premium sostituisce
   "Disponibile prossimamente" con il checkout.

Nessuna riga di `services/bankSync/` cambia: chiede solo
`canUseFeature('bank_sync')`.

## 11. Limiti noti

- **Solo le transazioni `booked`** entrano nei movimenti. Una `pending` che la
  banca cancella senza mai contabilizzarla non lascia traccia — è voluto.
- **Storni silenziosi**: se la banca rimuove una transazione già contabilizzata
  invece di emetterne una di segno opposto, WALLT non se ne accorge. Rilevarlo
  richiederebbe di riscaricare l'intera cronologia a ogni sync.
- **Valute diverse** da quella del conto vengono scartate e contate, non
  convertite: WALLT non ha tassi di cambio, e trattare 50 USD come 50 EUR
  corromperebbe i dati finanziari.
- **Prelievi di contante** vengono importati e finiscono in `da_verificare`.
  Se l'utente poi registra a mano le spese fatte con quel contante, la somma
  è contata due volte: è una scelta consapevole (un estratto conto a cui
  mancano dei prelievi sorprenderebbe di più), ma va spiegata nell'aiuto.
- **Ritorno da mobile**: se la banca apre il callback in un browser diverso da
  quello autenticato, la sessione non c'è e il router manda al login. Il
  tentativo scade dopo 30 minuti e libera il posto; l'utente ricomincia dalla
  pagina Conti.
- **Il saldo di un conto sincronizzato lo dice la banca**: una correzione
  manuale del saldo su quel conto viene sovrascritta alla sincronizzazione
  successiva.
