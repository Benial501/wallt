# Budget come consulente — piano di implementazione

> **Per gli agenti:** SOTTO-SKILL OBBLIGATORIA: usare superpowers:subagent-driven-development (consigliata) o superpowers:executing-plans per eseguire il piano task per task. I passi usano le caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** sostituire il budget mensile per categoria con un piano unico a tre
macro-categorie (Bisogni, Desideri, Futuro), con modelli pronti, un modello
consigliato dal profilo e una frase di consiglio.

**Architettura:**
- Il piano sta in quattro colonne nuove di `profili_utente`; la base è
  `entrata_mensile`, che esiste già.
- Tre moduli puri lato server:
  - il modello e gli importi;
  - quale voce conta un movimento;
  - quale consiglio dare.
- Un solo servizio con il database (`budgetStato.service.js`) li combina, e lo
  leggono API, notifiche e Analisi.
- Lato client, uno store riscritto e tre schermate: pagina, scelta del modello,
  dettaglio di una voce.

**Tecnologie:** Express 5, Sequelize 6 su PostgreSQL, express-validator, Jest +
supertest (server); Vue 3 `<script setup>`, Pinia, `creaRisorsa`, `node --test`
(client).

**Spec:** `docs/superpowers/specs/2026-11-23-budget-consulente-design.md`. Va
letta prima di iniziare: questo piano ne riporta le decisioni, non il perché.

## Vincoli globali

- Tutto il testo attorno al codice è in italiano: commenti, commit, messaggi
  d'errore, UI e documentazione. Gli identificatori restano in inglese.
- Fanno eccezione gli identificatori di dominio già in uso: `voce`, `piano`,
  `entrata`.
- Ogni commit termina con la riga
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Gli importi si calcolano in centesimi interi. Si convertono in euro (numero a
  due decimali) solo nella risposta dell'API.
- Modelli pronti: `equilibrato` 50/30/20, `spese_fisse_alte` 70/20/10,
  `risparmio_deciso` 40/30/30. Il quarto modello è `personalizzato`.
- `SOGLIA_SPESE_FISSE_ALTE = 0.40`, con confronto stretto («oltre»).
- Soglie degli avvisi: 80 e 100. Il suggerimento di cambio modello richiede 3
  mesi completi osservati.
- Tipi di conto del Futuro: `risparmio`, `investimenti`, `emergenza`.
- Voci fisse: `investimento` è sempre Futuro, `deposito_scommesse` è sempre
  Desideri. Nessuna delle due è spostabile.
- Contano solo i movimenti con `muoveSaldo(m)` vero (`ricorrenti.service.js`).
- Il testo push non contiene importi (Regola 17).
- `server/constants/budget.js` non contiene nessun `require` (Regola 22).
- Le letture del client passano da `creaRisorsa` e `DataState`, e fuori dallo
  store si espongono getter calcolati (Coding Rules 17 e 23).
- Il testo minimo nell'interfaccia è `--text-xs` (Coding Rule 19).
- In produzione la migrazione va applicata prima di pubblicare il codice: le
  migrazioni non girano all'avvio.
- Non committare la cartella `.superpowers/`.

## Punti da sorvegliare in revisione

1. **Utente senza entrata** (onboarding saltato), oppure entrata azzerata dopo
   aver scelto il modello. Atteso:
   - il `PUT` risponde 422 `entrata_mancante`;
   - la pagina chiede l'entrata invece di mostrare barre a 0 €;
   - non parte nessuna notifica.

   Test nei Task 5, 7 e 8.
2. **Categoria archiviata con spese nel mese.** Atteso: l'importo resta nella
   voce della sua essenzialità e non finisce nei Desideri come «non
   classificata»; la categoria non compare fra «nessuna spesa questo mese».
   Test nel Task 6.
3. **Cambio di modello a metà mese.** Atteso: `GET /stato` mostra subito i nuovi
   obiettivi, e le notifiche già inviate nel mese non si ripetono. Test nei Task
   7 e 8.
4. **«Personalizzato» con Futuro a 0%.** Atteso: niente «Futuro indietro»,
   divisioni per zero o percentuali `NaN`; il consiglio passa a «in regola».
   Test nei Task 3 e 5.
5. **Entrata con i centesimi** (per esempio 1.000,01 €). Atteso: i tre obiettivi
   sommano esattamente all'entrata. Test nel Task 3.

---

## Task 1: vocabolario condiviso, etichette e contratto client/server

