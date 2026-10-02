# Bank Sync — riconciliazione con i conti esistenti: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permettere che una connessione bancaria alimenti un conto che l'utente già usa, invece di crearne sempre uno nuovo, senza duplicare lo storico inserito a mano.

**Architecture:** la decisione «dove vanno questi movimenti» si sposta dopo il ritorno dalla banca, quando i conti veri sono noti. Un nuovo stato `da_riconciliare` — dentro `STATI_VIVI`, fuori da `STATI_SINCRONIZZABILI` — tiene la connessione ferma finché l'utente non ha scelto. La soglia temporale (`import_da`) si decide al primo Sincronizza, imposta dal server e non dall'interfaccia.

**Tech Stack:** Node.js 22 + Express 5, Sequelize 6 su PostgreSQL, Jest + supertest lato server; Vue 3 `<script setup>` + Pinia 3 lato client.

**Spec:** [docs/superpowers/specs/2026-10-02-bank-sync-riconciliazione-conto-design.md](../specs/2026-10-02-bank-sync-riconciliazione-conto-design.md)

## Global Constraints

- **Lingua**: italiano per commenti, messaggi utente, commit e documentazione; identificatori in inglese (Coding Rule 7).
- **`canUseFeature` è l'unica porta sui permessi** (Regola 23): nessun `isPremium`, nessun confronto di piano.
- **Un limite promesso dal prodotto si impone dal database** (Coding Rule 22), non solo dal servizio.
- **Il client non invia mai** `user_id`, `status`, `conto_id` della connessione: li determina il server dall'utente autenticato.
- **Un errore del provider non distrugge dati già scritti** (Regola 24): su fallimento si scrivono solo `error_code` e `last_error_at`.
- **Solo le transazioni `booked`** entrano nei movimenti. Le `pending` si contano e si riportano, mai si scrivono.
- **Vocabolario duplicato client/server** va sorvegliato da un test di contratto, come `entitlementsContratto.test.js`.
- **Ogni migrazione che crea una tabella** abilita RLS e revoca i privilegi ad `anon`/`authenticated`. Questa migrazione *altera* una tabella esistente: non serve, e `migrazioniReali.test.js` resta verde.
- **Comandi di verifica**: `cd server && npm test` (97 suite); `cd server && npm run test:unit` (solo le suite senza database); `cd client && npm test`.
- **Il database `wallt_test` è condiviso con altre sessioni**: un fallimento isolato che sparisce al rilancio è flakiness nota. La baseline si prende con `npm test` completo, non rieseguendo un file.
- **Mai `git add -A`**: il worktree contiene 33 file non committati di un'altra sessione (onboarding). Solo percorsi espliciti.

## Struttura dei file

**Server — modificati:**
- `server/constants/bankSync.js` — aggiunge `STATO_DA_RICONCILIARE` e il codice `ERR_SOGLIA_RICHIESTA`
- `server/models/BankConnection.js` — aggiunge `import_da`
- `server/services/bankSync/connections.service.js` — il callback si restringe; nascono `datiRiconciliazione`, `completaRiconciliazione`, `contoCollegatoAConnessioneViva`
- `server/services/bankSync/syncEngine.service.js` — `dataSuggeritaImport`, la guardia della soglia, il pavimento su `dataDa`
- `server/controllers/bankSync.controller.js` — `getRiconciliazione`, `postRiconciliazione`
- `server/routes/bankSync.routes.js` — due rotte
- `server/middleware/validation.middleware.js` — `validateRiconciliazione`, `validateSync`
- `server/middleware/rateLimit.middleware.js` — `bankRiconciliazioneLimiter`
- `server/controllers/conti.controller.js` — rifiuta `saldo` su un conto collegato
- `server/controllers/movimenti.controller.js` — espone l'avviso di possibile doppione
- `server/tests/helpers/premium.js` — `collegaBanca` riconcilia per default

**Server — creati:**
- `server/migrations/20261002000049-add-riconciliazione-bank-connections.js`
- `server/tests/bankSyncRiconciliazione.test.js`

**Client — modificati:**
- `client/src/utils/bankSync.js` — vocabolario duplicato
- `client/src/stores/bankSync.store.js` — azioni di riconciliazione e soglia
- `client/src/components/conti/BankSyncSection.vue` — scheda di riconciliazione e avviso duplicati
- `client/src/views/ContiView.vue` — indicatore sulla card, campo saldo disabilitato
- `client/tests/bankSyncContratto.test.js` (creato)

**Documentazione:** `CLAUDE.md` (Regola 24), `docs/API.md`, `docs/DATABASE.md`, `docs/premium-bank-sync.md`

---

### Task 1: Il vocabolario e lo schema

**Files:**
- Modify: `server/constants/bankSync.js`
- Modify: `server/models/BankConnection.js:23`
- Create: `server/migrations/20261002000049-add-riconciliazione-bank-connections.js`
- Test: `server/tests/bankSyncRiconciliazione.test.js`

**Interfaces:**
- Consumes: niente (primo task)
- Produces: `STATO_DA_RICONCILIARE = 'da_riconciliare'` e `ERR_SOGLIA_RICHIESTA = 'SOGLIA_RICHIESTA'` da `constants/bankSync.js`; colonna `bank_connections.import_da` (`DATE`, nullable)

- [ ] **Step 1: Write the failing test**

Crea `server/tests/bankSyncRiconciliazione.test.js`:

```js
/**
 * La riconciliazione fra una connessione bancaria e i conti che l'utente
 * già possiede. Il punto non è "il collegamento funziona" (lo copre
 * bankSyncApi) ma "il collegamento non duplica lo storico inserito a mano".
 */

const {
  STATO_DA_RICONCILIARE, STATO_ATTIVA, STATI_VIVI, STATI_SINCRONIZZABILI,
  CONNECTION_STATUS,
} = require('../constants/bankSync');

describe('il vocabolario del nuovo stato', () => {
  it('da_riconciliare occupa il posto ma non è sincronizzabile', () => {
    expect(CONNECTION_STATUS).toContain(STATO_DA_RICONCILIARE);
    // Occupa il posto: l'autorizzazione presso la banca esiste già.
    expect(STATI_VIVI).toContain(STATO_DA_RICONCILIARE);
    // Ma niente può partire: è questa appartenenza, non una guardia
    // scritta a mano, che protegge lo storico manuale.
    expect(STATI_SINCRONIZZABILI).not.toContain(STATO_DA_RICONCILIARE);
    expect(STATI_SINCRONIZZABILI).toContain(STATO_ATTIVA);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "vocabolario" --silent`
Expected: FAIL — `STATO_DA_RICONCILIARE` è `undefined`, quindi `CONNECTION_STATUS` non lo contiene.

- [ ] **Step 3: Write minimal implementation**

In `server/constants/bankSync.js`, dopo la definizione di `STATO_IN_ATTESA`:

```js
/** Consenso concesso, ma l'utente non ha ancora detto a quale conto WALLT
 * appartengono questi movimenti. Occupa il posto (l'autorizzazione presso la
 * banca esiste) e NON è sincronizzabile: finché la destinazione è ignota,
 * importare significherebbe duplicare lo storico inserito a mano. */
const STATO_DA_RICONCILIARE = 'da_riconciliare';
```

Inserirlo in `CONNECTION_STATUS` fra `STATO_IN_ATTESA` e `STATO_ATTIVA`:

```js
const CONNECTION_STATUS = [
  STATO_IN_ATTESA,
  STATO_DA_RICONCILIARE,
  STATO_ATTIVA,
  STATO_CONSENSO_SCADUTO,
  STATO_ERRORE,
  STATO_SOSPESA_ENTITLEMENT,
  STATO_REVOCATA,
];
```

`STATI_VIVI` lo prende da sé (è `CONNECTION_STATUS` meno `revocata`). `STATI_SINCRONIZZABILI` resta `[STATO_ATTIVA, STATO_ERRORE]`: non va toccato.

Aggiungere accanto agli altri codici d'errore:

```js
/** Il primo Sincronizza di un utente che ha già movimenti propri: serve che
 * scelga da quando importare, altrimenti i 90 giorni si sommerebbero a
 * quanto ha inserito a mano. Non è un guasto, è una domanda. */
const ERR_SOGLIA_RICHIESTA = 'SOGLIA_RICHIESTA';
```

Esportare entrambi in `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "vocabolario" --silent`
Expected: PASS

- [ ] **Step 5: Write the migration**

Crea `server/migrations/20261002000049-add-riconciliazione-bank-connections.js`:

