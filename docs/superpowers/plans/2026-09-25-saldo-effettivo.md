# Saldo effettivo, conti nascosti e spese programmate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Affiancare al Patrimonio totale un **Saldo effettivo** (quanto è davvero spendibile), reso possibile da due cose nuove: i conti nascosti e le spese occasionali programmate.

**Architecture:** Il saldo effettivo non è un calcolo nuovo: è `server/services/liquidita.service.js` esteso, che resta l'unico punto in cui si decide cosa è spendibile (Regola 20 del CLAUDE.md). `GET /conti/patrimonio` lo espone delegando a quel servizio, così la home riceve i due numeri in una sola chiamata e non possono divergere. Le spese programmate sono ricorrenze con frequenza `una_tantum` e una data: il cron esistente le addebita una volta sola e poi le chiude.

**Tech Stack:** Node 22 + Express 5 + Sequelize 6 su PostgreSQL; Jest + supertest lato server; Vue 3 `<script setup>` + Pinia + `node:test` lato client.

**Spec:** `docs/superpowers/specs/2026-09-25-saldo-effettivo-design.md`

## Global Constraints

- Messaggi e etichette utente **in italiano**, codice e identificatori in inglese/italiano come nel file che si tocca.
- Ogni etichetta di concetto finanziario mostrata all'utente va in `client/src/content/glossario.js`, mai scritta in linea (Coding Rule 18).
- Le letture dall'API negli store passano da `creaRisorsa`; un errore non azzera mai i dati già ottenuti; gli stati vuoti vanno nello slot `vuoto` di `DataState` (Coding Rule 17).
- Il saldo effettivo si calcola **solo** in `server/services/liquidita.service.js`. Nessun controller ricalcola nulla (Regola 20).
- Importi: `round2` (`Math.round(v * 100) / 100`), come già fa il servizio.
- Orizzonte spese programmate: `ricorrente_data <= oggi + 30 giorni`, **comprese quelle con data passata e non ancora addebitate**.
- Fuso orario: le date "di oggi" vengono da `getRomeDateParts` (`ricorrenti.service.js`), mai da `new Date()` del processo (su Vercel è UTC).
- Test backend: `cd server && npx jest <file>` (serve PostgreSQL locale, `TEST_DATABASE_URL` in `server/.env`). Test client: `cd client && npm test`.
- Commit in italiano, prefisso `feat:` / `fix:` / `test:` / `docs:`, con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` in coda.

---

## File Structure

**Server — modificati**
- `migrations/20260925000033-add-nascosto-e-spese-programmate.js` (nuovo) — le due colonne.
- `models/Conto.js` — campo `nascosto`.
- `models/Movimento.js` — campo `ricorrente_data`, valore `una_tantum` nell'ENUM dichiarato.
- `services/ricorrenti.service.js` — `una_tantum` fra le frequenze supportate, `periodoPerRicorrenza` esportata, occorrenza e chiusura del promemoria.
- `services/liquidita.service.js` — conti nascosti, spese programmate, `saldo_effettivo`, fine dell'N+1.
- `controllers/conti.controller.js` — `nascosto` in create/update, `saldo_effettivo` in `getPatrimonioTotale`.
- `middleware/validation.middleware.js` — `nascosto`, `una_tantum`, `ricorrente_data`.

**Server — test nuovi**
- `tests/saldoEffettivo.test.js` — schema, conti nascosti, spese programmate, endpoint.
- `tests/ricorrenti.test.js` (esistente) — blocco nuovo per `una_tantum`.
- `tests/liquidita.test.js` (esistente) — invarianza dei campi già pubblicati.

**Client**
- `src/utils/ricorrenti.js` — `una_tantum`, `ordinaProssimeSpese`.
- `src/content/glossario.js`, `src/content/helpTopics.js` — concetto e aiuto.
- `src/stores/conti.store.js` — `saldoEffettivo`, `saldoEffettivoDettaglio`.
- `src/components/custom/WOverviewCarousel.vue` — riga saldo effettivo.
- `src/components/dashboard/ProssimeSpese.vue` (nuovo) — la card.
- `src/views/DashboardView.vue` — montaggio card e props.
- `src/views/ContiView.vue` — switch "Nascondi" e badge.
- `src/components/ricorrenti/RicorrenteForm.vue`, `RicorrenteItem.vue` — "Una tantum".
- `tests/ricorrenti.test.js` (esistente) — ordinamento della card.

---

### Task 1: Colonne nuove e modelli

**Files:**
- Create: `server/migrations/20260925000033-add-nascosto-e-spese-programmate.js`
- Modify: `server/models/Conto.js`, `server/models/Movimento.js`
- Test: `server/tests/saldoEffettivo.test.js` (nuovo)

**Interfaces:**
- Consumes: niente.
- Produces: `Conto.nascosto` (BOOLEAN, default `false`, mai null); `Movimento.ricorrente_data` (DATEONLY nullable, letta come stringa `'YYYY-MM-DD'`); il valore `'una_tantum'` ammesso in `Movimento.ricorrente_frequenza`.

**Contesto verificato (non ri-verificare):** `movimenti.ricorrente_frequenza` è `varchar(20)` nel database reale, non un ENUM Postgres — quindi nessun `ALTER TYPE` serve. `movimenti.ricorrenza_periodo` è `varchar(10)`, giusto per `YYYY-MM-DD`.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `server/tests/saldoEffettivo.test.js`:

```js
// Schema e semantica di base delle due colonne introdotte dal saldo effettivo:
// conti.nascosto (un conto che resta nel patrimonio ma non fra i soldi
// spendibili) e movimenti.ricorrente_data (la data di una spesa programmata
// una tantum).
const { registerUser, createApp, Conto, Movimento } = require('./setup');