**File:**
- Crea: `server/constants/budget.js`
- Crea: `client/src/utils/budget.js`
- Modifica: `client/src/content/glossario.js` (nuovi concetti nell'array `CONCETTI`)
- Test: `client/tests/budgetContratto.test.js`

**Interfacce:**
- Produce (server, CommonJS, `module.exports`):
  - `VOCI = ['bisogni', 'desideri', 'futuro']`;
  - `ETICHETTE_VOCI = { bisogni: 'Bisogni', desideri: 'Desideri', futuro: 'Futuro' }`;
  - `MODELLI_PRONTI = { equilibrato: { bisogni: 50, desideri: 30, futuro: 20 }, spese_fisse_alte: { bisogni: 70, desideri: 20, futuro: 10 }, risparmio_deciso: { bisogni: 40, desideri: 30, futuro: 30 } }`;
  - `MODELLO_PERSONALIZZATO = 'personalizzato'`;
  - `MODELLI_IDS = ['equilibrato', 'spese_fisse_alte', 'risparmio_deciso', 'personalizzato']`;
  - `SOGLIA_SPESE_FISSE_ALTE = 0.40`;
  - `SOGLIE_AVVISO = [80, 100]`;
  - `MESI_SUGGERIMENTO_MODELLO = 3`;
  - `TIPI_CONTO_FUTURO = ['risparmio', 'investimenti', 'emergenza']`;
  - `CATEGORIE_VOCE_FISSA = { investimento: 'futuro', deposito_scommesse: 'desideri' }`;
  - `CODICI_CONSIGLIO = ['entrata_mancante', 'bisogni_oltre', 'desideri_oltre', 'futuro_indietro', 'in_regola']`;
  - `percentualiValide(p) -> boolean`: vero solo se `p` ha esattamente le tre
    chiavi di `VOCI`, ciascuna un intero da 0 a 100, con somma 100.
- Produce (client, ESM): le stesse costanti con gli stessi nomi
  (`Object.freeze`) e la stessa `percentualiValide`.
- Produce (glossario): concetti `budget_bisogni`, `budget_desideri`,
  `budget_futuro` con `etichetta` uguale a `ETICHETTE_VOCI` e `topic:
  'budget-come-funziona'`. Le descrizioni sono le frasi della pagina:
  - «Ciò che devi pagare comunque: casa, bollette, spesa, trasporti, salute.»
  - «Ciò che scegli di spendere: svago, ristoranti, shopping, abbonamenti.»
  - «Ciò che metti da parte: risparmio, fondo di emergenza, investimenti.»

- [ ] **Passo 1: scrivere il test che fallisce** in `client/tests/budgetContratto.test.js`, sul modello di `fondoEmergenzaContratto.test.js` (`node:test`, import default del modulo server).

```js
test('le costanti coincidono fra client e server', () => {
  for (const nome of ['VOCI', 'MODELLI_IDS', 'CODICI_CONSIGLIO', 'TIPI_CONTO_FUTURO', 'SOGLIE_AVVISO']) {
    assert.deepEqual([...client[nome]], [...server[nome]], nome);
  }
  assert.deepEqual(client.MODELLI_PRONTI, server.MODELLI_PRONTI);
  assert.deepEqual(client.ETICHETTE_VOCI, server.ETICHETTE_VOCI);
  assert.deepEqual(client.CATEGORIE_VOCE_FISSA, server.CATEGORIE_VOCE_FISSA);
  assert.equal(client.SOGLIA_SPESE_FISSE_ALTE, server.SOGLIA_SPESE_FISSE_ALTE);
  assert.equal(client.MESI_SUGGERIMENTO_MODELLO, server.MESI_SUGGERIMENTO_MODELLO);
});
test('ogni modello pronto è un piano valido', () => {
  Object.values(server.MODELLI_PRONTI).forEach((p) => assert.equal(server.percentualiValide(p), true));
});
test('percentualiValide risponde uguale sui due lati', () => {
  const casi = [
    { bisogni: 50, desideri: 30, futuro: 20 }, { bisogni: 50, desideri: 30, futuro: 19 },
    { bisogni: 50.5, desideri: 29.5, futuro: 20 }, { bisogni: 101, desideri: 0, futuro: -1 },
    { bisogni: 100, desideri: 0, futuro: 0 }, { bisogni: 50, desideri: 50 }, null, {},
    { bisogni: '50', desideri: 30, futuro: 20 },
  ];
  casi.forEach((c) => assert.equal(client.percentualiValide(c), server.percentualiValide(c), JSON.stringify(c)));
  assert.equal(server.percentualiValide({ bisogni: 100, desideri: 0, futuro: 0 }), true);
  assert.equal(server.percentualiValide({ bisogni: '50', desideri: 30, futuro: 20 }), false);
});
test('le etichette delle voci sono quelle del glossario', () => {
  server.VOCI.forEach((v) => assert.equal(GLOSSARIO[`budget_${v}`].etichetta, server.ETICHETTE_VOCI[v]));
});
test('il vocabolario del server non carica nessun modulo', () => {
  const testo = readFileSync(new URL('../../server/constants/budget.js', import.meta.url), 'utf8');
  assert.equal(/require\(/.test(testo), false);
});
test('il tipo di conto del fondo è fra i conti del Futuro', () => {
  assert.ok(server.TIPI_CONTO_FUTURO.includes(serverFondo.TIPO_CONTO_FONDO));
});
```

- [ ] **Passo 2:** `cd client && node --test tests/budgetContratto.test.js` → FALLISCE (modulo non trovato).
- [ ] **Passo 3: creare i due moduli e i tre concetti del glossario.** Il commento in testa a `constants/budget.js` spiega perché non ha `require` (vedi `constants/fondoEmergenza.js`).
- [ ] **Passo 4:** `cd client && node --test tests/budgetContratto.test.js tests/glossario.test.js` → PASSA.
- [ ] **Passo 5: commit.**

```bash
git add server/constants/budget.js client/src/utils/budget.js client/src/content/glossario.js client/tests/budgetContratto.test.js
git commit -m "Aggiunge il vocabolario del budget a tre voci e il suo contratto client/server" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: colonne del piano sul profilo

**File:**
- Crea: `server/migrations/20261123000058-profilo-budget-piano.js`
- Modifica: `server/models/ProfiloUtente.js` (dopo `orizzonte_data`)
- Modifica: `docs/DATABASE.md` (sezione `profili_utente`)
- Test: `server/tests/budgetPianoVincolo.test.js`

**Interfacce:**
- Produce: attributi `budget_modello` (STRING(30), null),
  `budget_pct_bisogni`, `budget_pct_desideri`, `budget_pct_futuro` (SMALLINT,
  null).
- Produce: vincolo `profili_utente_budget_piano_valido`:

```sql
(budget_modello IS NULL AND budget_pct_bisogni IS NULL AND budget_pct_desideri IS NULL AND budget_pct_futuro IS NULL)
OR (budget_modello IN ('equilibrato','spese_fisse_alte','risparmio_deciso','personalizzato')
    AND budget_pct_bisogni BETWEEN 0 AND 100 AND budget_pct_desideri BETWEEN 0 AND 100 AND budget_pct_futuro BETWEEN 0 AND 100
    AND budget_pct_bisogni + budget_pct_desideri + budget_pct_futuro = 100)
```

Le colonne **non** vanno aggiunte ad `ALLOWED_FIELDS` di `profilo.controller.js`:
si scrivono solo da `PUT /api/budget/piano`.

- [ ] **Passo 1: scrivere il test che fallisce.** Registra un utente (`registerUser`) e legge il suo `ProfiloUtente`. Contiene tre test:
  - `il piano valido si salva`: `update({ budget_modello: 'equilibrato', budget_pct_bisogni: 50, budget_pct_desideri: 30, budget_pct_futuro: 20 })` → `reload()` restituisce gli stessi valori;
  - `il database rifiuta una somma diversa da 100`: con 50/30/19 l'update fallisce con `expect(...).rejects.toThrow()`;
  - `il database rifiuta un piano a metà`: modello valorizzato e percentuali `null` → l'update fallisce.
- [ ] **Passo 2:** `cd server && npx jest tests/budgetPianoVincolo.test.js` → FALLISCE (colonne assenti).
- [ ] **Passo 3: scrivere la migrazione.**
  - `up`: quattro `addColumn` e `addConstraint` di tipo `check`, dentro una transazione, sul modello di `20261031000053-create-abbonamenti.js`;
  - `down`: rimuove il vincolo e poi le colonne;
  - un commento in testa spiega che non serve hardening RLS, perché la tabella è già protetta.

  Poi aggiungere gli attributi al modello e la riga in `docs/DATABASE.md`.
- [ ] **Passo 4:** `cd server && npx jest tests/budgetPianoVincolo.test.js tests/migrazioniReali.test.js tests/migrations.postgres.test.js` → PASSA.
- [ ] **Passo 5: commit** con il messaggio «Aggiunge al profilo il piano del budget con il vincolo sulla somma».

---

## Task 3: modello consigliato e importi per voce (puro)

**File:**
- Crea: `server/utils/speseFisse.js` (sposta qui `calcolaSpeseFisse` da
  `profilo.controller.js`; il controller la importa finché esiste
  `calcolaBudgetSuggerito`, che il Task 7 elimina)
- Crea: `server/services/budgetModello.js`
- Modifica: `server/controllers/profilo.controller.js` (import al posto della
  definizione)
- Modifica: `server/jest.unit.config.js` (aggiunge il test)
- Test: `server/tests/budgetModello.test.js`

**Interfacce:**
- Consuma: `constants/budget.js` (Task 1).
- Produce:
  - `calcolaSpeseFisse(profilo) -> number`, in euro, con lo stesso comportamento
    di oggi;
  - `consigliaModello(profilo) -> { modello, percentuali, motivo: { codice, quota_spese_fisse } }`:
    - `codice` è uno fra `'vive_con_genitori'`, `'spese_fisse_alte'`,
      `'equilibrato'` e `'senza_entrata'`;
    - `quota_spese_fisse` è un numero da 0 a 1 con due decimali, oppure `null`;
  - `percentualiDelPiano(modello, percentuali) -> {bisogni, desideri, futuro} | null`:
    - per un modello pronto restituisce le percentuali del server e ignora le
      altre;
    - per `personalizzato` restituisce `percentuali` se valide, altrimenti `null`;
    - per un modello sconosciuto restituisce `null`;
  - `obiettiviInCentesimi(percentuali, entrataEuro) -> {bisogni, desideri, futuro}`:
    interi in centesimi a somma esatta, con il resto distribuito sulle parti
    frazionarie più alte (metodo del resto maggiore) e, a parità, nell'ordine
    di `VOCI`. Un'entrata nulla o minore di zero restituisce tre zeri.

- [ ] **Passo 1: scrivere il test che fallisce.**

```js
describe('consigliaModello', () => {
  it('chi vive con i genitori riceve Risparmio deciso', () => {
    expect(consigliaModello({ situazione_abitativa: 'vivo_con_genitori', entrata_mensile: 1200 }).modello).toBe('risparmio_deciso');
  });
  it('spese fisse oltre il 40% → Spese fisse alte', () => {
    const r = consigliaModello({ situazione_abitativa: 'affitto', costo_abitazione: 700, paga_bollette: 'tutte', stima_bollette: 110, entrata_mensile: 2000 });
    expect(r.modello).toBe('spese_fisse_alte');
    expect(r.motivo).toEqual({ codice: 'spese_fisse_alte', quota_spese_fisse: 0.41 });
  });
  it('esattamente il 40% resta Equilibrato', () => {
    expect(consigliaModello({ situazione_abitativa: 'affitto', costo_abitazione: 800, entrata_mensile: 2000 }).modello).toBe('equilibrato');
  });
  it('senza entrata consiglia Equilibrato senza quota', () => {
    expect(consigliaModello({ entrata_mensile: null }).motivo).toEqual({ codice: 'senza_entrata', quota_spese_fisse: null });
  });
});
describe('obiettiviInCentesimi', () => {
  it('2.000 € con 50/30/20', () => {
    expect(obiettiviInCentesimi({ bisogni: 50, desideri: 30, futuro: 20 }, 2000)).toEqual({ bisogni: 100000, desideri: 60000, futuro: 40000 });
  });
  it('1.000,01 € somma esattamente', () => {
    const o = obiettiviInCentesimi({ bisogni: 50, desideri: 30, futuro: 20 }, 1000.01);
    expect(o.bisogni + o.desideri + o.futuro).toBe(100001);
    expect(o).toEqual({ bisogni: 50001, desideri: 30000, futuro: 20000 });
  });
  it('Futuro allo 0% vale 0 centesimi', () => {
    expect(obiettiviInCentesimi({ bisogni: 70, desideri: 30, futuro: 0 }, 1500).futuro).toBe(0);
  });
});
describe('percentualiDelPiano', () => {
  it('un modello pronto ignora le percentuali inviate', () => {
    expect(percentualiDelPiano('equilibrato', { bisogni: 10, desideri: 10, futuro: 80 })).toEqual({ bisogni: 50, desideri: 30, futuro: 20 });
  });
  it('personalizzato invalido → null', () => {
    expect(percentualiDelPiano('personalizzato', { bisogni: 60, desideri: 30, futuro: 20 })).toBeNull();
  });
});
```

- [ ] **Passo 2:** `cd server && npx jest -c jest.unit.config.js tests/budgetModello.test.js` → FALLISCE.
- [ ] **Passo 3: implementare i due moduli** con le firme qui sopra. La regola di `consigliaModello` è la sezione «Il modello consigliato» della spec.
- [ ] **Passo 4:** `cd server && npm run test:unit` → PASSA, compresi i test di profilo già esistenti.
- [ ] **Passo 5: commit** con il messaggio «Calcola il modello di budget consigliato e gli obiettivi in centesimi».

---

## Task 4: quale voce conta un movimento (puro)

**File:**
- Crea: `server/services/budgetMacro.js`
- Modifica: `server/jest.unit.config.js`
- Test: `server/tests/budgetMacro.test.js`

**Interfacce:**
- Consuma: `constants/budget.js`.
- Produce:
  - `voceDellaCategoria(categoriaId, essenzialitaPerCategoria: Map<string,string>) -> 'bisogni'|'desideri'|'futuro'`:
    - legge prima `CATEGORIE_VOCE_FISSA`;
    - poi `essenziale` → `bisogni`;
    - in tutti gli altri casi, compresa una categoria assente dalla mappa, → `desideri`;
  - `contributoMovimento(movimento, { tipoConto: Map<id,string>, essenzialitaPerCategoria }) -> { voce, centesimi } | null`:
    - il chiamante ha già escluso i movimenti con `muoveSaldo` falso;
    - `centesimi` è con segno, e si ottiene con `Math.round(importo * 100)`;
    - segue la tabella «Quale spesa va in quale voce» della spec:
      - `uscita` → voce della categoria, positivo;
      - `trasferimento` con categoria `deposito_scommesse` → `desideri`, positivo;
      - `trasferimento` da un conto non-Futuro a un conto Futuro → `futuro`, positivo;
      - `trasferimento` da un conto Futuro a un conto non-Futuro → `futuro`, negativo;
      - ogni altro trasferimento ed ogni entrata → `null`;
    - un conto assente da `tipoConto` conta come non-Futuro;
  - `aggregaPerVoce(movimenti, contesto) -> { bisogni: { centesimi, perCategoria: Map<string,number> }, desideri: {...}, futuro: { centesimi, movimenti: Array<{ id, data, descrizione, centesimi, conto_id }> } }`.

- [ ] **Passo 1: scrivere il test che fallisce.** Contiene un caso per ciascuna riga della tabella. Fra i nomi:
  - `l'uscita Investimenti è Futuro anche se il catalogo la dice discrezionale`;
  - `il trasferimento verso il fondo vale +` (conto `emergenza`, 150 → `{ voce: 'futuro', centesimi: 15000 }`);
  - `il ritorno dal conto risparmio vale −` (→ `-15000`);
  - `fra due conti di risparmio non conta` (→ `null`);
  - `il deposito scommesse è Desideri`;
  - `supermercato (essenziale) è Bisogni`;
  - `palestra (semi_essenziale) è Desideri`;
  - `una categoria sconosciuta è Desideri`;
  - `un'entrata non conta`;
  - `aggregaPerVoce somma per categoria e tiene l'elenco del Futuro`: due uscite
    supermercato da 40 e 20 danno `perCategoria.get('supermercato') === 6000`.
- [ ] **Passo 2:** `cd server && npx jest -c jest.unit.config.js tests/budgetMacro.test.js` → FALLISCE.
- [ ] **Passo 3: implementare `budgetMacro.js`.**
- [ ] **Passo 4:** stesso comando → PASSA.
- [ ] **Passo 5: commit** con il messaggio «Assegna ogni movimento a Bisogni, Desideri o Futuro».

---

## Task 5: la frase del consulente (puro)

**File:**
- Crea: `server/services/budgetConsiglio.js`
- Modifica: `server/jest.unit.config.js`
- Test: `server/tests/budgetConsiglio.test.js`

**Interfacce:**
- Produce `scegliConsiglio(input) -> { codice, dati }`. Gli importi sono in
  centesimi. `input` contiene:
  - `entrataCentesimi`;
  - `modello`;
  - `giorniRimanenti`;
  - `bisogniOltreDaTreMesi: boolean`;
  - `voci: { bisogni: { obiettivo, usato }, desideri: { obiettivo, usato, perCategoria: Map }, futuro: { obiettivo, usato } }`.
- I casi, in ordine di priorità:
  - `entrata_mancante` → `{}`;
  - `bisogni_oltre` → `{ eccedenza, suggerisci_modello }`. `suggerisci_modello`
    vale `'spese_fisse_alte'` da `equilibrato` e `'equilibrato'` da
    `risparmio_deciso`, solo con `bisogniOltreDaTreMesi`; altrimenti `null`;
  - `desideri_oltre` → `{ eccedenza, categorie: [id, id] }`, le due categorie
    con l'importo più alto (al massimo due);
  - `futuro_indietro` → `{ mancante }`. Scatta solo con `futuro.obiettivo > 0` e
    `usato < obiettivo`;
  - `in_regola` → `{ restante_desideri, giorni }`.

- [ ] **Passo 1: scrivere il test che fallisce.** Un test per ciascun codice, più:
  - `bisogni oltre senza tre mesi non suggerisce`;
  - `con personalizzato non suggerisce mai`;
  - `Futuro allo 0% con il resto in regola dà in_regola` (punto di revisione 4);
  - `entrata 0 vince su tutto` (punto di revisione 1).

  I valori di riferimento sono quelli della bozza approvata: obiettivi
  100000/60000/40000, usati 78000/64000/15000 → `desideri_oltre`,
  `eccedenza: 4000`.
- [ ] **Passo 2:** `cd server && npx jest -c jest.unit.config.js tests/budgetConsiglio.test.js` → FALLISCE.
- [ ] **Passo 3: implementare `scegliConsiglio`.**
- [ ] **Passo 4:** stesso comando → PASSA.
- [ ] **Passo 5: commit** con il messaggio «Sceglie la frase del consulente del budget».

---

## Task 6: stato del mese dal database

**File:**
- Riscrive: `server/services/budgetStato.service.js`. Rimuove
  `BUDGET_TO_MOVIMENTI`, `GROUPS_FOR_LEGACY`, `HOME_UTILITIES`,
  `getMovimentiCategorie`, `getStato` e `intervalloMese`. Prima di rimuoverli,
  `grep -rn` per accertarsi che nessun altro li importi.
- Test: `server/tests/budgetStato.test.js`
- Elimina: il test `categorie dettagliate sono incluse nei budget generali
  storici` in `server/tests/categoryImport.test.js` e i suoi import. Lo
  sostituisce il caso «supermercato» qui sotto.

**Interfacce:**
- Consuma: Task 3 (`percentualiDelPiano`, `obiettiviInCentesimi`), Task 4
  (`aggregaPerVoce`, `voceDellaCategoria`), Task 5 (`scegliConsiglio`),
  `muoveSaldo`, `categorie.service.list`, `classificaFinestra`, `elencoMesi`,
  `fineMese`.
- Produce `calcolaStatoBudget({ userId, oggi }) -> Promise<null | Stato>`:
  - `oggi` è nel formato `'YYYY-MM-DD'`, nel fuso dell'utente, e decide mese e
    giorni rimanenti;
  - restituisce `null` se il profilo non ha un piano.

```
Stato = {
  modello, percentuali: {bisogni, desideri, futuro}, entrata: number|null,
  mese: 'YYYY-MM', giorni_rimanenti: number,
  voci: {
    bisogni:  { obiettivo, usato, restante, percentuale_usata,
                categorie: [{ categoria, importo, spostabile, predefinita, essenzialita_catalogo }],
                categorie_senza_spese: [id] },
    desideri: { …come bisogni },
    futuro:   { obiettivo, usato, restante, percentuale_usata,
                movimenti: [{ id, data, descrizione, importo, conto_id }] },
  },
  consiglio: { codice, dati },
}
```

Note sui campi:
- Tutti gli importi sono in euro, compresi quelli dentro `consiglio.dati`, che
  il servizio converte da centesimi.
- `percentuale_usata` è un intero arrotondato e vale 0 quando l'obiettivo è 0.
  Per il Futuro può essere negativa.
- `categorie` è ordinato per importo decrescente.
- `spostabile` è falso per le voci fisse.
- `essenzialita_catalogo` viene da `CATEGORIE_DEFAULT` (null per le personali).

**Approccio:**
- Due letture in parallelo: i movimenti del mese (`tipo` in `uscita` e
  `trasferimento`, `data` fra il primo e l'ultimo giorno del mese) e tutti i
  conti dell'utente, inattivi compresi.
- L'essenzialità si legge da `list(userId, { includeArchived: true })`.
- `categorie_senza_spese` usa solo le categorie con `attiva` vero.
- `bisogniOltreDaTreMesi` richiede tre condizioni:
  - `classificaFinestra` sui 3 mesi precedenti, con il primo movimento
    dell'utente, restituisce `completi.length === 3`;
  - in ciascuno di quei mesi i Bisogni superano l'obiettivo di oggi;
  - per questo basta **una** query sui movimenti dei 3 mesi, aggregata per mese
    con `aggregaPerVoce`.

- [ ] **Passo 1: scrivere il test che fallisce.** Il profilo si imposta con
  `ProfiloUtente.update`: entrata 2000, piano `equilibrato` 50/30/20. Usa conti
  `banca`, `emergenza` e `risparmio`, e le date `oggi: '2026-11-23'`. Test:
  - `senza piano restituisce null`;
  - `la bozza approvata`: queste uscite di novembre
    - affitto 550, supermercato 160, elettricità 42, internet 28 → Bisogni 780;
    - ristoranti 300, delivery 180, shopping_online 160 → Desideri 640;
    - trasferimento banca→emergenza 150 → Futuro 150.

    Attesi: `voci.bisogni.usato === 780`, `voci.desideri.usato === 640`,
    `voci.futuro.usato === 150`, `giorni_rimanenti === 7`,
    `consiglio.codice === 'desideri_oltre'`,
    `consiglio.dati.categorie` uguale a `['ristoranti', 'delivery']`;
  - `l'origine di una ricorrenza non conta`: con un'uscita `ricorrente: true`
    (bollette 50) Bisogni resta a 0;
  - `un prelievo dal risparmio riduce il Futuro`: banca→risparmio 200, poi
    risparmio→banca 50 → `futuro.usato === 150`;
  - `il deposito scommesse conta nei Desideri`;
  - `una categoria personale archiviata con spese resta nella sua voce`
    (punto di revisione 2). Si crea una categoria personale `essenziale` con un
    movimento da 30, poi la si archivia (`attiva: false`). Attesi: è in
    `voci.bisogni.categorie` con `importo: 30` e non è in
    `categorie_senza_spese`;
  - `una predefinita nascosta dall'utente non compare fra quelle senza spese`;
  - `Bisogni oltre per tre mesi completi suggerisce il cambio modello`: con
    movimenti da agosto a novembre e Bisogni da 1.200 ogni mese →
    `consiglio.dati.suggerisci_modello === 'spese_fisse_alte'`;
  - `con due soli mesi completi non suggerisce`;
  - `entrata azzerata → entrata_mancante e obiettivi a 0` (punto di revisione 1).
- [ ] **Passo 2:** `cd server && npx jest tests/budgetStato.test.js` → FALLISCE.
- [ ] **Passo 3: riscrivere `budgetStato.service.js`.** In testa resta il commento sul perché il calcolo è condiviso (Regola 20).
- [ ] **Passo 4:** `cd server && npx jest tests/budgetStato.test.js tests/categoryImport.test.js` → PASSA.
- [ ] **Passo 5: commit** con il messaggio «Calcola lo stato del budget per Bisogni, Desideri e Futuro».

---

## Task 7: API del piano e dello stato, rimozione delle rotte vecchie

**File:**
- Riscrive: `server/controllers/budget.controller.js`, `server/routes/budget.routes.js`
- Modifica: `server/middleware/validation.middleware.js`. Sostituisce
  `validateBudget` e `validateUpdateBudget` con `validateBudgetPiano` e aggiorna
  le esportazioni.
- Modifica: `server/controllers/profilo.controller.js`. Rimuove:
  - `DISTRIBUZIONI`, `CATEGORIA_INFO`, `getProfiloBudgetType`;
  - `calcolaBudgetSuggerito` e `getBudgetSuggerito`;
  - l'import di `calcolaSpeseFisse`, se non serve più.
- Modifica: `server/routes/profilo.routes.js` (rimuove `/budget-suggerito`)
- Modifica: `server/tests/isolation.test.js`, `server/tests/scommesseTrasferimenti.test.js`, `server/tests/aggregatiRicorrenti.test.js` (casi budget riscritti)
- Modifica: `docs/API.md` (sezione Budget, rimozione di `budget-suggerito`) e
  `CLAUDE.md` (conteggio degli endpoint). Prima e dopo si contano le
  dichiarazioni con `grep -rhoE "router\.(get|post|put|patch|delete)\(" server/routes | wc -l`.
- Test: `server/tests/budgetApi.test.js`

**Interfacce:**
- Consuma: Task 3 e Task 6.
- Produce `GET /api/budget/piano` → 200:

```
{ piano: { modello, percentuali } | null,
  entrata: number|null,
  consigliato: { modello, percentuali, motivo: { codice, quota_spese_fisse } },
  modelli: [{ id, percentuali|null, importi: { bisogni, desideri, futuro }|null }] }
```

  I modelli sono i quattro di `MODELLI_IDS`. `importi` è in euro, e vale `null`
  senza entrata e per `personalizzato`.
- Produce `PUT /api/budget/piano` con corpo `{ modello, percentuali? }`:
  - 200 → stessa forma del `GET`;
  - 422 → `{ codice: 'entrata_mancante', message: "Indica prima la tua entrata mensile" }`;
  - 400 → errori di validazione.
- Produce `GET /api/budget/stato` → 200 `Stato` (Task 6), oppure 404
  `{ message: 'Nessun piano di budget' }`.
  - `oggi` = `oggiLocale()` (`FUSO_DEFAULT`, come nel resto dell'API). Solo le
    notifiche usano il fuso delle preferenze: leggerlo qui creerebbe la riga di
    preferenze a ogni apertura della pagina, per uno scarto possibile solo a
    cavallo della mezzanotte dell'ultimo giorno del mese.
- `validateBudgetPiano`:
  - `body('modello').isIn(MODELLI_IDS)`;
  - con `personalizzato`, un `custom` che richiede `percentualiValide(req.body.percentuali)`;
  - termina con `validate`.
- Le rotte `/piano` e `/stato` vanno dichiarate tutte e tre con `authMiddleware`.

- [ ] **Passo 1: scrivere il test che fallisce.**
  - `GET piano senza piano restituisce consigliato e quattro modelli`: con
    entrata 2000, `modelli[0].importi` vale `{ bisogni: 1000, desideri: 600, futuro: 400 }`;
  - `PUT equilibrato salva le percentuali del server` (invia `percentuali:
    { bisogni: 10, desideri: 10, futuro: 80 }` → `piano.percentuali` 50/30/20);
  - `PUT personalizzato 60/30/20 → 400`;
  - `PUT modello sconosciuto → 400`;
  - `PUT senza entrata → 422 entrata_mancante` (punto di revisione 1);
  - `GET stato senza piano → 404`;
  - `cambiare modello a metà mese aggiorna subito gli obiettivi` (punto di
    revisione 3): `PUT equilibrato`, `GET stato`, `PUT spese_fisse_alte`,
    `GET stato` → `voci.bisogni.obiettivo` passa da 1000 a 1400;
  - `le rotte vecchie non esistono più`: `POST /api/budget` → 404 e
    `GET /api/profilo/budget-suggerito` → 404.

  Nei file esistenti:
  - `isolation.test.js`: il caso budget diventa «USER_A non legge né modifica
    il piano di USER_B». USER_B ha un piano; il `GET` di A restituisce `piano:
    null`; il `PUT` di A non tocca il profilo di B;
  - `scommesseTrasferimenti.test.js`: «il deposito scommesse conta nei
    Desideri», con piano su profilo e `voci.desideri.usato === 50`;
  - `aggregatiRicorrenti.test.js`: lo stesso scenario con piano su profilo.
    Prima del cron `voci.bisogni.usato === 0`, dopo i due passaggi del cron
    `=== 50`.
- [ ] **Passo 2:** `cd server && npx jest tests/budgetApi.test.js` → FALLISCE.
- [ ] **Passo 3: implementare controller, rotte e validazione, poi rimuovere il codice vecchio.** Prima di cancellare, `grep -rn` sugli identificatori rimossi.
- [ ] **Passo 4:** `cd server && npm test` → PASSA tutta la suite, compreso `corsMetodi.test.js`. La baseline va presa con la suite completa: rieseguire un file isolato produce fallimenti fantasma (vedi la memoria del progetto).
- [ ] **Passo 5: commit** con il messaggio «Espone il piano e lo stato del budget, toglie le rotte per categoria».

---

## Task 8: notifiche e Analisi per voce

**File:**
- Modifica: `server/services/notifiche/NotificheGenerator.js`. Riscrive
  `regolaBudget` e rimuove `ETICHETTE_BUDGET` ed `etichettaCategoria`, se non
  hanno altri usi.
- Modifica: `server/controllers/analisi.controller.js`. Riscrive
  `getStatoBudgetMese` e il blocco `budget_alert`.
- Modifica: `server/tests/notifiche.test.js` (helper `creaBudget` → `creaPiano`;
  casi 5, 6 e 6b)
- Test: `server/tests/analisiSuggerimenti.test.js` (nuovo caso)

**Interfacce:**
- Consuma: `calcolaStatoBudget({ userId, oggi })` (Task 6) ed `ETICHETTE_VOCI`.
- `regolaBudget`:
  - `oggi = giornoLocale(adesso, preferenze.timezone)`;
  - mese dell'avviso = `oggi.slice(0, 7)`;
  - si valutano solo `bisogni` e `desideri`, e nulla se il consiglio è
    `entrata_mancante` o l'obiettivo è 0;
  - `dedupeKey`: `budget:${mese}:${voce}:100` e `budget:${mese}:${voce}:80`;
  - titoli invariati («Budget superato», «Budget quasi raggiunto»);
  - messaggi:
    - `Hai superato i ${etichetta} previsti per questo mese.`
    - `Hai usato l'80% dei ${etichetta} previsti per questo mese.`

    Senza importi;
  - `metadata: { voce, periodo: mese }`;
  - restano invariate priorità e `link: '/budget'`.
- Analisi: un suggerimento `budget_alert` per voce di spesa con
  `percentuale_usata > 85`:
  - `messaggio`: `${etichetta}: hai usato il ${p}% del budget`;
  - `dettaglio`: `${usato}€ su ${obiettivo}€`, arrotondati all'euro come oggi.

- [ ] **Passo 1: scrivere i test che falliscono.** In `notifiche.test.js` i casi esistenti si riscrivono sul piano: entrata 1000, `equilibrato` → Desideri 300.
  - 5) l'80% dei Desideri genera un solo avviso;
  - 6) il 100% ne genera uno solo, non ripetuto;
  - 6b) il mese successivo ne genera uno nuovo.

  Si aggiungono:
  - `il Futuro non genera avvisi` (nessun trasferimento verso il risparmio, nessuna notifica);
  - `il messaggio push non contiene importi`: `expect(n.messaggio).not.toMatch(/\d/)`;
  - `entrata azzerata → nessun avviso` (punto di revisione 1);
  - `cambiare modello dopo un avviso non ne crea un secondo nello stesso mese`
    (punto di revisione 3): superato con `equilibrato`, poi `risparmio_deciso`,
    di nuovo superato → `budget_superato` resta 1.

  In `analisiSuggerimenti.test.js`: `budget_alert per i Desideri oltre l'85%`.
