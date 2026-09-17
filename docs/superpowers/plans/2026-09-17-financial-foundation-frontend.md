# Financial Foundation Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizzare la navigazione Funzionalità, aggiungere la pagina Ricorrenti, rendere affidabili gli stati notifiche, introdurre una 404 coerente e aggiornare l'Help senza implementare Piano Smart.

**Architecture:** Un catalogo JavaScript puro alimenta le superfici di navigazione. Ricorrenti e notifiche usano `creaRisorsa` come macchina a stati e `DataState` come renderer, mentre le trasformazioni di presentazione restano in utility pure testabili con `node:test`.

**Tech Stack:** Vue 3 Composition API, Pinia 3, Vue Router 5, CSS scoped con token WALLT, `node:test`, Vite 8.

**Spec:** `docs/superpowers/specs/2026-09-17-financial-foundation-frontend-design.md`

## Global Constraints

- Modificare solo frontend, UX, navigazione, Help e test client.
- Non modificare modelli, migrazioni, servizi o business logic backend.
- Non implementare Piano Smart, debiti finti, liquidità libera o mesi di copertura frontend.
- Non aggiungere dipendenze.
- Usare `AppDialog.vue` per conferme e `creaRisorsa` + `DataState` per letture remote.
- Copy utente in italiano; touch target minimo 44 px per le nuove azioni; focus visibile; nessuna informazione affidata solo al colore.
- Sviluppare ogni comportamento con ciclo RED–GREEN–REFACTOR.

---

### Task 1: Catalogo Funzionalità condiviso

**Files:**
- Create: `client/src/config/functionalityItems.js`
- Create: `client/tests/functionalityItems.test.js`
- Modify: `client/src/components/layout/AppLayout.vue`
- Modify: `client/src/utils/appIcons.js`

**Interfaces:**
- Produces: `FUNCTIONALITY_ITEMS: FunctionalityItem[]` e `getFunctionalityItems(context, placement): FunctionalityItem[]`.
- `context` contiene `canAccessScommesseFeature` e `canAccessInvestimentiFeature` booleani.
- `placement` è `'sidebar'` oppure `'sheet'`.

- [ ] **Step 1: Scrivere il test fallente del catalogo**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNCTIONALITY_ITEMS, getFunctionalityItems } from '../src/config/functionalityItems.js';

test('ogni funzione ha metadati completi e id univoco', () => {
  assert.equal(new Set(FUNCTIONALITY_ITEMS.map((item) => item.id)).size, FUNCTIONALITY_ITEMS.length);
  FUNCTIONALITY_ITEMS.forEach((item) => {
    assert.ok(item.id && item.label && item.description && item.route && item.icon);
    assert.equal(item.active, true);
  });
});

test('ricorrenti alimenta sidebar e bottom sheet dalla stessa voce', () => {
  const context = { canAccessScommesseFeature: true, canAccessInvestimentiFeature: true };
  for (const placement of ['sidebar', 'sheet']) {
    assert.ok(getFunctionalityItems(context, placement).some((item) => item.id === 'ricorrenti'));
  }
});

test('le restrizioni filtrano le funzioni senza duplicare le liste', () => {
  const items = getFunctionalityItems({
    canAccessScommesseFeature: false,
    canAccessInvestimentiFeature: false,
  }, 'sheet');
  assert.ok(!items.some((item) => item.id === 'scommesse'));
  assert.ok(!items.some((item) => item.id === 'investimenti'));
});
```

- [ ] **Step 2: Eseguire il test e verificare RED**

Run: `cd client && node --test tests/functionalityItems.test.js`
Expected: FAIL perché `src/config/functionalityItems.js` non esiste.

- [ ] **Step 3: Implementare il catalogo minimo**

```js
export const FUNCTIONALITY_ITEMS = Object.freeze([
  { id: 'budget', label: 'Budget', description: 'Pianifica le spese', icon: 'budget', route: '/budget', placements: ['sidebar', 'sheet'], active: true },
  { id: 'obiettivi', label: 'Obiettivi', description: 'Risparmi e traguardi', icon: 'obiettivi', route: '/obiettivi', placements: ['sidebar', 'sheet'], active: true },
  { id: 'ricorrenti', label: 'Ricorrenti', description: 'Entrate e uscite mensili', icon: 'ricorrenti', route: '/ricorrenti', placements: ['sidebar', 'sheet'], active: true },
  { id: 'scommesse', label: 'Scommesse', description: 'Piattaforme e movimenti', icon: 'scommesse', route: '/scommesse', placements: ['sidebar', 'sheet'], active: true, access: 'scommesse' },
  { id: 'investimenti', label: 'Investimenti', description: 'Portafoglio e rendimenti', icon: 'investimenti', route: '/investimenti', placements: ['sidebar', 'sheet'], active: true, access: 'investimenti' },
  { id: 'analisi', label: 'Analisi', description: 'Andamento delle finanze', icon: 'analisi', route: '/analisi', placements: ['sidebar'], active: true },
  { id: 'aiuto', label: 'Aiuto', description: 'Guida e primi passi', icon: 'aiuto', route: '/aiuto', placements: ['sheet'], active: true },
]);