describe('Colonne del saldo effettivo', () => {
  let userId;
  let conto;

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('un conto nasce visibile: nascosto è false, mai null', async () => {
    expect(conto.nascosto).toBe(false);
  });

  it('un conto può essere nascosto e resta tale dopo il reload', async () => {
    await conto.update({ nascosto: true });
    const riletto = await Conto.findByPk(conto.id);
    expect(riletto.nascosto).toBe(true);
  });

  it('una spesa programmata salva frequenza una_tantum e la sua data', async () => {
    const spesa = await Movimento.create({
      user_id: userId,
      conto_id: conto.id,
      tipo: 'uscita',
      importo: 300,
      categoria: 'altro_uscita',
      descrizione: 'Concerto',
      data: '2026-09-25',
      ricorrente: true,
      ricorrente_frequenza: 'una_tantum',
      ricorrente_data: '2026-10-10',
    });
    const riletta = await Movimento.findByPk(spesa.id);
    expect(riletta.ricorrente_frequenza).toBe('una_tantum');
    expect(riletta.ricorrente_data).toBe('2026-10-10');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd server && npx jest tests/saldoEffettivo.test.js`
Expected: FAIL — `nascosto` è `undefined` e la `Movimento.create` con `ricorrente_data` fallisce (colonna inesistente).

- [ ] **Step 3: Scrivi la migrazione**

Crea `server/migrations/20260925000033-add-nascosto-e-spese-programmate.js`:

```js
'use strict';

module.exports = {
  async up(q, S) {
    const conti = await q.describeTable('conti');
    if (!conti.nascosto) {
      // I conti storici sono tutti spendibili: nascondere è una scelta
      // esplicita, mai un default.
      await q.addColumn('conti', 'nascosto', {
        type: S.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }

    const movimenti = await q.describeTable('movimenti');
    if (!movimenti.ricorrente_data) {
      // Data dell'addebito unico: ha senso solo con
      // ricorrente_frequenza = 'una_tantum'. ricorrente_frequenza è
      // varchar(20), non un ENUM Postgres: il valore nuovo non richiede
      // nessuna modifica di tipo.
      await q.addColumn('movimenti', 'ricorrente_data', {
        type: S.DATEONLY, allowNull: true,
      });
    }
  },
  async down(q) {
    const conti = await q.describeTable('conti');
    if (conti.nascosto) await q.removeColumn('conti', 'nascosto');
    const movimenti = await q.describeTable('movimenti');
    if (movimenti.ricorrente_data) await q.removeColumn('movimenti', 'ricorrente_data');
  },
};
```

- [ ] **Step 4: Aggiorna i modelli**

In `server/models/Conto.js`, dopo il campo `attivo`:

```js
  nascosto: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
```

In `server/models/Movimento.js`, cambia `ricorrente_frequenza` e aggiungi `ricorrente_data` subito dopo `ricorrente_mese`:

```js
  ricorrente_frequenza: {
    type: DataTypes.ENUM('giornaliera', 'settimanale', 'mensile', 'annuale', 'una_tantum'),
    allowNull: true,
  },
```

```js
  // Data dell'addebito per le spese programmate (ricorrente_frequenza =
  // 'una_tantum'). Per le altre frequenze resta null: la schedulazione
  // vive in ricorrente_giorno/ricorrente_mese.
  ricorrente_data: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
```

- [ ] **Step 5: Esegui il test e verifica che passi**

Run: `cd server && npx jest tests/saldoEffettivo.test.js`
Expected: PASS (3 test). Il setup dei test applica le migrazioni al database `wallt_test`.

- [ ] **Step 6: Commit**

```bash
git add server/migrations/20260925000033-add-nascosto-e-spese-programmate.js server/models/Conto.js server/models/Movimento.js server/tests/saldoEffettivo.test.js
git commit -m "feat: colonne conti.nascosto e movimenti.ricorrente_data"
```

---

### Task 2: Saldo effettivo e conti nascosti nella liquidità

**Files:**
- Modify: `server/services/liquidita.service.js`
- Test: `server/tests/saldoEffettivo.test.js`, `server/tests/liquidita.test.js`

**Interfaces:**
- Consumes: `Conto.nascosto` (Task 1).
- Produces: `calcolaLiquidita(userId, { data, transaction })` restituisce, in aggiunta ai campi attuali, `saldo_conti_nascosti` (number) e `saldo_effettivo` (number). `saldo_conti` e `liquidita_libera` mantengono il significato di oggi (tutti i conti attivi); `liquidita_allocabile` esclude da ora i conti nascosti.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in coda a `server/tests/saldoEffettivo.test.js`, dentro un nuovo `describe`:

```js
const { Obiettivo } = require('../models');
const { calcolaLiquidita } = require('../services/liquidita.service');

describe('Saldo effettivo: conti nascosti', () => {
  let userId;

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    await Conto.create({
      user_id: userId, nome: 'Quotidiano', tipo: 'banca', saldo: 1000, attivo: true,
    });
    await Conto.create({
      user_id: userId, nome: 'Risparmi', tipo: 'risparmio', saldo: 5000, attivo: true, nascosto: true,
    });
  });

  it('il conto nascosto resta nel saldo conti ma esce dal saldo effettivo', async () => {
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.saldo_conti).toBe(6000);
    expect(r.saldo_conti_nascosti).toBe(5000);
    expect(r.saldo_effettivo).toBe(1000);
  });

  it('un obiettivo non completato abbassa il saldo effettivo', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 800, importo_attuale: 200, completato: false,
    });
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.saldo_effettivo).toBe(800);
  });

  it('i conti nascosti escono anche dal capitale allocabile di Piano Smart', async () => {
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.liquidita_allocabile).toBe(1000);
    // liquidita_libera conserva il significato di prima: tutti i conti attivi.
    expect(r.liquidita_libera).toBe(6000);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd server && npx jest tests/saldoEffettivo.test.js -t 'conti nascosti'`
Expected: FAIL — `saldo_effettivo` e `saldo_conti_nascosti` sono `undefined`.

- [ ] **Step 3: Implementa**

In `server/services/liquidita.service.js`, sostituisci il blocco che calcola i saldi dei conti:

```js
  const conti = await Conto.findAll({ where: { user_id: userId, attivo: true }, transaction });
  const saldo_conti = round2(conti.reduce((sum, c) => sum + toNumber(c.saldo), 0));
  const saldo_conti_speciali = round2(
    conti.filter((c) => c.tipo === 'scommesse').reduce((sum, c) => sum + toNumber(c.saldo), 0),
  );
  const saldo_ordinario = round2(saldo_conti - saldo_conti_speciali);
```

con:

```js
  const conti = await Conto.findAll({ where: { user_id: userId, attivo: true }, transaction });
  const saldo_conti = round2(conti.reduce((sum, c) => sum + toNumber(c.saldo), 0));

  // Un conto nascosto resta nel patrimonio (è denaro dell'utente) ma esce da
  // tutto ciò che significa "spendibile": è la sola differenza fra
  // saldo_conti e saldo_conti_visibili.
  const contiVisibili = conti.filter((c) => !c.nascosto);
  const saldo_conti_nascosti = round2(
    conti.filter((c) => c.nascosto).reduce((sum, c) => sum + toNumber(c.saldo), 0),
  );
  const saldo_conti_visibili = round2(saldo_conti - saldo_conti_nascosti);

  // I conti speciali si contano solo fra i visibili: un conto scommesse
  // nascosto è già stato tolto sopra, sottrarlo due volte falserebbe
  // saldo_ordinario.
  const saldo_conti_speciali = round2(
    contiVisibili.filter((c) => c.tipo === 'scommesse').reduce((sum, c) => sum + toNumber(c.saldo), 0),
  );
  const saldo_ordinario = round2(saldo_conti_visibili - saldo_conti_speciali);
```

e nel blocco finale aggiungi il saldo effettivo accanto agli altri risultati:

```js
  const liquidita_libera = round2(saldo_conti - liquidita_allocata - impegni_pertinenti);
  const liquidita_allocabile = round2(saldo_ordinario - liquidita_allocata - impegni_pertinenti);
  // Quanto l'utente può spendere davvero: i conti che considera spendibili,
  // meno il denaro già promesso a un obiettivo e le uscite già note.
  const saldo_effettivo = round2(saldo_conti_visibili - liquidita_allocata - impegni_pertinenti);
```

Aggiungi `saldo_conti_nascosti`, `saldo_conti_visibili` e `saldo_effettivo` all'oggetto restituito.

Aggiorna il commento in testa alla funzione: `saldo_conti` e `liquidita_libera` restano su tutti i conti attivi (significato invariato per chi già li consuma), mentre `saldo_ordinario`, `liquidita_allocabile` e `saldo_effettivo` partono dai soli conti visibili. Nota esplicita: `liquidita_allocabile` alimenta `liquidity.allocatable` in `financialContext.service.js`, quindi da qui in poi Piano Smart non propone più di distribuire il denaro di un conto nascosto.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/saldoEffettivo.test.js tests/liquidita.test.js`
Expected: PASS. `liquidita.test.js` deve passare **senza modifiche**: è la prova che i campi già pubblicati non hanno cambiato significato.

- [ ] **Step 5: Commit**

```bash
git add server/services/liquidita.service.js server/tests/saldoEffettivo.test.js
git commit -m "feat: saldo effettivo e conti nascosti in liquidita.service"
```

---

### Task 3: Le spese programmate diventano impegni (e via l'N+1)

**Files:**
- Modify: `server/services/ricorrenti.service.js`, `server/services/liquidita.service.js`
- Test: `server/tests/saldoEffettivo.test.js`

**Interfaces:**
- Consumes: `Movimento.ricorrente_data` (Task 1), `saldo_effettivo` (Task 2).
- Produces: `periodoPerRicorrenza(movimento, current) -> string | null` esportata da `ricorrenti.service.js`; `'una_tantum'` presente in `FREQUENZE_SUPPORTATE`; ogni voce di `impegni` ha ora `tipo` (`'ricorrente' | 'programmata'`) e `data` (`'YYYY-MM-DD'` per le programmate, `null` per le altre).

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in `server/tests/saldoEffettivo.test.js`:

```js
describe('Saldo effettivo: spese programmate', () => {
  let userId;
  let conto;

  const programmata = (data, importo = 300) => Movimento.create({
    user_id: userId,
    conto_id: conto.id,
    tipo: 'uscita',
    importo,
    categoria: 'altro_uscita',
    descrizione: 'Concerto',
    data: '2026-09-25',
    ricorrente: true,
    stato_ricorrenza: 'attiva',
    ricorrente_frequenza: 'una_tantum',
    ricorrente_data: data,
  });

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('una spesa programmata entro 30 giorni abbassa il saldo effettivo', async () => {
    await programmata('2026-10-10');
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.impegni_pertinenti).toBe(300);
    expect(r.saldo_effettivo).toBe(700);
    expect(r.impegni[0].tipo).toBe('programmata');
    expect(r.impegni[0].data).toBe('2026-10-10');
  });

  it('una spesa programmata oltre 30 giorni non pesa ancora', async () => {
    await programmata('2026-12-01');
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.impegni_pertinenti).toBe(0);
    expect(r.saldo_effettivo).toBe(1000);
  });

  it('una spesa programmata con data passata e mai addebitata pesa comunque', async () => {
    await programmata('2026-09-20');
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.saldo_effettivo).toBe(700);
  });

  it('una spesa programmata già addebitata non pesa due volte', async () => {
    const spesa = await programmata('2026-10-10');
    await Movimento.create({
      user_id: userId,
      conto_id: conto.id,
      tipo: 'uscita',
      importo: 300,
      categoria: 'altro_uscita',
      descrizione: 'Concerto (automatico)',
      data: '2026-10-10',
      ricorrente: false,
      ricorrenza_origine_id: spesa.id,
      ricorrenza_periodo: '2026-10-10',
    });
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.impegni_pertinenti).toBe(0);
  });

  it('una spesa programmata terminata non blocca più denaro', async () => {
    const spesa = await programmata('2026-10-10');
    await spesa.update({ stato_ricorrenza: 'terminata' });
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.saldo_effettivo).toBe(1000);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd server && npx jest tests/saldoEffettivo.test.js -t 'spese programmate'`
Expected: FAIL — le spese `una_tantum` non entrano fra gli impegni (`impegni_pertinenti` resta 0 nel primo test).

- [ ] **Step 3: Estendi `ricorrenti.service.js`**

```js
const FREQUENZE_SUPPORTATE = ['mensile', 'settimanale', 'annuale', 'una_tantum'];
```

Aggiungi, subito dopo `periodoPerFrequenza`:

```js
/**
 * Chiave di deduplica di una singola ricorrenza. Per le frequenze
 * periodiche è il periodo corrente; per una spesa programmata è la sua
 * data, che è già una chiave unica di per sé (si addebita una volta sola).
 * Sta qui e non in liquidita.service.js perché il cron e la liquidità
 * devono usare la stessa chiave per costruzione: se divergessero, la
 * liquidità sottrarrebbe uscite già addebitate.
 */
const periodoPerRicorrenza = (movimento, current) => (
  movimento.ricorrente_frequenza === 'una_tantum'
    ? (movimento.ricorrente_data || null)
    : periodoPerFrequenza(movimento.ricorrente_frequenza, current)
);
```

Esporta `periodoPerRicorrenza` insieme agli altri simboli già esportati dal file.

- [ ] **Step 4: Riscrivi il blocco impegni di `liquidita.service.js`**

Sostituisci il `for` con la `findOne` per ogni ricorrente con:

```js
  const ricorrenti = await Movimento.findAll({
    where: {
      user_id: userId,
      tipo: 'uscita',
      ...whereRicorrenzaAttiva(),
      ricorrente_frequenza: { [Op.in]: FREQUENZE_SUPPORTATE },
    },
    transaction,
  });

  // Orizzonte delle spese programmate: 30 giorni avanti, nessun limite
  // indietro. Una data già passata e mai addebitata è l'impegno più certo
  // che esista, ed è il caso per cui il saldo effettivo è stato scritto.
  const limiteProgrammate = new Date(`${current.date}T00:00:00Z`);
  limiteProgrammate.setUTCDate(limiteProgrammate.getUTCDate() + GIORNI_ORIZZONTE_PROGRAMMATE);
  const limiteProgrammateISO = limiteProgrammate.toISOString().slice(0, 10);

  const candidati = ricorrenti
    .map((r) => ({ movimento: r, periodo: periodoPerRicorrenza(r, current) }))
    .filter(({ movimento, periodo }) => {
      if (!periodo) return false;
      if (movimento.ricorrente_frequenza !== 'una_tantum') return true;
      return movimento.ricorrente_data <= limiteProgrammateISO;
    });

  // Una sola query invece di una per ricorrenza: questo servizio entra in
  // GET /conti/patrimonio, che si apre a ogni visita della dashboard.
  // La coppia (origine, periodo) viene poi verificata esattamente sul Set:
  // il prodotto incrociato della IN non può produrre falsi positivi.
  const eseguiti = candidati.length
    ? await Movimento.findAll({
      where: {
        ricorrenza_origine_id: { [Op.in]: candidati.map((c) => c.movimento.id) },
        ricorrenza_periodo: { [Op.in]: candidati.map((c) => c.periodo) },
      },
      attributes: ['ricorrenza_origine_id', 'ricorrenza_periodo'],
      transaction,
    })
    : [];
  const giaEseguiti = new Set(
    eseguiti.map((e) => `${e.ricorrenza_origine_id}|${e.ricorrenza_periodo}`),
  );

  const impegni = candidati
    .filter(({ movimento, periodo }) => !giaEseguiti.has(`${movimento.id}|${periodo}`))
    .map(({ movimento }) => ({
      movimento_id: movimento.id,
      categoria: movimento.categoria,
      importo: round2(toNumber(movimento.importo)),
      giorno: movimento.ricorrente_giorno || 1,
      tipo: movimento.ricorrente_frequenza === 'una_tantum' ? 'programmata' : 'ricorrente',
      data: movimento.ricorrente_frequenza === 'una_tantum' ? movimento.ricorrente_data : null,
    }));
```

In testa al file aggiungi la costante e l'import:

```js
const GIORNI_ORIZZONTE_PROGRAMMATE = 30;
```

```js
const {
  getRomeDateParts, FREQUENZE_SUPPORTATE, periodoPerFrequenza, periodoPerRicorrenza,
  whereRicorrenzaAttiva,
} = require('./ricorrenti.service');
```

Se `periodoPerFrequenza` non è più usato direttamente nel file, toglilo dall'import.

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/saldoEffettivo.test.js tests/liquidita.test.js tests/financialContext.test.js`
Expected: PASS su tutte e tre.

- [ ] **Step 6: Commit**

```bash
git add server/services/ricorrenti.service.js server/services/liquidita.service.js server/tests/saldoEffettivo.test.js
git commit -m "feat: spese programmate fra gli impegni della liquidita"
```

---

### Task 4: Il cron addebita e chiude le spese programmate

**Files:**
- Modify: `server/services/ricorrenti.service.js`
- Test: `server/tests/ricorrenti.test.js`

**Interfaces:**
- Consumes: `periodoPerRicorrenza` (Task 3).
- Produces: `processaRicorrenti(now)` addebita una spesa `una_tantum` quando `oggi >= ricorrente_data` e porta il promemoria a `stato_ricorrenza: 'terminata'` nella stessa transazione del movimento.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in coda a `server/tests/ricorrenti.test.js` (dentro il `describe` esistente, riusando `conto` e `userId` del `beforeEach`):

```js
  const creaProgrammata = (overrides = {}) => Movimento.create({
    user_id: userId,
    conto_id: conto.id,
    tipo: 'uscita',
    importo: 300,
    categoria: 'altro_uscita',
    descrizione: 'Concerto',
    data: '2026-03-01',
    ricorrente: true,
    ricorrente_frequenza: 'una_tantum',
    ricorrente_data: '2026-03-15',
    ...overrides,
  });

  const conOggi = async (anno, meseZeroBased, giorno, fn) => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] })
      .setSystemTime(new Date(anno, meseZeroBased, giorno));
    try { return await fn(); } finally { jest.useRealTimers(); }
  };

  it('addebita la spesa programmata alla sua data e chiude il promemoria', async () => {
    const spesa = await creaProgrammata();

    await conOggi(2026, 2, 15, () => processaRicorrenti());

    const generato = await Movimento.findOne({ where: { ricorrenza_origine_id: spesa.id } });
    expect(generato).not.toBeNull();
    expect(generato.ricorrenza_periodo).toBe('2026-03-15');
    expect(Number(generato.importo)).toBe(300);

    await conto.reload();
    expect(Number(conto.saldo)).toBe(700);

    await spesa.reload();
    expect(spesa.stato_ricorrenza).toBe('terminata');
  });

  it('non addebita prima della data programmata', async () => {
    const spesa = await creaProgrammata();

    await conOggi(2026, 2, 14, () => processaRicorrenti());

    const generato = await Movimento.findOne({ where: { ricorrenza_origine_id: spesa.id } });
    expect(generato).toBeNull();
    await conto.reload();
    expect(Number(conto.saldo)).toBe(1000);
  });

  it('recupera una data saltata invece di perderla', async () => {
    const spesa = await creaProgrammata();

    await conOggi(2026, 2, 20, () => processaRicorrenti());

    const generati = await Movimento.findAll({ where: { ricorrenza_origine_id: spesa.id } });
    expect(generati).toHaveLength(1);
    expect(generati[0].ricorrenza_periodo).toBe('2026-03-15');
  });

  it('non addebita due volte se il job gira di nuovo', async () => {
    const spesa = await creaProgrammata();

    await conOggi(2026, 2, 15, async () => {
      await processaRicorrenti();
      await processaRicorrenti();
    });

    const generati = await Movimento.findAll({ where: { ricorrenza_origine_id: spesa.id } });
    expect(generati).toHaveLength(1);
    await conto.reload();
    expect(Number(conto.saldo)).toBe(700);
  });
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd server && npx jest tests/ricorrenti.test.js -t 'programmata'`
Expected: FAIL — nessun movimento generato: `valutaOccorrenza` non conosce `una_tantum`.

- [ ] **Step 3: Implementa l'occorrenza**

In `server/services/ricorrenti.service.js`, dentro `valutaOccorrenza`, **prima** dei rami esistenti:

```js
  // Una spesa programmata è dovuta dal suo giorno in poi, non solo quel
  // giorno: se il cron non gira (deploy, downtime) viene recuperata al
  // passaggio successivo invece di sparire in silenzio. L'indice unico
  // (ricorrenza_origine_id, ricorrenza_periodo) garantisce che avvenga una
  // volta sola.
  if (movimento.ricorrente_frequenza === 'una_tantum') {
    const data = movimento.ricorrente_data;
    return { dovuto: Boolean(data) && current.date >= data, periodo: data || null };
  }
