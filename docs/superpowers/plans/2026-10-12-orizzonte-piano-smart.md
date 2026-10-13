# Orizzonte di spesa di Piano Smart — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare a Piano Smart un orizzonte di spesa dichiarato dall'utente — ciclo
mensile (invariato) oppure una data entro cui il capitale deve bastare, con
budget giornaliero autocorrettivo — e separare il cruscotto di monitoraggio dal
wizard di ripartizione in due pagine distinte.

**Architecture:** Un service puro (`orizzonte.service.js`) calcola il budget in
centesimi interi senza conoscere il database; `currentSituation.service.js` gli
delega **solo** in modalità data e in modalità mensile serializza i valori che
già calcola, così il comportamento attuale non cambia. La proiezione degli
impegni oltre i 30 giorni è un parametro **additivo** di `riepilogoRicorrenti`:
i chiamanti esistenti non la vedono.

**Tech Stack:** Node 22 + Express 5 + Sequelize 6 (server), Vue 3 `<script setup>`
+ Pinia 3 + Vite (client), Jest (server), `node:test` (client).

**Spec:** `docs/superpowers/specs/2026-10-12-orizzonte-piano-smart-design.md`

## Global Constraints

- **Lingua:** italiano per commenti, messaggi, commit, UI. Identificatori in inglese.
- **Tabella profilo:** si chiama `profili_utente` (plurale). La spec scrive
  `profilo_utente`: è un errore della spec, vale questo piano.
- **Centesimi interi** in tutto il motore (Regola 21): nessun float in euro.
- **Default invariato:** la finestra delle ricorrenze resta `oggi + 30` per ogni
  chiamante esistente. Solo la modalità data chiede di più.
- **Nessuna scrittura finanziaria:** l'orizzonte non crea movimenti, non muove
  saldi, non tocca `liquidita.service.js` né `fondoEmergenza.service.js`.
- **Fuori perimetro:** `services/pianoSmart/` (motore V1, `smart-v1` versionato).
- **Il tetto `min(..., spesa_media)` resta in modalità mensile.** Toglierlo anche
  lì è un intervento separato.
- **Migrazione:** da eseguire su Supabase **prima** del push su `main`
  (`npm run migrate:production`). Un modello che dichiara una colonna
  inesistente rompe ogni lettura di `profili_utente`.
- **Comandi:** `cd server && npm test` (richiede PostgreSQL), `npm run test:unit`
  (nessun database). Client: `cd client && npm test`.

---

## Le sei fasi

Ogni fase è completa e verificabile da sola, e indica **i soli file da leggere**:
una sessione nuova non deve esplorare il resto del repository.

| Fase | Deliverable | Fuori contesto |
|---|---|---|
| 1 | L'orizzonte si salva nel profilo e il vocabolario è condiviso | tutto il calcolo |
| 2 | Il motore puro calcola il budget | API, client, database |
| 3 | Il contesto sa dire gli impegni fino a una data | client, UI |
| 4 | L'API risponde con `horizon` | client, UI |
| 5 | Hero e selettore dell'orizzonte | separazione delle pagine |
| 6 | Due pagine, due voci di menu | calcolo (già fatto) |

---

# FASE 1 — Persistenza e vocabolario

**Leggi solo:** `server/models/ProfiloUtente.js`,
`server/migrations/20260926000035-add-piano-smart-safety-reserve-months.js`,
`server/middleware/validation.middleware.js:1245-1256`,
`server/controllers/profilo.controller.js:125-140`,
`server/constants/pianoSmart.js`, `client/src/utils/pianoSmart.js`,
`client/tests/pianoSmartContratto.test.js`.

### Task 1.1: Vocabolario dell'orizzonte (server + client + contratto)

**Files:**
- Modify: `server/constants/pianoSmart.js`
- Modify: `client/src/utils/pianoSmart.js`
- Test: `client/tests/pianoSmartContratto.test.js`

**Interfaces:**
- Produces (server): `ORIZZONTE_TIPI = ['mensile', 'data']`, `ORIZZONTE_MESI_MAX = 36`
- Produces (client): `ORIZZONTE_TIPI`, `ORIZZONTE_MESI_MAX`, `ETICHETTE_ORIZZONTE`

- [ ] **Step 1: Scrivi il test che fallisce**

In `client/tests/pianoSmartContratto.test.js`, aggiungi in fondo:

```js
test('i tipi di orizzonte coincidono con quelli del backend', () => {
  assert.deepEqual([...ORIZZONTE_TIPI], [...serverConstants.ORIZZONTE_TIPI]);
});

test('il tetto in mesi dell orizzonte e lo stesso sui due lati', () => {
  assert.equal(ORIZZONTE_MESI_MAX, serverConstants.ORIZZONTE_MESI_MAX);
});

test('ogni tipo di orizzonte ha una etichetta leggibile diversa dal valore API', () => {
  ORIZZONTE_TIPI.forEach((tipo) => {
    const etichetta = ETICHETTE_ORIZZONTE[tipo];
    assert.ok(etichetta && etichetta !== tipo, `tipo senza etichetta: ${tipo}`);
  });
});
```

E aggiungi `ORIZZONTE_TIPI, ORIZZONTE_MESI_MAX, ETICHETTE_ORIZZONTE` all'import
da `../src/utils/pianoSmart.js` già presente in testa al file.

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd client && npm test`
Expected: FAIL, `ORIZZONTE_TIPI` è `undefined`.

- [ ] **Step 3: Aggiungi il vocabolario sul server**

In `server/constants/pianoSmart.js`, prima di `module.exports`:

```js
/**
 * Orizzonte di spesa: entro quale termine il capitale deve bastare.
 * `mensile` è il ciclo che si rinnova col mese civile (comportamento
 * storico); `data` è un termine fisso scelto dall'utente, che si avvicina
 * ogni giorno.
 */
const ORIZZONTE_TIPI = ['mensile', 'data'];

/** Tetto alla data scelta. Non è una regola di prodotto ma di calcolo: oltre
 * questo limite la proiezione delle ricorrenze diventa un esercizio teorico
 * (e un ciclo di migliaia di giorni per ogni richiesta). */
const ORIZZONTE_MESI_MAX = 36;
```

E aggiungi `ORIZZONTE_TIPI,` e `ORIZZONTE_MESI_MAX,` dentro `module.exports`.

- [ ] **Step 4: Aggiungi il vocabolario sul client**

In `client/src/utils/pianoSmart.js`, dopo `CATEGORIE_PIANO`:

```js
/** Duplicato di `server/constants/pianoSmart.js`: il contratto è verificato
 * da `client/tests/pianoSmartContratto.test.js`, non dalla buona volontà. */
export const ORIZZONTE_TIPI = Object.freeze(['mensile', 'data']);
export const ORIZZONTE_MESI_MAX = 36;
export const ETICHETTE_ORIZZONTE = Object.freeze({
  mensile: 'Ciclo mensile',
  data: 'Fino a una data',
});
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `cd client && npm test`
Expected: PASS, tre test in più del conteggio precedente.

- [ ] **Step 6: Commit**

```bash
git add server/constants/pianoSmart.js client/src/utils/pianoSmart.js client/tests/pianoSmartContratto.test.js
git commit -m "Aggiungi il vocabolario condiviso dell'orizzonte di spesa"
```

### Task 1.2: Colonne, modello, validazione, whitelist

**Files:**
- Create: `server/migrations/20261012000001-add-piano-smart-horizon.js`
- Modify: `server/models/ProfiloUtente.js` (accanto a `mesi_riserva_piano_smart`)
- Modify: `server/middleware/validation.middleware.js` (dopo `mesi_riserva_piano_smart`)
- Modify: `server/controllers/profilo.controller.js:132`
- Test: `server/tests/profilo.test.js`

**Interfaces:**
- Consumes: `ORIZZONTE_TIPI`, `ORIZZONTE_MESI_MAX` dal Task 1.1
- Produces: colonne `profili_utente.orizzonte_tipo` (STRING, NOT NULL, default
  `'mensile'`) e `profili_utente.orizzonte_data` (DATEONLY, nullable); entrambe
  aggiornabili via `PUT /api/profilo`

- [ ] **Step 1: Scrivi il test che fallisce**

In `server/tests/profilo.test.js`, dentro il `describe` principale:

```js
describe('orizzonte di spesa', () => {
  test('salva un orizzonte a data futura', async () => {
    const res = await request(app)
      .put('/api/profilo')
      .set('Authorization', `Bearer ${token}`)
      .send({ orizzonte_tipo: 'data', orizzonte_data: '2027-06-30' });
    expect(res.status).toBe(200);
    const profilo = await ProfiloUtente.findOne({ where: { user_id: userId } });
    expect(profilo.orizzonte_tipo).toBe('data');
    expect(String(profilo.orizzonte_data)).toBe('2027-06-30');
  });

  test('rifiuta un tipo sconosciuto', async () => {
    const res = await request(app)
      .put('/api/profilo')
      .set('Authorization', `Bearer ${token}`)
      .send({ orizzonte_tipo: 'settimanale' });
    expect(res.status).toBe(400);
  });

  test('rifiuta una data nel passato', async () => {
    const res = await request(app)
      .put('/api/profilo')
      .set('Authorization', `Bearer ${token}`)
      .send({ orizzonte_tipo: 'data', orizzonte_data: '2020-01-01' });
    expect(res.status).toBe(400);
  });

  test('rifiuta una data oltre il tetto di 36 mesi', async () => {
    const res = await request(app)
      .put('/api/profilo')
      .set('Authorization', `Bearer ${token}`)
      .send({ orizzonte_tipo: 'data', orizzonte_data: '2040-01-01' });
    expect(res.status).toBe(400);
  });

  test('il tipo data senza data viene rifiutato', async () => {
    const res = await request(app)
      .put('/api/profilo')
      .set('Authorization', `Bearer ${token}`)
      .send({ orizzonte_tipo: 'data', orizzonte_data: null });
    expect(res.status).toBe(400);
  });
});
```

