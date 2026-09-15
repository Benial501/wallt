# Leggibilità, grafico del patrimonio e filtri dei movimenti — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare l'interfaccia di WALLT sopra la soglia di leggibilità WCAG AA, sostituire le due implementazioni divergenti del grafico del patrimonio con un componente solo, e dare ai movimenti ricerca, ordinamento e filtri usabili.

**Architettura:** Il blocco 5 interviene sui token in `client/src/assets/styles/variables.css` e rende il contrasto un test eseguibile invece di un'ispezione. Il blocco 3 sposta il periodo del grafico dallo store condiviso a un composable per istanza, ed estende `buildPeriodi` con un bucket giornaliero. Il blocco 4 aggiunge ricerca e ordinamento a `GET /movimenti` chiudendo la lacuna di validazione esistente, e separa i filtri dalla lista in un componente proprio.

**Tech Stack:** Vue 3 (`<script setup>`), Pinia 3, Chart.js 4 + vue-chartjs 5, Vite 8, Express 5, Sequelize 6. Test: `node --test` nel client (ESM), Jest nel server.

**Spec:** `docs/superpowers/specs/2026-09-14-leggibilita-grafico-filtri-design.md`

## Global Constraints

- **Italiano per l'utente, inglese per il codice.** Vale per messaggi, etichette e commenti rivolti all'utente; i nomi di variabili e funzioni seguono lo stile del file in cui stanno (questo repository usa nomi italiani negli store e nei util: `creaRisorsa`, `filtri`, `buildPeriodi`).
- **Un `catch` non azzera mai i dati già ottenuti.** Coding Rule 17. Ogni lettura API passa da `creaRisorsa` (`client/src/utils/risorsa.js`).
- **Le etichette finanziarie si leggono da `client/src/content/glossario.js`** con `etichetta(id)`, non si scrivono in linea. Coding Rule 18.
- **Una risorsa esposta al primo livello di uno store Pinia è già scompattata**: `store.risorsaX.stato` è la stringa, `.value` su di essa è `undefined` e su `.error` lancia. Un `computed` dello store che restituisce l'oggetto risorsa grezzo **non** è scompattato: lì `.value` serve. Contratto fissato da `client/tests/storeUnwrap.test.js`.
- **`where.user_id = req.userId` resta la prima condizione** di ogni query sui movimenti, e i filtri nuovi si aggiungono senza sostituirla.
- **Mai `sequelize.literal` con interpolazione** di input utente. Solo operatori Sequelize parametrizzati.
- **I parametri legacy `mesi` e `periodo`** di `GET /analisi/andamento-patrimonio` non si rimuovono: client e API vengono rilasciati separatamente.
- **Nessun dato finanziario su disco**: niente `localStorage`, niente `sessionStorage`, per importi, saldi e filtri.
- **Soglie di contrasto**: 4.5:1 per il testo normale, 3:1 per i bordi che delimitano un controllo.
- **Pavimento tipografico**: `0.875rem` (14px) per l'informativo, `0.75rem` (12px) il minimo assoluto con deroga commentata.
- Test: `cd client && npm test` · `cd server && npm test` (richiede PostgreSQL) · `cd server && npm run test:unit` (senza database).
- Ogni commit termina con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Struttura dei file

**Creati**

| File | Responsabilità |
|---|---|
| `client/tests/vistaValue.test.js` | Guardia: nessun template legge `.value` su una risorsa di store |
| `client/tests/contrasto.test.js` | Calcola i rapporti WCAG delle coppie testo/superficie dichiarate |
| `client/tests/tipografia.test.js` | Guardia: nessun `font-size` sotto il pavimento senza deroga |
| `client/src/composables/useAndamentoPatrimonio.js` | Fetch, periodo e statistiche dell'andamento, una istanza per componente |
| `client/tests/andamentoPatrimonio.test.js` | Mappatura dei periodi e regola della percentuale |
| `client/src/components/analisi/AndamentoPatrimonio.vue` | Il grafico, intero o compatto |
| `client/src/utils/filtriMovimenti.js` | Da stato dei filtri a parametri di query. Modulo puro |
| `client/tests/filtriMovimenti.test.js` | Test del modulo puro |
| `client/src/components/movimenti/MovimentiFilters.vue` | Pannello dei filtri, laterale o dal basso |
| `server/tests/movimentiFiltri.test.js` | Ricerca, ordinamenti, validazione, isolamento cross-user |

**Modificati**

| File | Modifica |
|---|---|
| `client/src/assets/styles/variables.css` | Token di colore corretti, scala tipografica, blocco `prefers-reduced-motion` globale |
| 37 file `.vue`/`.css` | Sweep tipografico, in tre task per area |
| `server/services/confrontoPeriodi.service.js` | `bucketGiorni`, tetto di quantità per unità |
| `server/middleware/validation.middleware.js` | `validateConfrontoQuery` per unità; `validateMovimentiQuery` completa |
| `server/controllers/movimenti.controller.js` | `cerca` e ordinamento per importo in `getMovimenti` |
| `server/tests/confrontoPeriodi.test.js` | Casi del bucket giornaliero |
| `client/src/stores/analisi.store.js` | Rimozione della risorsa dell'andamento |
| `client/src/views/AnalisiView.vue` | Adozione del componente, rimozione di `lineData`/`lineOptions` |
| `client/src/views/DashboardView.vue` | Adozione del componente |
| `client/src/components/custom/WOverviewCarousel.vue` | Rimozione della `sparklinePath` |
| `client/src/stores/movimenti.store.js` | Stato di UI dei filtri |
| `client/src/views/MovimentiView.vue` | Adozione di `MovimentiFilters` |

---

## Task 1: Guardia a grep sui `.value` nelle viste

Chiude il punto 2 della Parte 5 del brief. Va per primo: i blocchi 3 e 4 creano viste nuove, che devono nascere già sotto questa guardia.

**Files:**
- Create: `client/tests/vistaValue.test.js`

**Interfaces:**
- Consumes: niente.
- Produces: niente. È una guardia; i task successivi la ereditano eseguendo `npm test`.

- [ ] **Step 1: Scrivere il test**

Crea `client/tests/vistaValue.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Il difetto che questo test esiste per impedire ha superato dodici review.
 *
 * Una risorsa di `creaRisorsa` esposta al primo livello di uno store Pinia
 * viene scompattata da `reactive()`: `store.risorsaX.stato` è già la stringa.
 * Scriverci `.value` produce `undefined`, e `store.risorsaX.error.value`
 * lancia un TypeError che rompe il render dell'intera pagina.
 *
 * MA il caso opposto esiste ed è altrettanto vero: un `computed` dello store
 * che restituisce l'oggetto risorsa GREZZO non viene scompattato, e lì
 * `.value` serve. `investimenti.store.js` ne ha uno — `risorsaMovimentiAttiva`
 * — e `InvestimentiView.vue` lo legge correttamente con `.value`.
 *
 * Un grep che non distinguesse i due casi non sarebbe una guardia: sarebbe
 * una macchina per rompere il caso corretto. L'elenco delle esenzioni si
 * ricava quindi dagli store veri, non da un commento nel template che
 * potrebbe mentire.
 *
 * `storeUnwrap.test.js` fissa il meccanismo; questo guarda le viste, che
 * sono il posto in cui l'errore è costato.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const STORES = join(SRC, 'stores');

/** Corpo di `computed(` a partire dalla parentesi aperta, per bilanciamento. */
const corpoComputed = (sorgente, daIndice) => {
  let profondita = 0;
  for (let i = daIndice; i < sorgente.length; i++) {
    if (sorgente[i] === '(') profondita += 1;
    else if (sorgente[i] === ')') {
      profondita -= 1;
      if (profondita === 0) return sorgente.slice(daIndice + 1, i);
    }
  }
  return '';
};

/**
 * Nomi dei `computed` che restituiscono una risorsa grezza invece dei suoi
 * campi. Il segnale è un identificatore `risorsa…` usato NUDO, cioè non
 * seguito da `.` (che leggerebbe un campo) né da `(` (che sarebbe una
 * chiamata).
 */
export const risorseGrezze = (dir = STORES) => {
  const esenti = new Set();
  for (const nome of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const sorgente = readFileSync(join(dir, nome), 'utf8');
    for (const m of sorgente.matchAll(/const\s+(\w+)\s*=\s*computed\s*\(/g)) {
      const corpo = corpoComputed(sorgente, m.index + m[0].length - 1);
      if (/\brisorsa\w*(?![\w.(])/.test(corpo)) esenti.add(m[1]);
    }
  }
  return esenti;
};

const PATH_VALUE = /\b(\w*[Rr]isorsa\w*)(?:\.\w+)*\.value\b/g;

/** Identificatori di risorsa letti con `.value` che non sono esentati. */
export const colpevoliDellaRiga = (riga, esenti) => [...riga.matchAll(PATH_VALUE)]
  .map((m) => m[1])
  .filter((identificatore) => !esenti.has(identificatore));

const fileVue = (dir) => readdirSync(dir).flatMap((nome) => {
  const percorso = join(dir, nome);
  if (statSync(percorso).isDirectory()) return fileVue(percorso);
  return nome.endsWith('.vue') ? [percorso] : [];
});

/** Indici delle righe comprese fra `<template` e l'ultimo `</template>`. */
const righeDelTemplate = (righe) => {
  const apertura = righe.findIndex((r) => r.includes('<template'));
  if (apertura === -1) return [];
  let chiusura = -1;
  for (let i = righe.length - 1; i > apertura; i--) {
    if (righe[i].includes('</template>')) { chiusura = i; break; }
  }
  if (chiusura === -1) return [];
  return righe.map((_, i) => i).filter((i) => i > apertura && i < chiusura);
};

test('nessun template legge .value su una risorsa già scompattata', () => {
  const esenti = risorseGrezze();
  const colpevoli = [];

  for (const percorso of fileVue(SRC)) {
    const righe = readFileSync(percorso, 'utf8').split('\n');
    for (const i of righeDelTemplate(righe)) {
      if (colpevoliDellaRiga(righe[i], esenti).length) {
        colpevoli.push(`${relative(SRC, percorso)}:${i + 1} → ${righe[i].trim()}`);
      }
    }
  }

  assert.deepEqual(
    colpevoli, [],
    'Una risorsa letta da uno store è già scompattata: togliere `.value`.\n'
    + `Punti trovati:\n${colpevoli.join('\n')}`,
  );
});

test('le risorse grezze si ricavano dagli store, non da un commento', () => {
  const esenti = risorseGrezze();
  // `investimenti.store.js` espone un computed che restituisce la risorsa
  // intera: è il caso documentato da storeUnwrap.test.js.
  assert.ok(
    esenti.has('risorsaMovimentiAttiva'),
    `atteso risorsaMovimentiAttiva fra le esenzioni, trovate: ${[...esenti]}`,
  );
});

test('il rilevatore distingue il caso rotto da quello corretto', () => {
  // Blindaggio del test stesso: un controllo che non può fallire non protegge,
  // e un controllo che non può assolvere rompe il codice giusto.
  const esenti = new Set(['risorsaMovimentiAttiva']);

  assert.deepEqual(
    colpevoliDellaRiga('<p v-if="analisiStore.risorsaAndamento.error.value">x</p>', esenti),
    ['risorsaAndamento'],
    'la forma che ha rotto la dashboard deve essere segnalata',
  );
  assert.deepEqual(
    colpevoliDellaRiga(':stato="investimentiStore.risorsaMovimentiAttiva.stato.value"', esenti),
    [],
    'su un computed che restituisce la risorsa grezza `.value` è corretto',
  );
  assert.deepEqual(
    colpevoliDellaRiga(':stato="movimentiStore.risorsaMovimenti.stato"', esenti),
    [],
    'senza `.value` non c\'è nulla da segnalare',
  );
});
```

- [ ] **Step 2: Eseguire il test e verificare che passi**

Run: `cd client && npm test`

Expected: PASS, 92 test in totale (89 preesistenti più i tre nuovi).

Se il primo test fallisce, **fermati e guarda come è definito nello store il nome che segnala**, prima di toccare la vista:

- se è una risorsa esposta al primo livello dello store (`return { risorsaX, … }`), `.value` è di troppo: toglilo dal template;
- se è un `computed` che restituisce la risorsa **grezza**, `.value` è corretto e il difetto è nell'esenzione: `risorseGrezze()` non l'ha riconosciuto.

Togliere `.value` da un caso corretto rompe il render in silenzio: `DataState` riceverebbe un `ref` dove la prop dichiara `String`, e ogni confronto `stato === '…'` fallirebbe senza errore. È successo davvero alla prima stesura di questo task.

- [ ] **Step 3: Commit**

```bash
git add client/tests/vistaValue.test.js
git commit -m "$(cat <<'EOF'
Aggiunge la guardia sui .value delle risorse nei template

storeUnwrap.test.js fissa il meccanismo dello scompattamento ma non vede
le viste, ed è nelle viste che il difetto è costato: dodici review non
hanno visto un `.error.value` che rompeva il render della dashboard.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Token di colore e test del contrasto

Il test e la correzione stanno nello stesso task: il test è la prova che la correzione è corretta, e un revisore non può approvare l'uno senza l'altro.

**Files:**
- Create: `client/tests/contrasto.test.js`
- Modify: `client/src/assets/styles/variables.css`
- Modify: `client/src/assets/styles/glass.css` (il bordo di checkbox e radio)

**Interfaces:**
- Consumes: niente.
- Produces: i token corretti, letti da tutta l'app. `contrasto.test.js` esporta nulla; la sua lista `COPPIE` è la dichiarazione verificabile di quale testo finisce su quale superficie.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `client/tests/contrasto.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Contrasto WCAG dei token, calcolato invece che ispezionato.
 *
 * Nessun test automatico copriva il contrasto, e il risultato era che il
 * tema chiaro stava peggio dello scuro senza che nessuno lo sapesse: il
 * testo del pulsante primario sull'accento verde faceva 3.03:1.
 *
 * Il valore di questo file non è la formula — è la lista COPPIE: la
 * dichiarazione, verificabile, di quale testo finisce su quale superficie.
 * Aggiungere un token di testo significa aggiungerlo lì.
 */

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'styles', 'variables.css'),
  'utf8',
);

/** Token dichiarati dentro un blocco. Le regole chiudono con `}` a inizio riga. */
const leggiBlocco = (selettore) => {
  const inizio = CSS.indexOf(selettore);
  assert.notEqual(inizio, -1, `blocco non trovato: ${selettore}`);
  const apertura = CSS.indexOf('{', inizio);
  const chiusura = CSS.indexOf('\n}', apertura);
  const token = {};
  for (const [, nome, valore] of CSS.slice(apertura, chiusura).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    token[nome] = valore.trim();
  }
  return token;
};

const SCURO = leggiBlocco('html.dark {');
const CHIARO = leggiBlocco('html.light {');