- [ ] **Passo 2:** `cd server && npx jest tests/notifiche.test.js tests/analisiSuggerimenti.test.js` → FALLISCE.
- [ ] **Passo 3: implementare.**
- [ ] **Passo 4:** `cd server && npm test` → PASSA.
- [ ] **Passo 5: commit** con il messaggio «Avvisi e suggerimenti del budget per Bisogni e Desideri».

---

## Task 9: store e frasi del client

**File:**
- Riscrive: `client/src/stores/budget.store.js`
- Crea: `client/src/content/budgetConsigli.js`
- Modifica: `client/src/utils/budget.js` (aggiunge `essenzialitaPerSpostamento`)
- Modifica: `client/src/stores/profilo.store.js` (rimuove `budgetSuggerito` e la
  sua lettura) e `client/src/utils/session.js` (rimuove l'azzeramento di
  `budgetSuggerito`; `useBudgetStore().reset()` resta)
- Test: `client/tests/budgetConsigli.test.js`

**Interfacce:**
- Produce `fraseConsiglio(consiglio, { formatValuta, nomeCategoria }) -> string`
  in `content/budgetConsigli.js`. È puro: non importa `vue` e prende le
  etichette dal glossario.
  - Testi per la bozza approvata:
    - `desideri_oltre` → «Hai superato i Desideri di 40 €: pesano di più Ristoranti e Delivery.»
    - `futuro_indietro` → «Mancano 250 € per il Futuro: spostali sul conto risparmio. Piano Smart ti dice dove.»
    - `in_regola` → «Sei in linea: restano 180 € di Desideri per 7 giorni.»
    - `bisogni_oltre` → «I Bisogni hanno superato l'obiettivo di 120 €: la differenza va tolta dai Desideri.»
      Con `suggerisci_modello` aggiunge « Il modello 70/20/10 potrebbe adattarsi meglio a te.» (le percentuali da `MODELLI_PRONTI`).
    - `entrata_mancante` → «Indica la tua entrata mensile per vedere come dividerla.»