```

Il confronto fra stringhe `YYYY-MM-DD` è ordinato come le date: nessuna conversione serve.

- [ ] **Step 4: Chiudi il promemoria dopo l'addebito**

In `runProcessaRicorrenti`, dentro la transazione, subito dopo la `Movimento.create(...)` e prima di `return 'processed'`:

```js
        // Una spesa programmata si esegue una volta sola: chiuderla qui,
        // nella stessa transazione del movimento, la toglie dagli impegni
        // della liquidità (whereRicorrenzaAttiva la esclude) senza lasciare
        // una riga che continua a bloccare denaro già speso.
        if (origine.ricorrente_frequenza === 'una_tantum') {
          origine.stato_ricorrenza = 'terminata';
          await origine.save({ transaction });
        }
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/ricorrenti.test.js tests/cron.test.js tests/saldoEffettivo.test.js`
Expected: PASS su tutte e tre.

- [ ] **Step 6: Commit**

```bash
git add server/services/ricorrenti.service.js server/tests/ricorrenti.test.js
git commit -m "feat: il cron addebita e chiude le spese programmate una tantum"
```

---

### Task 5: Validazione di `una_tantum` e `ricorrente_data`

**Files:**
- Modify: `server/middleware/validation.middleware.js`
- Test: `server/tests/saldoEffettivo.test.js`

**Interfaces:**
- Consumes: niente dalle task precedenti (solo il valore `'una_tantum'`).
- Produces: `POST /api/movimenti` e `PUT /api/movimenti/:id` accettano `ricorrente_frequenza: 'una_tantum'` con `ricorrente_data` obbligatoria; rifiutano `ricorrente_data` con le altre frequenze; rifiutano in creazione una data passata.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in `server/tests/saldoEffettivo.test.js`:

```js
const { request, authHeader } = require('./setup');