const aColore = (valore) => {
  const esa = valore.match(/^#([0-9a-fA-F]{6})$/);
  if (esa) return { rgb: [0, 2, 4].map((i) => parseInt(esa[1].slice(i, i + 2), 16)), alpha: 1 };
  const rgba = valore.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgba) {
    return {
      rgb: [1, 2, 3].map((i) => Number(rgba[i])),
      alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  return null;
};

/** Sovrapposizione alfa: un token al 5% di bianco non ha un contrasto proprio. */
const componi = (sopra, sotto) => sopra.rgb.map(
  (c, i) => Math.round(c * sopra.alpha + sotto[i] * (1 - sopra.alpha)),
);

const lineare = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminanza = (rgb) => 0.2126 * lineare(rgb[0]) + 0.7152 * lineare(rgb[1]) + 0.0722 * lineare(rgb[2]);
const rapporto = (a, b) => {
  const [alta, bassa] = [luminanza(a), luminanza(b)].sort((x, y) => y - x);
  return (alta + 0.05) / (bassa + 0.05);
};

/**
 * Una superficie è una pila di token, dal più in alto al più in basso.
 * L'ultimo deve essere opaco.
 */
const SUPERFICI = {
  pagina: ['--bg-primary'],
  card: ['--glass-primary-bg', '--bg-primary'],
  chrome: ['--glass-chrome-bg', '--bg-primary'],
  elevata: ['--glass-elevated-bg', '--bg-primary'],
  accento: ['--accent-green'],
  cta: ['--cta-bg'],
};

const risolviSuperficie = (nome, tema) => SUPERFICI[nome].reduceRight((sotto, token) => {
  const colore = aColore(tema[token]);
  assert.ok(colore, `token non interpretabile: ${token} = ${tema[token]}`);
  return sotto === null ? colore.rgb : componi(colore, sotto);
}, null);

/** min 4.5 per il testo normale, 3 per i bordi che delimitano un controllo. */
const COPPIE = [
  { testo: '--text-primary', su: 'pagina', min: 4.5 },
  { testo: '--text-secondary', su: 'pagina', min: 4.5 },
  { testo: '--text-muted', su: 'pagina', min: 4.5 },
  { testo: '--text-subtle', su: 'pagina', min: 4.5 },
  { testo: '--text-link', su: 'pagina', min: 4.5 },
  { testo: '--positive', su: 'pagina', min: 4.5 },
  { testo: '--negative', su: 'pagina', min: 4.5 },
  { testo: '--warning', su: 'pagina', min: 4.5 },

  { testo: '--text-primary', su: 'card', min: 4.5 },
  { testo: '--text-secondary', su: 'card', min: 4.5 },
  { testo: '--text-muted', su: 'card', min: 4.5 },
  { testo: '--text-subtle', su: 'card', min: 4.5 },
  { testo: '--positive', su: 'card', min: 4.5 },
  { testo: '--negative', su: 'card', min: 4.5 },
  { testo: '--warning', su: 'card', min: 4.5 },

  { testo: '--text-primary', su: 'elevata', min: 4.5 },
  { testo: '--text-secondary', su: 'elevata', min: 4.5 },

  { testo: '--nav-item', su: 'chrome', min: 4.5 },
  { testo: '--text-primary', su: 'chrome', min: 4.5 },

  // Testo su una superficie piena: qui il colore di sfondo è il pulsante.
  { testo: '--accent-on', su: 'accento', min: 4.5 },
  { testo: '--cta-text', su: 'cta', min: 4.5 },

  // Il bordo di checkbox e radio. Con `appearance: none` quel bordo è
  // l'unica cosa che identifica il controllo, quindi ricade sotto WCAG
  // 1.4.11 e servono 3:1. La card è il caso peggiore: nel tema scuro è più
  // chiara della pagina, quindi un bordo chiaro lì contrasta di meno.
  //
  // `--border-strong` NON è in questa lista di proposito: serve a stati
  // hover e alla maniglia del foglio dal basso, che non identificano nulla
  // da soli. Portarlo a 3:1 significherebbe alzarne l'alfa da 0.16 a 0.36
  // nello scuro e oltre 0.5 nel chiaro, trasformando ogni filo del sistema
  // del vetro in una linea dura.
  { testo: '--control-border', su: 'card', min: 3 },
];

for (const [nomeTema, tema] of [['scuro', SCURO], ['chiaro', CHIARO]]) {
  test(`contrasto dei token — tema ${nomeTema}`, () => {
    const sotto = [];

    for (const { testo, su, min } of COPPIE) {
      const primoPiano = aColore(tema[testo]);
      assert.ok(primoPiano, `token non interpretabile: ${testo} = ${tema[testo]}`);
      const sfondo = risolviSuperficie(su, tema);
      const composto = primoPiano.alpha < 1 ? componi(primoPiano, sfondo) : primoPiano.rgb;
      const valore = rapporto(composto, sfondo);

      if (valore < min) {
        sotto.push(`${testo} su ${su}: ${valore.toFixed(2)} (serve ${min})`);
      }
    }

    assert.deepEqual(sotto, [], `Sotto soglia nel tema ${nomeTema}:\n${sotto.join('\n')}`);
  });
}

test('ogni token di testo dichiarato compare in almeno una coppia', () => {
  // Impedisce che un token nuovo entri nel tema senza essere mai verificato.
  const daVerificare = Object.keys(SCURO).filter(
    (t) => /^--(text|nav-item|positive|negative|warning|accent-on|cta-text)/.test(t)
      && !['--text-on-glass'].includes(t),
  );
  const coperti = new Set(COPPIE.map((c) => c.testo));
  const scoperti = daVerificare.filter((t) => !coperti.has(t));
  assert.deepEqual(scoperti, [], `token di testo mai verificati: ${scoperti.join(', ')}`);
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd client && npm test`

Expected: FAIL su entrambi i temi. Nello scuro `--text-muted su card: 3.54`, `--nav-item su chrome: 4.17`. Nel chiaro `--positive su pagina: 3.33`, `--warning su pagina: 2.81`, `--accent-on su accento: 3.03`, `--text-muted su pagina: 4.20`.

Fallirà anche con `token non interpretabile: --control-border = undefined`, perché quel token non esiste ancora: lo crea lo Step 3.

Se un token risulta «non interpretabile», è perché usa `color-mix` o una variabile: aggiungerlo all'esclusione dell'ultimo test, non aggirare il parser.

- [ ] **Step 3: Correggere i token**

In `client/src/assets/styles/variables.css`, blocco `:root, html.dark`:

```css
  --text-muted: #7E7E94;
```
```css
  --nav-item: #7A8799;
```

Blocco `html.light`. Qui `--text-subtle` e `--text-muted` hanno oggi lo **stesso** valore: due nomi per un colore solo sono un invito a divergere. Prima di scrivere, guarda i loro call site:

```bash
cd client && grep -rn "var(--text-subtle)" src --include='*.vue' --include='*.css' | wc -l
cd client && grep -rn "var(--text-muted)" src --include='*.vue' --include='*.css' | wc -l
```

Se `--text-subtle` ha pochi usi e non si distingue da `--text-muted` in nessuno, tienili uguali come sotto e annotalo nel commit. Se invece serve a un livello di gerarchia diverso, dagli un valore proprio **più chiaro** di `--text-muted` che superi comunque 4.5:1 — il test dirà se ci sei.

```css
  --text-muted: #5A6779;
  --text-subtle: #5A6779;
```
```css
  --negative: #C81E1E;
  --warning: #A34A07;
  --positive: #047857;
```
```css
  --nav-item: #5A6779;
```

E il punto che il brief non prevedeva — il testo del pulsante primario, non il verde del brand:

```css
  --accent-on: #04241C;
```

Aggiungi sopra quest'ultimo il commento che spiega perché:

```css
  /* Scuro sull'accento, come nel tema scuro: il bianco su #00A884 faceva
     3.03:1, e scurire il verde avrebbe cambiato il colore del brand. */
  --accent-on: #04241C;
```

Poi il token nuovo, in **entrambi** i blocchi. Aggiungilo accanto a `--border-strong`, con il commento:

```css
  /* Bordo dei controlli che hanno perso l'aspetto nativo con
     `appearance: none` — checkbox e radio. Lì il bordo è l'unica cosa che
     dice all'utente che c'è un controllo, quindi vale WCAG 1.4.11 e servono
     3:1. `--border-strong` resta com'è: disegna stati hover e la maniglia
     del foglio dal basso, che non identificano nulla da soli. */
```

Nel blocco `:root, html.dark`:

```css
  --control-border: #66667A;
```

Nel blocco `html.light`:

```css
  --control-border: #7A8699;
```

E fai usare il token ai due controlli che lo richiedono. In `client/src/assets/styles/glass.css`, nella regola di `input[type='checkbox'], input[type='radio']` (riga 206 circa), sostituisci:

```css
  border: 1.5px solid var(--control-border);
```

Verifica con `grep -n "border-strong" client/src/assets/styles/glass.css` che la riga 220 — l'hover con `color-mix` — **resti** su `--border-strong`: è uno stato, non l'identità del controllo.

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `cd client && npm test`

Expected: PASS su entrambi i temi.

- [ ] **Step 5: Verificare a schermo il pulsante primario**

Avvia l'anteprima e guarda un pulsante primario in tema chiaro: il testo ora è verde molto scuro invece che bianco. È il cambiamento più visibile di tutto il piano ed è voluto. Se il pulsante risulta illeggibile o sporco, **fermati e segnalalo** invece di riportare il bianco.

- [ ] **Step 6: Commit**

```bash
git add client/tests/contrasto.test.js client/src/assets/styles/variables.css
git commit -m "$(cat <<'EOF'
Porta i token di colore sopra la soglia WCAG AA e la rende un test

Il contrasto non era coperto da nessun test, e il tema chiaro stava
peggio dello scuro senza che si sapesse: importi in verde a 3.33:1,
avvisi a 2.81:1, e il testo del pulsante primario sull'accento a 3.03:1.

Il pulsante si corregge scurendo il testo, non l'accento: il verde del
brand resta intatto e i due temi finiscono per condividere la stessa
regola, che lo scuro applicava già.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Scala tipografica e guardia del pavimento

**Files:**
- Create: `client/tests/tipografia.test.js`
- Modify: `client/src/assets/styles/variables.css`

**Interfaces:**
- Consumes: niente.
- Produces: i token `--text-micro`, `--text-xs`, `--text-sm`, `--text-base`, `--text-lg`, usati dai task 4a–4c. La costante `AREE_NON_ANCORA_MIGRATE` del test viene svuotata una voce per volta dai task di sweep.

- [ ] **Step 1: Aggiungere i token alla scala**

In `client/src/assets/styles/variables.css`, nel blocco `:root` non tematizzato, subito sotto `--font-sans` e sopra `--tracking-display`:

```css
  /* --- Scala tipografica ---------------------------------------------------
     `--text-xs` è il pavimento dell'informativo: tutto ciò che l'utente legge
     per decidere (importi, date, categorie, etichette di campo, messaggi di
     stato) sta lì o sopra.

     `--text-micro` è l'unica deroga, e va motivata sulla riga che la usa con
     un commento `deroga:`. Vale per le etichette degli assi dei grafici, per
     i badge accanto a un testo che dice già la stessa cosa e per le
     micro-didascalie sotto un valore già leggibile. Sotto --text-micro non si
     scende mai. La guardia è client/tests/tipografia.test.js. */
  --text-micro: 0.75rem;
  --text-xs: 0.875rem;
  --text-sm: 0.9375rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
```

- [ ] **Step 2: Scrivere la guardia**

Crea `client/tests/tipografia.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pavimento tipografico.
 *
 * Alla scrittura di questo file c'erano 155 dichiarazioni di `font-size`
 * sotto 14px, e la maggior parte erano informazioni operative: importi,
 * date, nomi di categoria. Il pavimento è `--text-xs` (0.875rem); sotto si
 * scende solo con `--text-micro` (0.75rem) e solo con una deroga motivata
 * sulla riga o su quella precedente.
 *
 * AREE_NON_ANCORA_MIGRATE è temporanea: ogni task di sweep ne toglie una
 * voce, e a fine blocco 5 deve essere vuota.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const PAVIMENTO_REM = 0.875;

/** Svuotata dai task 4a, 4b e 4c, in quest'ordine. */
const AREE_NON_ANCORA_MIGRATE = [
  'views',
  'components',
  'assets',
];

const sorgenti = (dir) => readdirSync(dir).flatMap((nome) => {
  const percorso = join(dir, nome);
  if (statSync(percorso).isDirectory()) return sorgenti(percorso);
  return /\.(vue|css)$/.test(nome) ? [percorso] : [];
});

const inAreaNonMigrata = (relativo) => AREE_NON_ANCORA_MIGRATE.some(
  (area) => relativo === area || relativo.startsWith(area + sep),
);

/** Valore in rem, oppure null se la riga non dichiara una dimensione fissa. */
const remDellaRiga = (riga) => {
  const m = riga.match(/font-size:\s*(\d*\.?\d+)(rem|px)/);
  if (!m) return null;
  return m[2] === 'px' ? Number(m[1]) / 16 : Number(m[1]);
};

test('nessun font-size scende sotto il pavimento senza deroga', () => {
  const colpevoli = [];

  for (const percorso of sorgenti(SRC)) {
    const relativo = relative(SRC, percorso);
    if (inAreaNonMigrata(relativo)) continue;

    const righe = readFileSync(percorso, 'utf8').split('\n');
    righe.forEach((riga, i) => {
      const rem = remDellaRiga(riga);
      if (rem === null || rem >= PAVIMENTO_REM) return;
      const deroga = /deroga:/.test(riga) || /deroga:/.test(righe[i - 1] || '');
      if (!deroga) colpevoli.push(`${relativo}:${i + 1} → ${riga.trim()}`);
    });
  }

  assert.deepEqual(
    colpevoli, [],
    'Sotto il pavimento senza deroga. Usare var(--text-xs), oppure\n'
    + 'var(--text-micro) con un commento `deroga: <perché non è informativo>`.\n'
    + `Punti trovati:\n${colpevoli.join('\n')}`,
  );
});

test('la deroga sulla riga precedente vale, e sotto --text-micro non si scende', () => {
  // Blindaggio: il rilevatore deve riconoscere entrambe le forme.
  assert.equal(remDellaRiga('  font-size: 0.6875rem;'), 0.6875);
  assert.equal(remDellaRiga('  font-size: 11px;'), 0.6875);
  assert.equal(remDellaRiga('  font-size: var(--text-xs);'), null);
  assert.ok(remDellaRiga('  font-size: 0.75rem;') < PAVIMENTO_REM);
});

test('a blocco 5 concluso nessuna area resta da migrare', { skip: AREE_NON_ANCORA_MIGRATE.length > 0 }, () => {
  assert.deepEqual(AREE_NON_ANCORA_MIGRATE, []);
});
```

- [ ] **Step 3: Eseguire e verificare che passi**

Run: `cd client && npm test`

Expected: PASS. Con tutte e tre le aree ancora nella lista, il primo test non ha nulla da esaminare; il terzo è saltato. Passa perché la guardia esiste, non perché il lavoro è fatto.

- [ ] **Step 4: Commit**

```bash
git add client/tests/tipografia.test.js client/src/assets/styles/variables.css
git commit -m "$(cat <<'EOF'
Introduce la scala tipografica e la guardia del pavimento a 14px

Le 155 dichiarazioni di font-size sotto 14px si migrano per area nei tre
task successivi: ogni area esce da AREE_NON_ANCORA_MIGRATE quando è
stata rivista, e il test la sorveglia da quel momento.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4a: Sweep tipografico — viste principali

Le viste che la verifica a schermo del blocco 5 copre esplicitamente, più quelle che le stanno accanto.

**Files:**
- Modify: `client/src/views/MovimentiView.vue`, `ContiView.vue`, `BudgetView.vue`, `ImpostazioniView.vue`, `CategorieView.vue`, `NotificheView.vue`, `OnboardingView.vue`, `ContattoView.vue`, `PrivacyPolicy.vue`, `auth/LoginView.vue`, `auth/RegisterView.vue`
- Modify: `client/tests/tipografia.test.js` (una riga)

**Interfaces:**
- Consumes: i token `--text-*` del Task 3.
- Produces: niente di programmatico.

- [ ] **Step 1: Elencare i punti da rivedere**

Run:
```bash
cd client && grep -rnE "font-size: *0?\.(8125|75|6875|625)rem|font-size: *1[0-3]px" src/views --include='*.vue' | grep -vE "src/views/(Analisi|Importa|Investimenti|Scommesse|Obiettivi|Aiuto)View"
```

Expected: circa 35 righe. Sono l'elenco di lavoro di questo task.

- [ ] **Step 2: Sostituire, riga per riga**

Per ciascuna riga dell'elenco, decidere se il testo è **informativo** — qualcosa che l'utente legge per decidere: importi, date, nomi di categoria e di conto, etichette di campo, messaggi di stato ed errore.

Se lo è:
```css
  font-size: var(--text-xs);
```

Se non lo è (etichetta di asse, badge accanto a un testo che dice già la stessa cosa, micro-didascalia sotto un valore già leggibile):
```css
  /* deroga: badge decorativo, il testo accanto dice già lo stato */
  font-size: var(--text-micro);
```

Il commento `deroga:` deve dire **perché** quel testo non è operativo. «deroga: è piccolo» non è una motivazione.

Non toccare nulla oltre il `font-size`: allineamenti e spaziature vanno riviste a schermo nello Step 5, non indovinate ora.

- [ ] **Step 3: Togliere `views` dalla lista delle aree non migrate**

In `client/tests/tipografia.test.js`:

```js
const AREE_NON_ANCORA_MIGRATE = [
  'components',
  'assets',
];
```

Attenzione: questo espone **tutte** le viste, comprese le sei escluse dallo Step 1. Se il test fallisce su `AnalisiView`, `ImportaView`, `InvestimentiView`, `ScommesseView`, `ObiettiviView` o `AiutoView`, **non** rimettere `views` nella lista: quelle sei appartengono al Task 4b, quindi sposta la riga del Task 4b qui e fai i due sweep delle viste insieme in questo task.

- [ ] **Step 4: Eseguire i test**

Run: `cd client && npm test`

Expected: PASS. Se fallisce, l'errore elenca i punti rimasti con file e riga.

- [ ] **Step 5: Verificare a schermo**

Apri Movimenti, Conti, Budget e Impostazioni nei due temi. Cerca testo che ora va a capo dove prima stava su una riga, badge che si allargano oltre il contenitore, e colonne che si disallineano. Correggi quello che trovi; se una correzione richiede più di un ritocco di spaziatura, **fermati e segnalalo** invece di riprogettare il componente dentro un task di accessibilità.

- [ ] **Step 6: Commit**

```bash
git add client/src/views client/tests/tipografia.test.js
git commit -m "$(cat <<'EOF'
Porta le viste principali al pavimento tipografico di 14px

Ogni font-size sotto il pavimento è diventato var(--text-xs), oppure
var(--text-micro) con una deroga che dice perché quel testo non è
informativo. La guardia ora sorveglia src/views.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4b: Sweep tipografico — viste di funzione

Le sei viste rimaste: Analisi, Importa, Investimenti, Scommesse, Obiettivi, Aiuto.

**Files:**
- Modify: `client/src/views/AnalisiView.vue`, `ImportaView.vue`, `InvestimentiView.vue`, `ScommesseView.vue`, `ObiettiviView.vue`, `AiutoView.vue`

**Interfaces:**
- Consumes: i token `--text-*` del Task 3.
- Produces: niente di programmatico.

> Se il Task 4a ha già assorbito queste viste (vedi il suo Step 3), questo task è già fatto: verificalo con lo Step 1 e passa oltre.

- [ ] **Step 1: Elencare i punti da rivedere**

Run:
```bash
cd client && grep -rnE "font-size: *0?\.(8125|75|6875|625)rem|font-size: *1[0-3]px" src/views --include='*.vue' | grep -E "src/views/(Analisi|Importa|Investimenti|Scommesse|Obiettivi|Aiuto)View"
```

Expected: circa 51 righe.

- [ ] **Step 2: Sostituire, riga per riga**

Stessa regola del Task 4a. Informativo → `var(--text-xs)`; non informativo → `var(--text-micro)` preceduto da `/* deroga: <perché> */`.

Qui la deroga è legittima più spesso che altrove: `AnalisiView.vue` ha etichette di assi e di anelli, e `.donut-label` alla riga 679 è esattamente il caso per cui `--text-micro` esiste.

- [ ] **Step 3: Eseguire i test**

Run: `cd client && npm test`

Expected: PASS (`views` è già fuori dalla lista dal Task 4a).

- [ ] **Step 4: Verificare a schermo**

Apri Analisi, Importa e Investimenti nei due temi. In Analisi guarda in particolare gli assi dei grafici e le etichette dell'anello: se un'etichetta ora si sovrappone alla vicina, la deroga a `--text-micro` è la risposta giusta, non un `font-size` fisso più piccolo.

- [ ] **Step 5: Commit**

```bash
git add client/src/views
git commit -m "$(cat <<'EOF'
Porta le viste di funzione al pavimento tipografico

Analisi, Importa, Investimenti, Scommesse, Obiettivi e Aiuto. Le
etichette degli assi e dell'anello restano a --text-micro con la deroga
motivata: non sono informazioni che l'utente legge per decidere.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4c: Sweep tipografico — componenti e fogli di stile

**Files:**
- Modify: i file sotto `client/src/components/` e `client/src/assets/styles/` che dichiarano dimensioni sotto il pavimento
- Modify: `client/tests/tipografia.test.js` (svuota la lista)

**Interfaces:**
- Consumes: i token `--text-*` del Task 3.
- Produces: `AREE_NON_ANCORA_MIGRATE` vuota, quindi il terzo test di `tipografia.test.js` smette di essere saltato.

- [ ] **Step 1: Elencare i punti da rivedere**

Run:
```bash
cd client && grep -rnE "font-size: *0?\.(8125|75|6875|625)rem|font-size: *1[0-3]px" src/components src/assets --include='*.vue' --include='*.css'
```

Expected: circa 59 righe, concentrate in `components/custom/` (il carosello) e `components/help/`.

- [ ] **Step 2: Sostituire, riga per riga**

Stessa regola dei task precedenti.

`components/custom/WOverviewCarousel.vue` è il file più denso: è la vetrina della dashboard, e quasi tutto ciò che mostra è informativo. Le eccezioni plausibili sono le etichette sopra i valori (`.w-overview__eyebrow`), che accompagnano un importo già grande e leggibile.

- [ ] **Step 3: Svuotare la lista delle aree non migrate**

In `client/tests/tipografia.test.js`:

```js
const AREE_NON_ANCORA_MIGRATE = [];
```

- [ ] **Step 4: Eseguire i test**

Run: `cd client && npm test`

Expected: PASS, e il terzo test di `tipografia.test.js` non è più saltato.

- [ ] **Step 5: Verificare a schermo**

Apri la Dashboard nei due temi e scorri tutto il carosello. È la pagina con la densità più alta dell'app: se qualcosa deve rompersi, si rompe qui.

- [ ] **Step 6: Commit**

```bash
git add client/src/components client/src/assets client/tests/tipografia.test.js
git commit -m "$(cat <<'EOF'
Completa lo sweep tipografico su componenti e fogli di stile

AREE_NON_ANCORA_MIGRATE è vuota: da qui in avanti la guardia copre
tutto src/, e un font-size sotto il pavimento senza deroga motivata fa
fallire la suite.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Movimento ridotto, focus da tastiera, maiuscolo

**Files:**
- Modify: `client/src/assets/styles/variables.css` (o il foglio globale importato dopo di esso — vedi Step 1)
- Create: `client/tests/movimentoRidotto.test.js`
- Modify: i file con `text-transform: uppercase` elencati allo Step 5
- Test: la guardia sulla regola globale è nuova; focus e maiuscolo si verificano a schermo e da tastiera

**Interfaces:**
- Consumes: `--focus-ring`, `--focus-ring-tight`, già esistenti.
- Produces: niente di programmatico.

- [ ] **Step 1: Aggiungere il blocco globale di movimento ridotto**

`prefers-reduced-motion` è oggi in 10 file su 55. La spec chiede di estenderlo a tutti i file che animano: la forma corretta di quella richiesta è **una regola globale**, non 45 modifiche che si possono dimenticare una per volta.

Individua il foglio di stile globale caricato dopo `variables.css`:

```bash
cd client && grep -rn "variables.css" src/main.js src/App.vue src/assets/styles/*.css
```

Nel foglio globale (quello importato per ultimo), in fondo:

```css
/* =============================================================================
   Movimento ridotto.

   Chi ha impostato "riduci movimento" nel sistema riceve un'app ferma, senza
   che ogni componente debba ricordarsene: era in 10 file su 55, e i 45
   mancanti non erano una scelta.

   0.01ms e non 0: Vue <Transition> attende `transitionend` per togliere un
   elemento dal DOM, e una durata esattamente nulla non fa scattare l'evento
   in tutti i browser. Un modale che non si chiude sarebbe peggio di
   un'animazione di troppo.
   ============================================================================= */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

I dieci blocchi già presenti nei singoli componenti restano: sono più specifici, non in conflitto, e rimuoverli è churn senza guadagno.

- [ ] **Step 2: Scrivere la guardia sulla regola globale**

La tabella dei test della spec prevede una guardia sul movimento ridotto. Con la regola globale la guardia non deve più cercare 45 file: deve impedire che *quella* regola sparisca.

Crea `client/tests/movimentoRidotto.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Movimento ridotto.
 *
 * Stava in 10 file su 55, e i 45 mancanti non erano una scelta: una regola
 * globale li copre tutti. Questa guardia esiste perché quella regola non
 * sparisca in un riordino dei fogli di stile, e perché la durata resti
 * 0.01ms — con 0 esatto Vue <Transition> puo' non ricevere `transitionend`
 * e un modale resterebbe aperto.
 */
const STYLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'styles');

const css = readdirSync(STYLES)
  .filter((n) => n.endsWith('.css'))
  .map((n) => readFileSync(join(STYLES, n), 'utf8'))
  .join('\n');

test('esiste una regola globale per prefers-reduced-motion', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('la regola globale neutralizza animazioni e transizioni con il selettore universale', () => {
  const blocco = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(blocco, /\*,/, 'deve usare il selettore universale');
  assert.match(blocco, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(blocco, /transition-duration:\s*0\.01ms\s*!important/);
});

test('la durata non è zero esatto', () => {
  const blocco = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.doesNotMatch(
    blocco, /transition-duration:\s*0s\s*!important/,
    'con 0s Vue <Transition> può non smontare un elemento: usare 0.01ms',
  );
});
```

Run: `cd client && npm test`

Expected: PASS. Se fallisce, la regola dello Step 1 non è finita in un file di `src/assets/styles/`: spostala lì invece di allentare il test.

- [ ] **Step 3: Verificare a schermo che nulla resti bloccato**

Attiva la riduzione del movimento a livello di sistema (macOS: Impostazioni → Accessibilità → Schermo → Riduci movimento), ricarica l'app e prova **in quest'ordine**:

1. Apri e chiudi un modale (per esempio il form di un movimento).
2. Apri e chiudi un `BottomSheet` (il menu "Funzionalità" su mobile).
3. Scorri il carosello della dashboard.

Expected: tutto si apre e **si chiude**. Un pannello che resta aperto significa che una transizione non ha concluso: è il rischio noto di questa regola ed è la ragione dei `0.01ms`.

- [ ] **Step 4: Verificare il focus da tastiera**

`--focus-ring` esiste ed è usato in 9 punti. Percorri con il solo `Tab` (senza mouse) Dashboard, Movimenti, Conti e Impostazioni, e annota ogni elemento interattivo su cui l'anello **non** si vede.

Per ciascuno, aggiungi:

```css
.selettore:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
```

Un elemento può avere già `:focus-visible` e non mostrarlo perché un antenato ha `overflow: hidden` che taglia il `box-shadow`. In quel caso usa `--focus-ring-tight`, oppure `outline: 2px solid var(--border-focus); outline-offset: 2px`, che l'`overflow` non taglia.

Questa verifica è a tastiera, non a grep: una regola può esserci ed essere invisibile.

- [ ] **Step 5: Rivedere il maiuscolo forzato**

Undici occorrenze:

```bash
cd client && grep -rn "text-transform: *uppercase" src --include='*.vue' --include='*.css'
```

Per ciascuna, togli `text-transform: uppercase` e — se l'etichetta perdeva gerarchia senza il maiuscolo — restituiscila con peso o colore, non con la forma delle lettere. Il maiuscolo forzato riduce la velocità di lettura e fa pronunciare come acronimi parole che non lo sono.

`.w-overview__feature-label` in `WOverviewCarousel.vue:947` è quella che il brief segnala come lasciata indietro di proposito: qui rientra nel perimetro.

`src/views/PrivacyPolicy.vue:455` e `src/views/ContattoView.vue:173` vanno guardate prima di toccarle: se il maiuscolo è dentro una citazione di testo legale, lasciarlo e annotarlo nel commit.

- [ ] **Step 6: Eseguire i test**

Run: `cd client && npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src
git commit -m "$(cat <<'EOF'
Rende globale il movimento ridotto e completa focus e maiuscolo

prefers-reduced-motion stava in 10 file su 55, e i 45 mancanti non erano
una scelta: una regola globale li copre tutti e non si può dimenticare.
0.01ms invece di 0 perché Vue <Transition> attende transitionend per
smontare un elemento, e una durata nulla lascerebbe i modali aperti.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Verifica a schermo del blocco 5

Passo obbligatorio, non appendice: nessuno dei test precedenti vede un contrasto reale su una superficie sfocata, e il blocco 5 è quello che tocca più superficie con meno rete.

**Files:**
- Modify: soltanto ciò che la verifica rivela rotto
- Create: `docs/superpowers/plans/2026-09-14-verifica-blocco5.md` (esito della verifica)

**Interfaces:**
- Consumes: i task 2, 3, 4a, 4b, 4c, 5.
- Produces: la decisione documentata su ogni difetto trovato.

- [ ] **Step 1: Avviare client e API**

Usa la configurazione `wallt-api` e poi `wallt-client` da `.claude/launch.json`. Non avviare i server con Bash.

- [ ] **Step 2: Percorrere la matrice**

Quattro pagine × due temi × tre condizioni:

| Pagina | Tema chiaro | Tema scuro |
|---|---|---|
| Dashboard | zoom 100%, zoom 200%, solo tastiera | idem |
| Movimenti | zoom 100%, zoom 200%, solo tastiera | idem |
| Conti | zoom 100%, zoom 200%, solo tastiera | idem |
| Impostazioni | zoom 100%, zoom 200%, solo tastiera | idem |

A ogni casella cerca: testo che ora va a capo dove prima non andava, contenitori che il testo supera, anelli di focus invisibili o tagliati, e — a zoom 200% — contenuto che esce dallo schermo in orizzontale.

- [ ] **Step 3: Classificare ciò che trovi**

Tre categorie, e la differenza conta:

1. **Regressione introdotta dai task 2–5** → correggila qui.
2. **Difetto preesistente**, che c'era anche prima del blocco 5 → **annotalo, non correggerlo**. La spec lo dice esplicitamente: correggere di nascosto un difetto dei blocchi 1-2 dentro un task di accessibilità rende impossibile sapere cosa ha rotto cosa.
3. **Scelta di progetto da rivedere** (un token ora troppo scuro, una deroga tipografica sbagliata) → correggila qui e spiega perché nel commit.

- [ ] **Step 4: Scrivere l'esito**

Crea `docs/superpowers/plans/2026-09-14-verifica-blocco5.md` con, per ciascuna casella della matrice, l'esito e l'elenco dei difetti nelle tre categorie. Una casella senza difetti si scrive «nessun difetto», non si omette: la differenza fra «verificato e pulito» e «non verificato» è il punto.

- [ ] **Step 5: Eseguire i test**

Run: `cd client && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src docs/superpowers/plans/2026-09-14-verifica-blocco5.md
git commit -m "$(cat <<'EOF'
Verifica a schermo il blocco 5 e annota l'esito

Quattro pagine, due temi, zoom 200% e navigazione da tastiera. I difetti
preesistenti sono annotati e non corretti: correggerli qui renderebbe
impossibile sapere quale blocco ha rotto cosa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Bucket giornaliero e tetto di quantità per unità

Primo task del blocco 3, e l'unico sul server.

**Files:**
- Modify: `server/services/confrontoPeriodi.service.js`
- Modify: `server/middleware/validation.middleware.js:61-76`
- Test: `server/tests/confrontoPeriodi.test.js`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `UNITA_VALIDE` diventa `['giorno', 'settimana', 'mese', 'anno']`
  - `QUANTITA_MAX_PER_UNITA: { giorno: 31, settimana: 12, mese: 12, anno: 12 }`
  - `normalizzaQuantita(valore, unita, fallback = 6) → number`
  - `buildPeriodi({ unita, quantita, da, a }, oggi)` accetta `unita: 'giorno'` e restituisce punti con `{ chiave, label, labelEsteso, da, a }` dove `da === a === chiave`
  - `QUANTITA_MIN` e `QUANTITA_MAX` restano esportati con i valori attuali (2 e 12)

- [ ] **Step 1: Scrivere i test che falliscono**

In `server/tests/confrontoPeriodi.test.js`, aggiungi in fondo:

```js
describe('buildPeriodi — giorni', () => {
  it('restituisce un punto per giorno, dal più vecchio a oggi', () => {
    const periodi = buildPeriodi({ unita: 'giorno', quantita: 7 }, OGGI);
    assert.equal(periodi.length, 7);
    assert.equal(periodi[0].da, '2026-09-04');
    assert.equal(periodi[6].da, '2026-09-10');
  });

  it('ogni giorno è un intervallo di un giorno solo', () => {
    const periodi = buildPeriodi({ unita: 'giorno', quantita: 3 }, OGGI);
    periodi.forEach((p) => {
      assert.equal(p.da, p.a);
      assert.equal(p.chiave, p.da);
    });
  });

  it('attraversa il confine del mese senza saltare giorni', () => {
    // 2 settembre 2026: cinque giorni indietro finiscono in agosto.
    const periodi = buildPeriodi({ unita: 'giorno', quantita: 5 }, new Date(Date.UTC(2026, 8, 2)));
    assert.deepEqual(periodi.map((p) => p.da), [
      '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02',
    ]);
  });

  it('etichetta breve per l\'asse ed estesa per il tooltip', () => {
    const [primo] = buildPeriodi({ unita: 'giorno', quantita: 2 }, OGGI);
    assert.equal(primo.label, '9 set');
    assert.equal(primo.labelEsteso, '9 settembre 2026');
  });

  it('accetta fino a 31 giorni', () => {
    assert.equal(buildPeriodi({ unita: 'giorno', quantita: 31 }, OGGI).length, 31);
  });

  it('taglia a 31 una richiesta più ampia', () => {
    assert.equal(buildPeriodi({ unita: 'giorno', quantita: 90 }, OGGI).length, 31);
  });
});

describe('normalizzaQuantita — tetto per unità', () => {
  it('il tetto di 31 vale solo per i giorni', () => {
    assert.equal(normalizzaQuantita(31, 'giorno'), 31);
    assert.equal(normalizzaQuantita(31, 'settimana'), 12);
    assert.equal(normalizzaQuantita(31, 'mese'), 12);
    assert.equal(normalizzaQuantita(31, 'anno'), 12);
  });

  it('senza unità vale il tetto storico, perché è la firma che usavano le Analisi', () => {
    assert.equal(normalizzaQuantita(31), 12);
  });

  it('il minimo resta 2 per ogni unità', () => {
    assert.equal(normalizzaQuantita(1, 'giorno'), 2);
    assert.equal(normalizzaQuantita(0, 'mese'), 2);
  });
});
```

Aggiorna l'`import` in cima al file per portare anche i nomi nuovi:

```js
const {
  buildPeriodi, normalizzaQuantita, QUANTITA_MIN, QUANTITA_MAX,
  QUANTITA_MAX_PER_UNITA, UNITA_VALIDE,
} = require('../services/confrontoPeriodi.service');
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd server && npx jest tests/confrontoPeriodi.test.js`

Expected: FAIL. `buildPeriodi({unita:'giorno'})` cade nel `default` dello `switch` e restituisce mesi; `normalizzaQuantita` ignora il secondo argomento.

- [ ] **Step 3: Implementare**

In `server/services/confrontoPeriodi.service.js`:

Sostituisci la costante delle unità e aggiungi i tetti, subito sotto `MESI_SHORT`:

```js
/** Unita' che ammettono un numero di periodi scelto dall'utente. */
const UNITA_VALIDE = ['giorno', 'settimana', 'mese', 'anno'];

/** Estremi del selettore "quante ne confronto". */
const QUANTITA_MIN = 2;
const QUANTITA_MAX = 12;

/**
 * Tetto per unita'. Il grafico dell'andamento chiede fino a 30 giorni, ma
 * alzare un tetto unico a 31 renderebbe legali anche 31 anni: il selettore
 * del confronto nelle Analisi resta a 12 per settimane, mesi e anni.
 */
const QUANTITA_MAX_PER_UNITA = {
  giorno: 31,
  settimana: QUANTITA_MAX,
  mese: QUANTITA_MAX,
  anno: QUANTITA_MAX,
};
```

Serve anche il nome esteso dei mesi, accanto a `MESI_SHORT`:

```js
const MESI_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
```

Sostituisci `normalizzaQuantita`:

```js
/**
 * Normalizza la quantita' richiesta dentro gli estremi dell'unita'.
 *
 * `unita` e' opzionale: senza, vale il tetto storico di 12. E' la firma che
 * usavano le Analisi prima del bucket giornaliero, e i chiamanti che non
 * passano l'unita' devono continuare a ottenere il comportamento di prima.
 */
const normalizzaQuantita = (valore, unita, fallback = 6) => {
  const massimo = QUANTITA_MAX_PER_UNITA[unita] ?? QUANTITA_MAX;
  const n = parseInt(valore, 10);
  if (!Number.isFinite(n)) return Math.min(massimo, fallback);
  return Math.min(massimo, Math.max(QUANTITA_MIN, n));
};
```

Aggiungi il bucket, accanto a `bucketSettimane`:

```js
/**
 * Un punto per giorno. Serve al grafico dell'andamento del patrimonio, dove
 * "7 giorni" e "30 giorni" sono le finestre che si guardano piu' spesso.
 */
const bucketGiorni = (quantita, oggi) => {
  const periodi = [];

  for (let i = quantita - 1; i >= 0; i--) {
    const giorno = new Date(oggi);
    giorno.setUTCDate(giorno.getUTCDate() - i);
    const iso = giorno.toISOString().slice(0, 10);

    periodi.push({
      chiave: iso,
      // Etichetta corta per l'asse, estesa per il tooltip: su 30 punti
      // l'asse non ha spazio per il nome intero del mese.
      label: `${giorno.getUTCDate()} ${MESI_SHORT[giorno.getUTCMonth()].toLowerCase()}`,
      labelEsteso: `${giorno.getUTCDate()} ${MESI_LONG[giorno.getUTCMonth()]} ${giorno.getUTCFullYear()}`,
      da: iso,
      a: iso,
    });
  }

  return periodi;
};
```

In `buildPeriodi`, passa l'unità a `normalizzaQuantita` e aggiungi il ramo:

```js
const buildPeriodi = ({ unita, quantita, da, a } = {}, oggi = new Date()) => {
  if (da && a) return bucketIntervallo(da, a);

  const n = normalizzaQuantita(quantita, unita);
  const riferimento = new Date(Date.UTC(
    oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate(),
  ));

  switch (unita) {
    case 'giorno': return bucketGiorni(n, riferimento);
    case 'settimana': return bucketSettimane(n, riferimento);
    case 'anno': return bucketAnni(n, riferimento);
    default: return bucketMesi(n, riferimento);
  }
};
```

Aggiungi `QUANTITA_MAX_PER_UNITA` a `module.exports`, senza togliere nulla.

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd server && npx jest tests/confrontoPeriodi.test.js`

Expected: PASS, compresi i test preesistenti su settimane, mesi e anni.

- [ ] **Step 5: Aggiornare la validazione**

In `server/middleware/validation.middleware.js`, sostituisci `validateConfrontoQuery` (righe 61-76). L'import in cima al file va esteso con `QUANTITA_MAX_PER_UNITA`.

```js
// Confronto periodi: l'unita' e' una whitelist, la quantita' ha un tetto che
// dipende dall'unita' (fino a 31 giorni, 12 per il resto). `mesi` e' il
// parametro storico della versione precedente del client e resta accettato
// durante i rilasci (client e API deployano separatamente).
const validateConfrontoQuery = [
  query('unita')
    .optional({ values: 'falsy' })
    .isIn(UNITA_VALIDE)
    .withMessage('Unita di confronto non valida'),
  query('quantita')
    .optional({ values: 'falsy' })
    .custom((valore, { req }) => {
      const massimo = QUANTITA_MAX_PER_UNITA[req.query.unita] ?? QUANTITA_MAX;
      const n = parseInt(valore, 10);
      if (!Number.isInteger(n) || n < QUANTITA_MIN || n > massimo) {
        throw new Error(`Scegli da ${QUANTITA_MIN} a ${massimo} periodi`);
      }
      return true;
    }),
  query('mesi')
    .optional({ values: 'falsy' })
    .isInt({ min: QUANTITA_MIN, max: QUANTITA_MAX })
    .withMessage(`Scegli da ${QUANTITA_MIN} a ${QUANTITA_MAX} periodi`),
  ...intervalloDate,
  validate,
];
```

- [ ] **Step 6: Aggiungere i test di integrazione sulla validazione**

In `server/tests/analisiConfronto.test.js`, dentro `describe('GET /api/analisi/andamento-patrimonio')`:

```js
it('accetta 30 giorni e restituisce trenta punti', async () => {
  const res = await request(app)
    .get('/api/analisi/andamento-patrimonio?unita=giorno&quantita=30')
    .set(authHeader(token));
  expect(res.status).toBe(200);
  expect(res.body.punti).toHaveLength(30);
  expect(res.body.unita).toBe('giorno');
});

it('rifiuta 30 settimane, perché il tetto di 31 vale solo per i giorni', async () => {
  const res = await request(app)
    .get('/api/analisi/andamento-patrimonio?unita=settimana&quantita=30')
    .set(authHeader(token));
  expect(res.status).toBe(400);
});

it('rifiuta un\'unità fuori dalla whitelist', async () => {
  const res = await request(app)
    .get('/api/analisi/andamento-patrimonio?unita=ora&quantita=5')
    .set(authHeader(token));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 7: Eseguire la suite**

Run: `cd server && npm test`

Expected: PASS. Se PostgreSQL non è disponibile, `npm run test:unit` copre almeno `confrontoPeriodi.test.js`, ma i test di integrazione di questo task **vanno eseguiti** prima del commit.

- [ ] **Step 8: Commit**

```bash
git add server/services/confrontoPeriodi.service.js server/middleware/validation.middleware.js server/tests
git commit -m "$(cat <<'EOF'
Aggiunge il bucket giornaliero e un tetto di quantità per unità

Il selettore del grafico chiede 7 e 30 giorni, che buildPeriodi non
sapeva costruire. Il tetto diventa per unità invece che unico: alzarlo
a 31 per tutti avrebbe reso legali 31 anni, e il selettore del confronto
nelle Analisi resta a 12.

I parametri legacy mesi e periodo restano accettati: client e API si
rilasciano separatamente.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Il composable dell'andamento

**Files:**
- Create: `client/src/composables/useAndamentoPatrimonio.js`
- Test: `client/tests/andamentoPatrimonio.test.js`

**Interfaces:**
- Consumes: `creaRisorsa` da `client/src/utils/risorsa.js`; `api` da `client/src/utils/axios.js`; l'endpoint esteso dal Task 7.
- Produces:
  - `PERIODI_ANDAMENTO: Array<{ id, label, unita, quantita }>` con id `giorni_7`, `giorni_30`, `mesi_3`, `anno_1`
  - `statistichePunti(dati) → { inizio, fine, min, max, variazioneImporto, variazionePercentuale, mostraPercentuale }` — funzione pura, esportata a parte perché è la regola che il Task 9 mostra a schermo
  - `useAndamentoPatrimonio({ periodoIniziale }) → { stato, lastUpdated, loading, punti, statistiche, periodo, periodi, carica, cambiaPeriodo, riprova }` — **tutti ref di primo livello**, nessun oggetto risorsa annidato. `carica()` è la prima lettura, che il Task 9 chiama in `onMounted`; `cambiaPeriodo(id)` la rifà con il periodo nuovo e ignora un id sconosciuto

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `client/tests/andamentoPatrimonio.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PERIODI_ANDAMENTO, statistichePunti } from '../src/composables/useAndamentoPatrimonio.js';

test('i quattro periodi mappano sulle unità che il server sa costruire', () => {
  assert.deepEqual(
    PERIODI_ANDAMENTO.map(({ id, unita, quantita }) => ({ id, unita, quantita })),
    [
      { id: 'giorni_7', unita: 'giorno', quantita: 7 },
      { id: 'giorni_30', unita: 'giorno', quantita: 30 },
      // Dodici settimane, non tre mesi: tre punti non sono una linea.
      { id: 'mesi_3', unita: 'settimana', quantita: 12 },
      { id: 'anno_1', unita: 'mese', quantita: 12 },
    ],
  );
});

test('nessuna quantità supera il tetto della propria unità', () => {
  const TETTI = { giorno: 31, settimana: 12, mese: 12, anno: 12 };
  PERIODI_ANDAMENTO.forEach(({ id, unita, quantita }) => {
    assert.ok(quantita <= TETTI[unita], `${id} supera il tetto di ${unita}`);
    assert.ok(quantita >= 2, `${id} sta sotto il minimo`);
  });
});

test('le statistiche riportano i valori del server senza ricalcolarli', () => {
  const s = statistichePunti({
    punti: [{ patrimonio: 100 }, { patrimonio: 150 }],
    inizio: 100, fine: 150, min: 100, max: 150,
    variazione_importo: 50, variazione_percentuale: 50,
  });
  assert.equal(s.inizio, 100);
  assert.equal(s.fine, 150);
  assert.equal(s.variazioneImporto, 50);
  assert.equal(s.variazionePercentuale, 50);
  assert.equal(s.mostraPercentuale, true);
});

test('la percentuale si nasconde quando la base è sotto un euro', () => {
  // Chi parte da 0,50 € vedrebbe +12.000%: vero e inutile.
  const s = statistichePunti({
    punti: [{ patrimonio: 0.5 }, { patrimonio: 60.5 }],
    inizio: 0.5, fine: 60.5, min: 0.5, max: 60.5,
    variazione_importo: 60, variazione_percentuale: 12000,
  });
  assert.equal(s.mostraPercentuale, false);
  assert.equal(s.variazioneImporto, 60, 'l\'importo in euro resta sempre');
});

test('una base negativa vicina a zero nasconde la percentuale come quella positiva', () => {
  const s = statistichePunti({
    punti: [], inizio: -0.4, fine: 10, min: -0.4, max: 10,
    variazione_importo: 10.4, variazione_percentuale: 2600,
  });
  assert.equal(s.mostraPercentuale, false);
});

test('dati assenti non fanno lanciare le statistiche', () => {
  const s = statistichePunti(null);
  assert.equal(s.inizio, 0);
  assert.equal(s.fine, 0);
  assert.equal(s.mostraPercentuale, false);
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd client && npm test`

Expected: FAIL, `Cannot find module '../src/composables/useAndamentoPatrimonio.js'`.

- [ ] **Step 3: Implementare**

Crea `client/src/composables/useAndamentoPatrimonio.js`:

```js
import { ref, computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

/**
 * Andamento del patrimonio nel tempo, per il grafico condiviso fra Dashboard
 * e Analisi.
 *
 * Il periodo vive QUI, non nello store. Prima le due viste si contendevano
 * `analisiStore.risorsaAndamento`: finché nessuna delle due aveva un
 * selettore il difetto restava invisibile, ma con un selettore in entrambe
 * scegliere "1 anno" in Analisi cambiava anche la sparkline della Dashboard.
 * Una risorsa per istanza del composable toglie la contesa alla radice.
 *
 * Tutto ciò che esce di qui è un ref di PRIMO LIVELLO, mai l'oggetto risorsa.
 * Dentro un componente una risorsa è un oggetto semplice con ref annidati, e
 * i ref annidati non si scompattano nel template: restituire `{ stato, punti }`
 * elimina la classe di errore invece di chiedere di ricordarsene. È la stessa
 * trappola di client/tests/storeUnwrap.test.js, vista dall'altro lato.
 */

/**
 * "3 mesi" chiede dodici settimane e non tre mesi, perché tre punti non sono
 * una linea. Dodici settimane sono 84 giorni: l'approssimazione è voluta, il
 * tetto settimanale resta 12 per non toccare il selettore del confronto nelle
 * Analisi, e le date vere si leggono sull'asse e nel tooltip.
 */
export const PERIODI_ANDAMENTO = [
  { id: 'giorni_7', label: '7 giorni', unita: 'giorno', quantita: 7 },
  { id: 'giorni_30', label: '30 giorni', unita: 'giorno', quantita: 30 },
  { id: 'mesi_3', label: '3 mesi', unita: 'settimana', quantita: 12 },
  { id: 'anno_1', label: '1 anno', unita: 'mese', quantita: 12 },
];

/** Sotto questa base la percentuale è vera e priva di significato. */
const BASE_MINIMA_PER_PERCENTUALE = 1;

const numero = (valore) => (Number.isFinite(Number(valore)) ? Number(valore) : 0);

/**
 * Statistiche del periodo. Il server le calcola già tutte: qui si rinominano
 * e si aggiunge l'unica regola che è di presentazione, non di calcolo.
 */
export const statistichePunti = (dati) => {
  const variazioneImporto = numero(dati?.variazione_importo);
  const inizio = numero(dati?.inizio);

  return {
    inizio,
    fine: numero(dati?.fine),
    min: numero(dati?.min),
    max: numero(dati?.max),
    variazioneImporto,
    variazionePercentuale: numero(dati?.variazione_percentuale),
    mostraPercentuale: Math.abs(inizio) >= BASE_MINIMA_PER_PERCENTUALE,
  };
};

export const useAndamentoPatrimonio = ({ periodoIniziale = 'mesi_3' } = {}) => {
  const periodo = ref(periodoIniziale);

  const risorsa = creaRisorsa(
    async (unita, quantita) => {
      const { data } = await api.get('/analisi/andamento-patrimonio', {
        params: { unita, quantita },
      });
      return data;
    },
    {
      // Vuoto significa "non c'è ancora niente da disegnare": nessun punto,
      // oppure una serie tutta a zero e senza movimenti. Un utente con
      // patrimonio zero ma con movimenti registrati NON è vuoto.
      vuotoSe: (dati) => {
        const punti = dati?.punti || [];
        if (!punti.length) return true;
        return punti.every((p) => numero(p.patrimonio) === 0 && numero(p.delta) === 0);
      },
    },
  );

  const carica = () => {
    const scelto = PERIODI_ANDAMENTO.find((p) => p.id === periodo.value) || PERIODI_ANDAMENTO[2];
    return risorsa.carica(scelto.unita, scelto.quantita);
  };

  const cambiaPeriodo = (id) => {
    if (!PERIODI_ANDAMENTO.some((p) => p.id === id)) return undefined;
    periodo.value = id;
    return carica();
  };

  return {
    // Ref di primo livello: vedi il commento in cima al file.
    stato: risorsa.stato,
    lastUpdated: risorsa.lastUpdated,
    loading: risorsa.loading,
    punti: computed(() => risorsa.data.value?.punti || []),
    statistiche: computed(() => statistichePunti(risorsa.data.value)),
    periodo,
    periodi: PERIODI_ANDAMENTO,
    carica,
    cambiaPeriodo,
    riprova: risorsa.riprova,
  };
};
```

- [ ] **Step 4: Eseguire e verificare che passi**

Run: `cd client && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/composables/useAndamentoPatrimonio.js client/tests/andamentoPatrimonio.test.js
git commit -m "$(cat <<'EOF'
Dà all'andamento del patrimonio un composable con periodo proprio

Dashboard e Analisi si contendevano la stessa risorsa nello store: il
difetto era invisibile finché nessuna delle due aveva un selettore, e il
blocco 3 ne mette uno in entrambe. Una risorsa per istanza lo toglie.

Il composable espone ref di primo livello e mai l'oggetto risorsa: nei
componenti i ref annidati non si scompattano nel template, che è la
trappola dei blocchi 1-2 vista dall'altro lato.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Il componente del grafico

**Files:**
- Create: `client/src/components/analisi/AndamentoPatrimonio.vue`

**Interfaces:**
- Consumes: `useAndamentoPatrimonio`, `PERIODI_ANDAMENTO` dal Task 8; `DataState` da `client/src/components/common/DataState.vue`; `etichetta` da `client/src/content/glossario.js`; `formatValuta` da `client/src/utils/formatters.js`.
- Produces: un componente con prop `compatta: Boolean` (default `false`) e `periodoIniziale: String` (default `'mesi_3'`), senza emit.

- [ ] **Step 1: Verificare la firma di `formatValuta`**

Run: `cd client && grep -n "export const formatValuta" -A 8 src/utils/formatters.js`

Usa la firma che trovi; non assumerla.

- [ ] **Step 2: Scrivere il componente**

Crea `client/src/components/analisi/AndamentoPatrimonio.vue`:

```vue
<script setup>
import { computed, onMounted } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS, Tooltip, CategoryScale, LinearScale,
  PointElement, LineElement, Filler,
} from 'chart.js';
import DataState from '@/components/common/DataState.vue';
import { TrendingUp, TrendingDown, Minus } from '@/utils/appIcons';
import { etichetta } from '@/content/glossario';
import { formatValuta } from '@/utils/formatters';
import { useAndamentoPatrimonio } from '@/composables/useAndamentoPatrimonio';

ChartJS.register(Tooltip, CategoryScale, LinearScale, PointElement, LineElement, Filler);

/**
 * Andamento del patrimonio. Unico per Dashboard e Analisi: prima la Dashboard
 * disegnava una sparkline SVG a mano e Analisi usava Chart.js, due strade per
 * la stessa serie che potevano divergere senza che nessuno se ne accorgesse.
 */
const props = defineProps({
  /** Dashboard: niente assi, niente selettore. Stessa linea, stessa variazione. */
  compatta: { type: Boolean, default: false },
  periodoIniziale: { type: String, default: 'mesi_3' },
});

const {
  stato, lastUpdated, loading, punti, statistiche, periodo, periodi,
  carica, cambiaPeriodo, riprova,
} = useAndamentoPatrimonio({ periodoIniziale: props.periodoIniziale });

onMounted(carica);

const direzione = computed(() => {
  const v = statistiche.value.variazioneImporto;
  if (v > 0) return 'su';
  if (v < 0) return 'giu';
  return 'fermo';
});

const iconaDirezione = computed(() => (
  { su: TrendingUp, giu: TrendingDown, fermo: Minus }[direzione.value]
));

/**
 * Mai solo colore: la frase dice da sola cosa è successo, e resta l'unica
 * fonte per chi usa uno screen reader o non distingue verde e rosso.
 */
const frasesVariazione = computed(() => {
  const { variazioneImporto, variazionePercentuale, mostraPercentuale } = statistiche.value;
  const verso = { su: 'in aumento di', giu: 'in calo di', fermo: 'invariato' }[direzione.value];
  if (direzione.value === 'fermo') return 'Patrimonio invariato nel periodo';
  const importo = formatValuta(Math.abs(variazioneImporto));
  const percentuale = mostraPercentuale ? ` (${Math.abs(variazionePercentuale)}%)` : '';
  return `Patrimonio ${verso} ${importo}${percentuale} nel periodo`;
});

const segno = computed(() => ({ su: '+', giu: '−', fermo: '' }[direzione.value]));

const coloreLinea = computed(() => (
  direzione.value === 'giu' ? 'var(--negative)' : 'var(--positive)'
));

const datiGrafico = computed(() => ({
  labels: punti.value.map((p) => p.label),
  datasets: [{
    data: punti.value.map((p) => Number(p.patrimonio) || 0),
    borderColor: coloreLinea.value,
    backgroundColor: 'transparent',
    borderWidth: 2,
    tension: 0.35,
    pointRadius: 0,
    // Il punto compare solo sotto il dito o il puntatore: su 30 punti
    // disegnarli tutti rende la linea illeggibile.
    pointHoverRadius: 5,
    pointHitRadius: 24,
    fill: false,
  }],
}));

const opzioniGrafico = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  // Il tooltip deve rispondere al tocco, non solo al puntatore. Senza
  // touchstart/touchmove su mobile il grafico è muto.
  events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      displayColors: false,
      callbacks: {
        title: (voci) => punti.value[voci[0].dataIndex]?.labelEsteso || '',
        label: (voce) => formatValuta(voce.parsed.y),
      },
    },
  },
  scales: props.compatta
    ? { x: { display: false }, y: { display: false } }
    : {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
      y: { grid: { color: 'var(--divider)' }, ticks: { callback: (v) => formatValuta(v) } },
    },
}));
</script>

