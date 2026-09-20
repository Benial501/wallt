# Financial Foundation Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizzare il calcolo del patrimonio, introdurre un modello di liquidità libera/allocata, una classificazione strutturata di essenzialità delle spese, il concetto di fondo di sicurezza, un modello Debiti/Passività e il patrimonio netto — il "Financial Brain" preparatorio a Piano Smart, senza implementare Piano Smart.

**Architecture:** Ogni concetto finanziario vive in un service dedicato sotto `server/services/` (stile esistente: oggetto con funzioni pure esportate, un solo argomento `userId`/opts), riusato dai controller invece che ricalcolato. Nessuna business logic nei controller. Nessuna modifica a file frontend (Vue/router/view/componenti); l'unica eccezione è la rigenerazione meccanica di un asset JSON già generato da uno script esistente (`server/scripts/sync-category-catalog.js`).

**Tech Stack:** Node.js 22+, Express 5, Sequelize 6 + pg (PostgreSQL/Supabase), Jest + Supertest per i test, express-validator per la validazione.

**Spec:** Il brief fornito dall'utente in chat (nessun file spec separato — i 9 task e le regole di business sono riportati integralmente nella sezione Global Constraints e nei singoli task).

## Global Constraints

- **Branch:** `feature/financial-foundation-backend`, creato da `main` aggiornato (verificato: 0 commit di distacco da `origin/main` al momento della creazione).
- **Baseline test (da non peggiorare):** `npm run test:unit` → 10 suite, 65 passed + 1 skipped. `npm test` (richiede PostgreSQL locale) → 38 suite, 467 test passed.
- **Perimetro di proprietà:** `server/models/`, `server/services/`, `server/controllers/`, `server/routes/`, `server/migrations/`, `server/utils/`, `server/tests/`, `server/constants/catalogoCategorie.json`. Vietato: `AppLayout.vue`, router frontend, view/componenti Vue, a meno di stretta necessità per non rompere il progetto — nessun task di questo piano lo richiede.
- **Eccezione unica lato client:** rigenerare `client/src/data/categorie.generated.json` eseguendo lo script esistente `server/scripts/sync-category-catalog.js` dopo aver esteso il catalogo — è un artefatto generato, non codice UI.
- **Non implementare:** Piano Smart, Audit finanziario, Cash Flow Optimizer, Piano Patrimoniale, AI finanziaria, simulazioni, Monte Carlo, `getFinancialContext()` completo, piano di ammortamento avanzato per i debiti, cache prematura, snapshot mensili.
- **Non spostare mai denaro reale tra conti** per modellare "liquidità allocata": è un overlay di sola lettura calcolato a runtime, mai persistito come sottoconto.
- **Non contare due volte lo stesso importo** nella formula di liquidità libera (vedi Task 2 — verificato che `Obiettivo.importo_attuale` oggi è un contatore indipendente, mai sottratto dal saldo dei conti).
- **Lingua:** italiano per messaggi utente/commenti, inglese per identificatori di codice (Coding Rule 7 di `CLAUDE.md`).
- **Naming style dei service:** oggetto con funzioni pure esportate (`module.exports = { fn1, fn2 }`), mai classi — coerente con `budgetStato.service.js`, `confrontoPeriodi.service.js`, `scommesseContoSync.service.js`.
- **Naming style delle migration:** `addColumn`/`createTable` con `STRING` + whitelist applicativa per gli "enum", mai `Sequelize.ENUM` nativo (nessun file esistente lo usa) — coerente con `20260907000016-category-rule-type.js` e con `tipo` in `investimenti`/`categorie_personali`.
- **Ogni nuova tabella user-owned** isola per `where: { user_id: req.userId }` nei controller (l'isolamento in questo repo è applicativo, non tramite FK univoca per utente — verificato su `Obiettivo`).
- **`sequelize` globale ha `define: { timestamps: true, underscored: true }`** (`server/config/database.js`): ogni nuovo model usa `createdAt`/`updatedAt` camelCase in JS, mappati automaticamente su `created_at`/`updated_at` — non serve dichiararlo esplicitamente nei model.
- **Contesto per il branch frontend gemello:** esiste già un worktree `feature/financial-foundation-frontend` (spec: `docs/superpowers/specs/2026-09-17-financial-foundation-frontend-design.md`) che dichiara esplicitamente di NON introdurre UI per essenzialità/fondo sicurezza/debiti "in assenza di un contratto API presente nel branch [backend]", e lista come verifica post-merge: forma/valori del campo essenzialità e suo endpoint di modifica; forma di `tipo_obiettivo`, mesi di copertura e testo esplicativo del fondo sicurezza; endpoint CRUD e forma dati per debiti. Questo piano deve produrre esattamente quei tre contratti in modo stabile e documentato nel report finale.

---

## Struttura dei file

**Creati:**

| File | Responsabilità |
|---|---|
| `server/services/financialSummary.service.js` | Unico calcolo di patrimonio (conti+investimenti), passività (debiti) e patrimonio netto |
| `server/services/liquidita.service.js` | Overlay liquidità libera/allocata/impegni |
| `server/services/essenzialita.service.js` | Aggregazione spese per essenzialità, riusata da Analisi e Fondo Sicurezza |
| `server/services/fondoSicurezza.service.js` | Calcolo mesi di copertura per obiettivi `tipo_obiettivo: 'fondo_sicurezza'` |
| `server/models/Debito.js` | Modello Sequelize dei debiti/passività |
| `server/controllers/debiti.controller.js` | CRUD debiti, isolato per utente |
| `server/routes/debiti.routes.js` | Routing `/api/debiti` |
| `server/migrations/20260917000022-add-essenzialita-categorie-personali.js` | Colonna `essenzialita` su `categorie_personali` |
| `server/migrations/20260917000023-add-tipo-obiettivo.js` | Colonna `tipo_obiettivo` su `obiettivi` |
| `server/migrations/20260917000024-create-debiti.js` | Tabella `debiti` |
| `server/tests/financialSummary.test.js` | Regressione patrimonio centralizzato + patrimonio netto |
| `server/tests/liquidita.test.js` | Liquidità libera/allocata/impegni, doppio conteggio |
| `server/tests/essenzialita.test.js` | Classificazione essenzialità, categorie personali, sostituzione euristica hardcoded |
| `server/tests/fondoSicurezza.test.js` | Mesi di copertura, tutti i casi limite |
| `server/tests/debiti.test.js` | CRUD debiti + isolamento cross-user |
| `server/tests/logSanitization.test.js` | Nuove chiavi finanziarie redatte nei log (se non già coperto da un test esistente — verificato in Task 11) |

**Modificati:**

| File | Motivo |
|---|---|
| `server/controllers/conti.controller.js` | `getConti`, `getPatrimonioTotale` usano il service centralizzato; nuovo `getLiquidita`; `getPatrimonioTotale` espone anche passività/netto |
| `server/controllers/analisi.controller.js` | `getAndamentoPatrimonio` e `getSuggerimenti` usano il service centralizzato; `getSuggerimenti` sostituisce l'euristica hardcoded con `essenzialita.service` |
| `server/controllers/obiettivi.controller.js` | Supporto `tipo_obiettivo`; nuovo `getCopertura` |
| `server/routes/conti.routes.js` | Nuova rotta `GET /conti/liquidita` |
| `server/routes/obiettivi.routes.js` | Nuova rotta `GET /obiettivi/:id/copertura` |
| `server/routes/categorie.routes.js` | `validate()` accetta/valida `essenzialita` per le categorie personali |
| `server/constants/categorie.js` | Nuova costante `ESSENZIALITA_VALUES` |
| `server/constants/catalogoCategorie.json` | Campo `essenzialita` su tutte le 112 voci (94 uscita classificate, 18 entrata → `null`) |
| `server/models/CategoriaPersonale.js` | Campo `essenzialita` |
| `server/models/Obiettivo.js` | Campo `tipo_obiettivo` |
| `server/models/index.js` | Associazioni `User.hasMany(Debito)` / `Debito.belongsTo(User)` / `Debito.belongsTo(Conto)` |
| `server/middleware/validation.middleware.js` | Validators `validateObiettivo`/`validateUpdateObiettivo` (tipo_obiettivo), nuovi `validateDebito`/`validateUpdateDebito`/`validateDeleteDebito` |
| `server/app.js` | Mount `/api/debiti` |
| `server/utils/logger.js` | Nuove chiavi in `FINANCIAL_KEYS` |
| `server/tests/setup.js` | Aggiunta `debiti` a `TABLES` |
| `client/src/data/categorie.generated.json` | Rigenerato meccanicamente da `sync-category-catalog.js` (non editato a mano) |
| `docs/DATABASE.md`, `docs/API.md`, `docs/PROJECT_STATUS.md`, `docs/DECISIONS.md`, `CLAUDE.md` | Correzioni di imprecisioni tecniche verificate (Task 12) — non riscrittura |

---

### Task 1: `FinancialSummaryService` — patrimonio centralizzato

Elimina 4 formule duplicate identiche (`conti.reduce(...) + investimenti.reduce(...)`) in `conti.controller.js` (righe 42-48 e 213-223) e `analisi.controller.js` (righe 196-200 e 393-394, quest'ultima oggi bacata: calcola il patrimonio usando SOLO i conti, senza investimenti — la Regola di business #12 di `CLAUDE.md` dice esplicitamente "conti attivi + investimenti attivi"). Centralizzare corregge anche questo bug.

**Files:**
- Create: `server/services/financialSummary.service.js`
- Test: `server/tests/financialSummary.test.js`
- Modify: `server/controllers/conti.controller.js:42-48`, `server/controllers/conti.controller.js:213-223`
- Modify: `server/controllers/analisi.controller.js:196-200`, `server/controllers/analisi.controller.js:393-394`

**Interfaces:**
- Consumes: modelli `Conto`, `Investimento` da `../models`.
- Produces: `calcolaPatrimonio(userId, { transaction } = {})` → `Promise<{ conti: Conto[], investimenti: Investimento[], patrimonio_conti: number, patrimonio_investimenti: number, patrimonio_totale: number }>`, tutti gli importi arrotondati a 2 decimali. Usata da Task 1 (qui), Task 10 (patrimonio netto).

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `server/tests/financialSummary.test.js`:

```js
// Patrimonio centralizzato: un solo calcolo, usato ovunque allo stesso modo.
// Il difetto che questo test previene: prima esistevano 4 copie della stessa
// formula, e una di queste (getSuggerimenti) dimenticava gli investimenti.
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { Investimento, User, ProfiloUtente } = require('../models');
const { calcolaPatrimonio } = require('../services/financialSummary.service');

const oggi = () => new Date().toISOString().split('T')[0];

describe('FinancialSummaryService.calcolaPatrimonio', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    await User.update({ mostra_investimenti: true }, { where: { id: userId } });
    await ProfiloUtente.upsert({
      user_id: userId, onboarding_completato: true, fascia_eta: '25_34', ha_investimenti: 'si',
    });
  });

  it('somma conti attivi e investimenti attivi, esclude quelli inattivi', async () => {
    await Conto.create({
      user_id: userId, nome: 'Conto attivo', tipo: 'banca', saldo: 1000, attivo: true,
    });
    await Conto.create({
      user_id: userId, nome: 'Conto chiuso', tipo: 'banca', saldo: 500, attivo: false,
    });
    await Investimento.create({
      user_id: userId, nome_piattaforma: 'ETF', tipo: 'etf', saldo_attuale: 300, attivo: true,
    });
    await Investimento.create({
      user_id: userId, nome_piattaforma: 'Vecchio', tipo: 'etf', saldo_attuale: 999, attivo: false,
    });

    const result = await calcolaPatrimonio(userId);

    expect(result.patrimonio_conti).toBe(1000);
    expect(result.patrimonio_investimenti).toBe(300);
    expect(result.patrimonio_totale).toBe(1300);
  });

  it('GET /api/conti, GET /api/conti/patrimonio e GET /api/analisi/andamento-patrimonio concordano', async () => {
    await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 2000, attivo: true,
    });
    await Investimento.create({
      user_id: userId, nome_piattaforma: 'ETF', tipo: 'etf', saldo_attuale: 500, attivo: true,
    });

    const conti = await request(app).get('/api/conti').set(authHeader(token));
    const patrimonio = await request(app).get('/api/conti/patrimonio').set(authHeader(token));
    const andamento = await request(app).get('/api/analisi/andamento-patrimonio').set(authHeader(token));

    expect(conti.body.patrimonio_totale).toBe(2500);
    expect(patrimonio.body.totale).toBe(2500);
    expect(andamento.body.fine).toBe(2500);
  });

  it('REGRESSIONE: GET /api/analisi/suggerimenti calcola il patrimonio con conti+investimenti, non solo conti', async () => {
    const conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
    await Investimento.create({
      user_id: userId, nome_piattaforma: 'ETF', tipo: 'etf', saldo_attuale: 400, attivo: true,
    });
    // Un'entrata questo mese, cosi' il ramo "Patrimonio in crescita" si attiva
    // e riporta il patrimonio nel messaggio.
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'entrata', importo: 50,
      categoria: 'entrata_extra', descrizione: 'test', data: oggi(), ricorrente: false,
    });

    const res = await request(app).get('/api/analisi/suggerimenti').set(authHeader(token));
    const crescita = res.body.suggerimenti.find((s) => s.messaggio?.includes('Patrimonio in crescita'));

    expect(crescita).toBeDefined();
    expect(crescita.dettaglio).toContain('1450');
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
cd server && NODE_ENV=test npx jest tests/financialSummary.test.js --runInBand
```

Atteso: FAIL — `Cannot find module '../services/financialSummary.service'` (il primo test), e il terzo test fallisce comunque perché oggi `getSuggerimenti` non include gli investimenti nel messaggio (`dettaglio` conterrebbe `1000`, non `1450`).

- [ ] **Step 3: Creare il service**

Crea `server/services/financialSummary.service.js`:

```js
const { Conto, Investimento } = require('../models');

const toNumber = (val) => parseFloat(val) || 0;
const round2 = (val) => Math.round(val * 100) / 100;

/**
 * Patrimonio = somma saldi conti attivi + saldo attuale investimenti attivi
 * (Regola di business #12, CLAUDE.md). Unico punto di calcolo: prima esisteva
 * copiato in 4 file, e uno di questi (analisi.controller.js#getSuggerimenti)
 * aveva divergiuto — sommava solo i conti.
 */
async function calcolaPatrimonio(userId, { transaction } = {}) {
  const [conti, investimenti] = await Promise.all([
    Conto.findAll({ where: { user_id: userId, attivo: true }, transaction }),
    Investimento.findAll({ where: { user_id: userId, attivo: true }, transaction }),
  ]);

  const patrimonio_conti = round2(conti.reduce((sum, c) => sum + toNumber(c.saldo), 0));
  const patrimonio_investimenti = round2(investimenti.reduce((sum, i) => sum + toNumber(i.saldo_attuale), 0));
  const patrimonio_totale = round2(patrimonio_conti + patrimonio_investimenti);

  return {
    conti,
    investimenti,
    patrimonio_conti,
    patrimonio_investimenti,
    patrimonio_totale,
  };
}

module.exports = { calcolaPatrimonio, toNumber, round2 };
```

- [ ] **Step 4: Refactorare `conti.controller.js`**

In `server/controllers/conti.controller.js`, aggiungi l'import in testa (dopo la riga 10):

```js
const { calcolaPatrimonio } = require('../services/financialSummary.service');
```

Sostituisci le righe 37-48 di `getConti` (da `const conti = await Conto.findAll` a `const patrimonio_totale = ...`) con:

```js
    const { conti, patrimonio_conti, patrimonio_investimenti, patrimonio_totale } = await calcolaPatrimonio(req.userId);
    conti.sort((a, b) => (a.ordine - b.ordine) || (a.id - b.id));
```

e aggiorna il blocco `res.json` che segue (righe 50-55) usando direttamente `patrimonio_totale`, `patrimonio_conti`, `patrimonio_investimenti` (già arrotondati dal service, quindi togli i `Math.round(...)`):

```js
    res.json({
      conti,
      patrimonio_totale,
      patrimonio_conti,
      patrimonio_investimenti,
    });
```

Nota: `calcolaPatrimonio` non ordina i conti (`Conto.findAll` nel service non ha `order`), quindi il `.sort()` esplicito sopra preserva l'ordine `ordine ASC, id ASC` che l'endpoint restituiva prima.

Sostituisci le righe 213-223 di `getPatrimonioTotale` (da `const conti = await Conto.findAll` a `const totale = totaleConti + totaleInvestimenti;`) con:

```js
    const { patrimonio_conti: totaleConti, patrimonio_investimenti: totaleInvestimenti, patrimonio_totale: totale } = await calcolaPatrimonio(req.userId);
```

- [ ] **Step 5: Refactorare `analisi.controller.js`**

In `server/controllers/analisi.controller.js`, aggiungi l'import (dopo la riga 8):

```js
const { calcolaPatrimonio } = require('../services/financialSummary.service');
```

Sostituisci le righe 196-200 di `getAndamentoPatrimonio` (da `const conti = await Conto.findAll` a `const patrimonioAttuale = patrimonioConti + patrimonioInvestimenti;`) con:

```js
    const { patrimonio_totale: patrimonioAttuale } = await calcolaPatrimonio(req.userId);
```

Sostituisci le righe 393-394 di `getSuggerimenti` (`const conti = await Conto.findAll(...)` e `const patrimonio = conti.reduce(...)`) con:

```js
    const { patrimonio_totale: patrimonio } = await calcolaPatrimonio(req.userId);
```

- [ ] **Step 6: Eseguire il test e verificare che passi**

```bash
cd server && NODE_ENV=test npx jest tests/financialSummary.test.js --runInBand
```

Atteso: PASS, 3 test verdi.

- [ ] **Step 7: Eseguire la suite completa per verificare che non ci siano regressioni**

```bash
cd server && npm test
```

Atteso: nessun test rosso rispetto alla baseline (467 + 3 = 470 passed).

- [ ] **Step 8: Commit**

```bash
git add server/services/financialSummary.service.js server/tests/financialSummary.test.js server/controllers/conti.controller.js server/controllers/analisi.controller.js
git commit -m "feat(finance): centralize financial summary calculations

Introduce FinancialSummaryService.calcolaPatrimonio(userId) as the
single source of truth for patrimonio (conti attivi + investimenti
attivi), replacing 4 duplicated reduce() formulas across
conti.controller.js and analisi.controller.js. Fixes a divergence in
getSuggerimenti, which previously summed only conti, ignoring
investimenti."
```

---

### Task 2: `liquidita.service.js` — liquidità libera/allocata/impegni

Modello "overlay virtuale": nessun sottoconto persistito, nessun movimento di denaro reale. `liquidità allocata` legge gli `Obiettivo.importo_attuale` attivi (oggi un contatore indipendente dal saldo dei conti — verificato in fase di ricerca: `Obiettivo` non ha `conto_id`, `addContributo` non tocca `Conto.saldo` né crea `Movimento`). `impegni pertinenti` riusa il meccanismo di spese ricorrenti già esistente (`Movimento.ricorrente=true, ricorrente_frequenza='mensile'`): un movimento ricorrente di tipo `uscita` il cui `ricorrente_giorno` non è ancora passato questo mese, e che il cron non ha ancora eseguito per il periodo corrente, è denaro che uscirà comunque entro fine mese.

**Files:**
- Create: `server/services/liquidita.service.js`
- Test: `server/tests/liquidita.test.js`
- Modify: `server/controllers/conti.controller.js` (nuovo `getLiquidita`)
- Modify: `server/routes/conti.routes.js`

**Interfaces:**
- Consumes: `Conto`, `Obiettivo`, `Movimento` da `../models`.
- Produces: `calcolaLiquidita(userId, { data } = {})` → `Promise<{ saldo_conti: number, liquidita_allocata: number, impegni_pertinenti: number, liquidita_libera: number, obiettivi_allocati: Array<{id, nome, importo_attuale}>, impegni: Array<{movimento_id, categoria, importo, giorno}> }>`. `GET /api/conti/liquidita`.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `server/tests/liquidita.test.js`:

```js
// Liquidità libera = saldo conti attivi - liquidità allocata (obiettivi
// attivi) - impegni pertinenti (ricorrenti mensili non ancora eseguiti).
// Nessun sottoconto reale: e' un overlay di sola lettura sullo stesso saldo.
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { Obiettivo } = require('../models');
const { calcolaLiquidita } = require('../services/liquidita.service');

describe('LiquiditaService.calcolaLiquidita', () => {
  let app;
  let token;
  let userId;
  let conto;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('senza obiettivi né ricorrenti, la liquidità libera coincide col saldo conti', async () => {
    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.saldo_conti).toBe(1000);
    expect(result.liquidita_allocata).toBe(0);
    expect(result.impegni_pertinenti).toBe(0);
    expect(result.liquidita_libera).toBe(1000);
  });

  it('un obiettivo attivo riduce la liquidità libera del suo importo_attuale, uno completato no', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 500, importo_attuale: 200, completato: false,
    });
    await Obiettivo.create({
      user_id: userId, nome: 'Fatto', importo_target: 100, importo_attuale: 100, completato: true,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.liquidita_allocata).toBe(200);
    expect(result.liquidita_libera).toBe(800);
    expect(result.obiettivi_allocati).toHaveLength(1);
    expect(result.obiettivi_allocati[0].nome).toBe('Vacanza');
  });

  it('un ricorrente mensile non ancora scaduto questo mese conta come impegno', async () => {
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto', data: '2026-01-01', ricorrente: true, ricorrente_frequenza: 'mensile',
      ricorrente_giorno: 25,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.impegni_pertinenti).toBe(300);
    expect(result.liquidita_libera).toBe(700);
  });

  it('un ricorrente già eseguito questo mese non viene contato due volte', async () => {
    const ricorrente = await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto', data: '2026-01-01', ricorrente: true, ricorrente_frequenza: 'mensile',
      ricorrente_giorno: 10,
    });
    // Simula l'esecuzione del cron per il periodo corrente.
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto (automatico)', data: '2026-09-10', ricorrente: false,
      ricorrenza_origine_id: ricorrente.id, ricorrenza_periodo: '2026-09',
    });
    await conto.update({ saldo: 700 }); // il saldo riflette gia' l'addebito

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.saldo_conti).toBe(700);
    expect(result.impegni_pertinenti).toBe(0);
    expect(result.liquidita_libera).toBe(700);
  });

  it('un ricorrente il cui giorno è già passato questo mese, ma non ancora eseguito, resta un impegno', async () => {
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto', data: '2026-01-01', ricorrente: true, ricorrente_frequenza: 'mensile',
      ricorrente_giorno: 5,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    // Il cron non l'ha ancora eseguito (nessun Movimento con ricorrenza_periodo
    // '2026-09'): resta un impegno anche se il giorno target è passato, perché
    // il saldo del conto non riflette ancora l'addebito.
    expect(result.impegni_pertinenti).toBe(300);
  });

  it('GET /api/conti/liquidita espone lo stesso risultato del service', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 500, importo_attuale: 150, completato: false,
    });
    const res = await request(app).get('/api/conti/liquidita').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.saldo_conti).toBe(1000);
    expect(res.body.liquidita_allocata).toBe(150);
    expect(res.body.liquidita_libera).toBe(850);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
cd server && NODE_ENV=test npx jest tests/liquidita.test.js --runInBand
```

Atteso: FAIL — `Cannot find module '../services/liquidita.service'`.

- [ ] **Step 3: Creare il service**

Crea `server/services/liquidita.service.js`:

```js
const { Conto, Obiettivo, Movimento } = require('../models');
const { Op } = require('sequelize');

const toNumber = (val) => parseFloat(val) || 0;
const round2 = (val) => Math.round(val * 100) / 100;

/**
 * Overlay di sola lettura: nessun euro viene spostato, nessun sottoconto
 * viene creato. Serve solo a rispondere "quanto è davvero libero" senza far
 * contare due volte lo stesso importo.
 *
 * - liquidita_allocata: somma di Obiettivo.importo_attuale per gli obiettivi
 *   NON completati. Oggi un obiettivo non ha conto_id e il suo
 *   importo_attuale non viene mai sottratto dal saldo dei conti (verificato
 *   in obiettivi.controller.js#addContributo) — senza questo overlay lo
 *   stesso denaro risulterebbe libero due volte: una volta sul conto, una
 *   volta come progresso dell'obiettivo. Un obiettivo completato non blocca
 *   più liquidità: il suo scopo è stato raggiunto.
 * - impegni_pertinenti: somma degli importi dei Movimento ricorrenti mensili
 *   di tipo 'uscita' il cui addebito per il periodo corrente non è ancora
 *   avvenuto (nessun Movimento con ricorrenza_origine_id=<id> e
 *   ricorrenza_periodo=<periodo corrente>). Il saldo del conto non riflette
 *   ancora quell'uscita, quindi non è denaro davvero disponibile.
 */
async function calcolaLiquidita(userId, { data = new Date().toISOString().split('T')[0], transaction } = {}) {
  const oggi = new Date(data);
  const periodoCorrente = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`;

  const conti = await Conto.findAll({ where: { user_id: userId, attivo: true }, transaction });
  const saldo_conti = round2(conti.reduce((sum, c) => sum + toNumber(c.saldo), 0));

  const obiettiviAttivi = await Obiettivo.findAll({
    where: { user_id: userId, completato: false },
    transaction,
  });
  const liquidita_allocata = round2(obiettiviAttivi.reduce((sum, o) => sum + toNumber(o.importo_attuale), 0));
  const obiettivi_allocati = obiettiviAttivi.map((o) => ({
    id: o.id,
    nome: o.nome,
    importo_attuale: toNumber(o.importo_attuale),
  }));

  const ricorrenti = await Movimento.findAll({
    where: {
      user_id: userId,
      tipo: 'uscita',
      ricorrente: true,
      ricorrente_frequenza: 'mensile',
    },
    transaction,
  });

  const impegni = [];
  for (const r of ricorrenti) {
    // eslint-disable-next-line no-await-in-loop
    const eseguitoQuestoPeriodo = await Movimento.findOne({
      where: { ricorrenza_origine_id: r.id, ricorrenza_periodo: periodoCorrente },
      transaction,
    });
    if (!eseguitoQuestoPeriodo) {
      impegni.push({
        movimento_id: r.id,
        categoria: r.categoria,
        importo: toNumber(r.importo),
        giorno: r.ricorrente_giorno || 1,
      });
    }
  }
  const impegni_pertinenti = round2(impegni.reduce((sum, i) => sum + i.importo, 0));

  const liquidita_libera = round2(saldo_conti - liquidita_allocata - impegni_pertinenti);

  return {
    saldo_conti,
    liquidita_allocata,
    impegni_pertinenti,
    liquidita_libera,
    obiettivi_allocati,
    impegni,
  };
}

module.exports = { calcolaLiquidita };
```

- [ ] **Step 4: Esporre l'endpoint**

In `server/controllers/conti.controller.js`, aggiungi l'import (accanto a quello di `financialSummary.service`):

```js
const { calcolaLiquidita } = require('../services/liquidita.service');
```

Aggiungi la funzione controller subito dopo `getPatrimonioTotale`:

```js
const getLiquidita = async (req, res) => {
  try {
    const risultato = await calcolaLiquidita(req.userId);
    res.json(risultato);
  } catch (error) {
    logger.error('Errore getLiquidita', { err: error });
    res.status(500).json({ message: 'Errore nel calcolo della liquidità' });
  }
};
```

Aggiungi `getLiquidita` a `module.exports` in fondo al file.

In `server/routes/conti.routes.js`, aggiungi `getLiquidita` alla destructuring dell'import e la rotta subito dopo `/patrimonio`:

```js
router.get('/liquidita', authMiddleware, getLiquidita);
```

- [ ] **Step 5: Eseguire il test e verificare che passi**

```bash
cd server && NODE_ENV=test npx jest tests/liquidita.test.js --runInBand
```

Atteso: PASS, 6 test verdi.

- [ ] **Step 6: Suite completa**

```bash
cd server && npm test
```

Atteso: 470 + 6 = 476 passed, 0 falliti.

- [ ] **Step 7: Commit**

```bash
git add server/services/liquidita.service.js server/tests/liquidita.test.js server/controllers/conti.controller.js server/routes/conti.routes.js
git commit -m "feat(finance): add liquidita libera/allocata overlay

New GET /api/conti/liquidita computes liquidita_libera as saldo conti
attivi minus liquidita_allocata (active, non-completed Obiettivo
importo_attuale) minus impegni_pertinenti (monthly recurring uscite
not yet executed this period). Read-only overlay: no money moves, no
virtual sub-accounts persisted."
```

---

### Task 3: Classificazione essenzialità — catalogo + categorie personali

Aggiunge il campo strutturato `essenzialita` (`essenziale` | `semi_essenziale` | `discrezionale`) a tutte le categorie di spesa, sostituendo la futura fonte dell'euristica hardcoded di Task 4. Le 94 categorie di uscita del catalogo vengono classificate con un default ragionato (sovrascrivibile in futuro via API); le categorie di entrata restano `null` (il concetto non si applica).

**Files:**
- Modify: `server/constants/categorie.js`
- Modify: `server/constants/catalogoCategorie.json`
- Modify: `server/models/CategoriaPersonale.js`
- Create: `server/migrations/20260917000022-add-essenzialita-categorie-personali.js`
- Modify: `server/routes/categorie.routes.js`
- Test: `server/tests/essenzialita.test.js` (parte 1 — catalogo e categorie personali; la parte 2, sostituzione dell'euristica, è nel Task 4)

**Interfaces:**
- Produces: `ESSENZIALITA_VALUES = ['essenziale', 'semi_essenziale', 'discrezionale']` esportato da `server/constants/categorie.js`. Ogni entry di `CATEGORIE_DEFAULT` e ogni riga di `CategoriaPersonale` (via `categorie.service.serialize`) porta un campo `essenzialita`.

- [ ] **Step 1: Aggiungere la costante di validazione**

In `server/constants/categorie.js`, dopo la riga 30 (`const isCategoriaSistema = ...`), aggiungi:

```js
const ESSENZIALITA_VALUES = ['essenziale', 'semi_essenziale', 'discrezionale'];
```

E aggiungi `ESSENZIALITA_VALUES` a `module.exports` in fondo al file.

- [ ] **Step 2: Classificare le 94 categorie di uscita nel catalogo**

Esegui questo script una tantum per aggiungere `essenzialita` a ogni voce di `server/constants/catalogoCategorie.json` (le categorie di entrata restano `null`, dato che il concetto si applica solo alle uscite):

```bash
cd server && node -e "
const fs = require('fs');
const path = 'constants/catalogoCategorie.json';
const cats = JSON.parse(fs.readFileSync(path, 'utf8'));

const essenziale = new Set([
  'cibo_spesa','casa','bollette','benzina_trasporti','mezzi_pubblici','salute',
  'affitto','mutuo','condominio','elettricita','gas','acqua','internet','telefono','manutenzione_casa',
  'spesa_alimentare','supermercato',
  'benzina','diesel','ricarica_elettrica','pedaggi','bollo_auto','assicurazione_auto','manutenzione_auto','moto',
  'farmacia','medico','dentista','visite_specialistiche','analisi_mediche','assicurazione_sanitaria',
  'commissioni_bancarie','commissioni_carta','interessi_passivi','assicurazioni','tasse','prestiti','rate',
  'scuola','universita','materiale_scolastico',
  'bambini','famiglia',
]);

const semiEssenziale = new Set([
  'abbigliamento','abbonamenti','arredamento','prodotti_casa',
  'parcheggio','taxi','car_sharing',
  'palestra','sport','attrezzatura_sportiva','benessere',
  'trading',
  'corsi','libri','formazione_online',
  'cura_personale','parrucchiere','cosmetici','animali',
]);

const aggiornati = cats.map(c => {
  if (c.tipo !== 'uscita') return { ...c, essenzialita: null };
  const essenzialita = essenziale.has(c.id) ? 'essenziale' : (semiEssenziale.has(c.id) ? 'semi_essenziale' : 'discrezionale');
  return { ...c, essenzialita };
});

const uscite = aggiornati.filter(c => c.tipo === 'uscita');
const conteggio = { essenziale: 0, semi_essenziale: 0, discrezionale: 0 };
uscite.forEach(c => { conteggio[c.essenzialita] += 1; });
console.log('Totale uscita:', uscite.length, conteggio);
if (uscite.length !== 94 || conteggio.essenziale + conteggio.semi_essenziale + conteggio.discrezionale !== 94) {
  throw new Error('Conteggio inatteso: verificare la lista prima di scrivere il file');
}

fs.writeFileSync(path, JSON.stringify(aggiornati, null, 2) + '\n');
console.log('Scritto', path);
"
```

Atteso in output: `Totale uscita: 94 { essenziale: 43, semi_essenziale: 19, discrezionale: 32 }`.

- [ ] **Step 3: Rigenerare l'asset frontend generato**

```bash
cd server && node scripts/sync-category-catalog.js
```

Verifica che `client/src/data/categorie.generated.json` risulti modificato (diff atteso: solo l'aggiunta del campo `essenzialita` per ogni voce, nessun'altra differenza) — non editarlo mai a mano, è un artefatto generato.

```bash
git diff --stat client/src/data/categorie.generated.json
```

- [ ] **Step 4: Colonna `essenzialita` sul modello `CategoriaPersonale`**

In `server/models/CategoriaPersonale.js`, aggiungi il campo dopo `attiva`. `allowNull: true` perché una categoria personale di tipo `entrata` riceve esplicitamente `essenzialita: null` (il concetto non si applica); il default `'discrezionale'` scatta solo per le `uscita` create senza specificarlo:

```js
  essenzialita: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'discrezionale' },