describe('Validazione delle spese programmate', () => {
  let app;
  let token;
  let conto;

  const corpo = (extra) => ({
    conto_id: conto.id,
    tipo: 'uscita',
    importo: 300,
    categoria: 'altro_uscita',
    descrizione: 'Concerto',
    data: '2026-09-25',
    ricorrente: true,
    ...extra,
  });

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    conto = await Conto.create({
      user_id: res.body.user.id, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('accetta una spesa programmata con la sua data', async () => {
    const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const res = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'una_tantum', ricorrente_data: domani }));
    expect(res.status).toBe(201);
    expect(res.body.movimento.ricorrente_data).toBe(domani);
  });

  it('rifiuta una spesa programmata senza data', async () => {
    const res = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'una_tantum' }));
    expect(res.status).toBe(400);
  });

  it('rifiuta una data programmata su una frequenza periodica', async () => {
    const res = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'mensile', ricorrente_giorno: 5, ricorrente_data: '2026-10-10' }));
    expect(res.status).toBe(400);
  });

  it('rifiuta una spesa programmata nel passato', async () => {
    const res = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'una_tantum', ricorrente_data: '2020-01-01' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd server && npx jest tests/saldoEffettivo.test.js -t 'Validazione delle spese programmate'`
Expected: FAIL — il primo test riceve 400 (`'una_tantum'` non è in `isIn`).

- [ ] **Step 3: Implementa**

In `server/middleware/validation.middleware.js`, in **entrambe** le catene (`validateMovimento` e `validateUpdateMovimento`) cambia la frequenza ammessa:

```js
  body('ricorrente_frequenza')
    .optional({ values: 'null' })
    .isIn(['mensile', 'settimanale', 'annuale', 'una_tantum'])
    .withMessage('Frequenza ricorrente non valida')
    .custom((value, { req }) => {
      if (value === 'una_tantum' && !req.body.ricorrente_data) {
        throw new Error('Una spesa programmata deve avere una data');
      }
      return true;
    }),
```

e aggiungi in entrambe, dopo `ricorrente_mese`:

```js
  // La data vale solo per le spese programmate: accettarla su una frequenza
  // periodica significherebbe salvare un campo che nessuno leggerà mai.
  body('ricorrente_data')
    .optional({ values: 'null' })
    .isISO8601({ strict: true })
    .withMessage('Data della spesa programmata non valida')
    .custom((value, { req }) => {
      if (req.body.ricorrente_frequenza !== 'una_tantum') {
        throw new Error('La data si usa solo con una spesa programmata');
      }
      return true;
    }),
```

Solo in `validateMovimento` (la creazione), incatena anche il divieto di data passata:

```js
    .custom((value) => {
      const oggi = new Date().toISOString().slice(0, 10);
      if (value < oggi) throw new Error('La data della spesa programmata è già passata');
      return true;
    }),
```

In modifica la data passata resta ammessa: serve a correggere un promemoria che il cron non ha ancora chiuso.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/saldoEffettivo.test.js tests/movimentiFiltri.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/middleware/validation.middleware.js server/tests/saldoEffettivo.test.js
git commit -m "feat: validazione delle spese programmate una tantum"
```

---

### Task 6: `nascosto` nell'API dei conti

**Files:**
- Modify: `server/controllers/conti.controller.js`, `server/middleware/validation.middleware.js`
- Test: `server/tests/saldoEffettivo.test.js`

**Interfaces:**
- Consumes: `Conto.nascosto` (Task 1).
- Produces: `POST /api/conti` accetta `nascosto` (default `false`); `PUT /api/conti/:id` lo aggiorna; `GET /api/conti` lo restituisce su ogni conto.

- [ ] **Step 1: Scrivi il test che fallisce**

```js
describe('API conti: nascondi conto', () => {
  let app;
  let token;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
  });

  it('crea un conto nascosto e lo restituisce come tale', async () => {
    const creato = await request(app).post('/api/conti').set(authHeader(token))
      .send({ nome: 'Risparmi', tipo: 'risparmio', saldo_iniziale: 500, nascosto: true });
    expect(creato.status).toBe(201);
    expect(creato.body.conto.nascosto).toBe(true);

    const elenco = await request(app).get('/api/conti').set(authHeader(token));
    expect(elenco.body.conti.find((c) => c.nome === 'Risparmi').nascosto).toBe(true);
  });

  it('nasconde e riespone un conto esistente', async () => {
    const creato = await request(app).post('/api/conti').set(authHeader(token))
      .send({ nome: 'Quotidiano', tipo: 'banca', saldo_iniziale: 100 });
    const id = creato.body.conto.id;
    expect(creato.body.conto.nascosto).toBe(false);

    const nascosto = await request(app).put(`/api/conti/${id}`).set(authHeader(token))
      .send({ nascosto: true });
    expect(nascosto.status).toBe(200);
    expect(nascosto.body.conto.nascosto).toBe(true);

    const riesposto = await request(app).put(`/api/conti/${id}`).set(authHeader(token))
      .send({ nascosto: false });
    expect(riesposto.body.conto.nascosto).toBe(false);
  });

  it('rifiuta un valore non booleano', async () => {
    const res = await request(app).post('/api/conti').set(authHeader(token))
      .send({ nome: 'Strano', tipo: 'banca', nascosto: 'forse' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd server && npx jest tests/saldoEffettivo.test.js -t 'nascondi conto'`
Expected: FAIL — `nascosto` torna `false` dopo la creazione con `true` (il campo viene ignorato).

- [ ] **Step 3: Implementa**

In `server/middleware/validation.middleware.js`, aggiungi a `validateConto` **e** a `validateUpdateConto`:

```js
  body('nascosto')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('Valore non valido per il conto nascosto'),
```

In `server/controllers/conti.controller.js`, in `createConto` aggiungi `nascosto = false` al destructuring di `req.body` e passalo sia al ramo che riattiva un conto inattivo sia alla `Conto.create`.

In `updateConto`, accanto agli altri campi opzionali:

```js
    if (nascosto !== undefined) updateData.nascosto = nascosto;
```

(aggiungendo `nascosto` al destructuring di `req.body` poco sopra).

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/saldoEffettivo.test.js tests/isolation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/controllers/conti.controller.js server/middleware/validation.middleware.js server/tests/saldoEffettivo.test.js
git commit -m "feat: campo nascosto nell'API dei conti"
```

---

### Task 7: `saldo_effettivo` in `GET /conti/patrimonio`

**Files:**
- Modify: `server/controllers/conti.controller.js:210-254`
- Test: `server/tests/saldoEffettivo.test.js`

**Interfaces:**
- Consumes: `calcolaLiquidita` con `saldo_effettivo` (Task 2, 3).
- Produces: la risposta di `GET /api/conti/patrimonio` guadagna `saldo_effettivo` (number) e `saldo_effettivo_dettaglio: { conti_visibili, conti_nascosti, obiettivi, impegni }`. Tutti i campi esistenti restano invariati.

- [ ] **Step 1: Scrivi il test che fallisce**

```js
describe('GET /conti/patrimonio: saldo effettivo', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
  });

  it('espone il saldo effettivo accanto al patrimonio, con il suo dettaglio', async () => {
    await Conto.create({ user_id: userId, nome: 'Quotidiano', tipo: 'banca', saldo: 1000, attivo: true });
    await Conto.create({ user_id: userId, nome: 'Risparmi', tipo: 'risparmio', saldo: 5000, attivo: true, nascosto: true });
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 800, importo_attuale: 200, completato: false,
    });

    const res = await request(app).get('/api/conti/patrimonio').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.totale).toBe(6000);
    expect(res.body.saldo_effettivo).toBe(800);
    expect(res.body.saldo_effettivo_dettaglio).toEqual({
      conti_visibili: 1000,
      conti_nascosti: 5000,
      obiettivi: 200,
      impegni: 0,
    });
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd server && npx jest tests/saldoEffettivo.test.js -t 'saldo effettivo accanto al patrimonio'`
Expected: FAIL — `saldo_effettivo` è `undefined`.

- [ ] **Step 3: Implementa**

In `getPatrimonioTotale`, calcola la liquidità insieme al patrimonio (non in sequenza) e aggiungi i due campi alla risposta:

```js
    const [{
      patrimonio_conti: totaleConti, patrimonio_investimenti: totaleInvestimenti,
      patrimonio_totale: totale, passivita_totale, patrimonio_netto,
    }, liquidita] = await Promise.all([
      calcolaPatrimonioNetto(req.userId),
      calcolaLiquidita(req.userId),
    ]);