export const getFunctionalityItems = (context = {}, placement = 'sheet') => FUNCTIONALITY_ITEMS.filter((item) => {
  if (!item.active || !item.placements.includes(placement)) return false;
  if (item.access === 'scommesse') return context.canAccessScommesseFeature === true;
  if (item.access === 'investimenti') return context.canAccessInvestimentiFeature === true;
  return true;
});
```

Estendere `NAV_ICON_MAP` con `ricorrenti: Repeat2`, importare il selettore in `AppLayout.vue` e sostituire le due liste duplicate con computed derivati dal catalogo.

- [ ] **Step 4: Verificare GREEN e regressioni**

Run: `cd client && node --test tests/functionalityItems.test.js && npm test`
Expected: PASS per il nuovo file e per tutta la suite.

- [ ] **Step 5: Commit**

```bash
git add client/src/config/functionalityItems.js client/tests/functionalityItems.test.js client/src/components/layout/AppLayout.vue client/src/utils/appIcons.js
git commit -m "refactor(navigation): centralize functionality items"
```

---

### Task 2: Risorsa e presentazione Ricorrenti

**Files:**
- Create: `client/src/utils/ricorrenti.js`
- Create: `client/tests/ricorrenti.test.js`
- Modify: `client/src/stores/movimenti.store.js`

**Interfaces:**
- Produces: `prossimaEsecuzione(giorno, oggi): dayjs.Dayjs`, `presentaRicorrente(movimento, oggi): object`.
- Produces nello store: `risorsaRicorrenti`, `ricorrenti`, `fetchRicorrenti()`.

- [ ] **Step 1: Scrivere test fallenti per presentazione, vuoto ed errore**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import { prossimaEsecuzione, presentaRicorrente } from '../src/utils/ricorrenti.js';
import { creaRisorsa } from '../src/utils/risorsa.js';

test('la prossima esecuzione usa questo mese se il giorno non è passato', () => {
  assert.equal(prossimaEsecuzione(20, dayjs('2026-09-17')).format('YYYY-MM-DD'), '2026-09-20');
});

test('il giorno oltre la fine del mese viene limitato all ultimo giorno', () => {
  assert.equal(prossimaEsecuzione(31, dayjs('2026-09-17')).format('YYYY-MM-DD'), '2026-09-30');
});

test('presenta i campi richiesti senza inventare lo stato pausa', () => {
  const item = presentaRicorrente({ tipo: 'uscita', importo: '19.90', descrizione: 'Telefono', ricorrente_giorno: 5, conto: { nome: 'Carta' }, ricorrente: true }, dayjs('2026-09-17'));
  assert.equal(item.tipoLabel, 'Uscita');
  assert.equal(item.frequenzaLabel, 'Ogni mese');
  assert.equal(item.contoLabel, 'Carta');
  assert.equal(item.statoLabel, 'Attiva');
});

test('una lista riuscita ma vuota è vuoto, un fallimento è errore', async () => {
  const vuota = creaRisorsa(async () => [], { iniziale: [] });
  await vuota.carica();
  assert.equal(vuota.stato.value, 'vuoto');
  const errore = creaRisorsa(async () => { throw new Error('rete'); }, { iniziale: [] });
  await errore.carica();
  assert.equal(errore.stato.value, 'errore');
});
```

- [ ] **Step 2: Eseguire e verificare RED**