```

- [ ] **Step 5: Migration additiva**

Crea `server/migrations/20260917000022-add-essenzialita-categorie-personali.js`. La colonna è nullable (una categoria personale `entrata` porta `essenzialita: null`, il concetto non si applica) e il CHECK ammette esplicitamente `NULL`:

```js
'use strict';
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('categorie_personali');
    if (columns.essenzialita) return;
    await q.sequelize.transaction(async transaction => {
      await q.addColumn('categorie_personali', 'essenzialita', {
        type: S.STRING(20), allowNull: true, defaultValue: 'discrezionale',
      }, { transaction });
      await q.sequelize.query(
        "ALTER TABLE categorie_personali ADD CONSTRAINT categorie_personali_essenzialita CHECK (essenzialita IS NULL OR essenzialita IN ('essenziale','semi_essenziale','discrezionale'))",
        { transaction },
      );
    });
  },
  async down(q) {
    const columns = await q.describeTable('categorie_personali');
    if (!columns.essenzialita) return;
    await q.sequelize.query('ALTER TABLE categorie_personali DROP CONSTRAINT IF EXISTS categorie_personali_essenzialita');
    await q.removeColumn('categorie_personali', 'essenzialita');
  },
};
```

- [ ] **Step 6: Validare `essenzialita` sulla create/update di categorie personali**

In `server/routes/categorie.routes.js`, aggiungi l'import di `ESSENZIALITA_VALUES` (riga 6):

```js
const { CATEGORIE_DEFAULT, isCategoriaSistema, ESSENZIALITA_VALUES } = require('../constants/categorie');
```

Nella funzione `validate(body)` (righe 11-18), sostituisci il `return` finale con:

```js
  const essenzialita = body.tipo === 'uscita' && ESSENZIALITA_VALUES.includes(body.essenzialita)
    ? body.essenzialita
    : (body.tipo === 'uscita' ? 'discrezionale' : null);
  return {
    nome, nome_normalizzato: normalizeName(nome), tipo: body.tipo,
    icona: body.icona || 'Tag', colore: body.colore || '#3498DB', essenzialita,
  };