Se `ProfiloUtente` o `userId` non sono già nello scope del file, prendili dallo
stesso punto in cui li prendono i test già presenti: non introdurre un secondo
modo di autenticarsi.

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd server && npx jest tests/profilo.test.js -t "orizzonte" --runInBand`
Expected: FAIL — la colonna non esiste.

- [ ] **Step 3: Scrivi la migrazione**

`server/migrations/20261012000001-add-piano-smart-horizon.js`:

```js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('profili_utente');
    if (!columns.orizzonte_tipo) {
      await queryInterface.addColumn('profili_utente', 'orizzonte_tipo', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'mensile',
      });
    }
    if (!columns.orizzonte_data) {
      await queryInterface.addColumn('profili_utente', 'orizzonte_data', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('profili_utente');
    if (columns.orizzonte_data) {
      await queryInterface.removeColumn('profili_utente', 'orizzonte_data');
    }
    if (columns.orizzonte_tipo) {
      await queryInterface.removeColumn('profili_utente', 'orizzonte_tipo');
    }
  },
};
```

Nessun hardening RLS: non crea tabelle, aggiunge colonne a una esistente.

- [ ] **Step 4: Dichiara i campi nel modello**

In `server/models/ProfiloUtente.js`, subito dopo il blocco
`mesi_riserva_piano_smart`:

```js
  // L'orizzonte entro cui il capitale deve bastare. `mensile` è il ciclo
  // storico; con `data` il termine è fisso e `orizzonte_data` lo contiene.
  // `mesi_riserva_piano_smart` vale solo in modalità mensile.
  orizzonte_tipo: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'mensile',
  },
  orizzonte_data: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
```

- [ ] **Step 5: Aggiungi la validazione**

In `server/middleware/validation.middleware.js`, subito dopo il blocco
`body('mesi_riserva_piano_smart')`:

```js
  body('orizzonte_tipo')
    .optional({ values: 'null' })
    .isIn(ORIZZONTE_TIPI)
    .withMessage('orizzonte_tipo non valido'),
  // La data è obbligatoria solo quando il tipo la richiede, deve stare nel
  // futuro nel fuso dell'utente e sotto il tetto di calcolo: senza tetto una
  // data nel 2090 farebbe proiettare le ricorrenze su ventimila giorni.
  body('orizzonte_data')
    .if(body('orizzonte_tipo').equals('data'))
    .exists({ values: 'null' })
    .withMessage('Scegli la data entro cui il capitale deve bastare')
    .bail()
    .isISO8601({ strict: true })
    .withMessage('orizzonte_data non valida')
    .bail()
    .custom((value) => {
      const oggi = oggiLocale();
      if (value <= oggi) throw new Error('La data deve essere nel futuro');
      if (value > sommaMesi(oggi, ORIZZONTE_MESI_MAX)) {
        throw new Error(`La data non può superare ${ORIZZONTE_MESI_MAX} mesi da oggi`);
      }
      return true;
    }),
  body('orizzonte_data')
    .optional({ values: 'null' })
    .isISO8601({ strict: true })
    .withMessage('orizzonte_data non valida'),
```

In testa al file, aggiungi agli import esistenti:

```js
const { ORIZZONTE_TIPI, ORIZZONTE_MESI_MAX } = require('../constants/pianoSmart');
const { oggiLocale, sommaMesi } = require('../utils/dateRome');
```

Se uno dei due `require` è già presente nel file, estendilo invece di
duplicarlo.

- [ ] **Step 6: Metti i campi nella whitelist del controller**

In `server/controllers/profilo.controller.js:132`, aggiungi
`'orizzonte_tipo', 'orizzonte_data'` all'elenco dei campi aggiornabili.

- [ ] **Step 7: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/profilo.test.js --runInBand`
Expected: PASS, cinque test in più.

- [ ] **Step 8: Verifica che la catena di migrazioni resti sana**

Run: `cd server && npx jest tests/migrazioniReali.test.js --runInBand`
Expected: PASS (zero tabelle senza RLS, catena applicabile).

- [ ] **Step 9: Commit**

```bash
git add server/migrations/20261012000001-add-piano-smart-horizon.js server/models/ProfiloUtente.js server/middleware/validation.middleware.js server/controllers/profilo.controller.js server/tests/profilo.test.js
git commit -m "Salva l'orizzonte di spesa nel profilo utente"
```

---

# FASE 2 — Il motore puro

**Leggi solo:** `server/services/pianoSmart/money.js`,
`server/tests/pianoSmartMoney.test.js` (come modello di suite pura),
`server/jest.unit.config.js`.

### Task 2.1: `calcolaOrizzonte`

**Files:**
- Create: `server/services/pianoSmartV2/orizzonte.service.js`
- Create: `server/tests/pianoSmartOrizzonte.test.js`
- Modify: `server/jest.unit.config.js` (aggiungi la suite a `testMatch`)

**Interfaces:**
- Consumes: niente (service puro, nessun `require('../models')`)
- Produces:

```js
calcolaOrizzonte({
  tipo,                      // 'mensile' | 'data'
  dataFine,                  // 'YYYY-MM-DD'
  referenceDate,             // 'YYYY-MM-DD', oggi nel fuso dell'utente
  baseCents,                 // int|null: conti spendibili meno obiettivi
  impegniFinoACents,         // int|null: ricorrenze + programmate in [oggi, dataFine]
  ritmoGiornalieroCents,     // int|null: spesa libera media al giorno
}) => {
  tipo, dataFine, giorni,
  capitaleLibero,            // int|null
  impegniFinoA,              // int|null
  budgetGiornaliero,         // int|null
  stato,                     // 'in_rotta' | 'scoperto' | 'non_stimabile'
  mancanti,                  // int|null, valorizzato solo se stato === 'scoperto'
  dataRaggiungibile,         // 'YYYY-MM-DD'|null
}
```

- [ ] **Step 1: Scrivi i test che falliscono**

`server/tests/pianoSmartOrizzonte.test.js`:

```js
/**
 * L'orizzonte di spesa: quanto si può spendere al giorno perché il capitale
 * basti fino a una data. Nessun database: suite pura, gira anche in
 * `npm run test:unit`.
 */
const { calcolaOrizzonte } = require('../services/pianoSmartV2/orizzonte.service');

const base = {
  tipo: 'data',
  dataFine: '2026-10-21',
  referenceDate: '2026-10-12',
  baseCents: 100000,
  impegniFinoACents: 0,
  ritmoGiornalieroCents: null,
};

describe('giorni', () => {
  test('conta inclusivi entrambi gli estremi', () => {
    expect(calcolaOrizzonte(base).giorni).toBe(10);
  });

  test('un orizzonte che finisce oggi vale un giorno', () => {
    expect(calcolaOrizzonte({ ...base, dataFine: '2026-10-12' }).giorni).toBe(1);
  });

  test('attraversa il cambio di mese e di anno', () => {
    expect(calcolaOrizzonte({
      ...base, referenceDate: '2026-12-30', dataFine: '2027-01-02',
    }).giorni).toBe(4);
  });
});

describe('budget giornaliero', () => {
  test('distribuisce il capitale libero sui giorni, arrotondando per difetto', () => {
    const esito = calcolaOrizzonte({ ...base, baseCents: 100005 });
    expect(esito.capitaleLibero).toBe(100005);
    expect(esito.budgetGiornaliero).toBe(10000);
    expect(esito.stato).toBe('in_rotta');
  });

  test('sottrae gli impegni prima di dividere', () => {
    const esito = calcolaOrizzonte({ ...base, impegniFinoACents: 40000 });
    expect(esito.capitaleLibero).toBe(60000);
    expect(esito.budgetGiornaliero).toBe(6000);
  });

  // La proprietà centrale: chi ha speso meno ieri oggi può spendere di più.
  test('speso meno di ieri: il budget di oggi sale', () => {
    const ieri = calcolaOrizzonte({ ...base, referenceDate: '2026-10-11', baseCents: 100000 });
    const oggiRisparmiando = calcolaOrizzonte({ ...base, baseCents: 95000 });
    expect(ieri.budgetGiornaliero).toBe(9090);
    expect(oggiRisparmiando.budgetGiornaliero).toBe(9500);
    expect(oggiRisparmiando.budgetGiornaliero).toBeGreaterThan(ieri.budgetGiornaliero);
  });

  test('speso piu del budget: il budget di oggi scende', () => {
    const ieri = calcolaOrizzonte({ ...base, referenceDate: '2026-10-11', baseCents: 100000 });
    const oggiSpendendo = calcolaOrizzonte({ ...base, baseCents: 80000 });
    expect(oggiSpendendo.budgetGiornaliero).toBeLessThan(ieri.budgetGiornaliero);
  });
});

describe('capitale insufficiente', () => {
  test('impegni oltre il capitale: scoperto e budget a zero', () => {
    const esito = calcolaOrizzonte({ ...base, impegniFinoACents: 150000 });
    expect(esito.stato).toBe('scoperto');
    expect(esito.capitaleLibero).toBe(-50000);
    expect(esito.mancanti).toBe(50000);
    expect(esito.budgetGiornaliero).toBe(0);
  });

  test('in rotta non espone mancanti', () => {
    expect(calcolaOrizzonte(base).mancanti).toBeNull();
  });
});

describe('data raggiungibile', () => {
  test('al ritmo attuale si ferma prima della data scelta', () => {
    const esito = calcolaOrizzonte({ ...base, ritmoGiornalieroCents: 25000 });
    expect(esito.dataRaggiungibile).toBe('2026-10-15');
  });

  test('un ritmo sostenibile arriva almeno alla data scelta', () => {
    const esito = calcolaOrizzonte({ ...base, ritmoGiornalieroCents: 5000 });
    expect(esito.dataRaggiungibile >= esito.dataFine).toBe(true);
  });

  test('senza ritmo osservato la data raggiungibile non si inventa', () => {
    expect(calcolaOrizzonte(base).dataRaggiungibile).toBeNull();
  });

  test('ritmo zero non divide per zero', () => {
    expect(calcolaOrizzonte({ ...base, ritmoGiornalieroCents: 0 }).dataRaggiungibile).toBeNull();
  });
});

describe('dati mancanti', () => {
  test('senza capitale non si stima nulla', () => {
    const esito = calcolaOrizzonte({ ...base, baseCents: null });
    expect(esito.stato).toBe('non_stimabile');
    expect(esito.budgetGiornaliero).toBeNull();
    expect(esito.capitaleLibero).toBeNull();
  });

  test('senza impegni noti non si stima nulla', () => {
    expect(calcolaOrizzonte({ ...base, impegniFinoACents: null }).stato).toBe('non_stimabile');
  });

  test('una data nel passato non produce un budget', () => {
    const esito = calcolaOrizzonte({ ...base, dataFine: '2026-10-01' });
    expect(esito.stato).toBe('non_stimabile');
    expect(esito.giorni).toBe(0);
  });
});

describe('modalita mensile', () => {
  test('serializza i valori ricevuti senza ricalcolarli', () => {
    const esito = calcolaOrizzonte({
      tipo: 'mensile',
      dataFine: '2026-10-31',
      referenceDate: '2026-10-12',
      baseCents: 60000,
      impegniFinoACents: 0,
      ritmoGiornalieroCents: null,
    });
    expect(esito.tipo).toBe('mensile');
    expect(esito.giorni).toBe(20);
    expect(esito.budgetGiornaliero).toBe(3000);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `cd server && npx jest tests/pianoSmartOrizzonte.test.js --runInBand`
Expected: FAIL — `Cannot find module '../services/pianoSmartV2/orizzonte.service'`.

- [ ] **Step 3: Scrivi l'implementazione minima**

`server/services/pianoSmartV2/orizzonte.service.js`:

```js
/**
 * L'orizzonte di spesa: entro quale termine il capitale deve bastare, e
 * quanto si può spendere al giorno perché basti.
 *
 * Service PURO: nessun modello, nessuna query, nessuna data di sistema.
 * Riceve già in centesimi interi ciò che gli serve e restituisce centesimi
 * interi (Regola 21). Chi lo chiama prepara gli ingressi.
 *
 * L'autocorrezione non è un meccanismo: è l'assenza di memoria. Il budget è
 * ricalcolato ogni giorno sul capitale REALE, quindi chi ieri ha speso meno
 * ha oggi più capitale e un giorno in meno su cui distribuirlo.
 */

const GIORNO_MS = 86400000;

/** Giorni fra due date ISO, inclusivi su entrambi gli estremi. Locale: non
 * serve un helper condiviso per una sottrazione di due giorni UTC. */
const giorniInclusivi = (da, a) => {
  const inizio = Date.parse(`${da}T00:00:00Z`);
  const fine = Date.parse(`${a}T00:00:00Z`);
  if (!Number.isFinite(inizio) || !Number.isFinite(fine)) return 0;
  const giorni = Math.round((fine - inizio) / GIORNO_MS) + 1;
  return giorni > 0 ? giorni : 0;
};

const sommaGiorniIso = (dataIso, giorni) => new Date(
  Date.parse(`${dataIso}T00:00:00Z`) + giorni * GIORNO_MS,
).toISOString().slice(0, 10);

function calcolaOrizzonte({
  tipo,
  dataFine,
  referenceDate,
  baseCents,
  impegniFinoACents,
  ritmoGiornalieroCents = null,
}) {
  const giorni = giorniInclusivi(referenceDate, dataFine);
  const vuoto = {
    tipo, dataFine, giorni,
    capitaleLibero: null,
    impegniFinoA: impegniFinoACents ?? null,
    budgetGiornaliero: null,
    stato: 'non_stimabile',
    mancanti: null,
    dataRaggiungibile: null,
  };
  if (giorni === 0 || baseCents === null || baseCents === undefined) return vuoto;
  if (impegniFinoACents === null || impegniFinoACents === undefined) return vuoto;

  const capitaleLibero = baseCents - impegniFinoACents;
  const scoperto = capitaleLibero < 0;
  // Un capitale negativo non si distribuisce: il budget è zero e l'ammontare
  // che manca è l'informazione utile al suo posto.
  const budgetGiornaliero = Math.floor(Math.max(capitaleLibero, 0) / giorni);

  let dataRaggiungibile = null;
  if (Number.isFinite(ritmoGiornalieroCents) && ritmoGiornalieroCents > 0) {
    const giorniSostenibili = Math.floor(Math.max(capitaleLibero, 0) / ritmoGiornalieroCents);
    // L'ultimo giorno coperto, non il primo scoperto: con un giorno
    // sostenibile la copertura finisce oggi.
    dataRaggiungibile = sommaGiorniIso(referenceDate, Math.max(giorniSostenibili - 1, 0));
  }

  return {
    tipo,
    dataFine,
    giorni,
    capitaleLibero,
    impegniFinoA: impegniFinoACents,
    budgetGiornaliero,
    stato: scoperto ? 'scoperto' : 'in_rotta',
    mancanti: scoperto ? -capitaleLibero : null,
    dataRaggiungibile,
  };
}