```

e nel `res.json`, dopo `patrimonio_netto`:

```js
      // Il saldo effettivo NON viene ricalcolato qui: arriva da
      // liquidita.service.js, unico punto in cui si decide cosa è
      // spendibile (Regola 20). Viaggia insieme al patrimonio perché la
      // home li mostra uno sotto l'altro: due chiamate separate potrebbero
      // arrivare disallineate.
      saldo_effettivo: liquidita.saldo_effettivo,
      saldo_effettivo_dettaglio: {
        conti_visibili: liquidita.saldo_conti_visibili,
        conti_nascosti: liquidita.saldo_conti_nascosti,
        obiettivi: liquidita.liquidita_allocata,
        impegni: liquidita.impegni_pertinenti,
      },
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `cd server && npx jest tests/saldoEffettivo.test.js tests/financialConsistency.test.js`
Expected: PASS.

- [ ] **Step 5: Aggiorna la documentazione API**

In `docs/API.md`, nella riga di `GET /conti/patrimonio`, aggiungi i due campi nuovi alla descrizione della risposta.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/conti.controller.js server/tests/saldoEffettivo.test.js docs/API.md
git commit -m "feat: GET /conti/patrimonio espone il saldo effettivo"
```

---

### Task 8: Il saldo effettivo in home

**Files:**
- Modify: `client/src/stores/conti.store.js`, `client/src/content/glossario.js`, `client/src/content/helpTopics.js`, `client/src/components/custom/WOverviewCarousel.vue`, `client/src/views/DashboardView.vue`
- Test: `client/tests/glossario.test.js` e `client/tests/contrasto.test.js` (esistenti, devono continuare a passare)

**Interfaces:**
- Consumes: `saldo_effettivo` e `saldo_effettivo_dettaglio` da `GET /conti/patrimonio` (Task 7).
- Produces: `contiStore.saldoEffettivo` (number | null) e `contiStore.saldoEffettivoDettaglio` (object | null); `WOverviewCarousel` accetta le props `saldoEffettivo` (Number, default null) e `saldoEffettivoDettaglio` (Object, default null).

- [ ] **Step 1: Aggiungi il concetto al glossario**

In `client/src/content/glossario.js`, dentro `CONCETTI`, subito dopo `patrimonio_totale`:

```js
  {
    id: 'saldo_effettivo',
    etichetta: 'Saldo effettivo',
    descrizione:
      'Quanto puoi spendere davvero: i saldi dei conti che non hai nascosto, meno il denaro già destinato agli obiettivi e le spese che hai in arrivo.',
    formula: 'conti non nascosti − obiettivi non completati − impegni in arrivo',
    origine: 'GET /conti/patrimonio → saldo_effettivo',
    topic: 'saldo-effettivo-come-si-calcola',
  },