```

Per `tipo: 'entrata'` questo passa esplicitamente `essenzialita: null` — coerente con la colonna nullable definita negli Step 4-5.

- [ ] **Step 7: Scrivere il test**

Crea `server/tests/essenzialita.test.js`:

```js
// Classificazione strutturata dell'essenzialità delle spese: essenziale,
// semi_essenziale, discrezionale. Sostituisce l'euristica hardcoded
// "svago + acquisti_vari + abbigliamento" con un campo sul catalogo.
const {
  request, createApp, registerUser, authHeader,
} = require('./setup');
const { list } = require('../services/categorie.service');
const { ESSENZIALITA_VALUES, CATEGORIE_DEFAULT } = require('../constants/categorie');

describe('Classificazione essenzialità', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
  });

  it('ogni categoria predefinita di uscita ha una essenzialita valida', () => {
    const uscite = CATEGORIE_DEFAULT.filter((c) => c.tipo === 'uscita');
    expect(uscite.length).toBeGreaterThan(0);
    uscite.forEach((c) => {
      expect(ESSENZIALITA_VALUES).toContain(c.essenzialita);
    });
  });

  it('le categorie di entrata non hanno essenzialita (non applicabile)', () => {
    const entrate = CATEGORIE_DEFAULT.filter((c) => c.tipo === 'entrata');
    entrate.forEach((c) => expect(c.essenzialita).toBeNull());
  });

  it('affitto è essenziale, svago è discrezionale', () => {
    const affitto = CATEGORIE_DEFAULT.find((c) => c.id === 'affitto' && c.tipo === 'uscita');
    const svago = CATEGORIE_DEFAULT.find((c) => c.id === 'svago' && c.tipo === 'uscita');
    expect(affitto.essenzialita).toBe('essenziale');
    expect(svago.essenzialita).toBe('discrezionale');
  });

  it('una categoria personale di uscita riceve discrezionale come default', async () => {
    const res = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Mia categoria', tipo: 'uscita' });

    expect(res.status).toBe(201);
    expect(res.body.categoria.essenzialita).toBe('discrezionale');
  });

  it('una categoria personale di uscita può dichiarare essenziale esplicitamente', async () => {
    const res = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Rata prestito personale', tipo: 'uscita', essenzialita: 'essenziale' });

    expect(res.body.categoria.essenzialita).toBe('essenziale');
  });

  it('una categoria personale di entrata ha essenzialita null indipendentemente dal body', async () => {
    const res = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Mia entrata', tipo: 'entrata', essenzialita: 'essenziale' });

    expect(res.body.categoria.essenzialita).toBeNull();
  });

  it('list(userId) restituisce essenzialita sia per predefinite sia per personali', async () => {
    await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Extra', tipo: 'uscita', essenzialita: 'semi_essenziale' });

    const categorie = await list(userId);
    const predefinita = categorie.find((c) => c.id === 'cibo_spesa' && c.tipo === 'uscita');
    const personale = categorie.find((c) => c.nome === 'Extra');

    expect(predefinita.essenzialita).toBe('essenziale');
    expect(personale.essenzialita).toBe('semi_essenziale');
  });
});
```

- [ ] **Step 8: Eseguire il test e verificare che passi**

```bash
cd server && NODE_ENV=test npx jest tests/essenzialita.test.js --runInBand
```

Atteso: PASS, 7 test verdi.

- [ ] **Step 9: Suite completa**

```bash
cd server && npm test
```

Atteso: 476 + 7 = 483 passed.

- [ ] **Step 10: Commit**

```bash
git add server/constants/categorie.js server/constants/catalogoCategorie.json server/models/CategoriaPersonale.js server/migrations/20260917000022-add-essenzialita-categorie-personali.js server/routes/categorie.routes.js server/tests/essenzialita.test.js client/src/data/categorie.generated.json
git commit -m "feat(categories): add expense essentiality classification