- Produce `essenzialitaPerSpostamento({ predefinita, essenzialita_catalogo }, voceDestinazione) -> 'essenziale'|'discrezionale'|null`
  in `utils/budget.js`:
  - verso `bisogni` → `'essenziale'`;
  - verso `desideri` → `null` (rimuove la personalizzazione) se la categoria è
    predefinita e il valore di catalogo non è `essenziale`, altrimenti
    `'discrezionale'`.
- Lo store `useBudgetStore`:
  - risorse: `risorsaPiano` (`GET /budget/piano`) e `risorsaStato` (`GET /budget/stato`);
  - getter calcolati: `piano`, `entrata`, `consigliato`, `modelli`, `haPiano`,
    `stato`, `voci`, `consiglio`, `statoPagina`, `lastUpdatedPagina`;
  - azioni:
    - `carica()`: legge il piano e, se c'è, lo stato;
    - `riprovaPagina()`;
    - `salvaPiano({ modello, percentuali })`: `PUT`, poi rilegge piano e stato;
    - `salvaEntrata(importo)`: `PUT /profilo` con `{ entrata_mensile }`, poi rilegge il piano;
    - `spostaCategoria(voceCategoria, voceDestinazione)`: chiama
      `PUT /categorie/default/:id/essenzialita` per le predefinite e
      `PUT /categorie/:id` con `{ essenzialita }` per le personali, poi
      rilegge lo stato e chiama `loadCategorie()`;
    - `reset()`.
  - `statoPagina` segue il commento dello store attuale: con un piano, la
    pagina non è pronta finché lo stato non ha risposto almeno una volta.