<template>
  <section class="andamento" :class="{ 'andamento--compatta': compatta }">
    <header v-if="!compatta" class="andamento__testa">
      <h2 class="andamento__titolo">{{ etichetta('patrimonio_totale') }}</h2>

      <div class="andamento__periodi" role="group" aria-label="Periodo del grafico">
        <button
          v-for="p in periodi"
          :key="p.id"
          type="button"
          class="andamento__periodo"
          :class="{ 'andamento__periodo--attivo': p.id === periodo }"
          :aria-pressed="p.id === periodo"
          @click="cambiaPeriodo(p.id)"
        >
          {{ p.label }}
        </button>
      </div>
    </header>

    <DataState
      :stato="stato"
      :last-updated="lastUpdated"
      messaggio-errore="Non è stato possibile caricare l'andamento del patrimonio."
      skeleton-type="text"
      :skeleton-lines="4"
      @riprova="riprova"
    >
      <template #vuoto>
        <p class="andamento__vuoto">
          Il grafico compare quando avrai registrato dei movimenti.
          Ne bastano due in giorni diversi per vedere la prima linea.
        </p>
      </template>

      <div class="andamento__corpo">
        <!-- Cambiando periodo `stato` resta `pronto`, perché `lastUpdated` non
             è più nullo: senza questo, il grafico vecchio resterebbe a schermo
             in silenzio mentre arriva il nuovo. È lo stesso caso della lista
             dei movimenti, e si risolve allo stesso modo. -->
        <p v-if="loading && !compatta" class="andamento__in-corso" role="status">
          Aggiornamento del grafico…
        </p>

        <div class="andamento__tela" :class="{ 'andamento__tela--in-corso': loading }">
          <Line :data="datiGrafico" :options="opzioniGrafico" />
        </div>

        <!-- Un <canvas> è opaco a uno screen reader, ed esce dallo schermo a
             zoom 200%. La tabella è l'unico modo perché la serie resti
             leggibile in entrambi i casi. -->
        <table class="sr-only">
          <caption>{{ etichetta('patrimonio_totale') }} per periodo</caption>
          <thead>
            <tr><th scope="col">Periodo</th><th scope="col">Valore</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in punti" :key="p.chiave || p.data">
              <th scope="row">{{ p.labelEsteso || p.label }}</th>
              <td>{{ formatValuta(p.patrimonio) }}</td>
            </tr>
          </tbody>
        </table>

        <p class="andamento__variazione" :class="`andamento__variazione--${direzione}`">
          <component :is="iconaDirezione" :size="16" :stroke-width="1.75" aria-hidden="true" />
          <span class="tabular-nums">
            {{ segno }}{{ formatValuta(Math.abs(statistiche.variazioneImporto)) }}
          </span>
          <span v-if="statistiche.mostraPercentuale" class="andamento__percentuale tabular-nums">
            {{ segno }}{{ Math.abs(statistiche.variazionePercentuale) }}%
          </span>
          <span class="sr-only">{{ frasesVariazione }}</span>
        </p>

        <dl v-if="!compatta" class="andamento__statistiche">
          <div><dt>Inizio</dt><dd class="tabular-nums">{{ formatValuta(statistiche.inizio) }}</dd></div>
          <div><dt>Attuale</dt><dd class="tabular-nums">{{ formatValuta(statistiche.fine) }}</dd></div>
          <div><dt>Minimo</dt><dd class="tabular-nums">{{ formatValuta(statistiche.min) }}</dd></div>
          <div><dt>Massimo</dt><dd class="tabular-nums">{{ formatValuta(statistiche.max) }}</dd></div>
        </dl>
      </div>
    </DataState>
  </section>