Every uscita category (catalog + personal) now carries an
essenzialita field (essenziale | semi_essenziale | discrezionale),
with a reasoned default per catalog entry and an explicit override on
create for personal categories. Entrata categories carry null (not
applicable). Regenerates the frontend catalog snapshot via the
existing sync script."
```

---

### Task 4: `essenzialita.service.js` — sostituire l'euristica hardcoded

**Files:**
- Create: `server/services/essenzialita.service.js`
- Modify: `server/controllers/analisi.controller.js:342`
- Test: aggiunge a `server/tests/essenzialita.test.js`

**Interfaces:**
- Consumes: `list(userId)` da `categorie.service.js` (già usato in `analisi.controller.js` come `listCategories`).
- Produces: `aggregaPerEssenzialita(totaliPerCategoria, categorieUscita)` → `{ essenziale, semi_essenziale, discrezionale, totale }` (arrotondati a 2 decimali). `getEssenzialita(categoriaId, categorieUscita)` → stringa, fallback `'discrezionale'` se la categoria non è trovata (es. categoria personale poi eliminata). Riusata anche dal Task 6 (fondo sicurezza).

- [ ] **Step 1: Creare il service**

Crea `server/services/essenzialita.service.js`:

```js
const round2 = (val) => Math.round(val * 100) / 100;

/** Essenzialita di una categoria, o 'discrezionale' se non trovata (es. una
 * categoria personale poi eliminata: meglio sottostimare l'essenziale che
 * sovrastimarlo). */
const getEssenzialita = (categoriaId, categorieUscita) => {
  const cat = categorieUscita.find((c) => c.id === categoriaId);
  return cat?.essenzialita || 'discrezionale';
};

/**
 * @param {Object<string, number>} totaliPerCategoria - es. { svago: 120, affitto: 800 }
 * @param {Array} categorieUscita - list(userId) filtrato a tipo 'uscita'
 */
const aggregaPerEssenzialita = (totaliPerCategoria, categorieUscita) => {
  const totali = { essenziale: 0, semi_essenziale: 0, discrezionale: 0 };
  Object.entries(totaliPerCategoria || {}).forEach(([categoriaId, importo]) => {
    const essenzialita = getEssenzialita(categoriaId, categorieUscita);
    totali[essenzialita] = (totali[essenzialita] || 0) + (parseFloat(importo) || 0);
  });
  return {
    essenziale: round2(totali.essenziale),
    semi_essenziale: round2(totali.semi_essenziale),
    discrezionale: round2(totali.discrezionale),
    totale: round2(totali.essenziale + totali.semi_essenziale + totali.discrezionale),
  };
};

module.exports = { getEssenzialita, aggregaPerEssenzialita };
```

- [ ] **Step 2: Sostituire l'euristica hardcoded in `getSuggerimenti`**

In `server/controllers/analisi.controller.js`, aggiungi l'import in testa:

```js
const { aggregaPerEssenzialita } = require('../services/essenzialita.service');
```

Sostituisci la riga 342 (`const nonEssenziali = (corrente.map.svago || 0) + (corrente.map.acquisti_vari || 0) + (corrente.map.abbigliamento || 0);`) con:

```js
    const categorieUscita = categories.filter((c) => c.tipo === 'uscita');
    const { discrezionale: nonEssenziali } = aggregaPerEssenzialita(corrente.map, categorieUscita);
```

`categories` è già caricato alla riga 287 (`await listCategories(req.userId, { includeArchived: true })`) — nessun'altra query aggiunta.

- [ ] **Step 3: Scrivere il test di regressione**

Aggiungi a `server/tests/essenzialita.test.js` (nuovo `describe`, stesso file):

```js
describe('Sostituzione euristica hardcoded in getSuggerimenti', () => {
  let app;
  let token;
  const oggi = () => new Date().toISOString().split('T')[0];

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
  });

  it('una categoria personale discrezionale entra nel calcolo esattamente come le predefinite', async () => {
    const { Conto, Movimento } = require('./setup');
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 0 });
    const contoId = contoRes.body.conto.id;

    const catRes = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Mio hobby', tipo: 'uscita', essenzialita: 'discrezionale' });
    const categoriaId = catRes.body.categoria.id;

    // 40% del totale in una categoria discrezionale personale, sopra la soglia del 30%.
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 40, categoria: categoriaId, data: oggi(),
    });
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 60, categoria: 'affitto', data: oggi(),
    });

    const res = await request(app).get('/api/analisi/suggerimenti').set(authHeader(token));
    const info = res.body.suggerimenti.find((s) => s.tipo === 'info' && s.messaggio?.includes('non essenziale'));

    expect(info).toBeDefined();
    expect(info.messaggio).toContain('40%');
  });
});
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

```bash
cd server && NODE_ENV=test npx jest tests/essenzialita.test.js --runInBand
```

Atteso: PASS, 8 test verdi (7 del Task 3 + 1 nuovo).

- [ ] **Step 5: Suite completa**

```bash
cd server && npm test
```

Atteso: 483 + 1 = 484 passed.

- [ ] **Step 6: Commit**

```bash
git add server/services/essenzialita.service.js server/controllers/analisi.controller.js server/tests/essenzialita.test.js
git commit -m "refactor(analisi): replace hardcoded discretionary-spend heuristic

getSuggerimenti no longer sums svago+acquisti_vari+abbigliamento by
name; it aggregates via essenzialita.service, which reads the
essenzialita field from categorie.service.list(userId). Any category
— predefined or personal — is now covered, not just the three
hardcoded ids."
```

---

### Task 5: `Obiettivo.tipo_obiettivo`

**Files:**
- Modify: `server/models/Obiettivo.js`
- Create: `server/migrations/20260917000023-add-tipo-obiettivo.js`
- Modify: `server/controllers/obiettivi.controller.js` (`createObiettivo`, `updateObiettivo`)
- Modify: `server/middleware/validation.middleware.js` (`validateObiettivo`, `validateUpdateObiettivo`)
- Test: `server/tests/fondoSicurezza.test.js` (parte 1 — il campo; la parte 2, mesi di copertura, è nel Task 6)

**Interfaces:**
- Produces: `Obiettivo.tipo_obiettivo` — `'generico'` (default) | `'fondo_sicurezza'`.

- [ ] **Step 1: Modello**

In `server/models/Obiettivo.js`, aggiungi il campo dopo `completato`:

```js
  tipo_obiettivo: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'generico',
  },
```

- [ ] **Step 2: Migration additiva**

Crea `server/migrations/20260917000023-add-tipo-obiettivo.js`:

```js
'use strict';
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('obiettivi');
    if (columns.tipo_obiettivo) return;
    await q.sequelize.transaction(async transaction => {
      await q.addColumn('obiettivi', 'tipo_obiettivo', {
        type: S.STRING(30), allowNull: false, defaultValue: 'generico',
      }, { transaction });
      await q.sequelize.query(
        "ALTER TABLE obiettivi ADD CONSTRAINT obiettivi_tipo_obiettivo CHECK (tipo_obiettivo IN ('generico','fondo_sicurezza'))",
        { transaction },
      );
    });
  },
  async down(q) {
    const columns = await q.describeTable('obiettivi');
    if (!columns.tipo_obiettivo) return;
    await q.sequelize.query('ALTER TABLE obiettivi DROP CONSTRAINT IF EXISTS obiettivi_tipo_obiettivo');
    await q.removeColumn('obiettivi', 'tipo_obiettivo');
  },
};
```

- [ ] **Step 3: Validazione**

In `server/middleware/validation.middleware.js`, nel blocco `validateObiettivo` (dopo `body('importo_iniziale')...`, prima di `validate,`), aggiungi:

```js
  body('tipo_obiettivo')
    .optional({ values: 'null' })
    .isIn(['generico', 'fondo_sicurezza'])
    .withMessage('Tipo obiettivo non valido'),
```

Nello stesso punto in `validateUpdateObiettivo` (dopo `body('icona')...`, prima di `validate,`), aggiungi lo stesso blocco.

- [ ] **Step 4: Controller**

In `server/controllers/obiettivi.controller.js`, in `createObiettivo` (riga 26), aggiungi `tipo_obiettivo = 'generico'` alla destructuring:

```js
    const { nome, importo_target, deadline, icona, importo_iniziale = 0, tipo_obiettivo = 'generico' } = req.body;
```

e aggiungi `tipo_obiettivo` all'oggetto passato a `Obiettivo.create` (riga 33-41):

```js
    const obiettivo = await Obiettivo.create({
      user_id: req.userId,
      nome,
      importo_target,
      importo_attuale: iniziale,
      deadline: deadline || null,
      icona: icona || '🎯',
      completato: iniziale >= toNumber(importo_target),
      tipo_obiettivo,
    });
```

In `updateObiettivo` (righe 69-74), aggiungi:

```js
    const { nome, importo_target, deadline, icona, tipo_obiettivo } = req.body;
    const updateData = {};
    if (nome !== undefined) updateData.nome = nome;
    if (importo_target !== undefined) updateData.importo_target = importo_target;
    if (deadline !== undefined) updateData.deadline = deadline;
    if (icona !== undefined) updateData.icona = icona;
    if (tipo_obiettivo !== undefined) updateData.tipo_obiettivo = tipo_obiettivo;
```

- [ ] **Step 5: Scrivere il test**

Crea `server/tests/fondoSicurezza.test.js` (parte 1; il Task 6 vi aggiunge un secondo `describe`):

```js
// tipo_obiettivo distingue un obiettivo generico da un fondo di sicurezza,
// per cui e' calcolabile mesiCopertura = importoFondo / speseEssenzialiMensili.
const {
  request, createApp, registerUser, authHeader,
} = require('./setup');

describe('Obiettivo.tipo_obiettivo', () => {
  let app;
  let token;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
  });

  it('default a generico se non specificato', async () => {
    const res = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'Vacanza', importo_target: 1000 });

    expect(res.body.obiettivo.tipo_obiettivo).toBe('generico');
  });

  it('accetta fondo_sicurezza esplicitamente', async () => {
    const res = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'Fondo emergenza', importo_target: 5000, tipo_obiettivo: 'fondo_sicurezza' });

    expect(res.body.obiettivo.tipo_obiettivo).toBe('fondo_sicurezza');
  });

  it('rifiuta un tipo_obiettivo non valido', async () => {
    const res = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'X', importo_target: 100, tipo_obiettivo: 'non_esiste' });

    expect(res.status).toBe(400);
  });

  it('può essere cambiato via update', async () => {
    const created = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'Vacanza', importo_target: 1000 });

    const res = await request(app)
      .put(`/api/obiettivi/${created.body.obiettivo.id}`)
      .set(authHeader(token))
      .send({ tipo_obiettivo: 'fondo_sicurezza' });

    expect(res.body.obiettivo.tipo_obiettivo).toBe('fondo_sicurezza');
  });
});
```

- [ ] **Step 6: Eseguire il test e verificare che passi**

```bash
cd server && NODE_ENV=test npx jest tests/fondoSicurezza.test.js --runInBand
```

Atteso: PASS, 4 test verdi.

- [ ] **Step 7: Suite completa**

```bash
cd server && npm test
```

Atteso: 484 + 4 = 488 passed.

- [ ] **Step 8: Commit**

```bash
git add server/models/Obiettivo.js server/migrations/20260917000023-add-tipo-obiettivo.js server/controllers/obiettivi.controller.js server/middleware/validation.middleware.js server/tests/fondoSicurezza.test.js
git commit -m "feat(goals): support emergency fund goals

Obiettivo gains tipo_obiettivo ('generico' default | 'fondo_sicurezza'),
additive migration with app-level whitelist (consistent with the
repo's convention of STRING + CHECK over native Postgres ENUM)."
```