```js
'use strict';

/**
 * Due modifiche a `bank_connections` per la riconciliazione con i conti
 * esistenti.
 *
 * 1. Lo stato `da_riconciliare`. Il vincolo CHECK elencava i sei stati
 *    precedenti: è il motivo per cui una stringa arbitraria non entra in
 *    quella colonna, ed è giusto che aggiungere uno stato costi una
 *    migrazione.
 *
 * 2. `import_da`: la soglia sotto la quale non si importa. NULLABLE, e il
 *    null non è "non impostato per sbaglio" ma un valore con un significato
 *    preciso — "nessuna soglia, vale la finestra dei 90 giorni". È ciò che
 *    fa comportare le connessioni già esistenti esattamente come prima.
 */

const VINCOLO = 'bank_connections_status';

const STATI_NUOVI = "'in_attesa','da_riconciliare','attiva','consenso_scaduto',"
  + "'errore','sospesa_entitlement','revocata'";
const STATI_VECCHI = "'in_attesa','attiva','consenso_scaduto','errore',"
  + "'sospesa_entitlement','revocata'";

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      await q.sequelize.query(
        `ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS ${VINCOLO}`,
        { transaction },
      );
      await q.sequelize.query(
        `ALTER TABLE bank_connections ADD CONSTRAINT ${VINCOLO} `
        + `CHECK (status IN (${STATI_NUOVI}))`,
        { transaction },
      );
      await q.addColumn('bank_connections', 'import_da', {
        type: S.DATEONLY,
        allowNull: true,
      }, { transaction });
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      // Le righe `da_riconciliare` violerebbero il vincolo vecchio. Vengono
      // marcate `revocata` invece di far fallire il rollback: sono
      // connessioni mai arrivate a importare nulla, quindi non si perde
      // nessun dato finanziario, e un `down` che non funziona è peggio.
      await q.sequelize.query(
        "UPDATE bank_connections SET status = 'revocata', state_hash = NULL "
        + "WHERE status = 'da_riconciliare'",
        { transaction },
      );
      await q.removeColumn('bank_connections', 'import_da', { transaction });
      await q.sequelize.query(
        `ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS ${VINCOLO}`,
        { transaction },
      );
      await q.sequelize.query(
        `ALTER TABLE bank_connections ADD CONSTRAINT ${VINCOLO} `
        + `CHECK (status IN (${STATI_VECCHI}))`,
        { transaction },
      );
    });
  },
};
```

In `server/models/BankConnection.js`, accanto a `saldo_provider`:

```js
  import_da: { type: DataTypes.DATEONLY, allowNull: true },
```

- [ ] **Step 6: Run the migration suite**

Run: `cd server && npx jest tests/migrazioniReali.test.js --silent`
Expected: PASS — la catena si applica e nessuna tabella resta senza RLS.

- [ ] **Step 7: Commit**

```bash
git add server/constants/bankSync.js server/models/BankConnection.js \
  server/migrations/20261002000049-add-riconciliazione-bank-connections.js \
  server/tests/bankSyncRiconciliazione.test.js
git commit -m "Introduci lo stato da_riconciliare e la soglia import_da"
```

---

### Task 2: Il callback smette di creare il conto

**Files:**
- Modify: `server/services/bankSync/connections.service.js:384-420`
- Modify: `server/controllers/bankSync.controller.js:196-199`
- Modify: `server/tests/helpers/premium.js:93-110`
- Test: `server/tests/bankSyncRiconciliazione.test.js`

**Interfaces:**
- Consumes: `STATO_DA_RICONCILIARE` dal Task 1
- Produces: dopo il callback la connessione è `da_riconciliare` con `conto_id` nullo. L'helper `collegaBanca(app, headers, { riconcilia = true, destinazione = 'nuovo' })` riconcilia per default, così i test esistenti non cambiano; con `riconcilia: false` si ferma a `da_riconciliare`.

- [ ] **Step 1: Write the failing test**

Aggiungi a `server/tests/bankSyncRiconciliazione.test.js`:

```js
const request = require('supertest');
const { createApp } = require('../app');
const { Conto, BankConnection } = require('../models');
const {
  azzeraConfigurazione, abilitaSandbox, creaUtente, concediEntitlement,
  collegaBanca,
} = require('./helpers/premium');

const app = createApp({ enableRateLimit: false });

describe('il callback non decide da solo dove vanno i movimenti', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.id);
  });

  it('lascia la connessione da riconciliare, senza creare nessun conto', async () => {
    const contiPrima = await Conto.count({ where: { user_id: utente.id } });

    const { callback } = await collegaBanca(app, utente.headers, { riconcilia: false });

    expect(callback.status).toBe(201);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.id } });
    expect(connessione.status).toBe(STATO_DA_RICONCILIARE);
    expect(connessione.conto_id).toBeNull();
    // Il conto NON esiste ancora: è la differenza con il comportamento
    // precedente, dove il collegamento ne creava uno a prescindere.
    expect(await Conto.count({ where: { user_id: utente.id } })).toBe(contiPrima);
  });

  it('nessuna sincronizzazione parte da da_riconciliare', async () => {
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const sync = await request(app)
      .post('/api/bank-sync/sync')
      .set(utente.headers)
      .send({});

    expect(sync.status).toBe(409);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.id } });
    expect(connessione.last_sync_at).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "callback non decide" --silent`
Expected: FAIL — `collegaBanca` non accetta `riconcilia`, e la connessione risulta `attiva` con un conto creato.

- [ ] **Step 3: Restringi il callback**

In `connections.service.js`, in `completaConnessione`, sostituisci il blocco che legge `esito.conti?.[0]` e crea il conto (righe ~384-420) con:

```js
  // Il conto NON viene scelto qui. Al callback sappiamo che l'autorizzazione
  // esiste, non a quale conto WALLT appartengono questi movimenti: l'utente
  // può già tracciare quella banca a mano, e creargliene un altro accanto
  // significa contare due volte lo stesso denaro. La scelta avviene in
  // `completaRiconciliazione`, quando i conti veri della banca sono noti.
  //
  // Per lo stesso motivo non si scrivono `provider_account_id`,
  // `iban_mascherato`, `valuta` e `saldo_provider`: descrivono un conto
  // ancora da scegliere, e riempirli col primo della lista era il difetto.
  const attivata = await connessione.update({
    status: STATO_DA_RICONCILIARE,
    consent_created_at: new Date(),
    consent_expires_at: scadenzaConsenso,
    state_used_at: new Date(),
  });

  return { connessione: serializza(attivata), ripetuto: false };
```

Mantieni invariata la gestione dell'errore «la banca non ha restituito nessun conto»: se la sessione non espone alcun conto, la riconciliazione non avrebbe nulla da offrire. Il controllo si sposta però a una verifica della sola presenza, senza selezionarne uno:

```js
  if (!esito.conti?.length) {
    await connessione.update({
      status: STATO_ERRORE, state_hash: null, last_error_at: new Date(),
    });
    throw Object.assign(new Error('La banca non ha restituito nessun conto'), { statusCode: 409 });
  }
```

Importa `STATO_DA_RICONCILIARE` in testa al file.

- [ ] **Step 4: Aggiorna il messaggio del controller**

In `bankSync.controller.js`, nel `callback`:

```js
    res.status(esito.ripetuto ? 200 : 201).json({
      ...esito,
      message: 'Conto bancario autorizzato. Scegli a quale conto WALLT '
        + 'associarlo per iniziare a sincronizzare.',
    });
```

Il messaggio precedente prometteva l'importazione dei 90 giorni: non è più vero, e la promessa dipende ora da `import_da`.

- [ ] **Step 5: Estendi l'helper dei test**

In `server/tests/helpers/premium.js`, sostituisci `collegaBanca`:

```js
/**
 * Collega una banca fino in fondo: connect → callback → riconciliazione.
 *
 * `riconcilia: true` è il default perché la maggior parte dei test vuole una
 * connessione utilizzabile, com'era prima che la riconciliazione esistesse.
 * I test che devono osservare lo stato intermedio passano `false`.
 */
const collegaBanca = async (app, headers, {
  institutionId = 'SANDBOX_BANCA_IT',
  riconcilia = true,
  destinazione = 'nuovo',
} = {}) => {
  const connect = await request(app)
    .post('/api/bank-sync/connect')
    .set(headers)
    .send({ institution_id: institutionId });

  if (connect.status !== 201) {
    throw new Error(`connect fallito: ${connect.status} ${JSON.stringify(connect.body)}`);
  }

  const state = estraiState(connect.body.url_autorizzazione);
  const callback = await request(app)
    .post('/api/bank-sync/callback')
    .set(headers)
    .send({ state });

  if (!riconcilia) return { connect, callback, state, riconciliazione: null };

  const elenco = await request(app).get('/api/bank-sync/riconciliazione').set(headers);
  if (elenco.status !== 200) {
    throw new Error(`riconciliazione (GET) fallita: ${elenco.status}`);
  }

  const riconciliazione = await request(app)
    .post('/api/bank-sync/riconciliazione')
    .set(headers)
    .send({
      provider_account_id: elenco.body.conti_banca[0].provider_account_id,
      destinazione,
    });

  if (riconciliazione.status !== 200 && riconciliazione.status !== 201) {
    throw new Error(`riconciliazione (POST) fallita: ${riconciliazione.status} `
      + JSON.stringify(riconciliazione.body));
  }

  return { connect, callback, state, riconciliazione };
};
```

L'helper dipende dalle rotte dei Task 3 e 4: fino ad allora i test con `riconcilia: true` falliranno. È voluto — l'ordine dei task lo risolve, e `riconcilia: false` funziona già adesso.