```

- [ ] **Step 2: Aggiungi il topic di aiuto**

In `client/src/content/helpTopics.js`, seguendo la forma degli altri topic, aggiungi `saldo-effettivo-come-si-calcola`: spiega che il patrimonio dice quanto possiedi e il saldo effettivo quanto puoi spendere; che un conto nascosto resta nel patrimonio ma esce dal saldo effettivo; che i soldi già messi su un obiettivo non sono liberi; che le ricorrenti del mese e le spese programmate entro 30 giorni sono già scalate anche se non ancora addebitate.

- [ ] **Step 3: Esponi i valori nello store**

In `client/src/stores/conti.store.js`, dopo `composizionePatrimonio`:

```js
  /**
   * Quanto è davvero spendibile. Arriva dallo stesso endpoint del
   * patrimonio, quindi i due numeri che la home mostra uno sotto l'altro
   * non possono riferirsi a momenti diversi. `null` finché la risposta non
   * c'è: non esiste un fallback sensato: dire "0" sarebbe un'informazione
   * falsa, dire il patrimonio sarebbe peggio.
   */
  const saldoEffettivo = computed(() => risorsaPatrimonio.data.value?.saldo_effettivo ?? null);
  const saldoEffettivoDettaglio = computed(
    () => risorsaPatrimonio.data.value?.saldo_effettivo_dettaglio ?? null,
  );
```

Aggiungili al `return` dello store.

- [ ] **Step 4: Mostra la riga nella slide Patrimonio**

In `client/src/components/custom/WOverviewCarousel.vue` aggiungi le props:

```js
  saldoEffettivo: { type: Number, default: null },
  saldoEffettivoDettaglio: { type: Object, default: null },
```

e nel template, subito dopo il blocco `w-overview__composizione`:

```html
            <div v-if="saldoEffettivo !== null" class="w-overview__effettivo">
              <p class="w-overview__effettivo-label">
                {{ etichetta('saldo_effettivo') }}
                <HelpTrigger topic="saldo-effettivo-come-si-calcola" variant="quiet" />
              </p>
              <p class="w-overview__effettivo-amount tabular-nums">{{ formatValuta(saldoEffettivo) }}</p>
              <p v-if="saldoEffettivoDettaglio" class="w-overview__effettivo-detail">
                <!-- Il perché della differenza col patrimonio: senza, il
                     numero più basso sembra un errore. -->
                <span v-if="saldoEffettivoDettaglio.conti_nascosti">
                  − {{ formatValuta(saldoEffettivoDettaglio.conti_nascosti) }} nascosti
                </span>
                <span v-if="saldoEffettivoDettaglio.obiettivi">
                  − {{ formatValuta(saldoEffettivoDettaglio.obiettivi) }} su obiettivi
                </span>
                <span v-if="saldoEffettivoDettaglio.impegni">
                  − {{ formatValuta(saldoEffettivoDettaglio.impegni) }} impegni
                </span>
              </p>
            </div>
```

Stili: `--text-sm` per l'importo, `--text-xs` per il dettaglio (mai sotto il pavimento tipografico), colori solo da token esistenti di `variables.css` — `client/tests/contrasto.test.js` e `client/tests/tipografia.test.js` falliscono se si introduce un colore o una dimensione fuori regola.

- [ ] **Step 5: Passa le props dalla dashboard**

In `client/src/views/DashboardView.vue`, sul `<WOverviewCarousel>`, accanto a `:patrimonio`:

```html
      :saldo-effettivo="contiStore.saldoEffettivo"
      :saldo-effettivo-dettaglio="contiStore.saldoEffettivoDettaglio"
```

- [ ] **Step 6: Esegui i test e la build**

Run: `cd client && npm test && npm run build`
Expected: PASS su tutte le suite; build senza errori.

- [ ] **Step 7: Commit**

```bash
git add client/src/stores/conti.store.js client/src/content/glossario.js client/src/content/helpTopics.js client/src/components/custom/WOverviewCarousel.vue client/src/views/DashboardView.vue
git commit -m "feat: saldo effettivo nella slide patrimonio della home"
```

---

### Task 9: Nascondere un conto dalla pagina Conti

**Files:**
- Modify: `client/src/views/ContiView.vue`
- Test: `cd client && npm test` (suite esistenti) + verifica manuale nel browser

**Interfaces:**
- Consumes: `nascosto` su `POST/PUT /api/conti` (Task 6), `contiStore.updateConto`.
- Produces: niente per le task successive.

- [ ] **Step 1: Porta `nascosto` nel form di modifica**

In `apriModifica`, aggiungi il campo allo stato del form:

```js
  editForm.value = {
    nome: conto.nome, icona: conto.icona, colore: conto.colore,
    saldo: Number(conto.saldo) || 0, nascosto: Boolean(conto.nascosto),
  };
```

e in `salvaModifica`:

```js
    const { nome, icona, colore, saldo, nascosto } = editForm.value;
    await contiStore.updateConto(
      contoEdit.value.id,
      { nome, icona, colore, saldo, nascosto },
      { tipo: contoEdit.value.tipo },
    );
```

Inizializza anche `const editForm = ref({ nome: '', icona: '', colore: '', saldo: 0, nascosto: false });`

- [ ] **Step 2: Aggiungi il controllo nel modale di modifica**

Dentro il modale di modifica, sotto i colori:

```html
        <label class="conto-nascondi">
          <input v-model="editForm.nascosto" type="checkbox">
          <span>
            <strong>Nascondi dal saldo effettivo</strong>
            <small>
              Il conto resta nel patrimonio totale, ma i suoi soldi non contano
              fra quelli che puoi spendere. Utile per un conto di risparmio.
            </small>
          </span>
        </label>
```

- [ ] **Step 3: Mostra il badge sulla card del conto**

Nella `WCard` di ogni conto, accanto al nome:

```html
            <span v-if="conto.nascosto" class="conto-badge-nascosto">Fuori dal saldo effettivo</span>