---

### Task 6: `fondoSicurezza.service.js` — mesi di copertura

**Files:**
- Create: `server/services/fondoSicurezza.service.js`
- Modify: `server/controllers/obiettivi.controller.js` (nuovo `getCopertura`)
- Modify: `server/routes/obiettivi.routes.js`
- Modify: `server/middleware/validation.middleware.js` (riuso di `validateIdParam`, nessun nuovo validator necessario)
- Test: aggiunge a `server/tests/fondoSicurezza.test.js`

**Interfaces:**
- Consumes: `Movimento` da `../models`, `list` da `categorie.service.js`, `aggregaPerEssenzialita` da `essenzialita.service.js` (Task 4).
- Produces: `calcolaMesiCopertura({ userId, obiettivo, mesi = 3 })` → `Promise<{ stato: 'disponibile'|'non_calcolabile'|'dati_insufficienti', mesi_copertura: number|null, spese_essenziali_mensili: number|null, importo_fondo: number, motivo: string|null }>`. `GET /api/obiettivi/:id/copertura`.

- [ ] **Step 1: Creare il service**

Crea `server/services/fondoSicurezza.service.js`:

```js
const { Op } = require('sequelize');
const { Movimento } = require('../models');
const { list } = require('./categorie.service');
const { aggregaPerEssenzialita } = require('./essenzialita.service');

const toNumber = (val) => parseFloat(val) || 0;
const round1 = (val) => Math.round(val * 10) / 10;

/** Primo giorno del mese, N mesi indietro rispetto a `riferimento`. */
const inizioMesiFa = (riferimento, n) => {
  const d = new Date(riferimento.getFullYear(), riferimento.getMonth() - n, 1);
  return d.toISOString().split('T')[0];
};

/** Ultimo giorno del mese precedente a `riferimento` (esclude il mese corrente,
 * ancora parziale, per non far apparire le spese essenziali piu' basse di
 * quanto sono davvero). */
const fineMeseScorso = (riferimento) => {
  const d = new Date(riferimento.getFullYear(), riferimento.getMonth(), 0);
  return d.toISOString().split('T')[0];
};

/**
 * mesiCopertura = importoFondo / speseEssenzialiMensili, calcolate sulla
 * media delle spese essenziali negli ultimi `mesi` mesi solari completi
 * (esclude il mese corrente, ancora parziale).
 *
 * Casi limite (nessun valore inventato quando i dati non bastano):
 * - nessun movimento di uscita nel periodo → 'dati_insufficienti'
 * - c'e' storico ma nessuna spesa e' classificata 'essenziale' → 'non_calcolabile'
 *   (dividere per zero non ha senso)
 * - fondo vuoto (importo_attuale=0) con spese essenziali > 0 → 'disponibile',
 *   mesi_copertura=0 (e' un risultato legittimo, non un errore)
 * - obiettivo completato → nessun trattamento speciale, la formula si applica
 *   comunque con l'importo_attuale corrente
 */
async function calcolaMesiCopertura({ userId, obiettivo, mesi = 3, riferimento = new Date() }) {
  const importoFondo = toNumber(obiettivo.importo_attuale);
  const da = inizioMesiFa(riferimento, mesi);
  const a = fineMeseScorso(riferimento);

  const movimenti = await Movimento.findAll({
    where: {
      user_id: userId,
      tipo: 'uscita',
      data: { [Op.between]: [da, a] },
    },
  });

  if (movimenti.length === 0) {
    return {
      stato: 'dati_insufficienti',
      mesi_copertura: null,
      spese_essenziali_mensili: null,
      importo_fondo: importoFondo,
      motivo: 'Nessuno storico di spese sufficiente per calcolare la copertura.',
    };
  }

  const spesoPerCategoria = {};
  movimenti.forEach((m) => {
    const cat = m.categoria || 'altro_uscita';
    spesoPerCategoria[cat] = (spesoPerCategoria[cat] || 0) + toNumber(m.importo);
  });

  const categorie = await list(userId, { includeArchived: true });
  const categorieUscita = categorie.filter((c) => c.tipo === 'uscita');
  const { essenziale } = aggregaPerEssenzialita(spesoPerCategoria, categorieUscita);
  const speseEssenzialiMensili = essenziale / mesi;

  if (speseEssenzialiMensili === 0) {
    return {
      stato: 'non_calcolabile',
      mesi_copertura: null,
      spese_essenziali_mensili: 0,
      importo_fondo: importoFondo,
      motivo: 'Le spese essenziali mensili sono pari a zero: la copertura non è calcolabile.',
    };
  }

  return {
    stato: 'disponibile',
    mesi_copertura: round1(importoFondo / speseEssenzialiMensili),
    spese_essenziali_mensili: Math.round(speseEssenzialiMensili * 100) / 100,
    importo_fondo: importoFondo,
    motivo: null,
  };
}

module.exports = { calcolaMesiCopertura };
```

- [ ] **Step 2: Endpoint**

In `server/controllers/obiettivi.controller.js`, aggiungi l'import in testa:

```js
const { calcolaMesiCopertura } = require('../services/fondoSicurezza.service');
```

Aggiungi la funzione dopo `getProiezione`:

```js
const getCopertura = async (req, res) => {
  try {
    const obiettivo = await Obiettivo.findOne({
      where: { id: req.params.id, user_id: req.userId },
    });

    if (!obiettivo) {
      return res.status(404).json({ message: 'Obiettivo non trovato' });
    }
    if (obiettivo.tipo_obiettivo !== 'fondo_sicurezza') {
      return res.status(400).json({ message: 'L\'obiettivo non è un fondo di sicurezza' });
    }

    const risultato = await calcolaMesiCopertura({ userId: req.userId, obiettivo });
    res.json(risultato);
  } catch (error) {
    logger.error('Errore getCopertura', { err: error });
    res.status(500).json({ message: 'Errore nel calcolo della copertura' });
  }
};
```

Aggiungi `getCopertura` a `module.exports`.

In `server/routes/obiettivi.routes.js`, aggiungi `getCopertura` alla destructuring e la rotta subito dopo `/:id/proiezione`:

```js
router.get('/:id/copertura', authMiddleware, validateIdParam, getCopertura);
```

- [ ] **Step 3: Scrivere il test**

Aggiungi a `server/tests/fondoSicurezza.test.js` un secondo `describe`:

```js
describe('FondoSicurezzaService.calcolaMesiCopertura', () => {
  const { Conto, Movimento } = require('./setup');
  let app;
  let token;
  let contoId;

  const creaMovimentoUscita = async (importo, categoria, data) => request(app)
    .post('/api/movimenti')
    .set(authHeader(token))
    .send({ conto_id: contoId, tipo: 'uscita', importo, categoria, data });

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 10000 });
    contoId = contoRes.body.conto.id;
  });

  const creaFondo = async (importoAttuale = 0) => {
    const res = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({
        nome: 'Fondo', importo_target: 10000, tipo_obiettivo: 'fondo_sicurezza', importo_iniziale: importoAttuale,
      });
    return res.body.obiettivo.id;
  };

  it('dati_insufficienti se non c\'è nessuno storico di spese', async () => {
    const id = await creaFondo(1000);
    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));
    expect(res.body.stato).toBe('dati_insufficienti');
    expect(res.body.mesi_copertura).toBeNull();
  });

  it('non_calcolabile se c\'è storico ma zero spese essenziali', async () => {
    const meseScorso = new Date();
    meseScorso.setMonth(meseScorso.getMonth() - 1);
    const data = meseScorso.toISOString().split('T')[0];
    await creaMovimentoUscita(100, 'svago', data); // discrezionale, non essenziale

    const id = await creaFondo(1000);
    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));
    expect(res.body.stato).toBe('non_calcolabile');
  });

  it('disponibile con mesi_copertura=0 se il fondo è vuoto ma ci sono spese essenziali', async () => {
    const meseScorso = new Date();
    meseScorso.setMonth(meseScorso.getMonth() - 1);
    const data = meseScorso.toISOString().split('T')[0];
    await creaMovimentoUscita(300, 'affitto', data);

    const id = await creaFondo(0);
    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));
    expect(res.body.stato).toBe('disponibile');
    expect(res.body.mesi_copertura).toBe(0);
  });

  it('calcola correttamente la copertura con dati completi, anche se l\'obiettivo è completato', async () => {
    const meseScorso = new Date();
    meseScorso.setMonth(meseScorso.getMonth() - 1);
    const data = meseScorso.toISOString().split('T')[0];
    // 900€ di essenziali nell'ultimo mese -> media 3 mesi = 300€/mese (0 negli altri 2 mesi contati).
    await creaMovimentoUscita(900, 'affitto', data);

    const id = await creaFondo(1500);
    // Completa l'obiettivo per verificare che non cambi il comportamento.
    await request(app).post(`/api/obiettivi/${id}/contributi`).set(authHeader(token)).send({ importo: 8500 });

    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));
    expect(res.body.stato).toBe('disponibile');
    expect(res.body.spese_essenziali_mensili).toBe(300);
    expect(res.body.mesi_copertura).toBe(round1(10000 / 300));

    function round1(v) { return Math.round(v * 10) / 10; }
  });

  it('400 se l\'obiettivo non è un fondo di sicurezza', async () => {
    const created = await request(app).post('/api/obiettivi').set(authHeader(token)).send({ nome: 'Vacanza', importo_target: 1000 });
    const res = await request(app).get(`/api/obiettivi/${created.body.obiettivo.id}/copertura`).set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('404 se l\'obiettivo non esiste o è di un altro utente', async () => {
    const res = await request(app).get('/api/obiettivi/999999/copertura').set(authHeader(token));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

```bash
cd server && NODE_ENV=test npx jest tests/fondoSicurezza.test.js --runInBand
```

Atteso: PASS, 4 + 6 = 10 test verdi.

- [ ] **Step 5: Suite completa**

```bash
cd server && npm test
```

Atteso: 488 + 6 = 494 passed.

- [ ] **Step 6: Commit**

```bash
git add server/services/fondoSicurezza.service.js server/controllers/obiettivi.controller.js server/routes/obiettivi.routes.js server/tests/fondoSicurezza.test.js
git commit -m "feat(goals): compute mesi di copertura for emergency fund goals

New GET /api/obiettivi/:id/copertura, gated to
tipo_obiettivo='fondo_sicurezza'. mesi_copertura =
importo_fondo / spese_essenziali_mensili (average essenziale spend
over the last 3 complete calendar months). Returns
disponibile/non_calcolabile/dati_insufficienti instead of guessing
when data is missing or the denominator is zero."
```

---

### Task 7: Modello `Debito`

**Files:**
- Create: `server/models/Debito.js`
- Create: `server/migrations/20260917000024-create-debiti.js`
- Modify: `server/models/index.js`

**Interfaces:**
- Produces: modello `Debito` (tabella `debiti`), associazioni `User.hasMany(Debito, { as: 'debiti' })`, `Debito.belongsTo(User)`, `Debito.belongsTo(Conto, { foreignKey: 'conto_id', as: 'conto' })`.

- [ ] **Step 1: Creare il modello**

Crea `server/models/Debito.js`:

```js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Debito = sequelize.define('Debito', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  nome: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  tipo: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'altro',
  },
  saldo_residuo: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  rata_periodica: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  tasso_interesse: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  taeg: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  frequenza: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'mensile',
  },
  prossima_scadenza: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  data_fine: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  conto_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  attivo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'debiti',
});