- [ ] **Step 6: Run the new tests**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "callback non decide" --silent`
Expected: PASS entrambi.

- [ ] **Step 7: Commit**

```bash
git add server/services/bankSync/connections.service.js \
  server/controllers/bankSync.controller.js \
  server/tests/helpers/premium.js server/tests/bankSyncRiconciliazione.test.js
git commit -m "Separa l'autorizzazione bancaria dalla scelta del conto"
```

---

### Task 3: `GET /bank-sync/riconciliazione`

**Files:**
- Modify: `server/services/bankSync/connections.service.js`
- Modify: `server/controllers/bankSync.controller.js`
- Modify: `server/routes/bankSync.routes.js`
- Test: `server/tests/bankSyncRiconciliazione.test.js`

**Interfaces:**
- Consumes: `STATO_DA_RICONCILIARE` (Task 1), lo stato post-callback (Task 2)
- Produces: `datiRiconciliazione(userId)` → `{ conti_banca: Array<{ provider_account_id, nome, iban_mascherato, valuta, saldo }>, conti_wallt: Array<{ id, nome, saldo, tipo }> }`. Rotta `GET /api/bank-sync/riconciliazione`.

- [ ] **Step 1: Write the failing test**

```js
describe('GET /bank-sync/riconciliazione', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.id);
  });

  it('offre i conti della banca e i conti agganciabili', async () => {
    const mio = await Conto.create({
      user_id: utente.id, nome: 'REVOLUT', tipo: 'app_pagamento', saldo: 42, attivo: true,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await request(app).get('/api/bank-sync/riconciliazione').set(utente.headers);

    expect(r.status).toBe(200);
    expect(r.body.conti_banca.length).toBeGreaterThan(0);
    expect(r.body.conti_banca[0]).toHaveProperty('provider_account_id');
    expect(r.body.conti_wallt.map((c) => c.id)).toContain(mio.id);
  });

  it('esclude il fondo di emergenza e i conti scommesse', async () => {
    await Conto.create({
      user_id: utente.id, nome: 'Fondo', tipo: 'emergenza', saldo: 0,
      attivo: true, nascosto: true, mesi_sicurezza_target: 3,
    });
    await Conto.create({
      user_id: utente.id, nome: 'Snai', tipo: 'scommesse', saldo: 0, attivo: true,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await request(app).get('/api/bank-sync/riconciliazione').set(utente.headers);

    const tipi = r.body.conti_wallt.map((c) => c.tipo);
    expect(tipi).not.toContain('emergenza');
    expect(tipi).not.toContain('scommesse');
  });

  it('409 se la connessione non è da riconciliare', async () => {
    const r = await request(app).get('/api/bank-sync/riconciliazione').set(utente.headers);
    expect(r.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "GET /bank-sync/riconciliazione" --silent`
Expected: FAIL con 404 — la rotta non esiste.

- [ ] **Step 3: Write the service function**

In `connections.service.js`:

```js
/** I tipi di conto che non possono ricevere un flusso bancario.
 * `emergenza` non ammette entrate o uscite dirette (Regola 22);
 * `scommesse` è già sincronizzato con le piattaforme (Regola 5). */
const TIPI_NON_AGGANCIABILI = ['emergenza', 'scommesse'];

/**
 * Quanto serve all'utente per decidere a quale conto appartengono i movimenti
 * della banca appena autorizzata.
 *
 * I conti della banca vengono RILETTI dal provider a ogni chiamata invece di
 * essere persistiti al callback: sono dati provvisori, e una colonna che li
 * conserva invecchia. Se il provider non risponde, l'utente vede un errore e
 * ritenta; la connessione resta `da_riconciliare` e non si perde nulla.
 *
 * Questa rotta NON dice se esistono movimenti preesistenti, benché sarebbe
 * comodo al client: quel predicato decide se fermare un'importazione e vive
 * in un posto solo, la guardia di `sincronizza`.
 */
async function datiRiconciliazione(userId, { provider = null } = {}) {
  const connessione = await trovaConnessioneViva(userId);
  if (!connessione || connessione.status !== STATO_DA_RICONCILIARE) {
    throw Object.assign(
      new Error('Nessun collegamento in attesa di essere associato a un conto.'),
      { statusCode: 409, codice: 'nessuna_riconciliazione_pendente' },
    );
  }

  const adapter = provider ?? await getBankProvider({ nome: connessione.provider });
  const esito = await adapter.getAccounts({
    providerConnectionId: connessione.provider_connection_id,
  });

  const contiWallt = await Conto.findAll({
    where: {
      user_id: userId,
      attivo: true,
      tipo: { [Op.notIn]: TIPI_NON_AGGANCIABILI },
    },
    order: [['ordine', 'ASC']],
  });

  return {
    istituto: { id: connessione.institution_id, nome: connessione.institution_name },
    conti_banca: (esito.conti || []).map((c) => ({
      provider_account_id: c.providerAccountId ?? c.provider_account_id,
      nome: c.nome,
      iban_mascherato: c.ibanMascherato ?? c.iban_mascherato ?? null,
      valuta: c.valuta ?? null,
      saldo: c.saldo ?? null,
    })),
    conti_wallt: contiWallt.map((c) => ({
      id: c.id, nome: c.nome, tipo: c.tipo, saldo: c.saldo,
    })),
  };
}
```

Esportala in `module.exports`. Verifica con `grep -n "getAccounts" server/services/bankSync/providers/*.js` i nomi esatti dei campi restituiti dall'adapter e allinea il mapping: le due forme alternative sopra vanno sostituite con quella reale, non lasciate entrambe.

- [ ] **Step 4: Controller e rotta**

In `bankSync.controller.js`:

```js
/** `GET /api/bank-sync/riconciliazione` — i dati per scegliere il conto. */
const getRiconciliazione = async (req, res) => {
  try {
    res.json(await connessioni.datiRiconciliazione(req.userId));
  } catch (error) {
    rispondiErrore(res, error, 'riconciliazione');
  }
};
```

Esportalo. In `bankSync.routes.js`, accanto alle altre rotte che usano la banca:

```js
router.get('/riconciliazione', authMiddleware, feature, bankSync.getRiconciliazione);
```

- [ ] **Step 5: Run the tests**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "GET /bank-sync/riconciliazione" --silent`
Expected: PASS tutti e tre.

- [ ] **Step 6: Commit**

```bash
git add server/services/bankSync/connections.service.js \
  server/controllers/bankSync.controller.js server/routes/bankSync.routes.js \
  server/tests/bankSyncRiconciliazione.test.js
git commit -m "Esponi i dati per associare il collegamento a un conto"
```

---

### Task 4: `POST /bank-sync/riconciliazione`

Il cuore del cambiamento: agganciare un conto esistente senza perdere nulla, oppure crearne uno col nome della banca.

**Files:**
- Modify: `server/services/bankSync/connections.service.js`
- Modify: `server/controllers/bankSync.controller.js`
- Modify: `server/routes/bankSync.routes.js`
- Modify: `server/middleware/validation.middleware.js`
- Modify: `server/middleware/rateLimit.middleware.js`
- Test: `server/tests/bankSyncRiconciliazione.test.js`

**Interfaces:**
- Consumes: `datiRiconciliazione` (Task 3)
- Produces: `completaRiconciliazione({ userId, providerAccountId, destinazione })` → `{ connessione, conto, creato: boolean }`. Rotta `POST /api/bank-sync/riconciliazione` con corpo `{ provider_account_id: string, destinazione: 'nuovo' | number }`.

- [ ] **Step 1: Write the failing test**

```js
describe('POST /bank-sync/riconciliazione', () => {
  let utente;

  const riconcilia = (headers, corpo) => request(app)
    .post('/api/bank-sync/riconciliazione').set(headers).send(corpo);

  const primoContoBanca = async (headers) => {
    const r = await request(app).get('/api/bank-sync/riconciliazione').set(headers);
    return r.body.conti_banca[0].provider_account_id;
  };

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.id);
  });

  it('agganciando un conto esistente non perde i suoi movimenti', async () => {
    const mio = await Conto.create({
      user_id: utente.id, nome: 'REVOLUT', tipo: 'app_pagamento', saldo: 42, attivo: true,
    });
    await Movimento.create({
      user_id: utente.id, conto_id: mio.id, tipo: 'uscita', importo: 10,
      categoria: 'spesa_quotidiana', descrizione: 'inserito a mano',
      data: '2026-09-01', ricorrente: false,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: mio.id,
    });

    expect(r.status).toBe(200);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.id } });
    expect(connessione.status).toBe(STATO_ATTIVA);
    expect(connessione.conto_id).toBe(mio.id);
    // Nessun conto nuovo, nessun movimento perso, id invariato.
    expect(await Conto.count({ where: { user_id: utente.id } })).toBe(1);
    expect(await Movimento.count({ where: { conto_id: mio.id } })).toBe(1);
  });

  it('creando un conto nuovo lo nomina come la banca, non come l\'intestatario', async () => {
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: 'nuovo',
    });

    expect(r.status).toBe(201);
    const conto = await Conto.findByPk(r.body.conto.id);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.id } });
    expect(conto.nome).toBe(connessione.institution_name);
  });

  it('rifiuta il conto di un altro utente', async () => {
    const altro = await creaUtente(app, { email: 'altro@wallt.test' });
    const suo = await Conto.create({
      user_id: altro.id, nome: 'Suo', tipo: 'banca', saldo: 0, attivo: true,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: suo.id,
    });

    expect(r.status).toBe(404);
    expect(await BankConnection.count({ where: { user_id: utente.id, conto_id: suo.id } })).toBe(0);
  });

  it('rifiuta il fondo di emergenza', async () => {
    const fondo = await Conto.create({
      user_id: utente.id, nome: 'Fondo', tipo: 'emergenza', saldo: 0,
      attivo: true, nascosto: true, mesi_sicurezza_target: 3,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: fondo.id,
    });

    expect(r.status).toBe(422);
  });

  it('rifiuta un provider_account_id che la sessione non espone', async () => {
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await riconcilia(utente.headers, {
      provider_account_id: 'inventato-da-un-client-ostile',
      destinazione: 'nuovo',
    });

    expect(r.status).toBe(422);
  });

  it('chiamata due volte è idempotente', async () => {
    await collegaBanca(app, utente.headers, { riconcilia: false });
    const id = await primoContoBanca(utente.headers);

    const prima = await riconcilia(utente.headers, { provider_account_id: id, destinazione: 'nuovo' });
    const dopo = await riconcilia(utente.headers, { provider_account_id: id, destinazione: 'nuovo' });

    expect(prima.status).toBe(201);
    expect(dopo.status).toBe(200);
    expect(await Conto.count({ where: { user_id: utente.id } })).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "POST /bank-sync/riconciliazione" --silent`
Expected: FAIL con 404 su tutti — la rotta non esiste.

- [ ] **Step 3: Write the service function**

In `connections.service.js`:

```js
/**
 * Associa la connessione autorizzata a un conto WALLT.
 *
 * Agganciare un conto esistente NON elimina e NON archivia nulla: quel conto
 * diventa lui il conto collegato. Stesso id, stesso nome, stessi movimenti;
 * cambia soltanto da dove arrivano quelli nuovi. La banca restituisce 90
 * giorni e lo storico manuale può coprirne nove mesi: sostituire il conto
 * distruggerebbe dati che nessuna fonte è in grado di restituire.
 *
 * Il saldo di un conto esistente non viene toccato qui: lo allinea la prima
 * sincronizzazione (`allineaSaldo`), che è già l'unico punto che fa quel
 * lavoro. Un solo proprietario di quella scrittura invece di due.
 */
async function completaRiconciliazione({
  userId, providerAccountId, destinazione, provider = null,
}) {
  const connessione = await trovaConnessioneViva(userId);
  if (!connessione) {
    throw Object.assign(new Error('Nessun collegamento bancario da associare.'), {
      statusCode: 409, codice: 'nessuna_riconciliazione_pendente',
    });
  }

  // Idempotenza: un doppio click o un refresh trova il lavoro già fatto.
  if (connessione.status === STATO_ATTIVA && connessione.conto_id) {
    const conto = await Conto.findOne({
      where: { id: connessione.conto_id, user_id: userId },
    });
    return { connessione: serializza(connessione, { conto }), conto, creato: false };
  }

  if (connessione.status !== STATO_DA_RICONCILIARE) {
    throw Object.assign(new Error('Questo collegamento non è in attesa di associazione.'), {
      statusCode: 409, codice: 'nessuna_riconciliazione_pendente',
    });
  }

  // Il conto bancario si prende dalla sessione, mai dal corpo della
  // richiesta: un id arrivato dal client non è una prova che quel conto
  // appartenga a questa autorizzazione.
  const adapter = provider ?? await getBankProvider({ nome: connessione.provider });
  const esito = await adapter.getAccounts({
    providerConnectionId: connessione.provider_connection_id,
  });
  const scelto = (esito.conti || []).find(
    (c) => (c.providerAccountId ?? c.provider_account_id) === providerAccountId,
  );
  if (!scelto) {
    throw Object.assign(new Error('Il conto indicato non appartiene a questo collegamento.'), {
      statusCode: 422, codice: 'conto_banca_non_valido',
    });
  }

  return sequelize.transaction(async (transaction) => {
    let conto;
    let creato = false;

    if (destinazione === 'nuovo') {
      const maxOrdine = await Conto.max('ordine', { where: { user_id: userId }, transaction });
      conto = await Conto.create({
        user_id: userId,
        // La banca prima dell'intestatario: Enable Banking mette in `name`
        // il nome del titolare, e «Christian Maiolo» non è il nome di un
        // conto. Rinominarlo resta possibile da `PUT /conti/:id`.
        nome: connessione.institution_name || scelto.nome || 'Conto bancario',
        tipo: 'banca',
        saldo: scelto.saldo ?? 0,
        icona: 'banca',
        colore: '#74B9FF',
        ordine: (maxOrdine || 0) + 1,
        attivo: true,
        nascosto: false,
      }, { transaction });
      creato = true;
    } else {
      conto = await Conto.findOne({
        where: { id: destinazione, user_id: userId, attivo: true },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!conto) {
        throw Object.assign(new Error('Conto non trovato'), { statusCode: 404 });
      }
      if (TIPI_NON_AGGANCIABILI.includes(conto.tipo)) {
        throw Object.assign(
          new Error('Questo conto non può essere collegato a una banca.'),
          { statusCode: 422, codice: 'conto_non_agganciabile' },
        );
      }
    }

    const aggiornata = await connessione.update({
      conto_id: conto.id,
      provider_account_id: providerAccountId,
      iban_mascherato: scelto.ibanMascherato ?? null,
      valuta: scelto.valuta ?? null,
      saldo_provider: scelto.saldo ?? null,
      status: STATO_ATTIVA,
    }, { transaction });

    return { connessione: serializza(aggiornata, { conto }), conto, creato };
  });
}
```

Allinea i nomi dei campi di `scelto` a quelli reali dell'adapter, come nel Task 3.

- [ ] **Step 4: Validazione, rate limit, controller, rotta**

In `validation.middleware.js`:

```js
/** Il corpo della riconciliazione. `destinazione` è `'nuovo'` oppure l'id di
 * un conto: due forme, un campo, perché per chi chiama è una sola scelta. */
const validateRiconciliazione = [
  body('provider_account_id').isString().trim().notEmpty()
    .withMessage('Conto bancario non indicato'),
  body('destinazione').custom((v) => v === 'nuovo' || Number.isInteger(Number(v)))
    .withMessage('Destinazione non valida'),
  handleValidationErrors,
];
```

Esportala. In `rateLimit.middleware.js`, accanto agli altri limiti di Bank Sync:

```js
/** La riconciliazione interroga il provider a ogni chiamata: il limite
 * protegge la sua quota, non il nostro database. */
const bankRiconciliazioneLimiter = creaLimiter({ max: 20, finestraMinuti: 15 });
```

Esportalo, allineando la forma a quella usata dagli altri limiter nello stesso file (`grep -n "bankConnectLimiter" server/middleware/rateLimit.middleware.js`).

In `bankSync.controller.js`:

```js
/** `POST /api/bank-sync/riconciliazione` — associa il collegamento a un conto. */
const postRiconciliazione = async (req, res) => {
  try {
    const { destinazione } = req.body;
    const esito = await connessioni.completaRiconciliazione({
      userId: req.userId,
      providerAccountId: req.body.provider_account_id,
      destinazione: destinazione === 'nuovo' ? 'nuovo' : Number(destinazione),
    });
    res.status(esito.creato ? 201 : 200).json({
      ...esito,
      message: esito.creato
        ? 'Conto creato e collegato alla banca.'
        : 'Collegamento associato al conto. I movimenti già presenti restano.',
    });
  } catch (error) {
    rispondiErrore(res, error, 'riconciliazione');
  }
};
```

In `bankSync.routes.js`:

```js
router.post(
  '/riconciliazione',
  authMiddleware, bankRiconciliazioneLimiter, feature, validateRiconciliazione,
  bankSync.postRiconciliazione,
);
```

Aggiungi `bankRiconciliazioneLimiter` e `validateRiconciliazione` agli import in testa al file.

- [ ] **Step 5: Run the tests**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js --silent`
Expected: PASS tutti, compresi quelli dei Task 2 e 3.

- [ ] **Step 6: Verifica che i test esistenti siano tornati verdi**

I tre file che usano `collegaBanca` ora passano dalla riconciliazione.

Run: `cd server && npx jest tests/bankSyncApi.test.js tests/bankSyncEngine.test.js tests/premiumSicurezza.test.js --silent`
Expected: PASS. Se qualcosa fallisce, è un punto che dava per scontato il conto creato dal callback: va corretto nel test, non nel servizio.

- [ ] **Step 7: Commit**

```bash
git add server/services/bankSync/connections.service.js \
  server/controllers/bankSync.controller.js server/routes/bankSync.routes.js \
  server/middleware/validation.middleware.js server/middleware/rateLimit.middleware.js \
  server/tests/bankSyncRiconciliazione.test.js
git commit -m "Associa il collegamento bancario a un conto esistente o nuovo"
```

---

### Task 5: La soglia di importazione

**Files:**
- Modify: `server/services/bankSync/syncEngine.service.js:206-226`
- Modify: `server/controllers/bankSync.controller.js` (`sync`)
- Modify: `server/middleware/validation.middleware.js`
- Test: `server/tests/bankSyncRiconciliazione.test.js`

**Interfaces:**
- Consumes: `ERR_SOGLIA_RICHIESTA` (Task 1), `import_da` (Task 1), una connessione `attiva` con conto (Task 4)
- Produces: `dataSuggeritaImport({ userId, contoId })` → `string | null` (ISO `YYYY-MM-DD`); `POST /api/bank-sync/sync` accetta `{ import_da?: string }` e risponde 409 `SOGLIA_RICHIESTA` con `data_suggerita` quando serve.

- [ ] **Step 1: Write the failing test**

```js
describe('la soglia di importazione protegge lo storico manuale', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.id);
  });

  it('il primo sync si rifiuta di importare e chiede da quando', async () => {
    const mio = await Conto.create({
      user_id: utente.id, nome: 'REVOLUT', tipo: 'app_pagamento', saldo: 42, attivo: true,
    });
    await Movimento.create({
      user_id: utente.id, conto_id: mio.id, tipo: 'uscita', importo: 10,
      categoria: 'spesa_quotidiana', descrizione: 'a mano', data: '2026-09-30',
      ricorrente: false,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false, destinazione: mio.id });
    await request(app).post('/api/bank-sync/riconciliazione').set(utente.headers).send({
      provider_account_id: (await request(app)
        .get('/api/bank-sync/riconciliazione').set(utente.headers)).body.conti_banca[0].provider_account_id,
      destinazione: mio.id,
    });

    const sync = await request(app).post('/api/bank-sync/sync').set(utente.headers).send({});

    expect(sync.status).toBe(409);
    expect(sync.body.codice).toBe('SOGLIA_RICHIESTA');
    // Il giorno dopo l'ultimo movimento non futuro.
    expect(sync.body.data_suggerita).toBe('2026-10-01');
    expect(await Movimento.count({ where: { conto_id: mio.id } })).toBe(1);
  });

  it('senza movimenti preesistenti importa come sempre', async () => {
    await collegaBanca(app, utente.headers);

    const sync = await request(app).post('/api/bank-sync/sync').set(utente.headers).send({});

    expect(sync.status).toBe(200);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.id } });
    expect(connessione.import_da).toBeNull();
    expect(connessione.last_successful_sync_at).not.toBeNull();
  });

  it('con import_da le transazioni precedenti non entrano', async () => {
    await collegaBanca(app, utente.headers);
    const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const sync = await request(app).post('/api/bank-sync/sync').set(utente.headers)
      .send({ import_da: domani });

    expect(sync.status).toBe(200);
    expect(sync.body.importati).toBe(0);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.id } });
    expect(connessione.import_da).toBe(domani);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "soglia di importazione" --silent`
Expected: FAIL — il primo test riceve 200 e importa, perché la guardia non esiste.

- [ ] **Step 3: Write `dataSuggeritaImport` e la guardia**

In `syncEngine.service.js`:

```js
/**
 * Da quando conviene importare, per non duplicare ciò che l'utente ha già
 * inserito a mano: il giorno successivo al suo ultimo movimento NON futuro.
 *
 * Il vincolo sul futuro non è decorativo. Un movimento già registrato in
 * avanti — una spesa programmata, un promemoria — produrrebbe altrimenti un
 * suggerimento oltre oggi, cioè «non importare niente».
 *
 * Se il conto di destinazione è vuoto (chi ha creato un conto nuovo pur
 * avendo storico altrove) si ripiega su tutti i conti dell'utente: il
 * rischio di doppio conteggio è cross-conto, non limitato al conto agganciato.
 * Senza alcun movimento non c'è soglia da suggerire e non c'è rischio.
 */
async function dataSuggeritaImport({ userId, contoId }) {
  const ultima = async (where) => Movimento.max('data', {
    where: { ...where, data: { [Op.lte]: oggiISO() } },
  });

  const trovata = (contoId ? await ultima({ user_id: userId, conto_id: contoId }) : null)
    ?? await ultima({ user_id: userId });

  if (!trovata) return null;

  const giorno = new Date(`${String(trovata).slice(0, 10)}T00:00:00Z`);
  giorno.setUTCDate(giorno.getUTCDate() + 1);
  return giorno.toISOString().slice(0, 10);
}
```

In `sincronizza`, dopo il recupero della connessione e **prima** del cooldown e del lock — una richiesta che va rifiutata non deve consumare né l'uno né l'altro:

```js
  // La soglia: al primo passaggio di chi ha già movimenti propri, importare
  // i 90 giorni li sommerebbe a quanto ha inserito a mano, e la deduplica non
  // può accorgersene (i movimenti manuali non hanno `external_transaction_id`).
  // La domanda si fa qui, nel server: l'avviso nell'interfaccia non
  // proteggerebbe una chiamata diretta all'API.
  if (importDa) {
    await connessione.update({ import_da: importDa });
  } else if (!connessione.last_successful_sync_at && !connessione.import_da) {
    const preesistenti = await Movimento.count({
      where: {
        user_id: userId,
        [Op.or]: [
          { bank_connection_id: null },
          { bank_connection_id: { [Op.ne]: connessione.id } },
        ],
      },
    });
    if (preesistenti > 0) {
      throw new SyncError(
        ERR_SOGLIA_RICHIESTA,
        'Hai già dei movimenti registrati. Scegli da quando importare per non '
        + 'ritrovarti la stessa spesa due volte.',
        {
          statusCode: 409,
          dettagli: {
            data_suggerita: await dataSuggeritaImport({
              userId, contoId: connessione.conto_id,
            }),
            movimenti_preesistenti: preesistenti,
          },
        },
      );
    }
  }
```

Aggiungi `importDa` ai parametri di `sincronizza` e importa `ERR_SOGLIA_RICHIESTA`.

Applica il pavimento a `dataDa` (riga ~224):

```js
      dataDa: maxDataISO(giorniPrimaISO(giorni), connessione.import_da),
```

con l'aiutante accanto a `giorniPrimaISO`:

```js
/** La più recente fra due date ISO, ignorando quelle assenti. Con
 * `import_da` nullo il risultato è la finestra di sempre: è ciò che fa
 * comportare le connessioni esistenti esattamente come prima. */
const maxDataISO = (a, b) => {
  if (!a) return b ? String(b).slice(0, 10) : null;
  if (!b) return a;
  return String(b).slice(0, 10) > a ? String(b).slice(0, 10) : a;
};
```

- [ ] **Step 4: Passa `import_da` dal controller**

In `bankSync.controller.js`:

```js
const sync = async (req, res) => {
  try {
    const esito = await sincronizza({
      userId: req.userId,
      origine: 'manuale',
      importDa: req.body?.import_da || null,
    });
    const stato = await connessioni.statoConnessione(req.userId);
    res.json({ ...esito, ...stato });
  } catch (error) {
    rispondiErrore(res, error, 'sync');
  }
};
```

Verifica che `rispondiErrore` riporti `dettagli` nel corpo della risposta accanto a `codice` (`grep -n "rispondiErrore" -A 15 server/controllers/bankSync.controller.js`): i test leggono `body.data_suggerita`. Se i dettagli finiscono annidati, allinea le asserzioni al punto in cui compaiono invece di cambiare la forma della risposta per tutti gli errori.

In `validation.middleware.js`:

```js
/** `import_da` è facoltativa, ma se c'è deve essere una data vera e non
 * futura: una soglia oltre oggi significherebbe "non importare niente", che
 * si ottiene non sincronizzando. */
const validateSync = [
  body('import_da').optional({ values: 'falsy' }).isISO8601()
    .custom((v) => String(v).slice(0, 10) <= new Date().toISOString().slice(0, 10))
    .withMessage('La data di inizio non può essere nel futuro'),
  handleValidationErrors,
];
```

Monta `validateSync` sulla rotta `/sync` in `bankSync.routes.js`, dopo `feature`.

- [ ] **Step 5: Run the tests**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js --silent`
Expected: PASS tutti.

- [ ] **Step 6: Run the whole Bank Sync surface**

Run: `cd server && npx jest tests/bankSync tests/premium --silent`
Expected: PASS. Il test «senza movimenti preesistenti importa come sempre» è quello che protegge la Regola 24.

- [ ] **Step 7: Commit**

```bash
git add server/services/bankSync/syncEngine.service.js \
  server/controllers/bankSync.controller.js server/routes/bankSync.routes.js \
  server/middleware/validation.middleware.js server/tests/bankSyncRiconciliazione.test.js
git commit -m "Chiedi da quando importare a chi ha già movimenti propri"
```

---

### Task 6: Il saldo di un conto collegato non si modifica a mano

**Files:**
- Modify: `server/services/bankSync/connections.service.js`
- Modify: `server/controllers/conti.controller.js:148-175`
- Test: `server/tests/bankSyncRiconciliazione.test.js`

**Interfaces:**
- Consumes: una connessione `attiva` con `conto_id` (Task 4)
- Produces: `contoCollegatoAConnessioneViva(contoId, userId)` → `Promise<boolean>`, esportata da `connections.service.js`

- [ ] **Step 1: Write the failing test**

```js
describe('il saldo di un conto collegato lo decide la banca', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.id);
  });

  it('rifiuta la modifica del saldo e spiega perché', async () => {
    const { riconciliazione } = await collegaBanca(app, utente.headers);
    const contoId = riconciliazione.body.conto.id;
    const saldoPrima = (await Conto.findByPk(contoId)).saldo;

    const r = await request(app).put(`/api/conti/${contoId}`).set(utente.headers)
      .send({ saldo: 999 });

    expect(r.status).toBe(422);
    expect(r.body.message).toMatch(/banca/i);
    expect((await Conto.findByPk(contoId)).saldo).toBe(saldoPrima);
  });

  it('il nome resta modificabile', async () => {
    const { riconciliazione } = await collegaBanca(app, utente.headers);
    const contoId = riconciliazione.body.conto.id;

    const r = await request(app).put(`/api/conti/${contoId}`).set(utente.headers)
      .send({ nome: 'Il mio Revolut' });

    expect(r.status).toBe(200);
    expect((await Conto.findByPk(contoId)).nome).toBe('Il mio Revolut');
  });

  it('su un conto non collegato il saldo si modifica come sempre', async () => {
    const mio = await Conto.create({
      user_id: utente.id, nome: 'CONTANTI', tipo: 'contanti', saldo: 10, attivo: true,
    });

    const r = await request(app).put(`/api/conti/${mio.id}`).set(utente.headers)
      .send({ saldo: 50 });

    expect(r.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "saldo di un conto collegato" --silent`
Expected: FAIL — il primo test riceve 200 e il saldo diventa 999.

- [ ] **Step 3: Write the helper**

In `connections.service.js`:

```js
/**
 * Se questo conto è alimentato da una banca.
 *
 * Vive qui e non in `conti.controller.js` perché il controller dei conti non
 * deve imparare cose sulle connessioni: gli basta la risposta.
 */
const contoCollegatoAConnessioneViva = async (contoId, userId) => !!await BankConnection.findOne({
  where: { user_id: userId, conto_id: contoId, status: { [Op.in]: STATI_VIVI } },
  attributes: ['id'],
});
```

Esportala.

- [ ] **Step 4: Write the guard**

In `conti.controller.js`, in `updateConto`, subito dopo il blocco del fondo di emergenza (riga ~172):

```js
    // Il saldo di un conto collegato lo scrive la sincronizzazione: accettare
    // una modifica qui non sarebbe rischioso, sarebbe INUTILE — il valore
    // vale fino alla chiamata successiva. Si rifiuta, come si rifiuta di
    // rendere visibile il fondo di emergenza qui sopra: un invariante si
    // impone, non si raccomanda.
    if (saldo !== undefined && await contoCollegatoAConnessioneViva(conto.id, req.userId)) {
      await t.rollback();
      return res.status(422).json({
        message: 'Il saldo di un conto collegato lo aggiorna la banca. '
          + 'Puoi cambiarne nome, icona e colore.',
        codice: 'saldo_gestito_dalla_banca',
      });
    }
```

Importa `contoCollegatoAConnessioneViva` da `../services/bankSync/connections.service`.

- [ ] **Step 5: Run the tests**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "saldo di un conto collegato" --silent`
Expected: PASS tutti tre.

- [ ] **Step 6: Verifica di non aver rotto i conti**

Run: `cd server && npx jest tests/conti tests/financialConsistency tests/fondoEmergenza --silent`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/services/bankSync/connections.service.js \
  server/controllers/conti.controller.js server/tests/bankSyncRiconciliazione.test.js
git commit -m "Impedisci di modificare a mano il saldo di un conto collegato"
```

---

### Task 7: Il contratto del vocabolario lato client

**Files:**
- Modify: `client/src/utils/bankSync.js`
- Create: `client/tests/bankSyncContratto.test.js`

**Interfaces:**
- Consumes: `STATO_DA_RICONCILIARE`, `ERR_SOGLIA_RICHIESTA` da `server/constants/bankSync.js` (Task 1)
- Produces: le stesse costanti in `client/src/utils/bankSync.js`, sorvegliate dal test

- [ ] **Step 1: Write the failing test**

Crea `client/tests/bankSyncContratto.test.js`:

```js
/**
 * Il vocabolario di Bank Sync è duplicato fra client e server, come quello
 * degli entitlement e del fondo di emergenza. Il test confronta i due file.
 *
 * Deve poter importare il lato server SENZA Sequelize: gira nel job
 * "Frontend (build)" della CI, dove `npm ci` tocca solo `client/`. Per questo
 * `server/constants/bankSync.js` non ha `require` — chi ci sposta dentro un
 * import di modelli rompe questo test, e lo rompe in modo silenzioso.
 */

import { describe, it, expect } from 'vitest';
import * as server from '../../server/constants/bankSync';
import * as client from '../src/utils/bankSync';

describe('il vocabolario di Bank Sync non divergе', () => {
  it('gli stati della connessione sono gli stessi', () => {
    expect(client.CONNECTION_STATUS).toEqual(server.CONNECTION_STATUS);
    expect(client.STATO_DA_RICONCILIARE).toBe(server.STATO_DA_RICONCILIARE);
  });

  it('il codice della soglia è lo stesso', () => {
    expect(client.ERR_SOGLIA_RICHIESTA).toBe(server.ERR_SOGLIA_RICHIESTA);
  });
});
```

Verifica prima con `ls client/src/utils/bankSync.js` se il file esiste: se non c'è, va creato in questo task riportando le costanti che il client usa già oggi (cerca con `grep -rn "sospesa_entitlement\|'attiva'" client/src` i valori oggi scritti in linea) e il test va esteso a quelle.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run tests/bankSyncContratto.test.js`
Expected: FAIL — `client.STATO_DA_RICONCILIARE` è `undefined`.

- [ ] **Step 3: Write the client vocabulary**

In `client/src/utils/bankSync.js`:

```js
/** Specchio di `server/constants/bankSync.js`. Sorvegliato da
 * `client/tests/bankSyncContratto.test.js`: i due file devono coincidere. */
export const STATO_IN_ATTESA = 'in_attesa';
export const STATO_DA_RICONCILIARE = 'da_riconciliare';
export const STATO_ATTIVA = 'attiva';
export const STATO_CONSENSO_SCADUTO = 'consenso_scaduto';
export const STATO_ERRORE = 'errore';
export const STATO_SOSPESA_ENTITLEMENT = 'sospesa_entitlement';
export const STATO_REVOCATA = 'revocata';

export const CONNECTION_STATUS = [
  STATO_IN_ATTESA,
  STATO_DA_RICONCILIARE,
  STATO_ATTIVA,
  STATO_CONSENSO_SCADUTO,
  STATO_ERRORE,
  STATO_SOSPESA_ENTITLEMENT,
  STATO_REVOCATA,
];

export const ERR_SOGLIA_RICHIESTA = 'SOGLIA_RICHIESTA';
```

Se il file esisteva già, aggiungi solo ciò che manca senza riscrivere il resto.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run tests/bankSyncContratto.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/bankSync.js client/tests/bankSyncContratto.test.js
git commit -m "Sorveglia il vocabolario di Bank Sync fra client e server"
```

---

### Task 8: Lo store: riconciliazione e soglia

**Files:**
- Modify: `client/src/stores/bankSync.store.js`

**Interfaces:**
- Consumes: le rotte dei Task 3, 4, 5; il vocabolario del Task 7
- Produces: `daRiconciliare` (getter), `caricaRiconciliazione()`, `confermaRiconciliazione({ providerAccountId, destinazione })`, `sincronizza({ importDa } = {})` che espone `sogliaRichiesta` (`{ data_suggerita, movimenti_preesistenti }` oppure `null`)

- [ ] **Step 1: Leggi le convenzioni dello store**

Run: `sed -n '1,60p' client/src/stores/bankSync.store.js`

Attenzione alla Regola 23 del progetto: attraverso il proxy di Pinia i ref annidati sono già scompattati, quindi dall'esterno si espongono getter calcolati, mai `risorsa.data.value`. Segui ciò che il file fa già.

- [ ] **Step 2: Write the store additions**

```js
  const riconciliazione = ref(null);
  const sogliaRichiesta = ref(null);

  const daRiconciliare = computed(
    () => connessione.value?.stato === STATO_DA_RICONCILIARE,
  );

  /** I dati per scegliere il conto. Non li teniamo in cache: la rotta
   * rilegge dal provider, e un elenco vecchio porterebbe a scegliere un
   * conto che non c'è più. */
  const caricaRiconciliazione = async () => {
    const { data } = await api.get('/bank-sync/riconciliazione');
    riconciliazione.value = data;
    return data;
  };

  const confermaRiconciliazione = async ({ providerAccountId, destinazione }) => {
    const { data } = await api.post('/bank-sync/riconciliazione', {
      provider_account_id: providerAccountId,
      destinazione,
    });
    connessione.value = data.connessione;
    riconciliazione.value = null;
    return data;
  };
```

In `sincronizza`, accogli la soglia. Il 409 con `SOGLIA_RICHIESTA` **non è un errore da mostrare**: è una domanda, e il chiamante deve poterla distinguere da un guasto.

```js
  const sincronizza = async ({ importDa = null } = {}) => {
    sincronizzando.value = true;
    sogliaRichiesta.value = null;
    try {
      const { data } = await api.post('/bank-sync/sync', importDa ? { import_da: importDa } : {});
      connessione.value = data.connessione;
      return data;
    } catch (err) {
      const corpo = err?.response?.data;
      if (corpo?.codice === ERR_SOGLIA_RICHIESTA) {
        // Non un guasto: serve che l'utente scelga da quando importare.
        sogliaRichiesta.value = {
          data_suggerita: corpo.data_suggerita ?? corpo.dettagli?.data_suggerita ?? null,
          movimenti_preesistenti: corpo.movimenti_preesistenti
            ?? corpo.dettagli?.movimenti_preesistenti ?? null,
        };
        return null;
      }
      throw err;
    } finally {
      sincronizzando.value = false;
    }
  };
```

Allinea la lettura di `data_suggerita` al punto reale in cui il server la mette (deciso nel Task 5, Step 4) e togli l'alternativa non usata. Aggiungi `riconciliazione`, `sogliaRichiesta`, `daRiconciliare`, `caricaRiconciliazione`, `confermaRiconciliazione` al `return` dello store, e azzera i due nuovi `ref` nel suo `reset()` — altrimenti restano al logout (vedi Known Issue 9).

- [ ] **Step 3: Run the client suite**

Run: `cd client && npm test`
Expected: PASS. Nessun test nuovo qui: il comportamento si verifica nel Task 9 attraverso i componenti.

- [ ] **Step 4: Commit**

```bash
git add client/src/stores/bankSync.store.js
git commit -m "Porta riconciliazione e soglia nello store di Bank Sync"
```

---

### Task 9: L'interfaccia: riconciliazione, avviso duplicati, indicatore, saldo bloccato

**Files:**
- Modify: `client/src/components/conti/BankSyncSection.vue`
- Modify: `client/src/views/ContiView.vue`

**Interfaces:**
- Consumes: lo store del Task 8
- Produces: nessuna interfaccia per altri task (è l'ultimo strato)

- [ ] **Step 1: La scheda di riconciliazione**

In `BankSyncSection.vue`, un ramo per `bankSyncStore.daRiconciliare` prima della scheda del conto collegato. Deve mostrare, per ogni conto restituito dalla banca, nome, IBAN mascherato e saldo; e far scegliere fra i conti WALLT agganciabili oppure «crea un conto nuovo».

Il testo deve dire cosa succede, perché è la decisione irreversibile del flusso:

> «Associa questo collegamento a un conto che usi già: i movimenti che hai inserito a mano restano, e da ora in poi li scrive la banca. Oppure creane uno nuovo.»

Mostra i conti della banca anche quando sono più di uno: è il difetto del `conti[0]` che questo lavoro corregge, e nasconderli nell'interfaccia lo reintrodurrebbe.

- [ ] **Step 2: L'avviso dei duplicati**

Un `AppDialog` che si apre quando `bankSyncStore.sogliaRichiesta` non è nullo, con la data suggerita precompilata in un campo data modificabile. Segui il modo di `showSostituisci` nello stesso file.

Il testo spiega il rischio concreto:

> «Hai già {movimenti_preesistenti} movimenti registrati. Importando da una data precedente potresti ritrovarti la stessa spesa due volte: WALLT non può riconoscere i movimenti che hai inserito a mano. Da quando vuoi importare?»

Alla conferma richiama `sincronizza({ importDa })`. Offri anche «importa tutto lo storico disponibile», che è semplicemente la data più vecchia proposta — non un secondo pulsante con una logica propria.

- [ ] **Step 3: L'indicatore sulla card del conto**

In `ContiView.vue`, nella `WCard` del ciclo su `contiVisibili` (riga ~211), un segno discreto accanto al nome quando quel conto è il conto collegato — `contiStore` non lo sa, lo sa `bankSyncStore.connessione.conto_id`.

Serve perché oggi, guardando l'elenco, il conto alimentato dalla banca è indistinguibile da quelli che l'utente riempie a mano: e su un conto collegato inserire un movimento a mano è un doppione in arrivo.

- [ ] **Step 4: Il campo saldo disabilitato**

Nel modale di modifica conto, se quel conto è il collegato, il campo saldo è `disabled` con la riga che dice perché: «Lo aggiorna la banca a ogni sincronizzazione.» Il server lo rifiuta già (Task 6); qui si evita di far compiere all'utente un'azione destinata a essere respinta.

- [ ] **Step 5: Verifica nel browser**

Non chiedere all'utente di controllare a mano. Avvia la preview, percorri il flusso e porta le prove:

1. `preview_start` sulla configurazione del client in `.claude/launch.json`
2. `read_console_messages` — nessun errore
3. Riconciliazione visibile con la connessione in `da_riconciliare`
4. L'avviso dei duplicati si apre al primo Sincronizza su un utente con movimenti
5. L'indicatore compare sulla card del conto collegato e non sugli altri
6. Il campo saldo è disabilitato per quel conto, attivo per gli altri
7. `resize_window` su `mobile`: la scelta del conto resta usabile
8. Uno screenshot per la scheda di riconciliazione e uno per l'avviso

- [ ] **Step 6: Run the client suite**

Run: `cd client && npm test`
Expected: PASS, compresi `contrasto.test.js`, `tipografia.test.js` e `vistaValue.test.js` — quest'ultimo sorveglia i template contro i ref annidati.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/conti/BankSyncSection.vue client/src/views/ContiView.vue
git commit -m "Fai scegliere all'utente a quale conto associare la banca"
```

---

### Task 10: L'avviso sul movimento manuale in un conto collegato

**Files:**
- Modify: `server/controllers/movimenti.controller.js`
- Modify: `client/src/components/movimenti/` (il form di creazione — individualo con `grep -rln "conto_id" client/src/components/movimenti/`)
- Test: `server/tests/bankSyncRiconciliazione.test.js`

**Interfaces:**
- Consumes: `contoCollegatoAConnessioneViva` (Task 6)
- Produces: `POST /api/movimenti` include `avviso: 'conto_collegato'` nella risposta quando il conto è collegato

- [ ] **Step 1: Write the failing test**

```js
describe('inserire a mano su un conto collegato', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.id);
  });

  it('riesce, ma la risposta avvisa del possibile doppione', async () => {
    const { riconciliazione } = await collegaBanca(app, utente.headers);
    const contoId = riconciliazione.body.conto.id;

    const r = await request(app).post('/api/movimenti').set(utente.headers).send({
      conto_id: contoId, tipo: 'uscita', importo: 7.5,
      categoria: 'spesa_quotidiana', descrizione: 'caffè', data: '2026-10-02',
    });

    // Non è bloccato: la spesa è avvenuta, e una `pending` non entra nei
    // movimenti importati. Ma l'utente deve sapere che arriverà anche
    // dalla banca.
    expect(r.status).toBe(201);
    expect(r.body.avviso).toBe('conto_collegato');
  });

  it('su un conto normale non avvisa', async () => {
    const mio = await Conto.create({
      user_id: utente.id, nome: 'CONTANTI', tipo: 'contanti', saldo: 100, attivo: true,
    });

    const r = await request(app).post('/api/movimenti').set(utente.headers).send({
      conto_id: mio.id, tipo: 'uscita', importo: 7.5,
      categoria: 'spesa_quotidiana', descrizione: 'caffè', data: '2026-10-02',
    });

    expect(r.status).toBe(201);
    expect(r.body.avviso).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "inserire a mano" --silent`
Expected: FAIL — `r.body.avviso` è `undefined` nel primo test.

- [ ] **Step 3: Write the implementation**

In `movimenti.controller.js`, in `createMovimento`, **dopo** il commit e accanto alla chiamata a `valutaBudgetDopoMovimento` (che per contratto resta fuori dalla transazione e non lancia mai), aggiungi all'oggetto di risposta:

```js
    // Un avviso, non un blocco: la spesa è avvenuta e le `pending` non
    // entrano nei movimenti importati, quindi vietare l'inserimento
    // significherebbe dire "aspetta la banca" su qualcosa di già accaduto.
    // Ma la stessa operazione arriverà anche dalla sincronizzazione, e la
    // deduplica non può riconoscere un movimento inserito a mano.
    const avviso = await contoCollegatoAConnessioneViva(movimento.conto_id, req.userId)
      ? 'conto_collegato'
      : undefined;
```

e includi `avviso` nel JSON solo quando è definito, per non cambiare la forma della risposta per tutti gli altri casi.

- [ ] **Step 4: Run the tests**

Run: `cd server && npx jest tests/bankSyncRiconciliazione.test.js -t "inserire a mano" --silent`
Expected: PASS entrambi.

- [ ] **Step 5: Mostra l'avviso nel client**

Nel form di creazione di un movimento, se la risposta porta `avviso: 'conto_collegato'`, un toast informativo (non un errore):

> «Salvato. Questa operazione arriverà anche dalla banca: se la vedi comparire due volte, cancella quella inserita a mano.»

- [ ] **Step 6: Run both suites**

Run: `cd server && npx jest tests/movimenti --silent && cd ../client && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/controllers/movimenti.controller.js \
  server/tests/bankSyncRiconciliazione.test.js client/src/components/movimenti
git commit -m "Avvisa chi inserisce a mano un movimento su un conto collegato"
```

---

### Task 11: La documentazione

**Files:**
- Modify: `CLAUDE.md` (Regola 24, tabella Sensitive Areas, conteggio test)
- Modify: `docs/API.md`
- Modify: `docs/DATABASE.md`
- Modify: `docs/premium-bank-sync.md`

**Interfaces:**
- Consumes: tutto il lavoro precedente
- Produces: niente di eseguibile

- [ ] **Step 1: Aggiorna la Regola 24 in `CLAUDE.md`**

La frase «la prima sincronizzazione importerà gli ultimi 90 giorni» va resa condizionata. Aggiungi al corpo della regola:

```markdown
    - **Il collegamento non crea per forza un conto nuovo.** Un conto che
      l'utente già usa può diventare il conto collegato: stesso id, stessi
      movimenti, cambia solo da dove arrivano quelli nuovi. Agganciare non
      elimina e non archivia nulla, perché la banca restituisce 90 giorni e
      lo storico manuale può coprirne nove mesi. Lo stato
      `da_riconciliare` tiene la connessione ferma finché la scelta non è
      fatta: sta dentro `STATI_VIVI` (l'autorizzazione esiste, il posto è
      occupato) e fuori da `STATI_SINCRONIZZABILI`, ed è quell'appartenenza
      — non una guardia scritta a mano — che impedisce di importare prima
      di sapere dove vanno i soldi.
    - **`import_da` è la soglia sotto la quale non si importa.** `null`
      significa «vale la finestra dei 90 giorni», ed è ciò che fa
      comportare le connessioni esistenti come prima. La soglia si decide
      al primo Sincronizza, e il server **rifiuta** (`SOGLIA_RICHIESTA`) il
      primo passaggio di chi ha già movimenti propri: la deduplica non può
      riconoscere un movimento inserito a mano, perché non ha
      `external_transaction_id`, e l'avviso nell'interfaccia non
      proteggerebbe una chiamata diretta all'API.
    - **Il saldo di un conto collegato non è modificabile a mano**
      (`updateConto` lo rifiuta). Non è una precauzione: la modifica
      sarebbe inutile, perché la sincronizzazione successiva la
      riscriverebbe. Inserire un *movimento* a mano invece è permesso, con
      un avviso: una spesa di stamattina può non essere ancora `booked`.
```

- [ ] **Step 2: `docs/API.md`**

Le due rotte nuove con corpo e risposte, il codice `SOGLIA_RICHIESTA` su `POST /sync`, e il conteggio degli endpoint aggiornato (133 → 135, verificandolo).

- [ ] **Step 3: `docs/DATABASE.md`**

La colonna `import_da` e il nuovo valore ammesso di `status` in `bank_connections`.

- [ ] **Step 4: `docs/premium-bank-sync.md`**

Il flusso aggiornato: connect → callback → **riconciliazione** → primo sync con soglia.

- [ ] **Step 5: Aggiorna il conteggio dei test**

Run: `cd server && npm test 2>&1 | tail -5` e `cd client && npm test 2>&1 | tail -5`
Riporta i numeri reali in `CLAUDE.md` (Known Issue 7), non una stima.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/API.md docs/DATABASE.md docs/premium-bank-sync.md
git commit -m "Documenta la riconciliazione fra Bank Sync e i conti esistenti"
```

---

### Task 12: La pulizia della produzione e il collaudo

**Files:** nessuno — operazioni sul database di produzione

**Interfaces:**
- Consumes: tutto il lavoro precedente, pubblicato
- Produces: una produzione pulita e il collaudo del collegamento reale

- [ ] **Step 1: Verifica la suite completa prima di pubblicare**

Run: `cd server && npm test` e `cd client && npm test`
Expected: PASS. Un fallimento isolato che sparisce al rilancio è la flakiness nota del database condiviso; un fallimento ripetibile no.

- [ ] **Step 2: Chiedi conferma prima di pushare**

Un push su `main` avvia da solo il deploy di produzione di entrambi i progetti Vercel. Elenca all'utente i commit che andrebbero live (`git log --oneline origin/main..HEAD`) e aspetta il suo sì.

- [ ] **Step 3: Applica la migrazione in produzione**

Run: `cd server && npm run migrate:production`
Expected: la 49 applicata. Richiede `DATABASE_MIGRATION_URL` in `server/.env`.

- [ ] **Step 4: Rimuovi i residui del collaudo interrotto, con conferma**

Mostra all'utente cosa sta per essere rimosso e aspetta il suo sì. Residui noti al 2 ottobre 2026: connessione `#3` (`attiva`, Revolut, zero movimenti importati) e conto `13` («Christian Maiolo», zero movimenti).

Verifica prima che il conto sia davvero vuoto — se non lo fosse, fermati e chiedi:

```sql
SELECT (SELECT COUNT(*) FROM movimenti WHERE conto_id = 13) AS movimenti,
       (SELECT status FROM bank_connections WHERE id = 3) AS stato;
```

Poi, solo se `movimenti` è 0:

```sql
UPDATE bank_connections SET status = 'revocata', state_hash = NULL WHERE id = 3;
DELETE FROM conti WHERE id = 13 AND user_id = 2;
```

Le connessioni `#1` e `#2` sono già `revocata`: non vanno toccate.

- [ ] **Step 5: Il collaudo del percorso nuovo**

L'utente autentica presso la banca — le credenziali bancarie non si inseriscono per lui. A ogni fermata leggi la produzione e verifica:

1. dopo il callback: `status = 'da_riconciliare'`, `conto_id` nullo, nessun conto creato;
2. la riconciliazione mostra il conto Revolut e, fra i conti agganciabili, il conto 9 «REVOLUT»;
3. scelto il conto 9: `conto_id = 9`, `status = 'attiva'`, i 353 movimenti ancora al loro posto, nessun conto nuovo;
4. al primo Sincronizza: `SOGLIA_RICHIESTA` con `data_suggerita` al giorno dopo l'ultimo movimento;
5. confermata la soglia: i movimenti importati hanno **data successiva alla soglia**, le uscite sono uscite (`DBDT` → `uscita`, la trappola del segno), il saldo del conto 9 coincide con quello della banca, e il patrimonio **non** conta più 42 € due volte.

- [ ] **Step 6: Aggiorna la memoria**

Se il collaudo rivela qualcosa di non ovvio e durevole sul provider o sul flusso, aggiorna `wallt-open-banking-provider.md` nella memoria di progetto.

---

## Autorevisione del piano

**Copertura della spec.** Ogni sezione ha un task: lo stato e lo schema → 1; il callback che si restringe → 2; `GET` → 3; `POST`, l'aggancio senza perdite e il nome → 4; la soglia e `SOGLIA_RICHIESTA` → 5; il saldo non modificabile → 6; il vocabolario duplicato → 7; store → 8; riconciliazione, avviso, indicatore e campo saldo → 9; il movimento manuale che avvisa → 10; la documentazione → 11; la pulizia e il collaudo → 12.

**Coerenza dei nomi fra task.** `contoCollegatoAConnessioneViva` è definita nel Task 6 e riusata nel Task 10 con la stessa firma. `dataSuggeritaImport({ userId, contoId })` è definita e usata nel Task 5. `STATO_DA_RICONCILIARE` e `ERR_SOGLIA_RICHIESTA` nascono nel Task 1 e sono gli stessi nei Task 2, 5, 7, 8. `collegaBanca(..., { riconcilia, destinazione })` è estesa nel Task 2 e usata con quella firma nei Task 3-6 e 10.

**Punti da verificare durante l'esecuzione, non assunti.** Tre, segnalati nel punto in cui servono perché il piano non può deciderli dall'esterno senza leggere il codice:

1. i nomi esatti dei campi restituiti da `getAccounts` dell'adapter (Task 3 Step 3, Task 4 Step 3);
2. dove `rispondiErrore` colloca `dettagli` nel corpo della risposta, che decide se il client legge `body.data_suggerita` o `body.dettagli.data_suggerita` (Task 5 Step 4, Task 8 Step 2);
3. l'esistenza e il contenuto attuale di `client/src/utils/bankSync.js` (Task 7 Step 1).

In tutti tre il piano dice di allineare il codice alla forma reale e di **togliere l'alternativa non usata**, invece di lasciare due strade.