Run: `cd client && node --test tests/ricorrenti.test.js`
Expected: FAIL perché `src/utils/ricorrenti.js` non esiste.

- [ ] **Step 3: Implementare utility e risorsa store**

```js
export const prossimaEsecuzione = (giorno, oggi = dayjs()) => {
  const giornoValido = Math.min(31, Math.max(1, Number(giorno) || 1));
  const nelMese = oggi.date(Math.min(giornoValido, oggi.daysInMonth())).startOf('day');
  if (!nelMese.isBefore(oggi.startOf('day'))) return nelMese;
  const prossimo = oggi.add(1, 'month');
  return prossimo.date(Math.min(giornoValido, prossimo.daysInMonth())).startOf('day');
};
```

In `movimenti.store.js` sostituire il fetch isolato con:

```js
const risorsaRicorrenti = creaRisorsa(async () => {
  const { data } = await api.get('/movimenti/ricorrenti');
  return data.movimenti || [];
}, { iniziale: [] });
const ricorrenti = computed(() => risorsaRicorrenti.data.value);
const fetchRicorrenti = () => risorsaRicorrenti.carica();
```

Aggiungere `risorsaRicorrenti.reset()` al reset e restituire risorsa/computed dallo store.

- [ ] **Step 4: Verificare GREEN**

Run: `cd client && node --test tests/ricorrenti.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/ricorrenti.js client/tests/ricorrenti.test.js client/src/stores/movimenti.store.js
git commit -m "feat(recurring): add reliable recurring data resource"
```

---

### Task 3: Pagina Ricorrenti e route

**Files:**
- Create: `client/src/components/ricorrenti/RicorrenteItem.vue`
- Create: `client/src/views/RicorrentiView.vue`
- Create: `client/tests/ricorrentiView.test.js`
- Create: `client/tests/helpers/renderVue.js`
- Modify: `client/src/router/index.js`

**Interfaces:**
- Consumes: `useMovimentiStore().risorsaRicorrenti`, `ricorrenti`, `fetchRicorrenti`, `updateMovimento`, `deleteMovimento`.
- Consumes: `presentaRicorrente`, `MovimentoForm`, `DataState`, `AppDialog`.

- [ ] **Step 1: Scrivere un test SSR fallente per rendering e accessibilità**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSfc } from './helpers/renderVue.js';

test('la riga ricorrente rende i campi e le azioni richiesti', async () => {
  const html = await renderSfc('/src/components/ricorrenti/RicorrenteItem.vue', {
    movimento: { id: 1, tipo: 'uscita', importo: '19.90', descrizione: 'Telefono', ricorrente: true, ricorrente_giorno: 20, conto: { nome: 'Carta' } },
  });
  for (const testo of ['Telefono', 'Uscita', 'Ogni mese', 'Prossima esecuzione', 'Carta', 'Attiva', 'Modifica', 'Elimina']) assert.match(html, new RegExp(testo));
});

test('la riga usa testo oltre al colore', async () => {
  const html = await renderSfc('/src/components/ricorrenti/RicorrenteItem.vue', {
    movimento: { id: 1, tipo: 'entrata', importo: '100', descrizione: 'Rimborso', ricorrente: true, ricorrente_giorno: 5, conto: { nome: 'Banca' } },
  });
  assert.match(html, />Entrata</);
  assert.match(html, />Modifica</);
  assert.match(html, />Elimina</);
});
```

- [ ] **Step 2: Eseguire e verificare RED**

Run: `cd client && node --test tests/ricorrentiView.test.js`
Expected: FAIL perché il componente non esiste.

- [ ] **Step 3: Implementare la pagina**

Creare `RicorrenteItem.vue` come componente presentazionale e una vista che:

```vue
<DataState
  :stato="movimentiStore.risorsaRicorrenti.stato"
  :last-updated="movimentiStore.risorsaRicorrenti.lastUpdated"
  messaggio-errore="Non è stato possibile caricare i movimenti ricorrenti."
  skeleton-type="card"
  @riprova="movimentiStore.risorsaRicorrenti.riprova()"
>
  <template #vuoto>…Nessun movimento ricorrente…</template>
  <article v-for="movimento in movimentiStore.ricorrenti" :key="movimento.id">…</article>