module.exports = Debito;
```

- [ ] **Step 2: Migration**

Crea `server/migrations/20260917000024-create-debiti.js`:

```js
'use strict';
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async transaction => {
      await q.createTable('debiti', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
        nome: { type: S.STRING(200), allowNull: false },
        tipo: { type: S.STRING(30), allowNull: false, defaultValue: 'altro' },
        saldo_residuo: { type: S.DECIMAL(12, 2), allowNull: false },
        rata_periodica: { type: S.DECIMAL(12, 2), allowNull: true },
        tasso_interesse: { type: S.DECIMAL(5, 2), allowNull: true },
        taeg: { type: S.DECIMAL(5, 2), allowNull: true },
        frequenza: { type: S.STRING(20), allowNull: true, defaultValue: 'mensile' },
        prossima_scadenza: { type: S.DATEONLY, allowNull: true },
        data_fine: { type: S.DATEONLY, allowNull: true },
        conto_id: { type: S.INTEGER, allowNull: true, references: { model: 'conti', key: 'id' }, onDelete: 'SET NULL' },
        attivo: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });
      await q.sequelize.query(
        "ALTER TABLE debiti ADD CONSTRAINT debiti_tipo CHECK (tipo IN ('prestito','mutuo','finanziamento','revolving','debito_personale','altro'))",
        { transaction },
      );
      await q.sequelize.query(
        "ALTER TABLE debiti ADD CONSTRAINT debiti_frequenza CHECK (frequenza IS NULL OR frequenza IN ('mensile','settimanale','annuale','unica'))",
        { transaction },
      );
      await q.addIndex('debiti', ['user_id', 'attivo'], { transaction });
    });
  },
  async down(q) {
    await q.dropTable('debiti');
  },
};
```

- [ ] **Step 3: Associazioni**

In `server/models/index.js`, aggiungi dopo la riga 27 (`const PushSubscription = require('./PushSubscription');`):

```js
const Debito = require('./Debito');
```

Aggiungi dopo il blocco `PushSubscription` (dopo riga 85):

```js
User.hasMany(Debito, { foreignKey: 'user_id', as: 'debiti' });
Debito.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Debito.belongsTo(Conto, { foreignKey: 'conto_id', as: 'conto' });
```

Aggiungi `Debito` a `module.exports`.

- [ ] **Step 4: Verificare che le migration girino senza errori**

```bash
cd server && NODE_ENV=test npx jest tests/financialSummary.test.js --runInBand
```

Questo test già esistente forza `beforeAll` di `setup.js` a rieseguire `runMigrations()` (guardia `migrationsApplied`, quindi va invalidata rilanciando l'intera suite jest da zero — usa un processo pulito):

```bash
cd server && npm test -- --testPathPattern="financialSummary"
```

Atteso: le migration passano (incluso `20260917000024-create-debiti.js`), i 3 test del Task 1 restano verdi. Se fallisce con un errore SQL, il problema è nella migration di questo step — non procedere oltre finché non è verde.

- [ ] **Step 5: Commit**

```bash
git add server/models/Debito.js server/migrations/20260917000024-create-debiti.js server/models/index.js
git commit -m "feat(debts): add Debito model and migration

Basic liabilities model: nome, tipo (whitelist), saldo_residuo,
rata_periodica, tasso_interesse, taeg, frequenza, prossima_scadenza,
data_fine, optional conto_id, soft-delete via attivo. No amortization
schedule, no payoff strategy — just a correct, usable record."
```

---

### Task 8: CRUD `Debiti`

**Files:**
- Create: `server/controllers/debiti.controller.js`
- Create: `server/routes/debiti.routes.js`
- Modify: `server/middleware/validation.middleware.js`
- Modify: `server/app.js`
- Modify: `server/tests/setup.js` (`TABLES`)

**Interfaces:**
- Produces: `GET /api/debiti`, `POST /api/debiti`, `PUT /api/debiti/:id`, `DELETE /api/debiti/:id` (soft-delete, `attivo:false`), tutti isolati per `user_id`.

- [ ] **Step 1: Validators**

In `server/middleware/validation.middleware.js`, aggiungi in fondo (dopo il blocco `--- Investimenti ---` o alla fine del file, prima di `module.exports`):

```js
// --- Debiti ---

const TIPI_DEBITO = ['prestito', 'mutuo', 'finanziamento', 'revolving', 'debito_personale', 'altro'];
const FREQUENZE_DEBITO = ['mensile', 'settimanale', 'annuale', 'unica'];

const validateDebito = [
  body('nome')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Nome obbligatorio'),
  body('tipo')
    .optional({ values: 'null' })
    .isIn(TIPI_DEBITO)
    .withMessage('Tipo debito non valido'),
  body('saldo_residuo')
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Saldo residuo non valido'),
  body('rata_periodica')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Rata periodica non valida'),
  body('tasso_interesse')
    .optional({ values: 'null' })
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tasso interesse non valido'),
  body('taeg')
    .optional({ values: 'null' })
    .isFloat({ min: 0, max: 100 })
    .withMessage('TAEG non valido'),
  body('frequenza')
    .optional({ values: 'null' })
    .isIn(FREQUENZE_DEBITO)
    .withMessage('Frequenza non valida'),
  body('prossima_scadenza')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Prossima scadenza non valida'),
  body('data_fine')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Data fine non valida'),
  body('conto_id')
    .optional({ values: 'null' })
    .isInt({ min: 1 })
    .withMessage('Conto non valido'),
  validate,
];

const validateUpdateDebito = [
  idParam,
  body('nome')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Nome non valido'),
  body('tipo')
    .optional({ values: 'null' })
    .isIn(TIPI_DEBITO)
    .withMessage('Tipo debito non valido'),
  body('saldo_residuo')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Saldo residuo non valido'),
  body('rata_periodica')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Rata periodica non valida'),
  body('tasso_interesse')
    .optional({ values: 'null' })
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tasso interesse non valido'),
  body('taeg')
    .optional({ values: 'null' })
    .isFloat({ min: 0, max: 100 })
    .withMessage('TAEG non valido'),
  body('frequenza')
    .optional({ values: 'null' })
    .isIn(FREQUENZE_DEBITO)
    .withMessage('Frequenza non valida'),
  body('prossima_scadenza')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Prossima scadenza non valida'),
  body('data_fine')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Data fine non valida'),
  body('conto_id')
    .optional({ values: 'null' })
    .isInt({ min: 1 })
    .withMessage('Conto non valido'),
  validate,
];

const validateDeleteDebito = validateIdParam;
```

Aggiungi `validateDebito, validateUpdateDebito, validateDeleteDebito` a `module.exports` in fondo al file.

- [ ] **Step 2: Controller**

Crea `server/controllers/debiti.controller.js`:

```js
const logger = require('../utils/logger');
const { Debito, Conto } = require('../models');

const getDebiti = async (req, res) => {
  try {
    const debiti = await Debito.findAll({
      where: { user_id: req.userId, attivo: true },
      order: [['createdAt', 'DESC']],
    });
    res.json({ debiti });
  } catch (error) {
    logger.error('Errore getDebiti', { err: error });
    res.status(500).json({ message: 'Errore nel recupero dei debiti' });
  }
};

const createDebito = async (req, res) => {
  try {
    const {
      nome, tipo = 'altro', saldo_residuo, rata_periodica, tasso_interesse,
      taeg, frequenza = 'mensile', prossima_scadenza, data_fine, conto_id,
    } = req.body;

    if (conto_id) {
      const conto = await Conto.findOne({ where: { id: conto_id, user_id: req.userId, attivo: true } });
      if (!conto) {
        return res.status(404).json({ message: 'Conto non trovato' });
      }
    }

    const debito = await Debito.create({
      user_id: req.userId,
      nome,
      tipo,
      saldo_residuo,
      rata_periodica: rata_periodica ?? null,
      tasso_interesse: tasso_interesse ?? null,
      taeg: taeg ?? null,
      frequenza,
      prossima_scadenza: prossima_scadenza || null,
      data_fine: data_fine || null,
      conto_id: conto_id || null,
      attivo: true,
    });

    res.status(201).json({ debito });
  } catch (error) {
    logger.error('Errore createDebito', { err: error });
    res.status(500).json({ message: 'Errore nella creazione del debito' });
  }
};