module.exports = { calcolaOrizzonte };
```

- [ ] **Step 4: Registra la suite fra quelle pure**

In `server/jest.unit.config.js`, dopo
`'<rootDir>/tests/pianoSmartCurrentSituation.test.js',` aggiungi:

```js
    '<rootDir>/tests/pianoSmartOrizzonte.test.js',
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/pianoSmartOrizzonte.test.js --runInBand`
Expected: PASS, 17 test.

Run: `cd server && npm run test:unit`
Expected: PASS, la nuova suite compare nell'elenco.

- [ ] **Step 6: Commit**

```bash
git add server/services/pianoSmartV2/orizzonte.service.js server/tests/pianoSmartOrizzonte.test.js server/jest.unit.config.js
git commit -m "Calcola il budget giornaliero di un orizzonte a data fissa"
```

---

# FASE 3 — Impegni proiettati fino alla data

**Leggi solo:** `server/services/financialContext.service.js:40-145` e `:505-530`,
`server/tests/pianoSmartRecurringCashFlow.test.js`.

**Perché additivo:** `riepilogoRicorrenti` è già esportato e il suo
`cashFlowItems` a 30 giorni alimenta radar, insight e motore V1. La proiezione
lunga arriva come **terzo parametro opzionale** e come **campo nuovo**: chi
chiama senza quel parametro ottiene esattamente ciò che otteneva prima.

### Task 3.1: `riepilogoRicorrenti(userId, referenceDate, orizzonteFine)`

**Files:**
- Modify: `server/services/financialContext.service.js`
- Test: `server/tests/pianoSmartRecurringCashFlow.test.js`

**Interfaces:**
- Produces: terzo parametro `orizzonteFine` (`'YYYY-MM-DD'` | `null`); quando
  valorizzato il risultato espone in più
  `horizon: { through, items: [{ occurrenceKey, dueDate, amount, description }], totalOutflow }`.
  Quando è `null`, `horizon` è `null` e nulla cambia.
- Produces: `context.preferences.orizzonteTipo` e `context.preferences.orizzonteData`

- [ ] **Step 1: Scrivi i test che falliscono**

In `server/tests/pianoSmartRecurringCashFlow.test.js`, aggiungi un `describe`
nuovo. Il file **non usa il database**: mocka `Movimento.findAll` e
`ScheduledPayment.findAll` e ripristina gli originali in `finally`. Segui
esattamente quel modo, altrimenti la suite esce da `test:unit`.

`Movimento.findAll` è chiamato due volte (le ricorrenze, poi gli addebiti già
eseguiti) e va mockato con due `mockResolvedValueOnce`. `ScheduledPayment.findAll`
sarà chiamato **due** volte quando si chiede un orizzonte: prima la finestra a
30 giorni, poi quella lunga — quindi due `mockResolvedValueOnce` distinti, che
è anche il modo di documentare quell'ordine.

```js
describe('proiezione oltre i 30 giorni', () => {
  // Affitto da 800 il 5 di ogni mese. Il periodo di ottobre è già stato
  // addebitato: senza quella riga la ricorrenza risulterebbe dovuta OGGI,
  // perché `valutaOccorrenza` apre una finestra e il 12 è oltre il 5
  // (recupero di un cron saltato, vedi ricorrenti.service.js).
  const affitto = [{
    id: 27, descrizione: 'Affitto', data: '2026-09-01', stato_ricorrenza: 'attiva',
    ricorrente_frequenza: 'mensile', ricorrente_giorno: 5, tipo: 'uscita', importo: 800,
  }];
  const ottobreGiaAddebitato = [{ ricorrenza_origine_id: 27, ricorrenza_periodo: '2026-10' }];
  const adesso = new Date('2026-10-12T12:00:00Z');

  const conMock = async (programmate, esecuzione) => {
    const originalMovimenti = Movimento.findAll;
    const originalProgrammate = ScheduledPayment.findAll;
    Movimento.findAll = jest.fn()
      .mockResolvedValueOnce(affitto)
      .mockResolvedValueOnce(ottobreGiaAddebitato);
    ScheduledPayment.findAll = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(programmate);
    try {
      return await esecuzione();
    } finally {
      Movimento.findAll = originalMovimenti;
      ScheduledPayment.findAll = originalProgrammate;
    }
  };

  test('senza orizzonte il risultato non cresce di un campo valorizzato', async () => {
    const esito = await conMock([], () => riepilogoRicorrenti(42, adesso));
    expect(esito.horizon).toBeNull();
  });

  test('la mensile e proiettata fino alla data, una volta per periodo', async () => {
    const esito = await conMock([], () => riepilogoRicorrenti(42, adesso, '2026-12-31'));
    expect(esito.horizon.through).toBe('2026-12-31');
    expect(esito.horizon.items.map((item) => item.dueDate))
      .toEqual(['2026-11-05', '2026-12-05']);
    const chiavi = esito.horizon.items.map((item) => item.occurrenceKey);
    expect(new Set(chiavi).size).toBe(chiavi.length);
    expect(esito.horizon.totalOutflow).toBe(1600);
  });

  test('la finestra breve resta a 30 giorni', async () => {
    const esito = await conMock([], () => riepilogoRicorrenti(42, adesso, '2026-12-31'));
    expect(esito.cashFlowItems.map((item) => item.dueDate)).toEqual(['2026-11-05']);
  });

  test('le uscite programmate entro l orizzonte entrano una volta sola', async () => {
    const programmate = [{
      id: 9, descrizione: 'Assicurazione', importo: 150, data_scadenza: '2026-12-20',
    }];
    const esito = await conMock(programmate, () => riepilogoRicorrenti(42, adesso, '2026-12-31'));
    const chiavi = esito.horizon.items.map((item) => item.occurrenceKey);
    expect(chiavi).toContain('programmata:9');
    expect(new Set(chiavi).size).toBe(chiavi.length);
    expect(esito.horizon.totalOutflow).toBe(1750);
    // La finestra breve non deve vedere una scadenza di dicembre.
    expect(esito.cashFlowItems.map((item) => item.dueDate)).toEqual(['2026-11-05']);
  });

  test('una data nel passato non attiva la proiezione', async () => {
    const esito = await conMock([], () => riepilogoRicorrenti(42, adesso, '2026-09-01'));
    expect(esito.horizon).toBeNull();
  });
});
```

Gli importi attesi (1600, 1750) derivano dalla fixture qui sopra: se cambi la
fixture ricalcolali, non adattare l'implementazione.

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `cd server && npx jest tests/pianoSmartRecurringCashFlow.test.js --runInBand`
Expected: FAIL — `esito.horizon` è `undefined`.

- [ ] **Step 3: Implementa la proiezione**

In `server/services/financialContext.service.js`, cambia la firma:

```js
async function riepilogoRicorrenti(userId, referenceDate = new Date(), orizzonteFine = null) {
```

Dopo `const termineFlussi = sommaGiorni(oggi.date, 30);` aggiungi:

```js
  // Finestra lunga, richiesta solo dall'orizzonte a data. È separata dalle
  // altre due di proposito: `cashFlowItems` (30 giorni) e `items` (fine mese)
  // alimentano radar, insight e motore V1, e allungarle cambierebbe numeri
  // che nessuno ha chiesto di cambiare.
  const termineOrizzonte = orizzonteFine && orizzonteFine > oggi.date ? orizzonteFine : null;
  const orizzonteEmesse = new Set();
  const orizzonteItems = [];
```

Dentro `ricorrenti.forEach((r) => { ... })`, dopo il blocco
`if (stato === 'attiva' && r.tipo === 'uscita') { ... }`, aggiungi:

```js
    if (termineOrizzonte && stato === 'attiva' && r.tipo === 'uscita') {
      for (let date = oggi.date; date <= termineOrizzonte; date = sommaGiorni(date, 1)) {
        const giorno = getRomeDateParts(new Date(`${date}T12:00:00Z`));
        const { dovuto, periodo } = valutaOccorrenza(r, giorno);
        const occurrenceKey = `${r.id}:${periodo}`;
        // Stessa deduplica per periodo delle altre due finestre: senza di
        // essa una mensile risulterebbe dovuta ogni giorno fino alla data.
        if (!dovuto || eseguiti.has(occurrenceKey) || orizzonteEmesse.has(occurrenceKey)) continue;
        orizzonteEmesse.add(occurrenceKey);
        orizzonteItems.push({
          occurrenceKey,
          dueDate: date,
          amount: toNumber(r.importo),
          description: r.descrizione,
        });
      }
    }
```

Dopo il blocco che carica `programmate`, aggiungi:

```js
  if (termineOrizzonte) {
    const programmateOrizzonte = await ScheduledPayment.findAll({
      where: {
        user_id: userId,
        stato: 'in_attesa',
        tipo: 'uscita',
        data_scadenza: { [Op.between]: [oggi.date, termineOrizzonte] },
      },
      attributes: ['id', 'descrizione', 'importo', 'data_scadenza'],
    });
    programmateOrizzonte.forEach((payment) => orizzonteItems.push({
      occurrenceKey: `programmata:${payment.id}`,
      dueDate: payment.data_scadenza,
      amount: toNumber(payment.importo),
      description: payment.descrizione,
    }));
  }
```

E nel `riepilogo` restituito aggiungi:

```js
    horizon: termineOrizzonte ? {
      through: termineOrizzonte,
      items: orizzonteItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate)
        || a.occurrenceKey.localeCompare(b.occurrenceKey)),
      totalOutflow: round2(orizzonteItems.reduce((sum, item) => sum + item.amount, 0)),
    } : null,