</template>

<style scoped>
.andamento__testa {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.andamento__titolo {
  font-size: var(--text-lg);
  letter-spacing: var(--tracking-title);
  margin: 0;
}

.andamento__periodi { display: flex; gap: var(--space-1); }

.andamento__periodo {
  /* 44×44 è il minimo tattile: la stessa regola già applicata ai "Riprova". */
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-pill);
  background: var(--glass-interactive-bg);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.andamento__periodo:hover { background: var(--glass-interactive-bg-hover); }

.andamento__periodo:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.andamento__periodo--attivo {
  background: var(--accent-light);
  border-color: var(--border-focus);
  color: var(--text-primary);
}

.andamento__tela {
  height: 220px;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.andamento--compatta .andamento__tela { height: 72px; }

/* Il grafico precedente resta leggibile mentre arriva il nuovo: smorzarlo
   dice che è vecchio senza toglierlo, che è la stessa regola di DataState
   per `errore-con-dati`. */
.andamento__tela--in-corso { opacity: 0.55; }

.andamento__in-corso {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.andamento__variazione {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
  font-size: var(--text-sm);
}

.andamento__variazione--su { color: var(--positive); }
.andamento__variazione--giu { color: var(--negative); }
.andamento__variazione--fermo { color: var(--text-secondary); }

.andamento__percentuale { color: var(--text-secondary); }

.andamento__statistiche {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-3);
  margin: var(--space-4) 0 0;
}

.andamento__statistiche dt {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.andamento__statistiche dd {
  margin: var(--space-1) 0 0;
  font-size: var(--text-base);
  color: var(--text-primary);
}

.andamento__vuoto {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin: 0;
}
</style>
```

- [ ] **Step 3: Verificare che `sr-only` e `tabular-nums` esistano**

Run: `cd client && grep -rn "sr-only\|tabular-nums" src/assets/styles/*.css | head`

Se `.sr-only` non esiste, aggiungilo al foglio globale:

```css
/* Visibile agli screen reader, non a schermo. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Verificare che le icone esistano**

Run: `cd client && grep -n "TrendingUp\|TrendingDown\|Minus" src/utils/appIcons.js`

Se una manca, aggiungila all'export seguendo la forma delle altre.

- [ ] **Step 5: Eseguire test e build**

Run: `cd client && npm test && npm run build`

Expected: PASS entrambi. La build è il controllo che import e template siano validi: il componente non è ancora montato da nessuna vista.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/analisi/AndamentoPatrimonio.vue client/src/assets client/src/utils/appIcons.js
git commit -m "$(cat <<'EOF'
Aggiunge il componente condiviso dell'andamento del patrimonio

Un solo grafico per Dashboard e Analisi, con selettore del periodo,
tooltip che risponde al tocco e non solo al puntatore, e una tabella
sr-only accanto al canvas: un canvas è opaco a uno screen reader e a
zoom 200% esce dallo schermo.

La variazione non dipende mai dal solo colore — segno, icona e frase
dicono la stessa cosa — e la percentuale si nasconde quando la base sta
sotto un euro, dove sarebbe vera e priva di significato.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Adozione del grafico e rimozione del codice sostituito

**Files:**
- Modify: `client/src/views/AnalisiView.vue`
- Modify: `client/src/views/DashboardView.vue`
- Modify: `client/src/components/custom/WOverviewCarousel.vue`
- Modify: `client/src/stores/analisi.store.js`

**Interfaces:**
- Consumes: `AndamentoPatrimonio.vue` dal Task 9.
- Produces: `analisi.store.js` senza `risorsaAndamento`, `andamentoPatrimonio`, `fetchAndamentoPatrimonio`.

- [ ] **Step 1: Montare il componente in Analisi**

In `client/src/views/AnalisiView.vue`, sostituisci il blocco che va dal `DataState` dell'andamento fino alla riga della variazione (intorno alle righe 543-565) con:

```vue
        <AndamentoPatrimonio />
```

Aggiungi l'import fra gli altri:

```js
import AndamentoPatrimonio from '@/components/analisi/AndamentoPatrimonio.vue';
```

Rimuovi `lineData` e `lineOptions` (dalla riga 283), `Line` dall'import di `vue-chartjs`, e `PointElement`, `LineElement`, `Filler` da `ChartJS.register` **solo se** nessun altro grafico della pagina li usa.

Run, prima di togliere la registrazione:
```bash
cd client && grep -n "<Line\|<Bar\|<Doughnut" src/views/AnalisiView.vue
```

- [ ] **Step 2: Montare il componente nella Dashboard**

In `client/src/components/custom/WOverviewCarousel.vue`, sostituisci l'`<svg class="w-overview__sparkline">` (riga 252 circa) con:

```vue
            <AndamentoPatrimonio compatta />
```

Aggiungi l'import, rimuovi `sparklinePath` (riga 104) e la prop `andamentoPunti` (riga 33), e togli la regola `.w-overview__sparkline` dallo stile.

In `client/src/views/DashboardView.vue`, rimuovi `andamentoPunti` (riga 130), il binding `:andamento-punti` (riga 287) e la chiamata `analisiStore.fetchAndamentoPatrimonio(...)` in `loadAnalisi` (riga 182). Se `loadAnalisi` resta senza corpo, rimuovi anche la funzione e la sua chiamata.

- [ ] **Step 3: Rifare la verifica dei consumatori prima di rimuovere dallo store**

Questa ricerca va fatta **ora**, non prima: è la lezione numero 2 del brief, e nei blocchi 1-2 una verifica fatta nove task troppo presto ha lasciato passare un difetto.

Run:
```bash
cd client && grep -rn "risorsaAndamento\|andamentoPatrimonio\|fetchAndamentoPatrimonio\|andamentoPunti\|sparklinePath" src/ tests/
```

Expected: nessun risultato fuori da `analisi.store.js` e dal composable del Task 8. Se ne resta uno, migralo prima di procedere.

- [ ] **Step 4: Rimuovere dallo store**

In `client/src/stores/analisi.store.js` togli `risorsaAndamento` (riga 55 circa) e le tre righe che la espongono: il `computed` `andamentoPatrimonio`, la funzione `fetchAndamentoPatrimonio`, le voci nel `reset()` e nell'oggetto restituito.

- [ ] **Step 5: Eseguire test e build**

Run: `cd client && npm test && npm run build`

Expected: PASS entrambi.

- [ ] **Step 6: Verificare a schermo**

Apri la Dashboard e poi Analisi, nei due temi.

Controlla in quest'ordine:

1. La sparkline compatta della Dashboard mostra una linea, non uno spazio vuoto.
2. In Analisi il selettore cambia il grafico, e **7 giorni** restituisce sette punti.
3. Scegli "1 anno" in Analisi, torna alla Dashboard: la sparkline **non** deve cambiare. È il difetto che questo blocco chiude, e questa è l'unica verifica che lo dimostra.
4. Su viewport mobile, tocca il grafico: il tooltip compare.

- [ ] **Step 7: Commit**

```bash
git add client/src
git commit -m "$(cat <<'EOF'
Adotta il grafico condiviso e rimuove le due implementazioni precedenti

La Dashboard disegnava una sparkline SVG a mano e Analisi usava Chart.js
nello stesso identico dato. Spariscono entrambe, insieme alla risorsa
condivisa nello store per cui scegliere un periodo in una pagina lo
cambiava anche nell'altra.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Ricerca e ordinamento sui movimenti

Primo task del blocco 4. Chiude anche la lacuna di validazione esistente.

**Files:**
- Modify: `server/controllers/movimenti.controller.js:39-90`
- Modify: `server/middleware/validation.middleware.js:49-53`
- Create: `server/tests/movimentiFiltri.test.js`

**Interfaces:**
- Consumes: niente.
- Produces: `GET /api/movimenti` accetta `cerca` (stringa, max 100) e `ordine` fra `data`, `caricamento`, `importo_desc`, `importo_asc`.

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `server/tests/movimentiFiltri.test.js`:

```js
// Ricerca e ordinamento sui movimenti. Il caso che conta davvero e' l'ultimo:
// un filtro che perde l'isolamento per utente e' un difetto di sicurezza, non
// di interfaccia, e non lo rivelerebbe nessun test funzionale.
const {
  createApp, request, registerUser, authHeader, Conto, Movimento,
} = require('./setup');

const app = createApp();
let token; let userId; let contoId;

const creaConto = async (uid) => (await Conto.create({
  user_id: uid, nome: 'Principale', tipo: 'conto_corrente', saldo: 1000, attivo: true,
})).id;

const creaMovimento = (uid, cid, descrizione, importo) => Movimento.create({
  user_id: uid,
  conto_id: cid,
  tipo: 'uscita',
  categoria: 'supermercato',
  descrizione,
  importo,
  data: '2026-09-10',
});

beforeEach(async () => {
  const account = (await registerUser(app)).res.body;
  token = account.token;
  userId = account.user.id;
  contoId = await creaConto(userId);
});

const elenco = (body) => (body.gruppi || []).flatMap((g) => g.movimenti);

describe('GET /api/movimenti — ricerca testuale', () => {
  beforeEach(async () => {
    await creaMovimento(userId, contoId, 'Spesa Esselunga', 42);
    await creaMovimento(userId, contoId, 'Benzina Q8', 60);
    await creaMovimento(userId, contoId, 'Cena fuori', 35);
  });

  it('trova per sottostringa', async () => {
    const res = await request(app).get('/api/movimenti?cerca=esse').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(elenco(res.body)).toHaveLength(1);
    expect(elenco(res.body)[0].descrizione).toBe('Spesa Esselunga');
  });

  it('ignora maiuscole e minuscole', async () => {
    const res = await request(app).get('/api/movimenti?cerca=BENZINA').set(authHeader(token));
    expect(elenco(res.body)).toHaveLength(1);
  });

  it('senza risultati restituisce una lista vuota, non un errore', async () => {
    const res = await request(app).get('/api/movimenti?cerca=inesistente').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(elenco(res.body)).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('i caratteri jolly di LIKE non sono interpretati come jolly', async () => {
    // Un `%` cercato deve cercare un `%`, non "qualunque cosa".
    const res = await request(app).get('/api/movimenti?cerca=%25').set(authHeader(token));
    expect(elenco(res.body)).toHaveLength(0);
  });

  it('si combina con tipo e intervallo di date', async () => {
    const res = await request(app)
      .get('/api/movimenti?cerca=a&tipo=uscita&da=2026-09-01&a=2026-09-30')
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(elenco(res.body).length).toBeGreaterThan(0);
    elenco(res.body).forEach((m) => expect(m.tipo).toBe('uscita'));
  });
});

describe('GET /api/movimenti — ordinamento', () => {
  beforeEach(async () => {
    await creaMovimento(userId, contoId, 'Piccola', 10);
    await creaMovimento(userId, contoId, 'Grande', 500);
    await creaMovimento(userId, contoId, 'Media', 100);
  });

  it('ordina per importo decrescente', async () => {
    const res = await request(app).get('/api/movimenti?ordine=importo_desc').set(authHeader(token));
    expect(elenco(res.body).map((m) => Number(m.importo))).toEqual([500, 100, 10]);
  });

  it('ordina per importo crescente', async () => {
    const res = await request(app).get('/api/movimenti?ordine=importo_asc').set(authHeader(token));
    expect(elenco(res.body).map((m) => Number(m.importo))).toEqual([10, 100, 500]);
  });

  it('ordine=caricamento continua a funzionare', async () => {
    const res = await request(app).get('/api/movimenti?ordine=caricamento').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(elenco(res.body)).toHaveLength(3);
  });
});

describe('GET /api/movimenti — validazione', () => {
  it('rifiuta un ordine fuori dalla whitelist', async () => {
    const res = await request(app).get('/api/movimenti?ordine=importo').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('rifiuta un tipo fuori dalla whitelist', async () => {
    const res = await request(app).get('/api/movimenti?tipo=regalo').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('rifiuta una ricerca più lunga del tetto', async () => {
    const res = await request(app)
      .get(`/api/movimenti?cerca=${'a'.repeat(101)}`)
      .set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('rifiuta una pagina non numerica', async () => {
    const res = await request(app).get('/api/movimenti?page=prima').set(authHeader(token));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/movimenti — isolamento fra utenti', () => {
  it('la ricerca non attraversa il confine fra due utenti', async () => {
    await creaMovimento(userId, contoId, 'Segreto di A', 999);

    const altro = (await registerUser(app, { email: `b${Date.now()}@example.com` })).res.body;
    const contoB = await creaConto(altro.user.id);
    await creaMovimento(altro.user.id, contoB, 'Roba di B', 1);

    const res = await request(app).get('/api/movimenti?cerca=Segreto').set(authHeader(altro.token));
    expect(res.status).toBe(200);
    expect(elenco(res.body)).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('l\'ordinamento per importo non mostra i movimenti di un altro utente', async () => {
    await creaMovimento(userId, contoId, 'Grosso di A', 10000);

    const altro = (await registerUser(app, { email: `c${Date.now()}@example.com` })).res.body;
    const contoB = await creaConto(altro.user.id);
    await creaMovimento(altro.user.id, contoB, 'Piccolo di B', 5);

    const res = await request(app)
      .get('/api/movimenti?ordine=importo_desc')
      .set(authHeader(altro.token));
    expect(elenco(res.body)).toHaveLength(1);
    expect(Number(elenco(res.body)[0].importo)).toBe(5);
  });
});
```

Verifica la firma di `registerUser` prima di eseguire:
```bash
cd server && grep -n "registerUser" -A 15 tests/setup.js
```
Se non accetta un'email personalizzata, usa la forma che accetta.

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd server && npx jest tests/movimentiFiltri.test.js`

Expected: FAIL. `cerca` viene ignorato (restituisce tutto), `ordine=importo_desc` cade sul default per data, e i test di validazione ricevono 200 invece di 400.

- [ ] **Step 3: Implementare la ricerca e l'ordinamento**

In `server/controllers/movimenti.controller.js`, dentro `getMovimenti`, estendi la destrutturazione:

```js
    const {
      tipo, categoria, conto_id, da, a,
      page = 1, limit = 50,
      ordine, cerca,
      solo_conti_attivi: soloContiAttivi,
    } = req.query;
```

Subito sotto il blocco delle date, aggiungi la ricerca. `where.user_id` resta la prima condizione e questa si aggiunge:

```js
    // Ricerca testuale sulla descrizione. I caratteri jolly di LIKE vanno
    // neutralizzati: chi cerca "50%" cerca quel testo, non "50 seguito da
    // qualunque cosa". L'operatore e' parametrizzato da Sequelize: nessuna
    // interpolazione, nessun literal.
    const termine = typeof cerca === 'string' ? cerca.trim() : '';
    if (termine) {
      const esatto = termine.replace(/[\\%_]/g, (c) => `\\${c}`);
      where.descrizione = { [Op.iLike]: `%${esatto}%` };
    }
```

Sostituisci il calcolo dell'ordinamento:

```js
    // `data` e' il default storico. `caricamento` e' il parametro gia' usato
    // dal client e non cambia. L'id in coda rende l'ordine deterministico:
    // senza, due movimenti dello stesso giorno o dello stesso importo
    // cambierebbero posto fra una pagina e l'altra.
    const ORDINAMENTI = {
      caricamento: [['createdAt', 'DESC'], ['id', 'DESC']],
      importo_desc: [['importo', 'DESC'], ['id', 'DESC']],
      importo_asc: [['importo', 'ASC'], ['id', 'DESC']],
      data: [['data', 'DESC'], ['id', 'DESC']],
    };
    const order = ORDINAMENTI[ordine] || ORDINAMENTI.data;
```

E nella `findAndCountAll` sostituisci il blocco `order:` con `order,`. Rimuovi la costante `orderByCaricamento`, che non serve più.

- [ ] **Step 4: Chiudere la lacuna di validazione**

In `server/middleware/validation.middleware.js`, sostituisci `validateMovimentiQuery` (righe 49-53):

```js
// Filtri della lista movimenti. Prima di questa versione erano validati solo
// conto_id e le date: tipo, categoria, ordine, page e limit arrivavano al
// controller senza alcun controllo.
const ORDINI_MOVIMENTI = ['data', 'caricamento', 'importo_desc', 'importo_asc'];

const validateMovimentiQuery = [
  optionalIdQuery('conto_id', 'Conto non valido'),
  query('tipo')
    .optional({ values: 'falsy' })
    .isIn(['entrata', 'uscita', 'trasferimento'])
    .withMessage('Tipo di movimento non valido'),
  query('categoria')
    .optional({ values: 'falsy' })
    .isLength({ max: 60 })
    .withMessage('Categoria non valida'),
  query('cerca')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 })
    .withMessage('La ricerca può contenere al massimo 100 caratteri'),
  query('ordine')
    .optional({ values: 'falsy' })
    .isIn(ORDINI_MOVIMENTI)
    .withMessage('Ordinamento non valido'),
  query('page')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Pagina non valida'),
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 200 })
    .withMessage('Limite non valido'),
  ...intervalloDate,
  validate,
];
```

- [ ] **Step 5: Eseguire i test**

Run: `cd server && npx jest tests/movimentiFiltri.test.js`

Expected: PASS.

- [ ] **Step 6: Eseguire la suite completa**

Run: `cd server && npm test`

Expected: PASS. I test di isolamento cross-user esistenti devono restare verdi: se uno di essi fallisce ora, la ricerca ha toccato `where.user_id` e va corretta prima del commit.

- [ ] **Step 7: Commit**

```bash
git add server/controllers/movimenti.controller.js server/middleware/validation.middleware.js server/tests/movimentiFiltri.test.js
git commit -m "$(cat <<'EOF'
Aggiunge ricerca e ordinamento per importo ai movimenti

La ricerca usa Op.iLike parametrizzato e neutralizza i jolly di LIKE:
chi cerca "50%" cerca quel testo. where.user_id resta la prima
condizione e i filtri si aggiungono, mai la sostituiscono — due test
sull'isolamento fra utenti lo dimostrano.

Chiude anche una lacuna preesistente: tipo, categoria, ordine, page e
limit arrivavano al controller senza validazione.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Il modulo puro dei filtri

**Files:**
- Create: `client/src/utils/filtriMovimenti.js`
- Test: `client/tests/filtriMovimenti.test.js`

**Interfaces:**
- Consumes: `dayjs` con locale `it`.
- Produces:
  - `FILTRI_INIZIALI: { tipo, periodo, anno, categoria, conto, cerca, ordine, da, a }`
  - `PERIODI_MOVIMENTI: Array<{ id, label }>` con id `oggi`, `settimana`, `mese`, `anno`, `personalizzato`
  - `ORDINI_MOVIMENTI: Array<{ id, label }>` con id `data`, `importo_desc`, `importo_asc`
  - `aParametriQuery(filtri, oggi?) → object` — solo le chiavi valorizzate
  - `filtriAttivi(filtri, { nomeCategoria, nomeConto }) → Array<{ chiave, etichetta }>`
  - `contaFiltriAttivi(filtri) → number`

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `client/tests/filtriMovimenti.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import {
  FILTRI_INIZIALI, PERIODI_MOVIMENTI, ORDINI_MOVIMENTI,
  aParametriQuery, filtriAttivi, contaFiltriAttivi,
} from '../src/utils/filtriMovimenti.js';

// Giovedì 10 settembre 2026.
const OGGI = dayjs('2026-09-10');

test('i filtri iniziali partono dal mese corrente e senza ricerca', () => {
  assert.equal(FILTRI_INIZIALI.periodo, 'mese');
  assert.equal(FILTRI_INIZIALI.tipo, '');
  assert.equal(FILTRI_INIZIALI.cerca, '');
  assert.equal(FILTRI_INIZIALI.ordine, 'data');
});

test('gli id degli ordinamenti coincidono con quelli accettati dall\'API', () => {
  assert.deepEqual(
    ORDINI_MOVIMENTI.map((o) => o.id),
    ['data', 'importo_desc', 'importo_asc'],
  );
});

test('il mese va dal primo giorno a oggi', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI, periodo: 'mese' }, OGGI);
  assert.equal(p.da, '2026-09-01');
  assert.equal(p.a, '2026-09-10');
});

test('oggi è un intervallo di un giorno solo', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI, periodo: 'oggi' }, OGGI);
  assert.equal(p.da, '2026-09-10');
  assert.equal(p.a, '2026-09-10');
});

test('la settimana parte dal lunedì, non dagli ultimi sette giorni', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI, periodo: 'settimana' }, OGGI);
  assert.equal(p.da, '2026-09-07');
  assert.equal(p.a, '2026-09-10');
});

test('l\'anno è quello scelto per intero, non da gennaio a oggi', () => {
  // È la differenza con periodoAnalisi.js: là "anno" significa da gennaio a
  // oggi, qui l'utente sceglie un anno di calendario e lo vuole tutto.
  const p = aParametriQuery({ ...FILTRI_INIZIALI, periodo: 'anno', anno: 2025 }, OGGI);
  assert.equal(p.da, '2025-01-01');
  assert.equal(p.a, '2025-12-31');
});

test('un intervallo personalizzato incompleto non produce date', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI, periodo: 'personalizzato', da: '2026-01-01', a: '' }, OGGI);
  assert.equal(p.da, undefined);
  assert.equal(p.a, undefined);
});

test('le chiavi vuote non finiscono nella query', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI }, OGGI);
  assert.equal('tipo' in p, false);
  assert.equal('categoria' in p, false);
  assert.equal('cerca' in p, false);
  // `data` è il default del server: mandarlo sarebbe rumore.
  assert.equal('ordine' in p, false);
});

test('la ricerca viene ripulita dagli spazi ai bordi', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI, cerca: '  esselunga  ' }, OGGI);
  assert.equal(p.cerca, 'esselunga');
});

test('una ricerca di soli spazi non diventa un filtro', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI, cerca: '   ' }, OGGI);
  assert.equal('cerca' in p, false);
});

test('i filtri attivi si presentano con il nome leggibile, non con l\'id', () => {
  const attivi = filtriAttivi(
    { ...FILTRI_INIZIALI, tipo: 'uscita', categoria: 'supermercato', cerca: 'coop' },
    { nomeCategoria: () => 'Supermercato', nomeConto: () => '' },
  );
  const etichette = attivi.map((f) => f.etichetta);
  assert.ok(etichette.includes('Uscite'));
  assert.ok(etichette.includes('Supermercato'));
  assert.ok(etichette.includes('Ricerca: coop'));
});

test('il periodo predefinito non conta come filtro attivo', () => {
  assert.equal(contaFiltriAttivi({ ...FILTRI_INIZIALI }), 0);
  assert.equal(contaFiltriAttivi({ ...FILTRI_INIZIALI, tipo: 'entrata' }), 1);
});

test('ogni periodo dichiarato sa produrre un intervallo', () => {
  PERIODI_MOVIMENTI.forEach(({ id }) => {
    const p = aParametriQuery({ ...FILTRI_INIZIALI, periodo: id, da: '2026-01-01', a: '2026-02-01' }, OGGI);
    assert.ok(p.da && p.a, `il periodo ${id} non produce un intervallo`);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd client && npm test`

Expected: FAIL, modulo non trovato.

- [ ] **Step 3: Implementare**

Crea `client/src/utils/filtriMovimenti.js`:

```js
import dayjs from 'dayjs';
// La locale sta qui, accanto alla logica che ne dipende: senza,
// `startOf('week')` fa iniziare la settimana di domenica.
import 'dayjs/locale/it.js';

dayjs.locale('it');

/**
 * Da stato dei filtri a parametri della query dei movimenti.
 *
 * Modulo puro e separato dal componente perché è l'unica forma testabile: nel
 * client non c'è infrastruttura di rendering, solo `node --test`.
 *
 * NON si fonde con `periodoAnalisi.js`, che gli somiglia. Lì "anno" significa
 * da gennaio a oggi, perché le Analisi mostrano il periodo in corso; qui
 * l'utente sceglie un anno di calendario e lo vuole intero. Unirli
 * sembrerebbe una semplificazione e cambierebbe il significato di un filtro.
 */

export const PERIODI_MOVIMENTI = [
  { id: 'oggi', label: 'Oggi' },
  { id: 'settimana', label: 'Questa settimana' },
  { id: 'mese', label: 'Questo mese' },
  { id: 'anno', label: 'Anno' },
  { id: 'personalizzato', label: 'Personalizzato' },
];

/** Gli id coincidono con quelli accettati da GET /movimenti. */
export const ORDINI_MOVIMENTI = [
  { id: 'data', label: 'Più recenti' },
  { id: 'importo_desc', label: 'Importo decrescente' },
  { id: 'importo_asc', label: 'Importo crescente' },
];

const TIPI = [
  { id: 'entrata', label: 'Entrate' },
  { id: 'uscita', label: 'Uscite' },
  { id: 'trasferimento', label: 'Trasferimenti' },
];

export const FILTRI_INIZIALI = {
  tipo: '',
  periodo: 'mese',
  anno: dayjs().year(),
  categoria: '',
  conto: '',
  cerca: '',
  ordine: 'data',
  da: '',
  a: '',
};

const intervallo = (filtri, oggi) => {
  const a = oggi.format('YYYY-MM-DD');
  switch (filtri.periodo) {
    case 'oggi':
      return { da: a, a };
    case 'settimana':
      return { da: oggi.startOf('week').format('YYYY-MM-DD'), a };
    case 'anno': {
      const anno = dayjs().year(filtri.anno || oggi.year());
      return {
        da: anno.startOf('year').format('YYYY-MM-DD'),
        a: anno.endOf('year').format('YYYY-MM-DD'),
      };
    }
    case 'personalizzato':
      // Un intervallo a metà non è un filtro: senza entrambi gli estremi non
      // si manda nulla, altrimenti la lista si restringerebbe in un modo che
      // l'utente non ha chiesto.
      return filtri.da && filtri.a ? { da: filtri.da, a: filtri.a } : {};
    case 'mese':
    default:
      return { da: oggi.startOf('month').format('YYYY-MM-DD'), a };
  }
};

/** Solo le chiavi valorizzate: un parametro vuoto è rumore nella query. */
export const aParametriQuery = (filtri, oggi = dayjs()) => {
  const params = { ...intervallo(filtri, oggi) };

  if (filtri.tipo) params.tipo = filtri.tipo;
  if (filtri.categoria) params.categoria = filtri.categoria;
  if (filtri.conto) params.conto_id = filtri.conto;

  const cerca = (filtri.cerca || '').trim();
  if (cerca) params.cerca = cerca;

  // `data` è già il default del server.
  if (filtri.ordine && filtri.ordine !== 'data') params.ordine = filtri.ordine;

  return params;
};

/**
 * Filtri attivi da mostrare come elementi rimovibili. Il periodo predefinito
 * non compare: non è qualcosa che l'utente ha scelto.
 */
export const filtriAttivi = (filtri, { nomeCategoria, nomeConto } = {}) => {
  const attivi = [];

  if (filtri.tipo) {
    attivi.push({
      chiave: 'tipo',
      etichetta: TIPI.find((t) => t.id === filtri.tipo)?.label || filtri.tipo,
    });
  }
  if (filtri.categoria) {
    attivi.push({
      chiave: 'categoria',
      etichetta: nomeCategoria?.(filtri.categoria) || filtri.categoria,
    });
  }
  if (filtri.conto) {
    attivi.push({
      chiave: 'conto',
      etichetta: nomeConto?.(filtri.conto) || 'Conto',
    });
  }
  if ((filtri.cerca || '').trim()) {
    attivi.push({ chiave: 'cerca', etichetta: `Ricerca: ${filtri.cerca.trim()}` });
  }
  if (filtri.periodo !== FILTRI_INIZIALI.periodo) {
    attivi.push({
      chiave: 'periodo',
      etichetta: PERIODI_MOVIMENTI.find((p) => p.id === filtri.periodo)?.label || 'Periodo',
    });
  }
  if (filtri.ordine !== FILTRI_INIZIALI.ordine) {
    attivi.push({
      chiave: 'ordine',
      etichetta: ORDINI_MOVIMENTI.find((o) => o.id === filtri.ordine)?.label || 'Ordine',
    });
  }

  return attivi;
};

export const contaFiltriAttivi = (filtri) => filtriAttivi(filtri).length;
```

- [ ] **Step 4: Eseguire e verificare che passi**

Run: `cd client && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/filtriMovimenti.js client/tests/filtriMovimenti.test.js
git commit -m "$(cat <<'EOF'
Estrae la mappatura dei filtri dei movimenti in un modulo puro

È l'unica forma testabile: nel client non c'è infrastruttura di
rendering, solo node --test. Resta separato da periodoAnalisi.js, che gli
somiglia: là "anno" va da gennaio a oggi, qui è un anno di calendario
intero, e fonderli cambierebbe il significato di un filtro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Il pannello dei filtri

**Files:**
- Create: `client/src/components/movimenti/MovimentiFilters.vue`

**Interfaces:**
- Consumes: `filtriMovimenti.js` dal Task 12; `BottomSheet` da `client/src/components/layout/BottomSheet.vue`; `CATEGORIE_ENTRATA`/`CATEGORIE_USCITA` da `client/src/utils/categorie.js`.
- Produces: componente con `v-model` (prop `modelValue: Object`, evento `update:modelValue` con l'oggetto filtri completo), prop `conti: Array`, `categorieRecenti: Array<string>` e `risultati: Number`, evento `azzera` senza payload. Il componente non chiama mai l'API: emette e basta, e il Task 14 decide quando ricaricare.

- [ ] **Step 1: Verificare l'API di `BottomSheet`**

Run: `cd client && sed -n '1,30p' src/components/layout/BottomSheet.vue`

Attese: prop `open`, `title`, `elevated`; evento `close`; uno slot predefinito.

- [ ] **Step 2: Scrivere il componente**

Crea `client/src/components/movimenti/MovimentiFilters.vue`:

```vue
<script setup>
import { computed, ref } from 'vue';
import BottomSheet from '@/components/layout/BottomSheet.vue';
import { SlidersHorizontal, Search, X } from '@/utils/appIcons';
import { CATEGORIE_ENTRATA, CATEGORIE_USCITA } from '@/utils/categorie';
import {
  FILTRI_INIZIALI, PERIODI_MOVIMENTI, ORDINI_MOVIMENTI, filtriAttivi,
} from '@/utils/filtriMovimenti';

/**
 * Filtri dei movimenti, separati dalla lista.
 *
 * Tre livelli: i filtri rapidi restano sempre a schermo, le categorie recenti
 * sono la scorciatoia che copre quasi tutti i casi, e il pannello completo
 * esiste per il resto. Su mobile il pannello è un foglio dal basso, su
 * desktop un pannello laterale: stesso contenuto, stesso stato.
 */
const props = defineProps({
  modelValue: { type: Object, required: true },
  conti: { type: Array, default: () => [] },
  /** Id di categoria visti nei movimenti recenti, in ordine di frequenza. */
  categorieRecenti: { type: Array, default: () => [] },
  risultati: { type: Number, default: 0 },
});

const emit = defineEmits(['update:modelValue', 'azzera']);

const pannelloAperto = ref(false);

const aggiorna = (campo, valore) => {
  emit('update:modelValue', { ...props.modelValue, [campo]: valore });
};

const TIPI = [
  { id: '', label: 'Tutti' },
  { id: 'entrata', label: 'Entrate' },
  { id: 'uscita', label: 'Uscite' },
  { id: 'trasferimento', label: 'Trasferimenti' },
];

/** Le categorie del tipo scelto; tutte quando il tipo non è filtrato. */
const categorieDisponibili = computed(() => {
  if (props.modelValue.tipo === 'entrata') return [...CATEGORIE_ENTRATA];
  if (props.modelValue.tipo === 'uscita') return [...CATEGORIE_USCITA];
  return [...CATEGORIE_ENTRATA, ...CATEGORIE_USCITA];
});

/**
 * Il campo `gruppo` arriva già dal catalogo, e le categorie create
 * dall'utente ricevono 'Personali' dall'API: nessuna resta senza sezione.
 */
const categoriePerGruppo = computed(() => {
  const gruppi = new Map();
  categorieDisponibili.value.forEach((c) => {
    const nome = c.gruppo || 'Altre';
    if (!gruppi.has(nome)) gruppi.set(nome, []);
    gruppi.get(nome).push(c);
  });
  return [...gruppi.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'it'))
    .map(([nome, categorie]) => ({ nome, categorie }));
});

const perId = computed(() => new Map(categorieDisponibili.value.map((c) => [c.id, c])));

const recenti = computed(() => props.categorieRecenti
  .map((id) => perId.value.get(id))
  .filter(Boolean)
  .slice(0, 6));

const nomeCategoria = (id) => perId.value.get(id)?.nome || id;
const nomeConto = (id) => props.conti.find((c) => String(c.id) === String(id))?.nome || 'Conto';

const attivi = computed(() => filtriAttivi(props.modelValue, { nomeCategoria, nomeConto }));

const rimuovi = (chiave) => {
  emit('update:modelValue', { ...props.modelValue, [chiave]: FILTRI_INIZIALI[chiave] });
};
</script>

<template>
  <div class="filtri">
    <div class="filtri__rapidi">
      <div class="filtri__tipi" role="group" aria-label="Tipo di movimento">
        <button
          v-for="t in TIPI"
          :key="t.id || 'tutti'"
          type="button"
          class="filtri__chip"
          :class="{ 'filtri__chip--attivo': modelValue.tipo === t.id }"
          :aria-pressed="modelValue.tipo === t.id"
          @click="aggiorna('tipo', t.id)"
        >
          {{ t.label }}
        </button>
      </div>

      <button
        type="button"
        class="filtri__apri"
        :aria-expanded="pannelloAperto"
        @click="pannelloAperto = true"
      >
        <SlidersHorizontal :size="16" :stroke-width="1.75" aria-hidden="true" />
        Filtri
        <span v-if="attivi.length" class="filtri__conteggio">{{ attivi.length }}</span>
      </button>
    </div>

    <div v-if="recenti.length" class="filtri__recenti">
      <span class="filtri__recenti-titolo">Categorie recenti</span>
      <button
        v-for="c in recenti"
        :key="c.id"
        type="button"
        class="filtri__chip"
        :class="{ 'filtri__chip--attivo': modelValue.categoria === c.id }"
        :aria-pressed="modelValue.categoria === c.id"
        @click="aggiorna('categoria', modelValue.categoria === c.id ? '' : c.id)"
      >
        {{ c.emoji }} {{ c.nome }}
      </button>
    </div>

    <div v-if="attivi.length" class="filtri__attivi">
      <button
        v-for="f in attivi"
        :key="f.chiave"
        type="button"
        class="filtri__attivo"
        @click="rimuovi(f.chiave)"
      >
        {{ f.etichetta }}
        <X :size="14" :stroke-width="2" aria-hidden="true" />
        <span class="sr-only">Rimuovi il filtro {{ f.etichetta }}</span>
      </button>

      <button type="button" class="filtri__azzera" @click="emit('azzera')">
        Azzera filtri
      </button>
    </div>

    <p class="filtri__risultati" role="status">
      {{ risultati }} {{ risultati === 1 ? 'movimento' : 'movimenti' }}
    </p>

    <BottomSheet :open="pannelloAperto" title="Filtri" elevated @close="pannelloAperto = false">
      <div class="pannello">
        <label class="pannello__campo">
          <span class="pannello__etichetta">Cerca nella descrizione</span>
          <span class="pannello__ricerca">
            <Search :size="16" :stroke-width="1.75" aria-hidden="true" />
            <input
              type="search"
              :value="modelValue.cerca"
              placeholder="Per esempio: supermercato"
              maxlength="100"
              @input="aggiorna('cerca', $event.target.value)"
            >
          </span>
        </label>

        <label class="pannello__campo">
          <span class="pannello__etichetta">Periodo</span>
          <select :value="modelValue.periodo" @change="aggiorna('periodo', $event.target.value)">
            <option v-for="p in PERIODI_MOVIMENTI" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </label>

        <div v-if="modelValue.periodo === 'personalizzato'" class="pannello__intervallo">
          <label class="pannello__campo">
            <span class="pannello__etichetta">Dal</span>
            <input type="date" :value="modelValue.da" @change="aggiorna('da', $event.target.value)">
          </label>
          <label class="pannello__campo">
            <span class="pannello__etichetta">Al</span>
            <input type="date" :value="modelValue.a" @change="aggiorna('a', $event.target.value)">
          </label>
        </div>

        <label class="pannello__campo">
          <span class="pannello__etichetta">Conto</span>
          <select :value="modelValue.conto" @change="aggiorna('conto', $event.target.value)">
            <option value="">Tutti i conti</option>
            <option v-for="c in conti" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>

        <label class="pannello__campo">
          <span class="pannello__etichetta">Categoria</span>
          <select :value="modelValue.categoria" @change="aggiorna('categoria', $event.target.value)">
            <option value="">Tutte le categorie</option>
            <optgroup v-for="g in categoriePerGruppo" :key="g.nome" :label="g.nome">
              <option v-for="c in g.categorie" :key="c.id" :value="c.id">
                {{ c.emoji }} {{ c.nome }}
              </option>
            </optgroup>
          </select>
        </label>

        <label class="pannello__campo">
          <span class="pannello__etichetta">Ordina per</span>
          <select :value="modelValue.ordine" @change="aggiorna('ordine', $event.target.value)">
            <option v-for="o in ORDINI_MOVIMENTI" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>

        <div class="pannello__azioni">
          <button type="button" class="pannello__secondario" @click="emit('azzera')">
            Azzera filtri
          </button>
          <button type="button" class="pannello__primario" @click="pannelloAperto = false">
            Mostra {{ risultati }} {{ risultati === 1 ? 'movimento' : 'movimenti' }}
          </button>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped>
.filtri { display: flex; flex-direction: column; gap: var(--space-3); }

.filtri__rapidi {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.filtri__tipi,
.filtri__recenti,
.filtri__attivi {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.filtri__recenti-titolo {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.filtri__chip,
.filtri__apri,
.filtri__attivo,
.filtri__azzera {
  /* 44px: la stessa soglia tattile già applicata ai pulsanti "Riprova". */
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-pill);
  background: var(--glass-interactive-bg);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.filtri__chip:hover,
.filtri__apri:hover,
.filtri__attivo:hover { background: var(--glass-interactive-bg-hover); }

.filtri__chip:focus-visible,
.filtri__apri:focus-visible,
.filtri__attivo:focus-visible,
.filtri__azzera:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.filtri__chip--attivo {
  background: var(--accent-light);
  border-color: var(--border-focus);
  color: var(--text-primary);
}

.filtri__conteggio {
  min-width: 20px;
  padding: 0 var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--accent-green);
  color: var(--accent-on);
  font-size: var(--text-xs);
  text-align: center;
}

.filtri__azzera { border-style: dashed; }

.filtri__risultati {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.pannello { display: flex; flex-direction: column; gap: var(--space-4); }
.pannello__campo { display: flex; flex-direction: column; gap: var(--space-2); }

.pannello__etichetta {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.pannello__campo select,
.pannello__campo input {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--text-base);
}

.pannello__campo select:focus-visible,
.pannello__campo input:focus-visible {
  outline: none;
  border-color: var(--border-focus);
  box-shadow: var(--focus-ring);
}

.pannello__ricerca { position: relative; display: flex; align-items: center; }
.pannello__ricerca svg { position: absolute; left: var(--space-3); color: var(--text-muted); }
.pannello__ricerca input { width: 100%; padding-left: calc(var(--space-3) * 2 + 16px); }

.pannello__intervallo { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }

.pannello__azioni { display: flex; gap: var(--space-3); }

.pannello__primario,
.pannello__secondario {
  flex: 1;
  min-height: 44px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}

.pannello__primario {
  border: none;
  background: var(--accent-green);
  color: var(--accent-on);
}

.pannello__secondario {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
}

.pannello__primario:focus-visible,
.pannello__secondario:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* Su desktop il foglio dal basso diventa un pannello laterale. Il contenuto
   non cambia: cambia solo dove si posa. */
@media (min-width: 768px) {
  .pannello__intervallo { grid-template-columns: 1fr 1fr; }
}
</style>
```

- [ ] **Step 3: Verificare le icone**

Run: `cd client && grep -n "SlidersHorizontal\|Search\|X\b" src/utils/appIcons.js`

Aggiungi quelle mancanti seguendo la forma delle altre.

- [ ] **Step 4: Eseguire test e build**

Run: `cd client && npm test && npm run build`

Expected: PASS entrambi.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/movimenti/MovimentiFilters.vue client/src/utils/appIcons.js
git commit -m "$(cat <<'EOF'
Aggiunge il pannello dei filtri dei movimenti

Tre livelli: filtri rapidi sempre a schermo, categorie recenti come
scorciatoia, pannello completo per il resto. Il raggruppamento delle
categorie legge il campo gruppo che il catalogo porta già, e le
categorie create dall'utente arrivano con il gruppo "Personali": nessuna
resta senza sezione.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Adozione dei filtri nella vista e stato nello store

**Files:**
- Modify: `client/src/stores/movimenti.store.js`
- Modify: `client/src/views/MovimentiView.vue`

**Interfaces:**
- Consumes: `MovimentiFilters.vue` dal Task 13; `filtriMovimenti.js` dal Task 12.
- Produces: `movimentiStore.filtriUI` (ref), `movimentiStore.impostaFiltriUI(filtri)`, `movimentiStore.categorieRecenti` (computed).

- [ ] **Step 1: Aggiungere lo stato dei filtri allo store**

In `client/src/stores/movimenti.store.js`, accanto a `const filtri = ref({});`:

```js
  /**
   * Stato dei filtri a livello di interfaccia: più ricco dei parametri della
   * query, perché `periodo: 'mese'` non è `da`/`a` e va ricostruito quando si
   * torna alla pagina.
   *
   * Vive in memoria e basta. I blocchi 1-2 hanno escluso il disco per i dati
   * finanziari, e una ricerca salvata può essere altrettanto rivelatrice di un
   * importo. `reset()` lo azzera, quindi `resetPiniaStores()` lo pulisce già
   * al logout senza aggiungere nulla.
   */
  const filtriUI = ref({ ...FILTRI_INIZIALI });
  const impostaFiltriUI = (valore) => { filtriUI.value = { ...valore }; };

  /**
   * Categorie viste nei movimenti recenti, dalla più frequente. Serve alla
   * scorciatoia del pannello filtri: nessun endpoint nuovo per
   * un'informazione che la dashboard carica già.
   */
  const categorieRecenti = computed(() => {
    const conteggi = new Map();
    (risorsaRecenti.data.value || []).forEach((m) => {
      if (!m.categoria) return;
      conteggi.set(m.categoria, (conteggi.get(m.categoria) || 0) + 1);
    });
    return [...conteggi.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  });
```

Importa `FILTRI_INIZIALI` in cima, e aggiungi `computed` all'import di `vue` se non c'è già.

Nel `reset()` dello store aggiungi:

```js
    filtriUI.value = { ...FILTRI_INIZIALI };
```

E aggiungi `filtriUI`, `impostaFiltriUI`, `categorieRecenti` all'oggetto restituito.

- [ ] **Step 2: Adottare il componente nella vista**

In `client/src/views/MovimentiView.vue`:

Sostituisci i sette `ref` dei filtri (righe 35-42) con un riferimento allo store, e la costruzione manuale dei parametri (righe 49-68) con il modulo puro:

```js
import { storeToRefs } from 'pinia';
import MovimentiFilters from '@/components/movimenti/MovimentiFilters.vue';
import { FILTRI_INIZIALI, aParametriQuery } from '@/utils/filtriMovimenti';

const { filtriUI } = storeToRefs(movimentiStore);

const caricaMovimenti = () => movimentiStore.fetchMovimenti(aParametriQuery(filtriUI.value));

/**
 * La ricerca parte a ogni tasto premuto, ma non a ogni tasto premuto: il
 * debounce evita una richiesta per lettera. La guardia di generazione dello
 * store scarta comunque le risposte sorpassate, quindi qui si risparmia
 * traffico, non correttezza.
 */
let attesa;
const aggiornaFiltri = (nuovi) => {
  const ricercaCambiata = nuovi.cerca !== filtriUI.value.cerca;
  movimentiStore.impostaFiltriUI(nuovi);
  clearTimeout(attesa);
  if (ricercaCambiata) attesa = setTimeout(caricaMovimenti, 300);
  else caricaMovimenti();
};

const azzeraFiltri = () => {
  movimentiStore.impostaFiltriUI({ ...FILTRI_INIZIALI });
  caricaMovimenti();
};
```

Sostituisci il `watch` della riga 187 con uno solo, e rimuovi il markup dei filtri esistente (il `<select>` alla riga 296 e ciò che lo circonda) con:

```vue
      <MovimentiFilters
        :model-value="filtriUI"
        :conti="contiStore.conti"
        :categorie-recenti="movimentiStore.categorieRecenti"
        :risultati="movimentiStore.pagination.total"
        @update:model-value="aggiornaFiltri"
        @azzera="azzeraFiltri"
      />
```

Verifica il nome della lista dei conti prima di usarlo:
```bash
cd client && grep -n "conti" src/stores/conti.store.js | grep "return\|const conti"
```

- [ ] **Step 3: Mostrare che una ricerca è in corso**

Durante una nuova ricerca `stato` resta `pronto`, perché `lastUpdated` non è più nullo: senza un indicatore la lista mostrerebbe i risultati precedenti in silenzio.

Sopra la lista:

```vue
      <p v-if="movimentiStore.loading" class="movimenti__ricerca-in-corso" role="status">
        Aggiornamento dei risultati…
      </p>
```

```css
.movimenti__ricerca-in-corso {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-muted);
}
```

- [ ] **Step 4: Eseguire test e build**

Run: `cd client && npm test && npm run build`

Expected: PASS entrambi. `vistaValue.test.js` è la guardia che il nuovo markup non introduca un `.value` di troppo.

- [ ] **Step 5: Verificare a schermo**

Apri Movimenti e controlla, in quest'ordine:

1. Scrivi nella ricerca: la lista si restringe dopo una breve pausa, non a ogni lettera.
2. Scorri fino in fondo e carica una pagina successiva; **poi** cambia la ricerca. Le righe della ricerca precedente devono sparire del tutto, non mescolarsi. È la guardia di generazione che si sta verificando.
3. Ordina per importo decrescente: il primo movimento è il più grande.
4. Scegli una categoria personale che hai creato: compare nel gruppo "Personali" e filtra.
5. Vai su un'altra pagina e torna ai Movimenti: i filtri sono ancora quelli.
6. Esci e rientra: i filtri sono tornati ai predefiniti.
7. Su viewport mobile, il pannello si apre come foglio dal basso e si chiude.

- [ ] **Step 6: Commit**

```bash
git add client/src/stores/movimenti.store.js client/src/views/MovimentiView.vue
git commit -m "$(cat <<'EOF'
Adotta il pannello filtri nei Movimenti e ne conserva lo stato

I filtri vivono nello store, in memoria: sopravvivono alla navigazione
dentro l'app e spariscono al logout, senza scrivere nulla su disco. La
ricerca va in debounce, e un indicatore dice che i risultati si stanno
aggiornando — senza, la lista mostrerebbe in silenzio quelli di prima,
perché con dati già presenti lo stato resta "pronto".

La guardia di generazione della paginazione non è stata toccata.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Documentazione

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/API.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `client/src/content/helpTopics.js`

**Interfaces:**
- Consumes: tutti i task precedenti.
- Produces: niente di programmatico.

- [ ] **Step 1: Aggiornare `CLAUDE.md`**

Nella sezione **Coding Rules**, dopo la regola 18:

```markdown
19. I token di leggibilità stanno in `client/src/assets/styles/variables.css` e sono verificati da `client/tests/contrasto.test.js`: ogni coppia testo/superficie dichiarata deve stare sopra 4.5:1 (3:1 per i bordi che delimitano un controllo). Aggiungere un token di testo significa aggiungerlo a `COPPIE`, altrimenti la suite fallisce. Il pavimento tipografico è `--text-xs` (14px) per l'informativo; sotto si scende solo con `--text-micro` e una deroga commentata sulla riga, sorvegliata da `client/tests/tipografia.test.js`.
20. `creaRisorsa` dentro un componente espone **ref di primo livello**, mai l'oggetto risorsa: nei componenti i ref annidati non si scompattano nel template, al contrario di quanto succede attraverso uno store Pinia. `client/src/composables/useAndamentoPatrimonio.js` è il riferimento; `client/tests/vistaValue.test.js` sorveglia i template.
```

Nella tabella **Sensitive Areas**, aggiungi:

```markdown
| **Filtri dei movimenti** | Un filtro che perde l'isolamento per utente è un difetto di sicurezza. `where.user_id` resta la prima condizione e i filtri si aggiungono | `movimenti.controller.js`, `validation.middleware.js`, `server/tests/movimentiFiltri.test.js` |
```

In **Known Issues**, aggiorna il punto 7 con il nuovo conteggio delle suite.

- [ ] **Step 2: Aggiornare `docs/API.md`**

Per `GET /movimenti`, aggiungi ai parametri:

| Parametro | Valori | Descrizione |
|---|---|---|
| `cerca` | stringa, max 100 | Sottostringa cercata nella descrizione, senza distinzione di maiuscole |
| `ordine` | `data`, `caricamento`, `importo_desc`, `importo_asc` | Default `data` |

Per `GET /analisi/andamento-patrimonio`, aggiungi `giorno` ai valori di `unita` e annota che il tetto di `quantita` è 31 per `giorno` e 12 per le altre unità.

- [ ] **Step 3: Aggiornare `docs/ARCHITECTURE.md`**

Annota che l'andamento del patrimonio non passa più dallo store: il componente `AndamentoPatrimonio.vue` possiede una risorsa per istanza tramite `useAndamentoPatrimonio`, e Dashboard e Analisi non si contendono più il periodo.

- [ ] **Step 4: Aggiungere l'argomento di aiuto sui filtri**

In `client/src/content/helpTopics.js`, seguendo la forma degli argomenti esistenti — testo semplice, nessun dato finanziario, id stabile:

```js
  {
    id: 'filtrare-i-movimenti',
    titolo: 'Come trovare un movimento',
    corpo: [
      'I pulsanti in alto filtrano per tipo: entrate, uscite o trasferimenti. Le categorie recenti sono quelle che hai usato di più negli ultimi movimenti.',
      'Il pannello "Filtri" apre tutto il resto: la ricerca nella descrizione, il periodo, il conto, la categoria e l\'ordinamento. Puoi ordinare per importo quando cerchi la spesa più grande di un mese.',
      'I filtri che hai scelto compaiono sotto i pulsanti e si tolgono uno alla volta. "Azzera filtri" li rimuove tutti insieme.',
      'I filtri restano mentre navighi nell\'app e si azzerano quando esci: non vengono salvati sul tuo dispositivo.',
    ],
  },
```

Aggiungilo anche alla sezione giusta di `HELP_SECTIONS`: la pagina Aiuto è organizzata per attività, quindi va accanto agli argomenti sui movimenti.

Verifica la forma esatta prima di scrivere:
```bash
cd client && sed -n '1,60p' src/content/helpTopics.js && grep -n "HELP_SECTIONS" -A 25 src/content/helpTopics.js
```

- [ ] **Step 5: Eseguire i test**

Run: `cd client && npm test`

Expected: PASS. `helpTopics.test.js` verifica gli id e la struttura: se fallisce, la forma dell'argomento nuovo non corrisponde a quella attesa.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs client/src/content/helpTopics.js
git commit -m "$(cat <<'EOF'
Aggiorna la documentazione per il sotto-progetto B

Due Coding Rules nuove: i token di leggibilità verificati da un test, e
creaRisorsa dentro un componente che espone ref di primo livello. I
filtri dei movimenti entrano fra le aree delicate, perché un filtro che
perde l'isolamento per utente è un difetto di sicurezza.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verifica finale di branch

Non è un task: è il passo che il brief indica come quello che vede ciò che nessuna review di task può vedere. Su dodici task tutti approvati, nei blocchi 1-2 ha trovato un difetto critico che impediva alla dashboard di renderizzare.

- [ ] `cd client && npm test && npm run build`
- [ ] `cd server && npm test`
- [ ] Review dell'intero diff del branch con `superpowers:requesting-code-review`
- [ ] Verifica a schermo finale: Dashboard, Movimenti, Conti, Analisi, nei due temi, con il grafico e i filtri veri

**Build e test verdi non bastano.** Nei blocchi 1-2 il difetto critico compilava e passava 85 test, perché la suite esercitava la factory in isolamento, dove il bug non poteva manifestarsi. Per il codice di interfaccia serve il browser.