const updateDebito = async (req, res) => {
  try {
    const debito = await Debito.findOne({
      where: { id: req.params.id, user_id: req.userId, attivo: true },
    });

    if (!debito) {
      return res.status(404).json({ message: 'Debito non trovato' });
    }

    const {
      nome, tipo, saldo_residuo, rata_periodica, tasso_interesse,
      taeg, frequenza, prossima_scadenza, data_fine, conto_id,
    } = req.body;

    if (conto_id !== undefined && conto_id !== null) {
      const conto = await Conto.findOne({ where: { id: conto_id, user_id: req.userId, attivo: true } });
      if (!conto) {
        return res.status(404).json({ message: 'Conto non trovato' });
      }
    }

    const updateData = {};
    if (nome !== undefined) updateData.nome = nome;
    if (tipo !== undefined) updateData.tipo = tipo;
    if (saldo_residuo !== undefined) updateData.saldo_residuo = saldo_residuo;
    if (rata_periodica !== undefined) updateData.rata_periodica = rata_periodica;
    if (tasso_interesse !== undefined) updateData.tasso_interesse = tasso_interesse;
    if (taeg !== undefined) updateData.taeg = taeg;
    if (frequenza !== undefined) updateData.frequenza = frequenza;
    if (prossima_scadenza !== undefined) updateData.prossima_scadenza = prossima_scadenza;
    if (data_fine !== undefined) updateData.data_fine = data_fine;
    if (conto_id !== undefined) updateData.conto_id = conto_id;

    await debito.update(updateData);
    res.json({ debito });
  } catch (error) {
    logger.error('Errore updateDebito', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento del debito' });
  }
};

const deleteDebito = async (req, res) => {
  try {
    const debito = await Debito.findOne({
      where: { id: req.params.id, user_id: req.userId, attivo: true },
    });

    if (!debito) {
      return res.status(404).json({ message: 'Debito non trovato' });
    }

    await debito.update({ attivo: false });
    res.json({ message: 'Debito eliminato' });
  } catch (error) {
    logger.error('Errore deleteDebito', { err: error });
    res.status(500).json({ message: 'Errore nell\'eliminazione del debito' });
  }
};

module.exports = {
  getDebiti,
  createDebito,
  updateDebito,
  deleteDebito,
};
```

- [ ] **Step 3: Routes**

Crea `server/routes/debiti.routes.js`:

```js
const express = require('express');
const {
  getDebiti, createDebito, updateDebito, deleteDebito,
} = require('../controllers/debiti.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateDebito,
  validateUpdateDebito,
  validateDeleteDebito,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/', authMiddleware, getDebiti);
router.post('/', authMiddleware, validateDebito, createDebito);
router.put('/:id', authMiddleware, validateUpdateDebito, updateDebito);
router.delete('/:id', authMiddleware, validateDeleteDebito, deleteDebito);

module.exports = router;
```

- [ ] **Step 4: Montare la rotta**

In `server/app.js`, aggiungi l'import dopo la riga 17 (`const cronRoutes = ...`):

```js
const debitiRoutes = require('./routes/debiti.routes');
```

Aggiungi il mount dopo la riga 110 (`app.use('/api/investimenti', investimentiRoutes);`):

```js
  app.use('/api/debiti', debitiRoutes);
```

- [ ] **Step 5: Aggiungere `debiti` alla whitelist di pulizia test**

In `server/tests/setup.js`, aggiungi `'debiti'` all'array `TABLES` (riga 51), in una posizione qualsiasi prima di `'conti'` (l'ordine non conta per `TRUNCATE ... CASCADE`, ma per leggibilità mettilo vicino alle altre tabelle satellite):

```js
const TABLES = [
  'categorie_default_nascoste',
  'categorie_personali',
  'notifiche',
  'push_subscriptions',
  'preferenze_notifiche',
  'auth_rate_limits',
  'password_reset_tokens',
  'regole_personali_merchant',
  'categorie_regole',
  'movimenti_investimento',
  'movimenti_scommesse',
  'obiettivo_contributi',
  'budget_categorie',
  'debiti',
  'movimenti',
  'investimenti',
  'piattaforme_scommesse',
  'obiettivi',
  'budget_mensili',
  'conti',
  'profili_utente',
  'users',
];
```

- [ ] **Step 6: Verifica manuale rapida (non ancora un test automatico)**

```bash
cd server && node -e "require('./app').createApp({ enableRateLimit: false }); console.log('app.js carica senza errori con debiti.routes montata');"
```

Atteso: nessun errore di require.

- [ ] **Step 7: Commit**

```bash
git add server/controllers/debiti.controller.js server/routes/debiti.routes.js server/middleware/validation.middleware.js server/app.js server/tests/setup.js
git commit -m "feat(debts): add CRUD endpoints for debiti

GET/POST/PUT/DELETE /api/debiti, isolated per user_id, soft-delete via
attivo (consistent with Conto). DELETE never destroys the row —
matches the repo's convention for financial records."
```

---

### Task 9: Test `Debiti` — CRUD e isolamento

**Files:**
- Create: `server/tests/debiti.test.js`
- Modify: `server/tests/isolation.test.js`

**Interfaces:**
- Nessuna nuova interfaccia — verifica quelle del Task 8.

- [ ] **Step 1: Test CRUD**

Crea `server/tests/debiti.test.js`:

```js
// CRUD debiti/passivita: modello semplice, isolato per utente, soft-delete.
const {
  request, createApp, registerUser, authHeader, Conto,
} = require('./setup');

describe('CRUD Debiti', () => {
  let app;
  let token;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
  });

  it('crea un debito con i valori di default per tipo e frequenza', async () => {
    const res = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send({ nome: 'Prestito auto', saldo_residuo: 5000 });

    expect(res.status).toBe(201);
    expect(res.body.debito.tipo).toBe('altro');
    expect(res.body.debito.frequenza).toBe('mensile');
    expect(res.body.debito.attivo).toBe(true);
  });

  it('crea un debito con tutti i campi', async () => {
    const res = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send({
        nome: 'Mutuo casa', tipo: 'mutuo', saldo_residuo: 150000, rata_periodica: 650,
        tasso_interesse: 2.5, taeg: 2.8, frequenza: 'mensile',
        prossima_scadenza: '2026-10-01', data_fine: '2046-10-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.debito.tipo).toBe('mutuo');
    expect(Number(res.body.debito.rata_periodica)).toBe(650);
  });

  it('rifiuta un tipo non valido', async () => {
    const res = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send({ nome: 'X', tipo: 'non_esiste', saldo_residuo: 100 });
    expect(res.status).toBe(400);
  });

  it('rifiuta un conto_id che non appartiene all\'utente', async () => {
    const res = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send({ nome: 'X', saldo_residuo: 100, conto_id: 999999 });
    expect(res.status).toBe(404);
  });

  it('collega un debito a un conto proprio', async () => {
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 0 });
    const res = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send({ nome: 'X', saldo_residuo: 100, conto_id: contoRes.body.conto.id });
    expect(res.status).toBe(201);
    expect(res.body.debito.conto_id).toBe(contoRes.body.conto.id);
  });

  it('lista solo i debiti attivi dell\'utente corrente', async () => {
    await request(app).post('/api/debiti').set(authHeader(token)).send({ nome: 'A', saldo_residuo: 100 });
    const b = await request(app).post('/api/debiti').set(authHeader(token)).send({ nome: 'B', saldo_residuo: 200 });
    await request(app).delete(`/api/debiti/${b.body.debito.id}`).set(authHeader(token));

    const res = await request(app).get('/api/debiti').set(authHeader(token));
    expect(res.body.debiti).toHaveLength(1);
    expect(res.body.debiti[0].nome).toBe('A');
  });

  it('aggiorna parzialmente un debito', async () => {
    const created = await request(app).post('/api/debiti').set(authHeader(token)).send({ nome: 'A', saldo_residuo: 1000 });
    const res = await request(app)
      .put(`/api/debiti/${created.body.debito.id}`)
      .set(authHeader(token))
      .send({ saldo_residuo: 800 });

    expect(Number(res.body.debito.saldo_residuo)).toBe(800);
    expect(res.body.debito.nome).toBe('A');
  });

  it('elimina un debito (soft-delete, non lo distrugge)', async () => {
    const created = await request(app).post('/api/debiti').set(authHeader(token)).send({ nome: 'A', saldo_residuo: 1000 });
    const del = await request(app).delete(`/api/debiti/${created.body.debito.id}`).set(authHeader(token));
    expect(del.status).toBe(200);

    const { Debito } = require('../models');
    const riga = await Debito.findByPk(created.body.debito.id);
    expect(riga).not.toBeNull();
    expect(riga.attivo).toBe(false);
  });

  it('404 su un debito inesistente', async () => {
    const res = await request(app).put('/api/debiti/999999').set(authHeader(token)).send({ nome: 'Y' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Test di isolamento cross-user**

In `server/tests/isolation.test.js`, aggiungi l'import di `Debito` alla destructuring esistente (riga 8):

```js
const {
  BudgetMensile, Obiettivo, Investimento, PiattaformaScommesse, User, ProfiloUtente, Debito,
} = require('../models');
```

Aggiungi un nuovo blocco `it` subito dopo il test `'USER_A non può leggere/modificare/eliminare l'obiettivo di USER_B'` (dopo la riga 229):

```js
  it('USER_A non può leggere/modificare/eliminare il debito di USER_B', async () => {
    const debitoB = await Debito.create({
      user_id: userIdB,
      nome: 'Prestito segreto B',
      saldo_residuo: 5000,
    });

    const listRes = await request(app)
      .get('/api/debiti')
      .set(authHeader(tokenA));
    expect(listRes.body.debiti.some((d) => d.id === debitoB.id)).toBe(false);

    const putRes = await request(app)
      .put(`/api/debiti/${debitoB.id}`)
      .set(authHeader(tokenA))
      .send({ nome: 'Rubato' });
    expect(putRes.status).toBe(404);

    const delRes = await request(app)
      .delete(`/api/debiti/${debitoB.id}`)
      .set(authHeader(tokenA));
    expect(delRes.status).toBe(404);

    await debitoB.reload();
    expect(debitoB.nome).toBe('Prestito segreto B');
    expect(debitoB.attivo).toBe(true);
  });
```

- [ ] **Step 3: Eseguire i test e verificare che passino**

```bash
cd server && NODE_ENV=test npx jest tests/debiti.test.js tests/isolation.test.js --runInBand
```

Atteso: PASS — 8 test nuovi in `debiti.test.js` + 1 nuovo in `isolation.test.js`, nessuna regressione sugli altri test di isolamento.

- [ ] **Step 4: Suite completa**

```bash
cd server && npm test
```

Atteso: 494 + 9 = 503 passed.

- [ ] **Step 5: Commit**

```bash
git add server/tests/debiti.test.js server/tests/isolation.test.js
git commit -m "test(debts): cover CRUD and cross-user isolation for debiti"
```

---

### Task 10: Patrimonio netto

Estende `FinancialSummaryService` con passività e patrimonio netto, ed espone i nuovi campi in modo additivo su `GET /api/conti/patrimonio` (i campi esistenti `totale`, `totale_conti`, `totale_investimenti` restano invariati per non rompere consumatori esistenti — nessuno di questi ha mai chiamato "netto" un valore che considerava solo le attività, quindi non c'è rinominazione da fare, solo aggiunta).

**Files:**
- Modify: `server/services/financialSummary.service.js`
- Modify: `server/controllers/conti.controller.js` (`getPatrimonioTotale`)
- Test: aggiunge a `server/tests/financialSummary.test.js`

**Interfaces:**
- Produces: `calcolaPassivita(userId, opts)` → `{ debiti, passivita_totale }`. `calcolaPatrimonioNetto(userId, opts)` → `{ patrimonio_conti, patrimonio_investimenti, patrimonio_totale, passivita_totale, patrimonio_netto }`.

- [ ] **Step 1: Estendere il service**

In `server/services/financialSummary.service.js`, aggiungi l'import di `Debito`:

```js
const { Conto, Investimento, Debito } = require('../models');
```

Aggiungi dopo `calcolaPatrimonio`:

```js
/** Passività = somma saldo_residuo dei debiti attivi. */
async function calcolaPassivita(userId, { transaction } = {}) {
  const debiti = await Debito.findAll({ where: { user_id: userId, attivo: true }, transaction });
  const passivita_totale = round2(debiti.reduce((sum, d) => sum + toNumber(d.saldo_residuo), 0));
  return { debiti, passivita_totale };
}

/**
 * Patrimonio netto = attività finanziarie (conti + investimenti) - passività
 * (debiti). Non sostituisce patrimonio_totale (che resta le sole attività,
 * come oggi): lo affianca, additivo.
 */
async function calcolaPatrimonioNetto(userId, { transaction } = {}) {
  const patrimonio = await calcolaPatrimonio(userId, { transaction });
  const { passivita_totale } = await calcolaPassivita(userId, { transaction });
  return {
    ...patrimonio,
    passivita_totale,
    patrimonio_netto: round2(patrimonio.patrimonio_totale - passivita_totale),
  };
}
```

Aggiungi `calcolaPassivita, calcolaPatrimonioNetto` a `module.exports`.

- [ ] **Step 2: Estendere l'endpoint**

In `server/controllers/conti.controller.js`, sostituisci l'import fatto nel Task 1:

```js
const { calcolaPatrimonioNetto } = require('../services/financialSummary.service');
```

(rimpiazza il precedente `calcolaPatrimonio` — resta comunque usato altrove nel file per `getConti`, quindi importa entrambi:)

```js
const { calcolaPatrimonio, calcolaPatrimonioNetto } = require('../services/financialSummary.service');
```

In `getPatrimonioTotale`, sostituisci la riga aggiunta nel Task 1:

```js
    const { patrimonio_conti: totaleConti, patrimonio_investimenti: totaleInvestimenti, patrimonio_totale: totale } = await calcolaPatrimonio(req.userId);
```

con:

```js
    const {
      patrimonio_conti: totaleConti, patrimonio_investimenti: totaleInvestimenti,
      patrimonio_totale: totale, passivita_totale, patrimonio_netto,
    } = await calcolaPatrimonioNetto(req.userId);
```

E aggiungi i due nuovi campi al `res.json` finale (dopo `variazione_percentuale`):

```js
    res.json({
      totale: Math.round(totale * 100) / 100,
      totale_conti: Math.round(totaleConti * 100) / 100,
      totale_investimenti: Math.round(totaleInvestimenti * 100) / 100,
      variazione_importo,
      variazione_percentuale,
      passivita_totale,
      patrimonio_netto,
    });
```

- [ ] **Step 3: Scrivere il test**

Aggiungi a `server/tests/financialSummary.test.js` un nuovo `describe`:

```js
describe('FinancialSummaryService.calcolaPatrimonioNetto', () => {
  const { Debito } = require('../models');
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
  });

  it('patrimonio netto = attivita - passivita (solo debiti attivi)', async () => {
    await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 5000, attivo: true,
    });
    await Debito.create({
      user_id: userId, nome: 'Prestito', saldo_residuo: 2000, attivo: true,
    });
    await Debito.create({
      user_id: userId, nome: 'Estinto', saldo_residuo: 999, attivo: false,
    });

    const { calcolaPatrimonioNetto } = require('../services/financialSummary.service');
    const result = await calcolaPatrimonioNetto(userId);

    expect(result.patrimonio_totale).toBe(5000);
    expect(result.passivita_totale).toBe(2000);
    expect(result.patrimonio_netto).toBe(3000);
  });

  it('GET /api/conti/patrimonio espone passivita_totale e patrimonio_netto senza cambiare i campi esistenti', async () => {
    await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
    await Debito.create({
      user_id: userId, nome: 'Prestito', saldo_residuo: 300, attivo: true,
    });

    const res = await request(app).get('/api/conti/patrimonio').set(authHeader(token));

    expect(res.body.totale).toBe(1000);
    expect(res.body.passivita_totale).toBe(300);
    expect(res.body.patrimonio_netto).toBe(700);
  });
});
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

```bash
cd server && NODE_ENV=test npx jest tests/financialSummary.test.js --runInBand
```

Atteso: PASS, 3 + 2 = 5 test verdi.

- [ ] **Step 5: Suite completa**

```bash
cd server && npm test
```

Atteso: 503 + 2 = 505 passed.

- [ ] **Step 6: Commit**

```bash
git add server/services/financialSummary.service.js server/controllers/conti.controller.js server/tests/financialSummary.test.js
git commit -m "feat(finance): expose patrimonio netto (attivita - passivita)

GET /api/conti/patrimonio gains passivita_totale and patrimonio_netto,
additive fields alongside the existing totale/totale_conti/
totale_investimenti (which stay gross, attivita-only, as before — no
existing field ever meant 'net')."
```

---

### Task 11: Logging — proteggere i nuovi campi finanziari

**Files:**
- Modify: `server/utils/logger.js`
- Test: `server/tests/logSanitization.test.js` (verificare prima se esiste già un test di sanitizzazione da estendere — altrimenti crearlo)

**Interfaces:**
- Estende `FINANCIAL_KEYS` (nessuna nuova funzione).

- [ ] **Step 1: Verificare l'esistenza di un test di logging**

```bash
cd server && ls tests/ | grep -i log
```

Se esiste un file (es. `logger.test.js`), usalo al posto di crearne uno nuovo negli step successivi — adatta i percorsi di conseguenza. Se non esiste, prosegui con `server/tests/logSanitization.test.js` come sotto.

- [ ] **Step 2: Estendere `FINANCIAL_KEYS`**

In `server/utils/logger.js`, sostituisci il blocco `FINANCIAL_KEYS` (righe 55-77) aggiungendo le nuove chiavi introdotte da questo piano:

```js
const FINANCIAL_KEYS = new Set([
  'importo',
  'saldo',
  'saldo_iniziale',
  'saldo_attuale',
  'saldo_dopo',
  'importo_target',
  'importo_totale',
  'importo_iniziale',
  'importo_attuale',
  'patrimonio',
  'patrimonio_totale',
  'entrata_mensile',
  'costo_abitazione',
  'stima_bollette',
  'spesa_benzina',
  'spesa_mezzi',
  'spese_fisse_extra',
  'limite_mensile',
  'budget_importo',
  'totale_entrate_giorno',
  'totale_uscite_giorno',
  // Financial Foundation (liquidita, essenzialita, fondo sicurezza, debiti, netto)
  'liquidita_libera',
  'liquidita_allocata',
  'saldo_conti',
  'impegni_pertinenti',
  'patrimonio_netto',
  'passivita',
  'passivita_totale',
  'saldo_residuo',
  'rata_periodica',
  'rata',
  'tasso_interesse',
  'taeg',
  'importo_fondo',
  'spese_essenziali_mensili',
  'mesi_copertura',
  'totale_conti',
  'totale_investimenti',
  'patrimonio_conti',
  'patrimonio_investimenti',
  'patrimonio_investito_totale',
]);
```

- [ ] **Step 3: Scrivere il test (se non esiste già una suite da estendere)**

Crea `server/tests/logSanitization.test.js`:

```js
// I nuovi campi finanziari introdotti dal Financial Brain non devono mai
// comparire in chiaro nei log: FINANCIAL_KEYS è una redazione ricorsiva per
// chiave, applicata a ogni oggetto passato a logger.*.
const logger = require('../utils/logger');

describe('Sanitizzazione log — nuovi campi finanziari', () => {
  const NUOVE_CHIAVI = [
    'liquidita_libera', 'liquidita_allocata', 'saldo_conti', 'impegni_pertinenti',
    'patrimonio_netto', 'passivita_totale', 'saldo_residuo', 'rata_periodica',
    'tasso_interesse', 'taeg', 'importo_fondo', 'spese_essenziali_mensili', 'mesi_copertura',
  ];

  it.each(NUOVE_CHIAVI)('redige %s quando compare come chiave di un oggetto loggato', (chiave) => {
    const spy = jest.spyOn(logger.transports[0], 'log').mockImplementation((info, cb) => cb && cb());
    logger.info('test log', { [chiave]: 12345.67 });
    const chiamata = spy.mock.calls.find((c) => c[0][chiave] !== undefined || JSON.stringify(c[0]).includes(chiave));
    expect(chiamata).toBeDefined();
    expect(JSON.stringify(chiamata[0])).not.toContain('12345.67');
    expect(JSON.stringify(chiamata[0])).toContain('[REDACTED]');
    spy.mockRestore();
  });
});
```

Nota: se l'ispezione allo Step 1 rivela una suite esistente con un helper diverso per verificare la redazione (es. chiamando direttamente una funzione `sanitizeMeta` esportata), preferisci riusare quello stile invece di questo mock su `transports[0].log` — l'obiettivo è verificare che il valore numerico non compaia mai in chiaro nell'output, non la forma esatta del test.

- [ ] **Step 4: Eseguire il test e verificare che passi**

```bash
cd server && NODE_ENV=test npx jest tests/logSanitization.test.js --runInBand
```

Atteso: PASS, 13 test verdi (uno per chiave).

- [ ] **Step 5: Suite completa**

```bash
cd server && npm test
```

Atteso: 505 + 13 = 518 passed.

- [ ] **Step 6: Commit**

```bash
git add server/utils/logger.js server/tests/logSanitization.test.js
git commit -m "chore(security): extend FINANCIAL_KEYS log redaction

Covers every new financial field introduced by this branch: liquidita
libera/allocata, impegni pertinenti, patrimonio netto, passivita,
debito residuo/rata/tasso/taeg, fondo sicurezza e mesi di copertura."
```

---

### Task 12: Documentazione tecnica — correzioni

Corregge solo le imprecisioni verificate contro il codice reale, non riscrive la documentazione.

**Files:**
- Modify: `docs/DATABASE.md`
- Modify: `docs/API.md`
- Modify: `docs/PROJECT_STATUS.md`
- Modify: `docs/DECISIONS.md`
- Modify: `CLAUDE.md`

**Interfaces:** nessuna (solo testo).

- [ ] **Step 1: `docs/DATABASE.md`**

Correggi (verificato contro `server/config/database.js` e `server/package.json`):
- Motore DB dichiarato "MySQL 8.x" → `PostgreSQL (Supabase)`.
- Driver dichiarato "mysql2 3.22" → `pg ^8.23.0 + pg-hstore ^2.3.4`.
- `DB_PORT` default `3306` → `5432`; aggiungi menzione di `DATABASE_URL` come path primario.
- Aggiungi la tabella mancante `auth_rate_limits` (modello `AuthRateLimit.js`) all'elenco tabelle.
- Aggiorna l'elenco migrazioni fino a `20260917000024-create-debiti.js` incluso (tutte quelle di questo piano + le 7 già mancanti prima di iniziare: `20260907000015` → `20260914000021`).

- [ ] **Step 2: `docs/API.md`**

Verifica il conteggio endpoint reale dopo le aggiunte di questo piano:

```bash
cd server && grep -rn "router\.\(get\|post\|put\|delete\|patch\)" routes/ | wc -l
```

Aggiorna il numero dichiarato in `docs/API.md` con il valore reale (era 92 prima di questo piano; +6 nuove rotte di questo piano: `GET /conti/liquidita`, `GET /obiettivi/:id/copertura`, `GET/POST/PUT/DELETE /debiti`), e aggiungi le voci mancanti per i nuovi endpoint (`GET /api/conti/liquidita`, `GET /api/obiettivi/:id/copertura`, `GET/POST/PUT/DELETE /api/debiti`).

- [ ] **Step 3: `docs/PROJECT_STATUS.md`**

Correggi (verificato: fortemente disallineato):
- Righe che dichiarano "12 suite... 125 test" e "richiede MySQL test DB" → aggiorna al conteggio reale post-piano (esegui `npm test` finale nel Task 13 e usa quel numero) e a PostgreSQL.
- La sezione "Session reset" (Known Bugs + P-7) che lo tratta come bug aperto → allinea a `CLAUDE.md` Known Issues §9 ("Risolto", commit `f565764`).
- La contraddizione interna sullo step-up Google (righe che dicono "Risolto" vs P-1 "RIAPERTO, RISCHIO ACCETTATO") → tieni solo la versione corretta (RIAPERTO/rischio accettato, coerente con `docs/SECURITY.md` e `CLAUDE.md`).
- Aggiungi una voce di roadmap per il Financial Brain completato da questo piano (patrimonio centralizzato, liquidità, essenzialità, fondo sicurezza, debiti, patrimonio netto) e per Piano Smart come prossimo passo non ancora iniziato.

- [ ] **Step 4: `docs/DECISIONS.md`**

Correggi:
- "Decision: MySQL con Sequelize ORM" → PostgreSQL con Sequelize ORM (l'ORM era già corretto, solo il motore era sbagliato).
- Conteggi obsoleti ("15 modelli, 16 migrazioni", "12 suite, 125 test") → valori reali post-piano.

- [ ] **Step 5: `CLAUDE.md`**

Aggiorna:
- "Migrazioni via `sequelize-cli` (25 file...)" → conteggio reale (`ls server/migrations | wc -l`, 28 prima di questo piano + 3 di questo piano = 31).
- "16 modelli Sequelize" (Repository Structure) → conteggio reale (21 prima + `Debito` = 22).
- Known Issue #7 "38 suite — 465 test" → il numero reale della suite finale di questo piano (verificato in Task 13).
- Aggiungi ai `Coding Rules`/`Sensitive Areas` un rimando ai nuovi service (`financialSummary.service.js`, `liquidita.service.js`, `essenzialita.service.js`, `fondoSicurezza.service.js`) come punto centrale per patrimonio/liquidità/essenzialità/fondo sicurezza, sul modello della Regola 18 già esistente per le categorie.

- [ ] **Step 6: Verificare che nessun conteggio nei quattro file sia rimasto disallineato tra loro**

```bash
grep -rn "38 suite\|465 test\|125 test\|12 suite\|25 file\|25 migrazioni\|16 modelli\|MySQL\|mysql2" docs/*.md CLAUDE.md
```

Rivedi ogni riga trovata: deve riportare valori coerenti col codice reale e tra i vari file.

- [ ] **Step 7: Commit**

```bash
git add docs/DATABASE.md docs/API.md docs/PROJECT_STATUS.md docs/DECISIONS.md CLAUDE.md
git commit -m "docs: correct stale technical facts (engine, counts, resolved issues)

DATABASE.md and DECISIONS.md claimed MySQL/mysql2; the real engine is
PostgreSQL via pg. PROJECT_STATUS.md still listed session-reset and
Google step-up as open/contradictory when CLAUDE.md and SECURITY.md
already had the correct, current state. Migration/model/test counts
updated to match the repository after this branch."
```

---

### Task 13: Verifica finale e report

**Files:** nessuno (solo esecuzione e verifica).

- [ ] **Step 1: Suite completa**

```bash
cd server && npm test 2>&1 | tail -20
```

Atteso: tutte le suite verdi, il conteggio finale dei test riflette la baseline (467) + tutti i test aggiunti da questo piano.

- [ ] **Step 2: Suite unit (senza DB, per verificare che nulla dipenda da side-effect impliciti)**

```bash
cd server && npm run test:unit 2>&1 | tail -20
```

Atteso: nessuna regressione rispetto alla baseline (10 suite, 65 passed + 1 skipped) — i nuovi test richiedono tutti il DB, quindi non dovrebbero comparire qui; se compaiono, verifica che non usino codice del piano che si aspettava mock.

- [ ] **Step 3: Verificare lo stato delle migration su un DB pulito**

```bash
cd server && DB_NAME=wallt_test_verifica npx sequelize-cli db:migrate:status 2>&1 | tail -10
```

(oppure lascia che `server/tests/setup.js` le rilanci da zero in un nuovo processo Jest, che è già ciò che fa `npm test`.)

- [ ] **Step 4: Rivedere il diff completo**

```bash
git diff main --stat
```

Verifica che nessun file fuori dal perimetro dichiarato (nessun file `client/src/views/`, `client/src/router/`, `client/src/components/` — eccetto il generato `categorie.generated.json` — nessun `AppLayout.vue`) sia stato toccato.

- [ ] **Step 5: Verificare la preparazione al futuro `getFinancialContext(userId)`**

Nessuna nuova funzione da scrivere (esplicitamente fuori scope — vedi Global Constraints). Verifica solo che l'architettura prodotta la renda facile da aggiungere in seguito:

```bash
grep -rn "^module.exports" server/services/financialSummary.service.js server/services/liquidita.service.js server/services/essenzialita.service.js server/services/fondoSicurezza.service.js
```

Conferma che ognuno dei 4 nuovi service esporti funzioni pure che accettano `userId` (più eventuali opzioni) e restituiscano dati puri, senza leggere `req`/`res` né dipendere da altri service di questo gruppo in modo circolare. Una futura `getFinancialContext(userId)` potrà chiamare in parallelo `calcolaPatrimonioNetto`, `calcolaLiquidita`, `calcolaMesiCopertura` (per ogni obiettivo `fondo_sicurezza`) e riusare `essenzialita.service` per le spese — senza toccare i controller. Annota questa conferma nel report finale (Step 6), non serve altro codice.

- [ ] **Step 6: Preparare il report finale** (nessun comando — sintesi da riportare in chat, non un nuovo file)

Il report finale deve includere, come richiesto dal brief:
1. File modificati/creati (elenco completo, già tracciato dai commit di ogni task).
2. Migration create: `20260917000022-add-essenzialita-categorie-personali.js`, `20260917000023-add-tipo-obiettivo.js`, `20260917000024-create-debiti.js`.
3. Nuovi endpoint: `GET /api/conti/liquidita`, `GET /api/obiettivi/:id/copertura`, `GET|POST|PUT|DELETE /api/debiti`, campi additivi su `GET /api/conti/patrimonio` (`passivita_totale`, `patrimonio_netto`), campo `essenzialita` su `GET /api/categorie` e `POST/PUT /api/categorie`.
4. Nuovi service: `financialSummary.service.js`, `liquidita.service.js`, `essenzialita.service.js`, `fondoSicurezza.service.js`.
5. Modello liquidità scelto: overlay virtuale, nessun sottoconto persistito.
6. Formula liquidità libera: `saldo conti attivi - liquidità allocata (obiettivi attivi) - impegni pertinenti (ricorrenti mensili non ancora eseguiti questo periodo)`.
7. Formula patrimonio netto: `patrimonio_totale (conti attivi + investimenti attivi) - passivita_totale (debiti attivi)`.
8. Gestione essenzialità: campo strutturato sul catalogo + categorie personali, sostituita l'euristica hardcoded in `getSuggerimenti`.
9. Gestione fondo sicurezza: `tipo_obiettivo`, endpoint dedicato, 3 stati (`disponibile`/`non_calcolabile`/`dati_insufficienti`).
10. Modello debiti: campi, tipi, isolamento, soft-delete.
11. Test aggiunti: elenco file e conteggio.
12. Risultato test: numero finale suite/test.
13. TODO/decisioni per il branch frontend: i tre contratti API richiesti esplicitamente dalla spec frontend (essenzialità + endpoint di modifica; `tipo_obiettivo`/mesi di copertura/testo esplicativo; CRUD debiti/forma dati) — con l'esatta forma JSON di risposta per ciascuno.
14. Nessun push su `main`; il branch resta `feature/financial-foundation-backend`, pronto per push su richiesta esplicita dell'utente.