```

Con uno stile discreto (`--text-xs`, token di colore già esistenti). Serve perché la differenza fra i due numeri della home deve sempre avere una causa visibile nella pagina Conti.

- [ ] **Step 4: Verifica nel browser**

Avvia l'anteprima, apri la pagina Conti, nascondi un conto e controlla in home che il Patrimonio totale non cambi e il Saldo effettivo cali dell'importo di quel conto.

- [ ] **Step 5: Esegui i test e la build**

Run: `cd client && npm test && npm run build`
Expected: PASS, build pulita.

- [ ] **Step 6: Commit**

```bash
git add client/src/views/ContiView.vue
git commit -m "feat: nascondere un conto dal saldo effettivo"
```

---

### Task 10: "Una tantum" nel form delle ricorrenti

**Files:**
- Modify: `client/src/utils/ricorrenti.js`, `client/src/components/ricorrenti/RicorrenteForm.vue`, `client/src/components/ricorrenti/RicorrenteItem.vue`
- Test: `client/tests/ricorrenti.test.js`

**Interfaces:**
- Consumes: l'API di Task 5 (`ricorrente_frequenza: 'una_tantum'` + `ricorrente_data`).
- Produces: `FREQUENZE_VALIDE` include `'una_tantum'`; `presentaRicorrente(movimento, oggi)` restituisce `frequenzaLabel: 'Una tantum'` e `prossimaEsecuzione` uguale a `ricorrente_data` per le spese programmate.

- [ ] **Step 1: Scrivi il test che fallisce**

In `client/tests/ricorrenti.test.js`:

```js
test('una spesa programmata si presenta con la sua data, non con una cadenza', () => {
  const item = presentaRicorrente({
    tipo: 'uscita',
    importo: '300.00',
    descrizione: 'Concerto',
    ricorrente: true,
    stato_ricorrenza: 'attiva',
    ricorrente_frequenza: 'una_tantum',
    ricorrente_data: '2026-10-10',
    conto: { nome: 'Conto' },
  }, dayjs('2026-09-25'));

  assert.equal(item.frequenzaLabel, 'Una tantum');
  assert.equal(item.prossimaEsecuzione, '2026-10-10');
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd client && npm test`
Expected: FAIL — `frequenzaLabel` è `'Ogni mese'`.

- [ ] **Step 3: Implementa in `utils/ricorrenti.js`**

```js
export const FREQUENZE_VALIDE = ['mensile', 'settimanale', 'annuale', 'una_tantum'];
```

```js
const FREQUENZA_LABELS = {
  mensile: 'Ogni mese',
  settimanale: 'Ogni settimana',
  annuale: 'Ogni anno',
  una_tantum: 'Una tantum',
};
```

In `calcolaProssimaEsecuzione`, come primo ramo:

```js
  // Una spesa programmata non ha una cadenza da proiettare: la sua data è
  // già scritta.
  if (movimento.ricorrente_frequenza === 'una_tantum') {
    return movimento.ricorrente_data ? dayjs(movimento.ricorrente_data) : oggi;
  }
```

- [ ] **Step 4: Aggiungi la scelta nel form**

In `RicorrenteForm.vue`: aggiungi `ricorrente_data: null` allo stato iniziale del form, in `resetForm` e nella copia dal `props.movimento` (`ricorrente_data: props.movimento.ricorrente_data || null`).

Nel `<select>` della frequenza aggiungi `<option value="una_tantum">Una tantum (data precisa)</option>`.

Sostituisci il selettore del giorno quando la frequenza è `una_tantum`:

```html
            <input
              v-if="form.ricorrente_frequenza === 'una_tantum'"
              v-model="form.ricorrente_data" type="date" class="form-input"
              :min="oggiISO"
            >
```

con `const oggiISO = dayjs().format('YYYY-MM-DD');`.

In `buildPayload`, tieni i campi coerenti fra loro — il backend rifiuta le combinazioni miste:

```js
const buildPayload = () => {
  const payload = { ...form.value, ricorrente: true };
  if (payload.ricorrente_frequenza !== 'annuale') payload.ricorrente_mese = null;
  if (payload.ricorrente_frequenza === 'una_tantum') {
    payload.ricorrente_giorno = null;
  } else {
    payload.ricorrente_data = null;
  }
  if (!isEdit.value) payload.data = dayjs().format('YYYY-MM-DD');
  return payload;
};
```

Estendi `canSave`: con `una_tantum` serve anche la data.

```js
const canSave = computed(() => form.value.importo > 0 && form.value.categoria && form.value.conto_id
  && (form.value.ricorrente_frequenza !== 'una_tantum' || Boolean(form.value.ricorrente_data)));
```

- [ ] **Step 5: Mostra la data nell'elenco**

In `RicorrenteItem.vue`, dove oggi compare `frequenzaLabel`, per le spese programmate mostra la data (`prossimaEsecuzione` formattata) invece di una cadenza. Le voci `terminata` restano visibili come storico: non filtrarle.

- [ ] **Step 6: Esegui i test e la build**

Run: `cd client && npm test && npm run build`
Expected: PASS, build pulita.

- [ ] **Step 7: Commit**

```bash
git add client/src/utils/ricorrenti.js client/src/components/ricorrenti/RicorrenteForm.vue client/src/components/ricorrenti/RicorrenteItem.vue client/tests/ricorrenti.test.js
git commit -m "feat: spese una tantum nel form delle ricorrenti"
```

---

### Task 11: Card "Prossime spese" in home

**Files:**
- Modify: `client/src/utils/ricorrenti.js`, `client/src/views/DashboardView.vue`, `client/src/stores/movimenti.store.js`
- Create: `client/src/components/dashboard/ProssimeSpese.vue`
- Test: `client/tests/ricorrenti.test.js`

**Interfaces:**
- Consumes: `presentaRicorrente` esteso (Task 10), `GET /movimenti/ricorrenti`.
- Produces: `ordinaProssimeSpese(movimenti, oggi) -> Array` — solo uscite attive, spese programmate prima, poi le periodiche per imminenza.

- [ ] **Step 1: Scrivi il test che fallisce**

In `client/tests/ricorrenti.test.js`:

```js
import { ordinaProssimeSpese } from '../src/utils/ricorrenti.js';

const spesa = (extra) => ({
  id: extra.id,
  tipo: 'uscita',
  importo: '50.00',
  descrizione: extra.descrizione || 'Spesa',
  ricorrente: true,
  stato_ricorrenza: 'attiva',
  conto: { nome: 'Conto' },
  ...extra,
});

test('le spese programmate vengono prima delle periodiche, anche se più lontane', () => {
  const oggi = dayjs('2026-09-25');
  const ordinate = ordinaProssimeSpese([
    spesa({ id: 1, ricorrente_frequenza: 'mensile', ricorrente_giorno: 26 }),
    spesa({ id: 2, ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-10-20' }),
  ], oggi);

  assert.deepEqual(ordinate.map((s) => s.id), [2, 1]);
});

test('fra spese dello stesso gruppo vince la più imminente', () => {
  const oggi = dayjs('2026-09-25');
  const ordinate = ordinaProssimeSpese([
    spesa({ id: 1, ricorrente_frequenza: 'annuale', ricorrente_giorno: 1, ricorrente_mese: 12 }),
    spesa({ id: 2, ricorrente_frequenza: 'settimanale', ricorrente_giorno: 6 }),
    spesa({ id: 3, ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-11-01' }),
    spesa({ id: 4, ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-09-30' }),
  ], oggi);

  assert.deepEqual(ordinate.map((s) => s.id), [4, 3, 2, 1]);
});

test('entrate, sospese e terminate restano fuori dalle prossime spese', () => {
  const oggi = dayjs('2026-09-25');
  const ordinate = ordinaProssimeSpese([
    spesa({ id: 1, tipo: 'entrata', ricorrente_frequenza: 'mensile', ricorrente_giorno: 27 }),
    spesa({ id: 2, stato_ricorrenza: 'sospesa', ricorrente_frequenza: 'mensile', ricorrente_giorno: 27 }),
    spesa({ id: 3, stato_ricorrenza: 'terminata', ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-09-26' }),
    spesa({ id: 4, ricorrente_frequenza: 'mensile', ricorrente_giorno: 28 }),
  ], oggi);

  assert.deepEqual(ordinate.map((s) => s.id), [4]);
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `cd client && npm test`
Expected: FAIL — `ordinaProssimeSpese` non è esportata.

- [ ] **Step 3: Implementa l'ordinamento**

In `client/src/utils/ricorrenti.js`:

```js
/**
 * Le prossime spese come le vuole la home: prima quelle programmate (sono
 * eventi singoli e datati, l'utente le ha appuntate proprio per non
 * dimenticarle), poi le periodiche per imminenza. Entrate, sospese e
 * terminate restano fuori: non sono soldi in uscita nei prossimi giorni.
 *
 * Restituisce le voci originali arricchite con `presentazione`, così la
 * card non ricalcola nulla e resta una vista.
 */
export const ordinaProssimeSpese = (movimenti = [], oggi = dayjs()) => (movimenti || [])
  .filter((m) => m.tipo === 'uscita'
    && m.ricorrente
    && (m.stato_ricorrenza || 'attiva') === 'attiva')
  .map((m) => ({ ...m, presentazione: presentaRicorrente(m, oggi) }))
  .sort((a, b) => {
    const gruppo = (m) => (m.ricorrente_frequenza === 'una_tantum' ? 0 : 1);
    if (gruppo(a) !== gruppo(b)) return gruppo(a) - gruppo(b);
    const data = (m) => m.presentazione.prossimaEsecuzione || '9999-12-31';
    return data(a).localeCompare(data(b)) || (a.id - b.id);
  });
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `cd client && npm test`
Expected: PASS.

- [ ] **Step 5: Crea la card**

Crea `client/src/components/dashboard/ProssimeSpese.vue`. Gli stili seguono
`RecentTransactions.vue` (stessa struttura header + lista + `DataState`):
copiane il blocco `<style scoped>` adattando i nomi delle classi.

```vue
<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import DataState from '@/components/common/DataState.vue';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { useValuta } from '@/composables/useValuta';
import { ordinaProssimeSpese } from '@/utils/ricorrenti';
import dayjs from 'dayjs';

/**
 * Le spese che stanno per uscire dal conto. Non ricalcola niente: ordina
 * con `ordinaProssimeSpese` (stessa regola verificata dai test) e mostra le
 * prime quattro. Le programmate vengono prima perche sono eventi singoli e
 * datati: chi le ha appuntate lo ha fatto per non dimenticarle.
 */
const props = defineProps({
  movimenti: { type: Array, default: () => [] },
  stato: { type: String, default: 'pronto' },
  lastUpdated: { type: Number, default: null },
});

const emit = defineEmits(['riprova']);
const router = useRouter();
const { formatValuta } = useValuta();

const MAX_VOCI = 4;

const spese = computed(() => ordinaProssimeSpese(props.movimenti).slice(0, MAX_VOCI));
const totaleSpese = computed(() => ordinaProssimeSpese(props.movimenti).length);

/** "Oggi" / "Domani" / "fra 5 giorni" entro la settimana, poi la data. */
const quando = (spesa) => {
  const data = spesa.presentazione.prossimaEsecuzione;
  if (!data) return '';
  const giorni = dayjs(data).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (giorni <= 0) return 'Oggi';
  if (giorni === 1) return 'Domani';
  if (giorni <= 7) return `fra ${giorni} giorni`;
  return dayjs(data).format('D MMM');
};
</script>

<template>
  <section class="prossime-spese">
    <div class="prossime-spese__header">
      <h2 class="prossime-spese__title">Prossime spese</h2>
      <button type="button" class="prossime-spese__link" @click="router.push('/ricorrenti')">
        Vedi tutte
      </button>
    </div>

    <DataState
      :stato="stato"
      :last-updated="lastUpdated"
      messaggio-errore="Non e stato possibile caricare le prossime spese."
      skeleton-type="text"
      :skeleton-lines="3"
      @riprova="emit('riprova')"
    >
      <template #vuoto>
        <div class="prossime-spese__empty">
          <p class="prossime-spese__empty-title">Nessuna spesa in arrivo</p>
          <p class="prossime-spese__empty-hint">
            Registra una spesa ricorrente o programma una spesa occasionale: comparira
            qui e verra scalata dal saldo effettivo prima ancora di essere addebitata.
          </p>
          <button type="button" class="prossime-spese__manual-link" @click="router.push('/ricorrenti')">
            Vai alle ricorrenti &rarr;
          </button>
        </div>
      </template>

      <div class="prossime-spese__list">
        <div v-for="spesa in spese" :key="spesa.id" class="prossime-spese__item">
          <div class="prossime-spese__avatar">
            <CategoryIcon :movimento="spesa" :size="18" />
          </div>
          <div class="prossime-spese__info">
            <p class="prossime-spese__name">{{ spesa.presentazione.descrizione }}</p>
            <p class="prossime-spese__meta">
              {{ spesa.presentazione.frequenzaLabel }} &middot; {{ spesa.presentazione.contoLabel }}
            </p>
          </div>
          <div class="prossime-spese__amount-wrap">
            <p class="prossime-spese__amount tabular-nums">-{{ formatValuta(spesa.importo) }}</p>
            <p class="prossime-spese__date">{{ quando(spesa) }}</p>
          </div>
        </div>
        <p v-if="totaleSpese > MAX_VOCI" class="prossime-spese__altre">
          e altre {{ totaleSpese - MAX_VOCI }} in programma
        </p>
      </div>
    </DataState>
  </section>
</template>
```

Vincoli da rispettare: lo stato vuoto sta nello **slot `vuoto`** del
`DataState`, mai in un `v-if` fatto a mano (Coding Rule 17); nessun font-size
sotto `--text-xs` senza deroga commentata (`client/tests/tipografia.test.js`);
colori solo da token gia presenti in `variables.css`
(`client/tests/contrasto.test.js`).

- [ ] **Step 6: Montala in dashboard**

In `DashboardView.vue`, fra `WOverviewCarousel` e `RecentTransactions`, con la risorsa dei ricorrenti presa dallo store movimenti (`creaRisorsaRicorrenti` esiste già in `utils/ricorrenti.js`; se lo store non espone ancora una risorsa ricorrenti, aggiungila accanto alle altre seguendo lo stesso schema e includila nel suo `reset()` — vedi Known Issue 9). Caricala in `onMounted` insieme alle altre.

- [ ] **Step 7: Verifica nel browser**

Crea una spesa programmata e una mensile, controlla che la card mostri prima la programmata e che il saldo effettivo in home sia calato dell'importo di entrambe.

- [ ] **Step 8: Esegui i test e la build**

Run: `cd client && npm test && npm run build`
Expected: PASS, build pulita.

- [ ] **Step 9: Commit**

```bash
git add client/src/utils/ricorrenti.js client/src/components/dashboard/ProssimeSpese.vue client/src/views/DashboardView.vue client/src/stores/movimenti.store.js client/tests/ricorrenti.test.js
git commit -m "feat: card delle prossime spese in home"
```

---

### Task 12: Documentazione e chiusura

**Files:**
- Modify: `CLAUDE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/PROJECT_STATUS.md`

**Interfaces:**
- Consumes: tutte le task precedenti.
- Produces: niente codice.

- [ ] **Step 1: Estendi la Regola 20 in `CLAUDE.md`**

Nella regola su patrimonio/liquidità, aggiungi che `liquidita.service.js` calcola anche il **saldo effettivo** (conti non nascosti − obiettivi non completati − impegni), che `Conto.nascosto` significa "fuori da tutto ciò che è spendibile" e vale sia per la home sia per il capitale allocabile di Piano Smart, e che `GET /conti/patrimonio` lo espone **delegando**, senza ricalcolarlo.

- [ ] **Step 2: Aggiungi una regola di business sulle spese programmate**

Sempre in `CLAUDE.md`, accanto alla regola 11 (spese ricorrenti): `ricorrente_frequenza: 'una_tantum'` + `ricorrente_data` è una spesa programmata; il cron la addebita quando `oggi >= ricorrente_data` (recupero incluso) e la chiude portandola a `stato_ricorrenza: 'terminata'` nella stessa transazione; pesa sul saldo effettivo entro 30 giorni.

- [ ] **Step 3: Aggiorna `docs/DATABASE.md`**

Documenta `conti.nascosto` e `movimenti.ricorrente_data`, e aggiorna il conteggio delle migrazioni (da 39 a 40) qui e in `CLAUDE.md`.

- [ ] **Step 4: Aggiorna il conteggio dei test**

In `CLAUDE.md`, Known Issue 7, aggiorna il numero di suite e test backend/frontend con il risultato reale di `npm test`.

- [ ] **Step 5: Esegui l'intera suite**

Run: `cd server && npm test` poi `cd client && npm test && npm run build`
Expected: tutto verde. Riporta i numeri reali nel messaggio finale, senza arrotondare né presumere.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/DATABASE.md docs/API.md docs/PROJECT_STATUS.md
git commit -m "docs: saldo effettivo, conti nascosti e spese programmate"
```

---

## Note per chi esegue

- **La migrazione in produzione non parte da sola**: su Supabase l'auto-migrate è disabilitato quando `NODE_ENV=production`. Va lanciata a mano con `npm run migrate:production`. Va detto all'utente alla fine, non dato per fatto.
- **Non toccare il significato di `saldo_conti` e `liquidita_libera`**: li consumano già altri punti. La verifica è che `tests/liquidita.test.js` passi senza modifiche.
- **Il cron è area sensibile**: crea movimenti e muove saldi. Ogni modifica lì va accompagnata dal test che la dimostra, e la chiusura del promemoria deve stare nella **stessa transazione** dell'addebito.