- [ ] **Passo 1: scrivere il test che fallisce.** Un test per ciascuna frase qui sopra, con `formatValuta` che formatta all'italiana come `useValuta`. Più tre casi di `essenzialitaPerSpostamento`:
  - predefinita `semi_essenziale` verso i Desideri → `null`;
  - predefinita `essenziale` verso i Desideri → `'discrezionale'`;
  - personale verso i Bisogni → `'essenziale'`.
- [ ] **Passo 2:** `cd client && node --test tests/budgetConsigli.test.js` → FALLISCE.
- [ ] **Passo 3: implementare frasi, funzione e store.**
- [ ] **Passo 4:** `cd client && npm test` → PASSA, compreso `vistaValue.test.js`.
- [ ] **Passo 5: commit** con il messaggio «Store del budget a tre voci e frasi del consulente».

---

## Task 10: schermate del budget e home

**File:**
- Riscrive: `client/src/views/BudgetView.vue`
- Crea: `client/src/views/BudgetVoceView.vue`,
  `client/src/components/budget/BudgetSceltaModello.vue`,
  `client/src/components/budget/BudgetVoceRiga.vue`
- Modifica: `client/src/router/routes.js`. Aggiunge una rotta figlia accanto a
  `budget`: `path: 'budget/:voce'`, `name: 'budget-voce'`. Una voce non in
  `VOCI` reindirizza a `budget`.