</DataState>
```

Montare `MovimentoForm` con il movimento selezionato per modifica. Dopo `saved`, richiamare `fetchRicorrenti`. Per eliminare, aprire `AppDialog`, chiamare `deleteMovimento(id)`, chiudere il dialog, mostrare il toast e ricaricare Ricorrenti.

Aggiungere nel router, prima della catch-all futura:

```js
{ path: 'ricorrenti', name: 'ricorrenti', component: () => import('@/views/RicorrentiView.vue') },
```

- [ ] **Step 4: Verificare GREEN e build**

Run: `cd client && node --test tests/ricorrentiView.test.js && npm test && npm run build`
Expected: PASS e build riuscita.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ricorrenti/RicorrenteItem.vue client/src/views/RicorrentiView.vue client/tests/helpers/renderVue.js client/tests/ricorrentiView.test.js client/src/router/index.js
git commit -m "feat(recurring): add recurring transactions view"
```

---

### Task 4: Stato affidabile delle notifiche

**Files:**
- Create: `client/tests/notificheResource.test.js`
- Modify: `client/src/stores/notifiche.store.js`
- Modify: `client/src/views/NotificheView.vue`
- Modify: `client/src/components/notifiche/NotifichePanel.vue`

**Interfaces:**
- Produces nello store: `risorsaNotifiche` con dato `{ notifiche, totale, nonLette }`.
- Mantiene compatibili `notifiche`, `totale`, `nonLette`, `loading`, `fetchNotifiche()`.

- [ ] **Step 1: Scrivere test fallenti per errore, retry e conservazione dati**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaRisorsa } from '../src/utils/risorsa.js';

test('errore notifiche non diventa lista vuota', async () => {
  const r = creaRisorsa(async () => { throw new Error('rete'); }, { iniziale: { notifiche: [], totale: 0, nonLette: 0 }, vuotoSe: (d) => d.notifiche.length === 0 });
  await r.carica();
  assert.equal(r.stato.value, 'errore');
});

test('retry notifiche recupera e un errore successivo conserva i dati', async () => {
  let tentativo = 0;
  const r = creaRisorsa(async () => {
    tentativo += 1;
    if (tentativo === 1 || tentativo === 3) throw new Error('rete');
    return { notifiche: [{ id: 1 }], totale: 1, nonLette: 1 };
  }, { iniziale: { notifiche: [], totale: 0, nonLette: 0 }, vuotoSe: (d) => d.notifiche.length === 0 });
  await r.carica();
  await r.riprova();
  await r.carica();
  assert.equal(r.stato.value, 'errore-con-dati');
  assert.equal(r.data.value.notifiche.length, 1);
});
```

- [ ] **Step 2: Eseguire e verificare RED rispetto allo store attuale**

Run: `cd client && node --test tests/notificheResource.test.js` e aggiungere una guardia che richiede `risorsaNotifiche` nello store.
Expected: la guardia dello store FAIL perché il simbolo non esiste.

- [ ] **Step 3: Migrare lo store e le due superfici**

Nel fetcher restituire:

```js
return {
  notifiche: data.notifiche || [],
  totale: data.totale || 0,
  nonLette: data.non_lette || 0,
};
```

Esporre computed per le proprietà compatibili. Dopo scritture riuscite aggiornare `risorsaNotifiche.data.value` con copie immutabili. In reset chiamare `risorsaNotifiche.reset()`.

Rimpiazzare i rami manuali `loading`/`vuoto` in pagina e pannello con `DataState`, usando `risorsaNotifiche.stato`, `lastUpdated` e `riprova`. Il pannello mantiene il footer disponibile solo quando esistono dati.

- [ ] **Step 4: Verificare GREEN**

Run: `cd client && node --test tests/notificheResource.test.js && npm test && npm run build`
Expected: PASS e build riuscita.

- [ ] **Step 5: Commit**

```bash
git add client/tests/notificheResource.test.js client/src/stores/notifiche.store.js client/src/views/NotificheView.vue client/src/components/notifiche/NotifichePanel.vue
git commit -m "fix(notifications): distinguish error from empty state"
```

---

### Task 5: Route 404 e Help

**Files:**
- Create: `client/src/views/NotFoundView.vue`
- Create: `client/src/router/routes.js`
- Create: `client/tests/notFoundRoute.test.js`
- Modify: `client/src/router/index.js`
- Modify: `client/src/content/helpTopics.js`
- Modify: `client/tests/helpTopics.test.js`

**Interfaces:**
- Produces: route `not-found` con path `/:pathMatch(.*)*`.
- Produce argomenti Help `funzionalita-navigazione`, `ricorrenti-gestione`, `notifiche-aggiornamento`.

- [ ] **Step 1: Scrivere test fallenti**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, createMemoryHistory } from 'vue-router';
import { loadModule, renderSfc } from './helpers/renderVue.js';

test('una URL sconosciuta risolve la route 404', async () => {
  const { routes } = await loadModule('/src/router/routes.js');
  const router = createRouter({ history: createMemoryHistory(), routes });
  assert.equal(router.resolve('/questa-pagina-non-esiste').name, 'not-found');
});

test('la 404 rende Home e ritorno come azioni nominate', async () => {
  const html = await renderSfc('/src/views/NotFoundView.vue');
  assert.match(html, /Torna alla Home/);
  assert.match(html, /Torna indietro/);
  assert.match(html, /<main/);
});
```