```

- [ ] **Step 4: Esponi la preferenza nel contesto**

In `server/services/financialContext.service.js:521`, dentro `preferences`:

```js
      orizzonteTipo: profilo?.orizzonte_tipo || 'mensile',
      orizzonteData: profilo?.orizzonte_data ? String(profilo.orizzonte_data) : null,
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/pianoSmartRecurringCashFlow.test.js --runInBand`
Expected: PASS.

- [ ] **Step 6: Verifica che i consumatori esistenti non si muovano**

Run: `cd server && npx jest tests/pianoSmartCurrentSituation.test.js tests/pianoSmartSituationContext.test.js tests/pianoSmartV2PlanningContext.test.js --runInBand`
Expected: PASS senza modifiche ai test. Se uno cambia esito, la proiezione non
è additiva: correggi l'implementazione, non il test.

- [ ] **Step 7: Commit**

```bash
git add server/services/financialContext.service.js server/tests/pianoSmartRecurringCashFlow.test.js
git commit -m "Proietta gli impegni fino a una data senza toccare le finestre esistenti"
```

---

# FASE 4 — Innesto nell'API

**Leggi solo:** `server/services/pianoSmartV2/currentSituation.service.js`,
`server/controllers/pianoSmartV2.controller.js:45-70`,
`server/tests/pianoSmartCurrentSituation.test.js`,
`docs/piano-smart-v2-api-contract.md`.

### Task 4.1: `horizon` nella risposta di `current-situation`

**Files:**
- Modify: `server/services/pianoSmartV2/currentSituation.service.js`
- Modify: `server/controllers/pianoSmartV2.controller.js`
- Modify: `docs/piano-smart-v2-api-contract.md`
- Test: `server/tests/pianoSmartCurrentSituation.test.js`

**Interfaces:**
- Consumes: `calcolaOrizzonte` (Task 2.1), `recurring.horizon` e
  `preferences.orizzonteTipo`/`orizzonteData` (Task 3.1)
- Produces: `GET /api/piano-smart-v2/current-situation` → campo `horizon` con la
  forma restituita da `calcolaOrizzonte`, più `horizon.budgetGiornaliero` come
  stringa decimale come gli altri importi del contratto

- [ ] **Step 1: Scrivi i test che falliscono**

In `server/tests/pianoSmartCurrentSituation.test.js`:

```js
describe('horizon', () => {
  test('in modalita mensile serializza il ciclo del mese senza cambiare i valori storici', () => {
    const situazione = buildCurrentSituation({
      context: contestoBase({ preferences: { orizzonteTipo: 'mensile' } }),
      now: new Date('2026-10-12T12:00:00Z'),
    });
    expect(situazione.horizon.tipo).toBe('mensile');
    expect(situazione.horizon.dataFine).toBe('2026-10-31');
    expect(situazione.horizon.giorni).toBe(situazione.current.remainingDays);
    expect(situazione.horizon.budgetGiornaliero).toBe(situazione.current.dailyLimit);
  });

  test('in modalita data il budget non e limitato dalla spesa media storica', () => {
    const contesto = contestoBase({
      preferences: { orizzonteTipo: 'data', orizzonteData: '2027-02-28' },
      recurringHorizon: { through: '2027-02-28', items: [], totalOutflow: 0 },
    });
    const situazione = buildCurrentSituation({
      context: contesto, now: new Date('2026-10-12T12:00:00Z'),
    });
    expect(situazione.horizon.tipo).toBe('data');
    expect(situazione.horizon.dataFine).toBe('2027-02-28');
    expect(situazione.horizon.giorni).toBe(140);
    expect(situazione.current.dailyLimitBasis).toBe('orizzonte_data');
  });

  test('senza orizzonte proiettato la modalita data non stima', () => {
    const situazione = buildCurrentSituation({
      context: contestoBase({
        preferences: { orizzonteTipo: 'data', orizzonteData: '2027-02-28' },
        recurringHorizon: null,
      }),
      now: new Date('2026-10-12T12:00:00Z'),
    });
    expect(situazione.horizon.stato).toBe('non_stimabile');
  });
});
```

`contestoBase` è l'helper già usato nel file: estendilo per accettare
`preferences` e `recurringHorizon` se non lo fa già, mantenendo i default che
gli altri test danno per scontati.

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `cd server && npx jest tests/pianoSmartCurrentSituation.test.js -t horizon --runInBand`
Expected: FAIL — `situazione.horizon` è `undefined`.

- [ ] **Step 3: Collega l'orizzonte**

In `server/services/pianoSmartV2/currentSituation.service.js`, dopo gli import:

```js
const { calcolaOrizzonte } = require('./orizzonte.service');
```

Dopo il calcolo di `dailyLimit` e `actualDailySpend`, prima del `return`:

```js
  // L'orizzonte. In modalità mensile NON si ricalcola nulla: si serializza il
  // ciclo che questo service ha già misurato, così la pagina può leggere un
  // campo solo in entrambe le modalità senza che i numeri storici cambino.
  // In modalità data il tetto `min(..., spesa_media)` non si applica: la
  // domanda non è quanto si spende di solito, ma quanto si può spendere al
  // giorno perché il capitale arrivi alla data.
  const orizzonteTipo = context.preferences?.orizzonteTipo === 'data'
    && context.preferences?.orizzonteData ? 'data' : 'mensile';
  const horizonCommitments = context.recurring?.horizon;
  const horizon = orizzonteTipo === 'mensile'
    ? {
      tipo: 'mensile',
      dataFine: monthEnd,
      giorni: remainingDays,
      capitaleLibero: money(available),
      // Senza gli obiettivi: nel riepilogo dell'hero quelli sono già una
      // riga a sé, e sommarli qui li mostrerebbe sottratti due volte.
      impegniFinoA: protectedAmount === null || allocated === null ? null
        : money(protectedAmount - allocated),
      budgetGiornaliero: money(dailyLimit),
      stato: dailyLimit === null ? 'non_stimabile' : shortfall > 0 ? 'scoperto' : 'in_rotta',
      mancanti: shortfall > 0 ? money(shortfall) : null,
      dataRaggiungibile: null,
    }
    : (() => {
      const esito = calcolaOrizzonte({
        tipo: 'data',
        dataFine: context.preferences.orizzonteData,
        referenceDate,
        // La base NON è `liquidity.allocatable`: quel campo sottrae già
        // `impegni_pertinenti` (liquidita.service.js:211), e sottrarre poi
        // `impegniFinoA` conterebbe due volte le ricorrenze del periodo
        // corrente. Qui serve il capitale lordo spendibile: saldo ordinario
        // (conti visibili meno i conti speciali, quindi scommesse escluse e
        // fondo di emergenza escluso perché nascosto — Regola 22) meno la
        // liquidità già allocata sugli obiettivi. Gli impegni li sottrae
        // `calcolaOrizzonte`, una volta sola, sull'orizzonte scelto.
        baseCents: liquidity === null || allocated === null ? null
          : cents(context.liquidity.ordinary) - allocated,
        impegniFinoACents: horizonCommitments ? cents(horizonCommitments.totalOutflow) : null,
        ritmoGiornalieroCents: actualDailySpend,
      });
      return {
        ...esito,
        capitaleLibero: money(esito.capitaleLibero),
        impegniFinoA: money(esito.impegniFinoA),
        budgetGiornaliero: money(esito.budgetGiornaliero),
        mancanti: money(esito.mancanti),
      };
    })();
```

Nel `return`, aggiungi `horizon,` accanto a `current` e, dentro `current`,
sostituisci il valore di `dailyLimitBasis` con:

```js
      dailyLimitBasis: orizzonteTipo === 'data' ? 'orizzonte_data'
        : incomeMode === 'irregolare' && averageDailyExpenses !== null
          && marginDailyLimit !== null && averageDailyExpenses < marginDailyLimit
          ? 'spesa_media' : 'margine_mese',
```

- [ ] **Step 4: Fai chiedere al controller la finestra lunga**

In `server/controllers/pianoSmartV2.controller.js`, nella funzione
`currentSituation`, dopo `const financialContext = await getFinancialContext(req.userId);`:

```js
    // La proiezione lunga costa un giro di query in più: la si chiede solo a
    // chi ha scelto un orizzonte a data. `riepilogoRicorrenti` è già
    // esportato, quindi non serve allargare `getFinancialContext`.
    if (financialContext.preferences?.orizzonteTipo === 'data'
      && financialContext.preferences?.orizzonteData) {
      const conOrizzonte = await riepilogoRicorrenti(
        req.userId,
        new Date(financialContext.period.referenceDate),
        financialContext.preferences.orizzonteData,
      );
      financialContext.recurring.horizon = conOrizzonte.horizon;
    }
```

E aggiungi `riepilogoRicorrenti` all'import già presente di
`../services/financialContext.service`.

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/pianoSmartCurrentSituation.test.js tests/pianoSmartV2Api.test.js tests/pianoSmartV2Contract.test.js --runInBand`
Expected: PASS. I test esistenti **non** vanno modificati: in modalità mensile
(default del profilo) il contratto è quello di prima più il campo `horizon`.

- [ ] **Step 6: Documenta il contratto**

In `docs/piano-smart-v2-api-contract.md`, nella sezione di
`GET /current-situation`, aggiungi `horizon` con i suoi campi, i tre valori di
`stato` (`in_rotta`, `scoperto`, `non_stimabile`) e la riga: in modalità
mensile è una serializzazione dei valori già presenti in `current`, in modalità
data è il calcolo di `orizzonte.service.js` e `dailyLimitBasis` vale
`orizzonte_data`.

- [ ] **Step 7: Esegui la suite server completa**

Run: `cd server && npm test`
Expected: PASS. Serve PostgreSQL; la baseline va presa con la suite completa,
non rieseguendo un file.

- [ ] **Step 8: Commit**

```bash
git add server/services/pianoSmartV2/currentSituation.service.js server/controllers/pianoSmartV2.controller.js server/tests/pianoSmartCurrentSituation.test.js docs/piano-smart-v2-api-contract.md
git commit -m "Esponi l'orizzonte di spesa in current-situation"
```

### Task 4.2: Il simulatore parla in giorni di autonomia

**Files:**
- Modify: `server/services/pianoSmartV2/currentSituation.service.js` (`simulatePurchase`)
- Test: `server/tests/pianoSmartCurrentSituation.test.js`

**Interfaces:**
- Consumes: `situation.horizon` (Task 4.1)
- Produces: in `simulatePurchase`, due campi in più — `giorniAutonomiaPersi`
  (int|null) e `dataRaggiungibileAfter` (`'YYYY-MM-DD'`|null)

- [ ] **Step 1: Scrivi il test che fallisce**

```js
test('la simulazione dice quanti giorni di autonomia costa l acquisto', () => {
  const situazione = buildCurrentSituation({
    context: contestoBase({
      preferences: { orizzonteTipo: 'data', orizzonteData: '2027-02-28' },
      recurringHorizon: { through: '2027-02-28', items: [], totalOutflow: 0 },
    }),
    now: new Date('2026-10-12T12:00:00Z'),
  });
  const esito = simulatePurchase(situazione, '300.00');
  expect(esito.giorniAutonomiaPersi).toBeGreaterThan(0);
  expect(esito.dataRaggiungibileAfter < situazione.horizon.dataRaggiungibile).toBe(true);
});

test('senza ritmo osservato non inventa giorni persi', () => {
  const situazione = buildCurrentSituation({
    context: contestoBase({ preferences: { orizzonteTipo: 'mensile' } }),
    now: new Date('2026-10-12T12:00:00Z'),
  });
  const esito = simulatePurchase(situazione, '300.00');
  expect(esito.giorniAutonomiaPersi).toBeNull();
  expect(esito.dataRaggiungibileAfter).toBeNull();
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd server && npx jest tests/pianoSmartCurrentSituation.test.js -t autonomia --runInBand`
Expected: FAIL — `giorniAutonomiaPersi` è `undefined`.

- [ ] **Step 3: Implementa**

In `simulatePurchase`, prima del `return`:

```js
  // Giorni di autonomia persi: la lettura più parlante dell'impatto quando
  // esiste un orizzonte a data. Senza ritmo osservato non si calcola: la
  // percentuale di spendibile resta l'unica cosa che si può dire.
  const ritmo = cents(situation.current?.actualDailySpend);
  const autonomiaPrima = situation.horizon?.dataRaggiungibile ?? null;
  let giorniAutonomiaPersi = null;
  let dataRaggiungibileAfter = null;
  if (autonomiaPrima !== null && Number.isFinite(ritmo) && ritmo > 0) {
    giorniAutonomiaPersi = Math.floor(amount / ritmo);
    dataRaggiungibileAfter = new Date(
      Date.parse(`${autonomiaPrima}T00:00:00Z`) - giorniAutonomiaPersi * 86400000,
    ).toISOString().slice(0, 10);
  }
```