- Modifica: `client/src/content/helpTopics.js` (riscrive `budget-come-funziona`)
- Modifica: `client/src/components/custom/WOverviewCarousel.vue` (slide budget:
  tre righe al posto della ciambella per categoria), `client/src/views/DashboardView.vue`
  (`carica()`, props `haPiano`/`vociBudget`/`entrataBudget`),
  `client/src/components/help/GettingStartedCard.vue` (testo «Scegli come
  dividere i tuoi soldi»)
- Elimina: `client/src/utils/budgetCategorie.js`, dopo aver verificato con
  `grep -rn budgetCategorie client/src` che nessun altro lo usi.

**Interfacce:**
- Consuma lo store e le funzioni del Task 9, `GLOSSARIO` per nomi e
  spiegazioni, `getCategoriaUscita` per nome e icona delle categorie, e
  `formatValuta` da `useValuta`.
- `BudgetVoceRiga.vue`:
  - props `{ voce: string, dati: object }`, emette `apri`;
  - la barra è rossa oltre il 100% e la larghezza è limitata a [0, 100];
  - la nota segue i tre casi della bozza.
- `BudgetSceltaModello.vue`:
  - props `{ modelli, consigliato, entrata, pianoAttuale }`;
  - emette `scegli({ modello, percentuali })` e `modifica-entrata(importo)`;
  - preseleziona il piano attuale, oppure il consigliato;
  - per «Personalizzato» mostra tre campi interi; il pulsante è disattivato
    finché `percentualiValide` è falso, e un avviso in linea mostra la somma
    corrente.