Estendere `helpTopics.test.js` con:

```js
for (const id of ['funzionalita-navigazione', 'ricorrenti-gestione', 'notifiche-aggiornamento']) {
  assert.ok(getHelpTopic(id), `argomento mancante: ${id}`);
}
```

- [ ] **Step 2: Eseguire e verificare RED**

Run: `cd client && node --test tests/notFoundRoute.test.js tests/helpTopics.test.js`
Expected: FAIL per vista/route/argomenti mancanti.

- [ ] **Step 3: Implementare vista, route e contenuti reali**

La vista usa `WalltLogo`, `WButton`, `router.push('/dashboard')` e `router.back()`, con copy “Questa pagina non esiste o è stata spostata”. Aggiungere la catch-all come ultima route top-level.

Nel catalogo Help aggiungere tre topic con link interni a `/ricorrenti`, `/notifiche` e `/aiuto`, poi inserirli nelle sezioni appropriate. Non menzionare funzionalità backend future.

- [ ] **Step 4: Verificare GREEN**

Run: `cd client && node --test tests/notFoundRoute.test.js tests/helpTopics.test.js && npm test && npm run build`
Expected: PASS e build riuscita.

- [ ] **Step 5: Commit**

```bash
git add client/src/views/NotFoundView.vue client/src/router/routes.js client/tests/notFoundRoute.test.js client/src/router/index.js client/src/content/helpTopics.js client/tests/helpTopics.test.js
git commit -m "feat(router): add themed not-found route and update help"
```

---

### Task 6: Verifica browser e chiusura

**Files:**
- Modify only if verification reveals a regression in files already owned by Tasks 1–5.

**Interfaces:**
- Consumes: application routes and build output.
- Produces: evidence for the final report; no permanent mocks.

- [ ] **Step 1: Eseguire verifiche statiche finali**

Run: `cd client && npm test && npm run build && git diff --check`
Expected: 0 fallimenti, build riuscita, nessun errore whitespace. Annotare che `npm run lint` non esiste.

- [ ] **Step 2: Avviare frontend e backend disponibili**

Run client: `cd client && npm run dev -- --host 127.0.0.1`
Run server, solo se dipendenze e database locali sono configurati: `cd server && npm start`.

- [ ] **Step 3: Verificare realmente le route**

Con il browser controllare Home, Movimenti, Conti, Budget, Analisi, Funzionalità, Ricorrenti, Obiettivi, Investimenti, Notifiche, Aiuto, Impostazioni e una URL inesistente a viewport mobile e desktop. Controllare console, route rotte, loading/error/empty raggiungibili, focus da tastiera e chiusura dialog con Escape.

- [ ] **Step 4: Correggere eventuali regressioni con test RED prima del fix**

Per ogni difetto osservato, aggiungere un test minimo che fallisce, correggere il solo file coinvolto e rieseguire test mirato + suite completa.

- [ ] **Step 5: Revisione finale e commit di eventuali sole correzioni**

```bash
git status --short
git diff --check
git log --oneline main..HEAD
```

Se esistono correzioni non ancora committate:

```bash
git add <solo-file-correlati>
git commit -m "test(frontend): verify financial foundation flows"
```