E aggiungi `giorniAutonomiaPersi, dataRaggiungibileAfter,` all'oggetto
restituito.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/pianoSmartCurrentSituation.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/pianoSmartV2/currentSituation.service.js server/tests/pianoSmartCurrentSituation.test.js
git commit -m "Esprimi l'impatto di un acquisto in giorni di autonomia"
```

---

### Task 4.3: Quanti giorni coprirebbe il fondo di emergenza

La spec lo chiede esplicitamente: quando la data non è raggiungibile, una riga
di **sola lettura** dice quanti giorni in più il fondo coprirebbe. Il fondo
**non** entra nel capitale: è informazione, non capitale incluso.

**Files:**
- Modify: `server/services/pianoSmartV2/currentSituation.service.js`
- Test: `server/tests/pianoSmartCurrentSituation.test.js`

**Interfaces:**
- Consumes: `horizon` (Task 4.1), `context.emergencyFund.current`
- Produces: due campi in `horizon` — `fondoDisponibile` (stringa decimale|null)
  e `fondoGiorniAggiuntivi` (int|null)

- [ ] **Step 1: Scrivi i test che falliscono**

```js
describe('fondo di emergenza come informazione', () => {
  const contestoData = (extra = {}) => contestoBase({
    preferences: { orizzonteTipo: 'data', orizzonteData: '2027-02-28' },
    recurringHorizon: { through: '2027-02-28', items: [], totalOutflow: 0 },
    ...extra,
  });

  test('dice quanti giorni in piu coprirebbe il fondo', () => {
    const situazione = buildCurrentSituation({
      context: contestoData({ emergencyFund: { status: 'attivo', current: '900.00' } }),
      now: new Date('2026-10-12T12:00:00Z'),
    });
    const ritmo = Number(situazione.current.actualDailySpend);
    expect(ritmo).toBeGreaterThan(0);
    expect(situazione.horizon.fondoGiorniAggiuntivi)
      .toBe(Math.floor(90000 / Math.round(ritmo * 100)));
  });

  test('senza fondo non promette giorni', () => {
    const situazione = buildCurrentSituation({
      context: contestoData({ emergencyFund: { status: 'assente', current: null } }),
      now: new Date('2026-10-12T12:00:00Z'),
    });
    expect(situazione.horizon.fondoGiorniAggiuntivi).toBeNull();
    expect(situazione.horizon.fondoDisponibile).toBeNull();
  });

  test('il fondo non entra nel capitale libero', () => {
    const senza = buildCurrentSituation({
      context: contestoData({ emergencyFund: { status: 'assente', current: null } }),
      now: new Date('2026-10-12T12:00:00Z'),
    });
    const con = buildCurrentSituation({
      context: contestoData({ emergencyFund: { status: 'attivo', current: '900.00' } }),
      now: new Date('2026-10-12T12:00:00Z'),
    });
    expect(con.horizon.capitaleLibero).toBe(senza.horizon.capitaleLibero);
    expect(con.horizon.budgetGiornaliero).toBe(senza.horizon.budgetGiornaliero);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `cd server && npx jest tests/pianoSmartCurrentSituation.test.js -t "fondo di emergenza come informazione" --runInBand`
Expected: FAIL — `fondoGiorniAggiuntivi` è `undefined`.

- [ ] **Step 3: Implementa**

In `currentSituation.service.js`, nel ramo `tipo === 'data'`, dentro l'oggetto
restituito dalla funzione immediata, aggiungi:

```js
        // Informazione, non capitale: il fondo è un conto nascosto e resta
        // fuori da `baseCents` (Regola 22). Qui diciamo soltanto quanti
        // giorni in più coprirebbe al ritmo attuale, perché chi non arriva
        // alla data scelta deve poterlo sapere senza che l'app decida per lui.
        fondoDisponibile: money(emergencyFundBalance || null),
        fondoGiorniAggiuntivi: emergencyFundBalance && actualDailySpend > 0
          ? Math.floor(emergencyFundBalance / actualDailySpend) : null,
```

Nel ramo `mensile` aggiungi gli stessi due campi a `null`: il contratto deve
avere la stessa forma nelle due modalità.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/pianoSmartCurrentSituation.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/pianoSmartV2/currentSituation.service.js server/tests/pianoSmartCurrentSituation.test.js
git commit -m "Di' quanti giorni coprirebbe il fondo senza includerlo nel capitale"
```

---

# FASE 5 — Hero e selettore dell'orizzonte

**Leggi solo:** `client/src/views/PianoSmartView.vue:403-470` (l'hero attuale),
`client/src/content/glossario.js:1-40`, `client/src/stores/pianoSmart.store.js`,
`client/src/components/piano-smart/PianoSmartGuide.vue`,
`client/tests/vistaValue.test.js`.

### Task 5.1: Le quattro etichette nel glossario

**Files:**
- Modify: `client/src/content/glossario.js`
- Test: `client/tests/pianoSmartContratto.test.js`

**Interfaces:**
- Produces: concetti `budget_giornaliero`, `capitale_libero`,
  `impegni_orizzonte`, `ritmo_attuale` in `GLOSSARIO`

- [ ] **Step 1: Scrivi il test che fallisce**

```js
test('i concetti dell orizzonte hanno etichetta e descrizione', () => {
  ['budget_giornaliero', 'capitale_libero', 'impegni_orizzonte', 'ritmo_attuale']
    .forEach((id) => {
      const concetto = GLOSSARIO[id];
      assert.ok(concetto, `concetto mancante: ${id}`);
      assert.ok(concetto.etichetta && concetto.descrizione, `concetto incompleto: ${id}`);
    });
});

test('nessun concetto si chiama piu Spendibile', () => {
  const etichette = Object.values(GLOSSARIO).map((c) => c.etichetta);
  assert.ok(!etichette.includes('Spendibile'), 'etichetta ritirata ancora presente');
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd client && npm test`
Expected: FAIL, `concetto mancante: budget_giornaliero`.

- [ ] **Step 3: Aggiungi i concetti**

In `client/src/content/glossario.js`, dentro `CONCETTI`:

```js
  {
    id: 'budget_giornaliero',
    etichetta: 'Puoi spendere oggi',
    descrizione:
      'Quanto puoi spendere oggi perché il capitale basti fino al termine che hai scelto. Si ricalcola ogni giorno su quello che ti resta davvero: se ieri hai speso meno, oggi puoi spendere di più.',
    formula: 'capitale libero ÷ giorni rimanenti',
    origine: 'GET /piano-smart-v2/current-situation → horizon.budgetGiornaliero',
    topic: 'orizzonte-di-spesa',
  },
  {
    id: 'capitale_libero',
    etichetta: 'Capitale libero',
    descrizione:
      'I soldi dei conti che puoi davvero distribuire sui giorni: i conti attivi non nascosti, meno quanto hai già accantonato sugli obiettivi e meno gli impegni fino al termine scelto. Il fondo di emergenza non è compreso.',
    formula: 'conti spendibili − obiettivi accantonati − impegni fino al termine',
    origine: 'GET /piano-smart-v2/current-situation → horizon.capitaleLibero',
    topic: 'orizzonte-di-spesa',
  },
  {
    id: 'impegni_orizzonte',
    etichetta: 'Impegni fino al termine',
    descrizione:
      'Le uscite che sai già di dover sostenere entro il termine scelto: ricorrenze e spese programmate. Vengono messe da parte prima di calcolare quanto puoi spendere al giorno, così una bolletta non azzera il budget il giorno in cui scade.',
    formula: 'ricorrenze + spese programmate con scadenza entro il termine',
    origine: 'GET /piano-smart-v2/current-situation → horizon.impegniFinoA',
    topic: 'orizzonte-di-spesa',
  },
  {
    id: 'ritmo_attuale',
    etichetta: 'Ritmo attuale',
    descrizione:
      'Quanto stai spendendo in media al giorno in spese libere, cioè escluse le ricorrenze. Confrontato col budget dice se stai sopra o sotto; da solo non è un limite.',
    formula: 'spese libere del periodo osservato ÷ giorni osservati',
    origine: 'GET /piano-smart-v2/current-situation → current.actualDailySpend',
    topic: 'orizzonte-di-spesa',
  },
```

E togli dal file il concetto la cui etichetta è `Spendibile`, spostando in
`capitale_libero` quello che la sua descrizione diceva di utile. Se altri file
importano quell'`id`, aggiornali nello stesso commit: `grep -rn "<id>" client/src`.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `cd client && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/content/glossario.js client/tests/pianoSmartContratto.test.js
git commit -m "Nomina nel glossario i concetti dell'orizzonte di spesa"
```

### Task 5.2: `OrizzonteSelector.vue`

**Files:**
- Create: `client/src/components/piano-smart/OrizzonteSelector.vue`
- Modify: `client/src/stores/profilo.store.js` (solo se non espone già `updateProfilo`)

**Interfaces:**
- Consumes: `ORIZZONTE_TIPI`, `ETICHETTE_ORIZZONTE`, `ORIZZONTE_MESI_MAX` (Task 1.1)
- Produces: componente con props `{ tipo, dataFine, mesiRiserva, incomeMode, suggerisciData }`
  ed emit `{ cambia: ({ orizzonte_tipo, orizzonte_data, mesi_riserva_piano_smart }) => void }`

- [ ] **Step 1: Scrivi il componente**

```vue
<script setup>
import { computed, ref } from 'vue';
import { ETICHETTE_ORIZZONTE, ORIZZONTE_MESI_MAX } from '@/utils/pianoSmart';

const props = defineProps({
  tipo: { type: String, default: 'mensile' },
  dataFine: { type: String, default: null },
  mesiRiserva: { type: Number, default: 1 },
  // Il giudizio del server sulla stabilità delle entrate diventa una frase
  // visibile, non un criterio che decide in silenzio quali controlli esistono.
  suggerisciData: { type: Boolean, default: false },
  salvataggioInCorso: { type: Boolean, default: false },
});
const emit = defineEmits(['cambia']);

const aperto = ref(false);
const dataScelta = ref(props.dataFine ?? '');

const minima = computed(() => {
  const domani = new Date(Date.now() + 86400000);
  return domani.toISOString().slice(0, 10);
});
const massima = computed(() => {
  const limite = new Date();
  limite.setUTCMonth(limite.getUTCMonth() + ORIZZONTE_MESI_MAX);
  return limite.toISOString().slice(0, 10);
});
const etichettaCorrente = computed(() => (props.tipo === 'data' && props.dataFine
  ? `fino al ${new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${props.dataFine}T12:00:00Z`))}`
  : ETICHETTE_ORIZZONTE.mensile.toLowerCase()));

const scegliMensile = () => {
  emit('cambia', { orizzonte_tipo: 'mensile', orizzonte_data: null });
  aperto.value = false;
};
const scegliData = () => {
  if (!dataScelta.value) return;
  emit('cambia', { orizzonte_tipo: 'data', orizzonte_data: dataScelta.value });
  aperto.value = false;
};
const cambiaMesi = (event) => {
  const months = Number(event.target.value);
  if (Number.isInteger(months) && months >= 1 && months <= 6) {
    emit('cambia', { mesi_riserva_piano_smart: months });
  }
};
</script>

<template>
  <div class="orizzonte">
    <button
      type="button" class="orizzonte__trigger" :aria-expanded="aperto"
      @click="aperto = !aperto"
    >Orizzonte: {{ etichettaCorrente }}</button>

    <div v-if="aperto" class="orizzonte__pannello">
      <p v-if="suggerisciData" class="orizzonte__suggerimento">
        Le tue entrate risultano irregolari negli ultimi tre mesi: l’orizzonte a
        data potrebbe descriverti meglio.
      </p>

      <fieldset class="orizzonte__opzione">
        <legend>{{ ETICHETTE_ORIZZONTE.mensile }}</legend>
        <p>Le tue entrate si rinnovano ogni mese: il budget riparte col mese.</p>
        <label for="orizzonte-mesi">Mesi di spese da proteggere</label>
        <select
          id="orizzonte-mesi" :value="mesiRiserva"
          :disabled="salvataggioInCorso" @change="cambiaMesi"
        >
          <option v-for="m in 6" :key="m" :value="m">{{ m }} {{ m === 1 ? 'mese' : 'mesi' }}</option>
        </select>
        <button
          type="button" :disabled="tipo === 'mensile' || salvataggioInCorso"
          @click="scegliMensile"
        >Usa il ciclo mensile</button>
      </fieldset>

      <fieldset class="orizzonte__opzione">
        <legend>{{ ETICHETTE_ORIZZONTE.data }}</legend>
        <p>Il capitale deve bastare fino al giorno che scegli.</p>
        <label for="orizzonte-data">Fino al</label>
        <input
          id="orizzonte-data" v-model="dataScelta" type="date"
          :min="minima" :max="massima" :disabled="salvataggioInCorso"
        >
        <button
          type="button" :disabled="!dataScelta || salvataggioInCorso"
          @click="scegliData"
        >Usa questa data</button>
      </fieldset>
    </div>
  </div>
</template>
```

Lo stile segue le classi già usate nell'hero: non introdurre un sistema nuovo.

- [ ] **Step 2: Commit**

```bash
git add client/src/components/piano-smart/OrizzonteSelector.vue
git commit -m "Aggiungi il selettore dell'orizzonte di spesa"
```

### Task 5.3: `SituazioneHero.vue` — una risposta, tre numeri, una porta

**Files:**
- Create: `client/src/components/piano-smart/SituazioneHero.vue`
- Modify: `client/src/views/PianoSmartView.vue:407-470` (sostituisci l'hero con il componente)
- Test: nessuna modifica a `client/tests/vistaValue.test.js`: elenca i `.vue`
  con `readdirSync`, quindi i file nuovi entrano da sé nel perimetro sorvegliato

**Interfaces:**
- Consumes: `horizon` dall'API (Task 4.1), `OrizzonteSelector` (Task 5.2),
  `GLOSSARIO` (Task 5.1)
- Produces: componente con props `{ situazione, salvataggioInCorso }` ed emit
  `{ cambiaOrizzonte }` — nessun calcolo proprio

- [ ] **Step 1: Scrivi il componente**

```vue
<script setup>
import { computed } from 'vue';
import WCard from '@/components/common/WCard.vue';
import OrizzonteSelector from '@/components/piano-smart/OrizzonteSelector.vue';
import { GLOSSARIO } from '@/content/glossario';
import { formattaEuro } from '@/utils/pianoSmart';

/**
 * L'hero della situazione: UN numero in cima, tre di supporto, tutto il resto
 * dietro una porta sola.
 *
 * Non calcola niente. Il budget, i giorni, la data raggiungibile e lo stato
 * arrivano da `horizon` (GET /piano-smart-v2/current-situation): questo
 * componente scrive solo le frasi.
 */
const props = defineProps({
  situazione: { type: Object, required: true },
  salvataggioInCorso: { type: Boolean, default: false },
});
defineEmits(['cambiaOrizzonte']);

const h = computed(() => props.situazione.horizon ?? {});
const corrente = computed(() => props.situazione.current ?? {});

const dataLunga = (iso) => (iso
  ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`))
  : null);

const contesto = computed(() => (h.value.tipo === 'data'
  ? `per arrivare al ${dataLunga(h.value.dataFine)} · ${h.value.giorni} giorni`
  : `fino al ${dataLunga(h.value.dataFine)} · ${h.value.giorni} giorni`));

const arrivaPrima = computed(() => h.value.dataRaggiungibile
  && h.value.dataFine && h.value.dataRaggiungibile < h.value.dataFine);

const margine = computed(() => {
  const budget = Number(h.value.budgetGiornaliero);
  const ritmo = Number(corrente.value.actualDailySpend);
  if (!Number.isFinite(budget) || !Number.isFinite(ritmo)) return null;
  return budget - ritmo;
});
</script>

<template>
  <WCard class="situation-hero">
    <p class="hero-kicker">{{ GLOSSARIO.budget_giornaliero.etichetta }}</p>
    <strong class="hero-amount">{{ formattaEuro(h.budgetGiornaliero) }}</strong>
    <p class="hero-context">{{ contesto }}</p>

    <p v-if="h.stato === 'scoperto'" class="shortfall" role="status">
      Gli impegni fino al {{ dataLunga(h.dataFine) }} superano il capitale di
      {{ formattaEuro(h.mancanti) }}.
    </p>
    <p v-else-if="arrivaPrima" class="situation-status situation-status--sopra_il_ritmo" role="status">
      Al ritmo attuale arrivi al {{ dataLunga(h.dataRaggiungibile) }}.
    </p>

    <!-- Sola lettura: il fondo non è compreso nel capitale, lo diciamo solo
         a chi non arriva alla data scelta. -->
    <p v-if="(h.stato === 'scoperto' || arrivaPrima) && h.fondoGiorniAggiuntivi" class="hint">
      Il fondo di emergenza coprirebbe altri {{ h.fondoGiorniAggiuntivi }} giorni
      ({{ formattaEuro(h.fondoDisponibile) }}), ma non è compreso nel budget.
    </p>
    <p v-else-if="h.stato === 'in_rotta'" class="situation-status situation-status--sotto_controllo">
      In rotta.
    </p>
    <p v-else class="muted">
      Serve ancora qualche registrazione per calcolare il budget.
    </p>

    <OrizzonteSelector
      :tipo="h.tipo" :data-fine="h.dataFine"
      :mesi-riserva="corrente.reserveMonths ?? 1"
      :suggerisci-data="corrente.incomeMode === 'irregolare' && h.tipo === 'mensile'"
      :salvataggio-in-corso="salvataggioInCorso"
      @cambia="$emit('cambiaOrizzonte', $event)"
    />

    <div class="situation-grid">
      <div>
        <span>{{ GLOSSARIO.capitale_libero.etichetta }}</span>
        <strong>{{ formattaEuro(h.capitaleLibero) }}</strong>
      </div>
      <div>
        <!-- Etichetta dal glossario (Coding Rule 18), la data concreta accanto. -->
        <span>{{ GLOSSARIO.impegni_orizzonte.etichetta }}</span>
        <strong>{{ formattaEuro(h.impegniFinoA) }}</strong>
        <small>entro il {{ dataLunga(h.dataFine) }}</small>
      </div>
      <div>
        <span>{{ GLOSSARIO.ritmo_attuale.etichetta }}</span>
        <strong>{{ formattaEuro(corrente.actualDailySpend) }}/giorno</strong>
        <small v-if="margine !== null">
          {{ margine >= 0 ? `${formattaEuro(margine)} sotto il budget` : `${formattaEuro(Math.abs(margine))} sopra il budget` }}
        </small>
      </div>
    </div>

    <details class="explanation">
      <summary>Come è calcolato</summary>
      <dl class="hero-breakdown">
        <dt>Liquidità dei conti</dt><dd>{{ formattaEuro(corrente.liquidity) }}</dd>
        <dt>− obiettivi accantonati</dt><dd>{{ formattaEuro(corrente.allocatedToGoals) }}</dd>
        <dt>− {{ GLOSSARIO.impegni_orizzonte.etichetta.toLowerCase() }} ({{ dataLunga(h.dataFine) }})</dt><dd>{{ formattaEuro(h.impegniFinoA) }}</dd>
        <dt>= capitale libero</dt><dd>{{ formattaEuro(h.capitaleLibero) }}</dd>
        <dt>÷ {{ h.giorni }} giorni</dt><dd>{{ formattaEuro(h.budgetGiornaliero) }}/giorno</dd>
      </dl>
      <p>{{ GLOSSARIO.capitale_libero.descrizione }}</p>
      <p v-if="h.tipo === 'data'">
        Il fondo di emergenza non è compreso nel capitale: resta da parte.
      </p>
    </details>
  </WCard>
</template>
```

- [ ] **Step 2: Sostituisci l'hero nella view**

In `client/src/views/PianoSmartView.vue`, rimpiazza il blocco
`<WCard v-if="tab === 'today'" class="situation-hero"> … </WCard>`
(righe 407-470) con:

```vue
        <SituazioneHero
          v-if="tab === 'today'" :situazione="currentSituation"
          :salvataggio-in-corso="salvaMesiRiservaInCorso"
          @cambia-orizzonte="aggiornaOrizzonte"
        />
```

Sostituisci `aggiornaMesiRiserva` con:

```js
const aggiornaOrizzonte = async (payload) => {
  if (salvaMesiRiservaInCorso.value) return;
  salvaMesiRiservaInCorso.value = true;
  try {
    await profiloStore.updateProfilo(payload);
    await store.loadCurrentSituation();
    toast.success('Orizzonte aggiornato.');
  } catch {
    toast.error('Non è stato possibile aggiornare l’orizzonte. Riprova.');
  } finally {
    salvaMesiRiservaInCorso.value = false;
  }
};
```

Togli gli stili dell'hero che si sono spostati nel componente e l'import di
`CircleHelp` se non serve più altrove nel file.

- [ ] **Step 3: Verifica nel browser**

Avvia la preview (`preview_start` con la configurazione del dev server), apri
`/funzionalita/piano-smart`, e controlla: un solo numero in cima, tre numeri di
supporto, il selettore che apre il pannello, nessun errore in console. Il
pannello va provato in entrambe le modalità.

- [ ] **Step 4: Esegui i test del client**

Run: `cd client && npm test && npm run build`
Expected: PASS entrambi.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/piano-smart/SituazioneHero.vue client/src/views/PianoSmartView.vue
git commit -m "Riscrivi l'hero della situazione intorno a un numero solo"
```

---

# FASE 6 — Due pagine, due voci di menu

**Leggi solo:** `client/src/router/routes.js:144-153`,
`client/src/components/layout/AppLayout.vue:113-140`,
`client/src/views/PianoSmartView.vue` (per il taglio).

### Task 6.1: Dividi la view

**Files:**
- Create: `client/src/views/SituazioneView.vue`
- Modify: `client/src/views/PianoSmartView.vue`
- Modify: `client/src/router/routes.js`
- Modify: `client/src/components/layout/AppLayout.vue`
- Modify: `client/src/components/piano-smart/PianoSmartGuide.vue`

**Interfaces:**
- Consumes: tutto quanto prodotto nelle fasi 1-5
- Produces: rotta `funzionalita/situazione` (name `situazione`); la rotta
  `funzionalita/piano-smart` resta e serve il solo wizard

- [ ] **Step 1: Crea `SituazioneView.vue`**

Sposta in questo file, invariati, i tre tab di monitoraggio: l'hero
(`SituazioneHero`), `Prossimi 30 giorni`, `Analisi`, il simulatore «Prima di
spendere», `PianoSmartChangeTimeline`, `PianoSmartCashFlowRadar`,
`PianoSmartGoalsSummary`, `PianoSmartExpenseFunding` e i loro stili. Il `tab`
locale resta con i tre valori `today`/`upcoming`/`analysis`; la voce `plans`
sparisce da qui. **Il simulatore va collocato subito sotto l'hero**, non dopo la
previsione di fine mese (spec, sezione interfaccia).

- [ ] **Step 2: Riduci `PianoSmartView.vue` al wizard**

Resta: `pianoMode` (`create`/`history`), gli step 1-3, l'analisi evoluta V2, lo
storico, il dettaglio e l'eliminazione. Spariscono il `tab` e tutto ciò che
legge `currentSituation`. Se `store.loadCurrentSituation()` non serve più qui,
togli la chiamata da `onMounted`.

- [ ] **Step 3: Aggiungi la rotta e il redirect**

In `client/src/router/routes.js`, prima della voce `funzionalita/piano-smart`:

```js
      {
        path: 'funzionalita/situazione',
        name: 'situazione',
        component: () => import('@/views/SituazioneView.vue'),
      },
```

E in fondo all'elenco delle rotte figlie, per non rompere link e segnalibri
(Coding Rule 14):

```js
      {
        // La pagina era una sola fino all'ottobre 2026: chi arriva da un
        // vecchio link cercava il monitoraggio, non il wizard.
        path: 'funzionalita/piano-smart/situazione',
        redirect: { name: 'situazione' },
      },
```

- [ ] **Step 4: Due voci di menu**

In `client/src/components/layout/AppLayout.vue`, in `navItems` sostituisci la
voce singola con:

```js
    { path: '/funzionalita/situazione', icon: NAV_ICON_MAP.pianoSmart, label: 'La tua situazione' },
    { path: '/funzionalita/piano-smart', icon: NAV_ICON_MAP.pianoSmart, label: 'Piano Smart' },
```

E in `mobileNav` (riga 135) punta la voce a `/funzionalita/situazione` con
label `Situazione`: è la pagina che si apre più spesso. Se `NAV_ICON_MAP` non ha
un'icona distinta per le due voci, usa la stessa: due icone nuove non sono in
perimetro.

- [ ] **Step 5: Aggiorna la guida**

In `PianoSmartGuide.vue`, nella sezione `cos-e`, scrivi che sono due cose
distinte: «La tua situazione» risponde a *come sto e quanto posso spendere*,
«Piano Smart» a *è arrivata una somma, come la divido*. Nella stessa sezione
spiega le due modalità di orizzonte in due frasi.

- [ ] **Step 6: Verifica nel browser**

Entrambe le voci di menu, entrambe le pagine, il redirect, il wizard che salva
un piano, nessun errore in console. Prova il passaggio da ciclo mensile a data e
viceversa.

- [ ] **Step 7: Esegui tutti i test**

Run: `cd client && npm test && npm run build`
Run: `cd server && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/views/SituazioneView.vue client/src/views/PianoSmartView.vue client/src/router/routes.js client/src/components/layout/AppLayout.vue client/src/components/piano-smart/PianoSmartGuide.vue
git commit -m "Separa il monitoraggio dal wizard in due pagine"
```

### Task 6.2: Allinea CLAUDE.md e la documentazione

**Files:**
- Modify: `CLAUDE.md` (Regola 21 e la tabella delle aree sensibili)
- Modify: `docs/API.md`

- [ ] **Step 1: Aggiorna la Regola 21**

Aggiungi in coda alla Regola 21 un paragrafo: l'orizzonte di spesa è una
preferenza dell'utente (`orizzonte_tipo`, `orizzonte_data` su
`profili_utente`), il calcolo sta in `services/pianoSmartV2/orizzonte.service.js`
in centesimi interi, in modalità mensile `currentSituation` serializza i valori
che già calcola e **non** li ricalcola, il fondo di emergenza resta fuori dal
capitale perché è un conto nascosto (Regola 22) e per questo nessun calcolo di
liquidità è stato toccato. Il tetto `min(..., spesa_media)` vale solo in
modalità mensile.

- [ ] **Step 2: Aggiorna il conteggio degli endpoint e la riga di `docs/API.md`**

Nessuna rotta nuova: `current-situation` cresce di un campo. Verifica che il
conteggio in `CLAUDE.md` resti corretto e aggiungi `horizon` alla descrizione
della rotta in `docs/API.md`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/API.md
git commit -m "Documenta l'orizzonte di spesa nel manuale operativo"
```

---

## Ordine, dipendenze, token

- Le fasi **1 → 2 → 3 → 4 → 5 → 6** sono in ordine di dipendenza: ognuna
  compila e passa i test da sola.
- 1 e 2 sono **indipendenti fra loro**: possono girare in parallelo in due
  sessioni.
- 5 richiede 4 (legge `horizon`); 6 richiede 5 (sposta `SituazioneHero`).
- Ogni fase dichiara i soli file da leggere: una sessione nuova non deve
  esplorare il repository per eseguirla.

## Prima del push su `main`

1. `cd server && npm test` e `cd client && npm test && npm run build` verdi.
2. **`npm run migrate:production` su Supabase**, prima del push: in produzione
   le migrazioni non girano all'avvio e il modello dichiara due colonne nuove.
3. Verifica con un profilo reale che `orizzonte_tipo` sia `'mensile'` di default
   e che la pagina mostri gli stessi numeri di prima per chi non sceglie nulla.