Le schermate seguono le bozze approvate, descritte nella sezione «Schermate»
della spec:

- **Pagina principale.** Ordine dei blocchi: intestazione con chip del modello e
  riga «mese · su X € di entrata · mancano N giorni»; scheda di consiglio; tre
  `BudgetVoceRiga` con la frase del glossario; «Cambia modello». Lo stato vuoto
  di `DataState` mostra `BudgetSceltaModello`.
- **Dettaglio di una voce.** Contiene:
  - la frase della voce, l'usato e il restante;
  - «Dove sono andati questo mese», con il menu ⋯ solo se `spostabile`. Il menu
    chiama `spostaCategoria` e mostra «Vale anche per il calcolo del fondo di
    emergenza»;
  - le categorie senza spese: le prime cinque per nome, poi «Mostra tutte»;
  - per il Futuro, l'elenco dei movimenti senza menu.

- [ ] **Passo 1:** `cd client && npm test` → verde prima di iniziare (baseline).
- [ ] **Passo 2: implementare componenti, viste, rotta, aiuto e home.**
- [ ] **Passo 3:** `cd client && npm test && npm run build` → PASSA, compresi `contrasto.test.js`, `tipografia.test.js` e `vistaValue.test.js`.
- [ ] **Passo 4: verifica nel browser.** Avviare client e server con `preview_start` e registrare un utente via API (vedi la memoria «Verifica nel browser saltando l'onboarding»). Il pannello avvia i server dal repository principale, non dal worktree: controllare quale codice sta servendo. Poi verificare in tema scuro e chiaro, a 375 px:
  - senza piano compare la scelta del modello con il consigliato preselezionato;
  - scegliendo «Equilibrato» la pagina mostra le tre righe;
  - creando le uscite della bozza compare la frase `desideri_oltre`;
  - il dettaglio dei Bisogni sposta «Supermercato» nei Desideri e le barre si
    aggiornano;
  - la home mostra le tre voci;
  - la console non ha errori.

  Allegare uno screenshot della pagina principale.
- [ ] **Passo 5: commit** con il messaggio «Nuova pagina Budget: modelli, consiglio e dettaglio delle voci».

---

## Task 11: manuale, grafo e verifica finale

**File:**
- Modifica: `CLAUDE.md`. Aggiunge la **Regola 29 «Budget a tre voci»**: piano
  sul profilo, un solo calcolo in `budgetStato.service.js`, `muoveSaldo`, voci
  fisse, Futuro netto, niente scritture finanziarie, vocabolario sorvegliato dal
  contratto. Aggiorna anche:
  - la riga «Notifiche» delle aree sensibili (avvisi per voce);
  - il conteggio dei test in Known Issues 7;
  - la struttura del repository (`components/budget`).
- Modifica: `graphify-out/graph.json` (`graphify update .`)

- [ ] **Passo 1:** scrivere la regola e gli aggiornamenti, nello stile delle Regole 22 e 28.
- [ ] **Passo 2:** `cd server && npm test` e `cd client && npm test && npm run build` → tutto verde. Annotare il numero di suite e test per il manuale.
- [ ] **Passo 3:** `graphify update .` dalla radice.
- [ ] **Passo 4: commit** con il messaggio «Documenta il budget a tre voci nel manuale operativo».
- [ ] **Passo 5:** ricordare al proprietario la sequenza per la produzione:
  1. `npm run migrate:production` con la migrazione `20261123000058`;
  2. poi il push su `main`.
