# Fondamenta: stato dei dati e terminologia del patrimonio — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedire che un errore di rete venga scambiato per una perdita di dati, e dare a ogni cifra mostrata un nome stabile e una definizione unica in tutta l'app.

**Architecture:** Una factory `creaRisorsa` avvolge ogni lettura API e garantisce per costruzione che un fallimento non azzeri mai i dati già ottenuti; un componente `DataState` puramente presentazionale traduce lo stato della risorsa in ciò che l'utente vede. Un glossario statico diventa l'unica fonte delle etichette finanziarie. Nessuna modifica al backend e nessuna modifica ai calcoli.

**Tech Stack:** Vue 3.5 (Composition API, `<script setup>`), Pinia 3, dayjs, `node --test` per i test del client. Nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-09-10-fondamenta-dati-e-patrimonio-design.md`

## Global Constraints

- **Nessuna dipendenza nuova.** Vietato introdurre `vitest`, `@vue/test-utils` o qualunque altro pacchetto (regola 5 del `CLAUDE.md`). I test del client girano con `node --test tests/*.test.js`, che funziona solo su moduli JS puri. **Verificato in fase di pianificazione:** la reattività di Vue (`ref`, `computed`) funziona sotto `node --test` senza DOM, quindi `risorsa.js` è testabile così com'è.
- **Nessuna modifica al backend.** Nessun file sotto `server/` viene toccato. Nessun endpoint nuovo, nessun campo nuovo nelle risposte.
- **Nessuna modifica ai calcoli finanziari.** Il patrimonio resta `conti attivi + investimenti attivi`, esattamente come oggi. Il blocco 2 rinomina, non ricalcola.
- **Lingua:** italiano per i messaggi rivolti all'utente e per i commenti; inglese per gli identificatori di codice. È la convenzione del progetto (regola 7 del `CLAUDE.md`).
- **Persistenza:** solo in memoria. È vietato scrivere saldi, importi o qualunque dato finanziario in `localStorage` o `sessionStorage`.
- **Etichette esatte, da usare verbatim:**
  - Titolo della scheda principale: `Patrimonio totale`
  - Voci della composizione: `Conti` e `Investimenti`
  - Risultato mensile: `Risultato del mese`
  - Avviso dati vecchi: `Non è stato possibile aggiornare i dati. Stai visualizzando l'ultimo aggiornamento disponibile.`
  - Indicatore: `Dati non aggiornati`
  - Pulsante: `Riprova`
- **Baseline dei test prima di iniziare:** `cd client && npm test` → 65 test verdi. Nessun task può ridurre questo numero.
- **Accessibilità:** l'avviso discreto è `role="status"`, il pannello d'errore è `role="alert"`. Ogni segnale di stato porta icona **e** testo, mai il solo colore.

---

## Struttura dei file

**Creati:**

| File | Responsabilità |
|---|---|
| `client/src/utils/risorsa.js` | La factory. Tutta la logica di stato vive qui, ed è l'unico file di questo piano che contenga decisioni |
| `client/tests/risorsa.test.js` | La macchina a stati, verificata caso per caso |
| `client/src/components/common/DataState.vue` | Presentazione. Riceve uno stato, sceglie uno slot. Nessuna decisione |
| `client/src/content/glossario.js` | Catalogo delle etichette finanziarie, unica fonte di verità |
| `client/tests/glossario.test.js` | Coerenza del catalogo |

**Modificati:** i sette store (`conti`, `movimenti`, `budget`, `analisi`, `obiettivi`, `investimenti`, `scommesse`), le otto viste corrispondenti, `WOverviewCarousel.vue`, `helpTopics.js`, `session.js`, più `CLAUDE.md`, `docs/PROJECT_STATUS.md` e `docs/ARCHITECTURE.md`.

**Eliminati:** `GlassBalanceCard.vue`, `SummaryCards.vue`, `CategoryCarousel.vue`, `CategoryCard.vue`, `PlaceholderView.vue`.

---

### Task 1: La factory `creaRisorsa`

Il cuore del piano. Nessun altro task ha senso finché questo non è verde.

**Files:**
- Create: `client/src/utils/risorsa.js`
- Test: `client/tests/risorsa.test.js`

**Interfaces:**
- Consumes: niente (primo task)
- Produces: `creaRisorsa(fetcher, opzioni)` → `{ data, loading, error, lastUpdated, stato, carica, riprova, reset }`. `data`/`loading`/`error`/`lastUpdated` sono `Ref`; `stato` è un `ComputedRef<'caricamento'|'errore'|'errore-con-dati'|'vuoto'|'pronto'>`; `carica(...args)` è `async` e **non lancia mai**, restituendo i dati in caso di successo e `undefined` in caso di errore; `riprova()` ripete l'ultima chiamata con gli stessi argomenti; `reset()` riporta tutto allo stato iniziale.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `client/tests/risorsa.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaRisorsa } from '../src/utils/risorsa.js';

/** Promise che possiamo risolvere o rifiutare a comando, per i test di concorrenza. */
const differita = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('parte in stato di caricamento e arriva a pronto', async () => {
  const r = creaRisorsa(async () => [1, 2, 3], { iniziale: [] });
  assert.equal(r.stato.value, 'vuoto');
  const attesa = r.carica();
  assert.equal(r.stato.value, 'caricamento');
  await attesa;
  assert.equal(r.stato.value, 'pronto');
  assert.deepEqual(r.data.value, [1, 2, 3]);
  assert.equal(r.error.value, null);
  assert.ok(r.lastUpdated.value > 0);
});

test('senza dati precedenti un fallimento porta in errore', async () => {
  const r = creaRisorsa(async () => { throw new Error('rete'); }, { iniziale: [] });
  await r.carica();
  assert.equal(r.stato.value, 'errore');
  assert.equal(r.lastUpdated.value, null);
});

test('INVARIANTE: un fallimento non tocca data ne lastUpdated', async () => {
  let deveFallire = false;
  const r = creaRisorsa(async () => {
    if (deveFallire) throw new Error('rete');
    return [1, 2, 3];
  }, { iniziale: [] });

  await r.carica();
  const primoAggiornamento = r.lastUpdated.value;

  deveFallire = true;
  await r.carica();

  assert.deepEqual(r.data.value, [1, 2, 3], 'i dati devono restare');
  assert.equal(r.lastUpdated.value, primoAggiornamento, 'lastUpdated non deve cambiare');
  assert.equal(r.stato.value, 'errore-con-dati');
});

test('carica non lancia mai: restituisce undefined in caso di errore', async () => {
  const r = creaRisorsa(async () => { throw new Error('rete'); }, { iniziale: [] });
  const esito = await r.carica();
  assert.equal(esito, undefined);
});

test('un tentativo riuscito dopo un errore pulisce lo stato', async () => {
  let deveFallire = true;
  const r = creaRisorsa(async () => {
    if (deveFallire) throw new Error('rete');
    return [7];
  }, { iniziale: [] });

  await r.carica();
  assert.equal(r.stato.value, 'errore');

  deveFallire = false;
  await r.riprova();
  assert.equal(r.stato.value, 'pronto');
  assert.equal(r.error.value, null);
  assert.deepEqual(r.data.value, [7]);
});

test('durante un nuovo tentativo senza dati lo stato torna caricamento', async () => {
  const primo = differita();
  const secondo = differita();
  let chiamate = 0;
  const r = creaRisorsa(async () => {
    chiamate += 1;
    return chiamate === 1 ? primo.promise : secondo.promise;
  }, { iniziale: [] });

  const a = r.carica();
  primo.reject(new Error('rete'));
  await a;
  assert.equal(r.stato.value, 'errore');

  const b = r.carica();
  assert.equal(r.stato.value, 'caricamento', 'caricamento deve precedere errore');
  secondo.resolve([1]);
  await b;
  assert.equal(r.stato.value, 'pronto');
});

test('con dati precedenti l avviso resta visibile durante il nuovo tentativo', async () => {
  let modo = 'ok';
  const lenta = differita();
  const r = creaRisorsa(async () => {
    if (modo === 'ok') return [1];
    if (modo === 'ko') throw new Error('rete');
    return lenta.promise;
  }, { iniziale: [] });

  await r.carica();
  modo = 'ko';
  await r.carica();
  assert.equal(r.stato.value, 'errore-con-dati');

  modo = 'lenta';
  const inVolo = r.carica();
  assert.equal(r.stato.value, 'errore-con-dati', 'il banner non deve sparire a meta del retry');
  lenta.resolve([2]);
  await inVolo;
  assert.equal(r.stato.value, 'pronto');
});

test('una risposta lenta partita prima non sovrascrive una veloce partita dopo', async () => {
  const lenta = differita();
  const veloce = differita();
  let chiamate = 0;
  const r = creaRisorsa(async () => {
    chiamate += 1;
    return chiamate === 1 ? lenta.promise : veloce.promise;
  }, { iniziale: [] });

  const a = r.carica();
  const b = r.carica();

  veloce.resolve(['recente']);
  await b;
  lenta.resolve(['vecchia']);
  await a;

  assert.deepEqual(r.data.value, ['recente'], 'la risposta sorpassata va scartata');
});

test('un errore sorpassato non sporca una risorsa gia riuscita', async () => {
  const lenta = differita();
  const veloce = differita();
  let chiamate = 0;
  const r = creaRisorsa(async () => {
    chiamate += 1;
    return chiamate === 1 ? lenta.promise : veloce.promise;
  }, { iniziale: [] });

  const a = r.carica();
  const b = r.carica();

  veloce.resolve(['ok']);
  await b;
  lenta.reject(new Error('rete'));
  await a;

  assert.equal(r.error.value, null, 'un fallimento sorpassato non deve comparire');
  assert.equal(r.stato.value, 'pronto');
});

test('vuoto non viene mai restituito quando c e un errore', async () => {
  let deveFallire = false;
  const r = creaRisorsa(async () => {
    if (deveFallire) throw new Error('rete');
    return [];
  }, { iniziale: [] });

  await r.carica();
  assert.equal(r.stato.value, 'vuoto');

  deveFallire = true;
  await r.carica();
  assert.equal(r.stato.value, 'errore-con-dati', 'l errore ha la precedenza sul vuoto');
});

test('vuotoSe personalizzato decide cosa significa vuoto', async () => {
  const r = creaRisorsa(async () => ({ esiste: false }), {
    iniziale: null,
    vuotoSe: (v) => !v || v.esiste === false,
  });
  await r.carica();
  assert.equal(r.stato.value, 'vuoto');
});

test('reset riporta ogni campo al valore iniziale', async () => {
  const r = creaRisorsa(async () => [1], { iniziale: [] });
  await r.carica();
  r.reset();
  assert.deepEqual(r.data.value, []);
  assert.equal(r.error.value, null);
  assert.equal(r.lastUpdated.value, null);
  assert.equal(r.loading.value, false);
  assert.equal(r.stato.value, 'vuoto');
});

test('reset invalida le richieste in volo', async () => {
  const lenta = differita();
  const r = creaRisorsa(async () => lenta.promise, { iniziale: [] });

  const inVolo = r.carica();
  r.reset();
  lenta.resolve(['dati del vecchio utente']);
  await inVolo;

  assert.deepEqual(r.data.value, [], 'dopo il logout nessuna risposta deve ripopolare la risorsa');
});

test('riprova ripete la chiamata con gli stessi argomenti', async () => {
  const visti = [];
  const r = creaRisorsa(async (mese, anno) => {
    visti.push([mese, anno]);
    return { mese, anno };
  }, { iniziale: null });

  await r.carica(9, 2026);
  await r.riprova();

  assert.deepEqual(visti, [[9, 2026], [9, 2026]]);
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
cd client && node --test tests/risorsa.test.js
```

Atteso: FAIL con `ERR_MODULE_NOT_FOUND` — `src/utils/risorsa.js` non esiste ancora.

- [ ] **Step 3: Scrivere l'implementazione**

Crea `client/src/utils/risorsa.js`:

```js
import { ref, computed } from 'vue';

/**
 * Stato di una lettura dall'API.
 *
 * Nasce da un difetto concreto: piu' store azzeravano i dati nel gestore
 * dell'errore (`catch { lista.value = [] }`), e la vista mostrava lo stato
 * vuoto — "Nessun budget per settembre" — al posto di un errore di rete.
 * L'utente leggeva una perdita di dati dove c'era solo una richiesta fallita.
 *
 * Qui la regola non e' una convenzione da ricordare: e' l'unico modo in cui
 * `carica` e' scritta. In caso di fallimento viene scritto SOLO `error`.
 *
 * I dati vivono in memoria e basta: niente localStorage, mai. Un saldo non
 * deve finire su disco (stessa scelta gia' fatta per il payload delle push).
 *
 * @param {Function} fetcher  funzione asincrona che restituisce i dati gia'
 *                            estratti dalla risposta.
 * @param {Object}   opzioni
 * @param {*}        opzioni.iniziale  valore di partenza di `data`.
 * @param {Function} opzioni.vuotoSe   predicato: cosa significa "vuoto" qui.
 */
export const creaRisorsa = (fetcher, { iniziale = null, vuotoSe } = {}) => {
  const data = ref(iniziale);
  const loading = ref(false);
  const error = ref(null);
  const lastUpdated = ref(null);

  // Numero di sequenza: la dashboard lancia otto caricamenti in parallelo e
  // `onSaved` li rilancia tutti insieme. Senza guardia una risposta lenta
  // partita prima sovrascrive una veloce partita dopo, e i saldi tornano
  // indietro nel tempo.
  let sequenza = 0;
  let ultimiArgs = [];

  const vuotoPredefinito = (valore) => {
    if (Array.isArray(valore)) return valore.length === 0;
    return valore === null || valore === undefined;
  };
  const isVuoto = typeof vuotoSe === 'function' ? vuotoSe : vuotoPredefinito;

  /**
   * L'ordine e' vincolante. `caricamento` precede `errore` cosi' un "Riprova"
   * dopo un fallimento senza dati mostra di nuovo lo scheletro, invece di
   * lasciare il pannello d'errore fino alla risposta. Con dati precedenti,
   * invece, `errore-con-dati` sopravvive al tentativo in corso: il dato a
   * schermo e' ancora vecchio finche' non arriva quello nuovo, e dirlo a
   * meta' strada e poi ridirlo sarebbe un lampeggio.
   */
  const stato = computed(() => {
    if (loading.value && lastUpdated.value === null) return 'caricamento';
    if (error.value && lastUpdated.value === null) return 'errore';
    if (error.value) return 'errore-con-dati';
    if (isVuoto(data.value)) return 'vuoto';
    return 'pronto';
  });

  /**
   * Non lancia mai: l'errore e' uno stato, non un'eccezione. Chi chiama non
   * deve incatenare `.catch()` per evitare una rejection non gestita, e chi
   * ha bisogno di sapere com'e' andata guarda `error` oppure il valore di
   * ritorno (i dati, oppure `undefined`).
   */
  const carica = async (...args) => {
    ultimiArgs = args;
    const mia = ++sequenza;
    loading.value = true;
    try {
      const risultato = await fetcher(...args);
      if (mia !== sequenza) return undefined;
      data.value = risultato;
      lastUpdated.value = Date.now();
      // Solo un successo cancella l'errore precedente.
      error.value = null;
      return risultato;
    } catch (e) {
      if (mia !== sequenza) return undefined;
      // INVARIANTE: `data` e `lastUpdated` non vengono toccati.
      error.value = e;
      return undefined;
    } finally {
      if (mia === sequenza) loading.value = false;
    }
  };

  const riprova = () => carica(...ultimiArgs);

  /**
   * L'incremento di `sequenza` non e' un dettaglio: invalida le richieste in
   * volo, cosi' una risposta che arriva dopo il logout non puo' ripopolare la
   * risorsa con i dati dell'utente precedente.
   */
  const reset = () => {
    sequenza += 1;
    data.value = iniziale;
    loading.value = false;
    error.value = null;
    lastUpdated.value = null;
    ultimiArgs = [];
  };

  return { data, loading, error, lastUpdated, stato, carica, riprova, reset };
};
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

```bash
cd client && node --test tests/risorsa.test.js
```

Atteso: PASS, 14 test verdi.

- [ ] **Step 5: Verificare che la suite completa non sia peggiorata**

```bash
cd client && npm test
```

Atteso: 79 test verdi (65 di baseline + 14 nuovi), 0 falliti.

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/risorsa.js client/tests/risorsa.test.js
git commit -m "Aggiunge creaRisorsa, lo stato di una lettura dall'API

Un fallimento non puo' piu' azzerare i dati gia' ottenuti: e' una
proprieta' della funzione, non una convenzione. Include la guardia di
sequenza contro le risposte sorpassate, gia' possibile oggi sulla
dashboard, e l'invalidazione delle richieste in volo al reset, perche'
una risposta in ritardo non ripopoli la risorsa dopo il logout."
```

> **Nota per chi esegue:** il codice del Task 1 è stato eseguito in fase di
> pianificazione: 14 test verdi, suite complessiva a 79. Se il tuo risultato
> è diverso, hai deviato dal piano — rileggi prima di proseguire.

---

### Task 2: Il componente `DataState`

Presentazione pura. Riceve uno stato, sceglie uno slot, non decide nulla. È la ragione per cui `risorsa.js` può restare l'unico file testato: qui non c'è logica da sbagliare.

**Files:**
- Create: `client/src/components/common/DataState.vue`

**Interfaces:**
- Consumes: il vocabolario di `stato` prodotto dal Task 1 (`'caricamento'|'errore'|'errore-con-dati'|'vuoto'|'pronto'`).
- Produces: componente con proprietà `stato` (String, obbligatoria), `lastUpdated` (Number|null), `messaggioErrore` (String), `skeletonType` (String, default `'text'`), `skeletonLines` (Number, default `3`); slot `default` e `vuoto`; evento `riprova`.

- [ ] **Step 1: Creare il componente**

Crea `client/src/components/common/DataState.vue`:

```vue
<script setup>
import { computed } from 'vue';
import dayjs from 'dayjs';
import 'dayjs/locale/it';
import WSkeleton from '@/components/common/WSkeleton.vue';
import { AlertTriangle, AlertCircle, RefreshCw } from '@/utils/appIcons';

dayjs.locale('it');

/**
 * Traduce lo stato di una risorsa (utils/risorsa.js) in cio' che si vede.
 *
 * Il caso che questo componente esiste per risolvere e' `errore-con-dati`:
 * la richiesta e' fallita ma i dati precedenti sono ancora a schermo. Prima
 * quel caso non esisteva — un errore svuotava la pagina e l'utente credeva
 * di aver perso i propri dati.
 */
const props = defineProps({
  stato: { type: String, required: true },
  /** Istante dell'ultima risposta riuscita. Mai aggiornato da un fallimento. */
  lastUpdated: { type: Number, default: null },
  messaggioErrore: { type: String, default: 'Non è stato possibile caricare i dati.' },
  skeletonType: { type: String, default: 'text' },
  skeletonLines: { type: Number, default: 3 },
});

const emit = defineEmits(['riprova']);

/**
 * Orario assoluto e non relativo: "3 minuti fa" richiederebbe un timer per
 * restare vero, e invecchierebbe in silenzio appena la scheda perde il fuoco.
 */
const orarioAggiornamento = computed(() => {
  if (!props.lastUpdated) return '';
  const quando = dayjs(props.lastUpdated);
  return quando.isSame(dayjs(), 'day')
    ? `alle ${quando.format('HH:mm')}`
    : `il ${quando.format('D MMM')} alle ${quando.format('HH:mm')}`;
});
</script>

<template>
  <div class="data-state">
    <WSkeleton
      v-if="stato === 'caricamento'"
      :type="skeletonType"
      :lines="skeletonLines"
    />

    <div v-else-if="stato === 'errore'" class="data-state__errore" role="alert">
      <AlertTriangle
        class="data-state__errore-icona"
        :size="26"
        :stroke-width="1.75"
        aria-hidden="true"
      />
      <p class="data-state__errore-titolo">{{ messaggioErrore }}</p>
      <p class="data-state__errore-testo">
        Controlla la connessione e riprova. I tuoi dati non sono stati persi.
      </p>
      <button type="button" class="data-state__riprova" @click="emit('riprova')">
        <RefreshCw :size="15" :stroke-width="1.75" aria-hidden="true" />
        Riprova
      </button>
    </div>

    <slot v-else-if="stato === 'vuoto'" name="vuoto" />

    <template v-else>
      <div v-if="stato === 'errore-con-dati'" class="data-state__avviso" role="status">
        <AlertCircle
          class="data-state__avviso-icona"
          :size="16"
          :stroke-width="1.75"
          aria-hidden="true"
        />
        <div class="data-state__avviso-testo">
          <p class="data-state__avviso-titolo">Dati non aggiornati</p>
          <p class="data-state__avviso-dettaglio">
            Non è stato possibile aggiornare i dati. Stai visualizzando l'ultimo
            aggiornamento disponibile<template v-if="orarioAggiornamento">, {{ orarioAggiornamento }}</template>.
          </p>
        </div>
        <button
          type="button"
          class="data-state__riprova data-state__riprova--inline"
          @click="emit('riprova')"
        >
          <RefreshCw :size="14" :stroke-width="1.75" aria-hidden="true" />
          Riprova
        </button>
      </div>
      <slot />
    </template>
  </div>
</template>

<style scoped>
/* --- Errore senza dati precedenti: occupa il posto dei dati --------------- */
.data-state__errore {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
  padding: 2rem 1.25rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-lg);
}

.data-state__errore-icona { color: var(--warning); }

.data-state__errore-titolo {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
}

.data-state__errore-testo {
  margin: 0;
  max-width: 28rem;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

/* --- Errore con dati precedenti: avviso sopra i dati, non al loro posto --- */
.data-state__avviso {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  margin-bottom: 0.75rem;
  padding: 0.625rem 0.75rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-left: 3px solid var(--warning);
  border-radius: var(--radius-md);
}

/* L'icona accompagna il testo: il significato non deve mai dipendere dal
   solo colore (regola ripresa poi dal blocco 5). */
.data-state__avviso-icona {
  flex-shrink: 0;
  margin-top: 0.0625rem;
  color: var(--warning);
}

.data-state__avviso-testo { flex: 1; min-width: 0; }

.data-state__avviso-titolo {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}

.data-state__avviso-dettaglio {
  margin: 0.125rem 0 0;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

/* --- Riprova ------------------------------------------------------------- */
.data-state__riprova {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  /* 44px di area toccabile su mobile, come richiede il blocco 5. */
  min-height: 44px;
  padding: 0.5rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--glass-interactive-bg);
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.data-state__riprova:hover { background: var(--glass-interactive-bg-hover); }

.data-state__riprova:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.data-state__riprova--inline {
  flex-shrink: 0;
  min-height: 36px;
  padding: 0.375rem 0.6875rem;
  font-size: 0.8125rem;
}

@media (max-width: 480px) {
  .data-state__avviso { flex-wrap: wrap; }
  .data-state__riprova--inline { margin-left: 1.625rem; }
}
</style>
```

- [ ] **Step 2: Verificare che il progetto compili**

```bash
cd client && npm run build
```

Atteso: build completata senza errori. Non esiste test di componenti in questo progetto (vedi Global Constraints): la compilazione è la verifica disponibile a questo stadio, e il comportamento verrà controllato a schermo nel Task 9.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/common/DataState.vue
git commit -m "Aggiunge DataState, la presentazione dello stato di una lettura

Traduce lo stato di una risorsa in cio' che si vede. Il caso per cui
esiste e' 'errore-con-dati': la richiesta e' fallita ma i dati
precedenti restano a schermo, con un avviso sopra invece del vuoto.
L'avviso e' role=status, il pannello d'errore role=alert, e ogni
segnale porta icona e testo, mai il solo colore."
```

---

### Task 3: Il glossario e l'argomento di aiuto

Indipendente dai Task 1 e 2: può essere eseguito in parallelo.

**Files:**
- Create: `client/src/content/glossario.js`
- Create: `client/tests/glossario.test.js`
- Modify: `client/src/content/helpTopics.js` (nuovo argomento + inserimento in sezione)

**Interfaces:**
- Consumes: `getHelpTopic` da `client/src/content/helpTopics.js`.
- Produces: `GLOSSARIO` (mappa id → concetto), `GLOSSARIO_LIST` (array), `getConcetto(id)`, `etichetta(id)`. Gli id sono `patrimonio_totale`, `componente_conti`, `componente_investimenti`, `risultato_mese`. Nuovo argomento di aiuto con id `patrimonio-come-si-calcola`.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `client/tests/glossario.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARIO, GLOSSARIO_LIST, getConcetto, etichetta } from '../src/content/glossario.js';
import { getHelpTopic } from '../src/content/helpTopics.js';

test('gli id dei concetti sono unici e coerenti con la mappa', () => {
  const ids = GLOSSARIO_LIST.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.equal(GLOSSARIO[id].id, id));
});

test('ogni concetto ha etichetta e descrizione non vuote', () => {
  GLOSSARIO_LIST.forEach((c) => {
    assert.ok(c.etichetta && c.etichetta.trim().length > 0, `etichetta mancante: ${c.id}`);
    assert.ok(c.descrizione && c.descrizione.trim().length > 0, `descrizione mancante: ${c.id}`);
  });
});

test('i quattro concetti della specifica esistono con le etichette decise', () => {
  assert.equal(etichetta('patrimonio_totale'), 'Patrimonio totale');
  assert.equal(etichetta('componente_conti'), 'Conti');
  assert.equal(etichetta('componente_investimenti'), 'Investimenti');
  assert.equal(etichetta('risultato_mese'), 'Risultato del mese');
});

test('nessun concetto usa "Disponibilita totale", riservato al blocco 6C', () => {
  GLOSSARIO_LIST.forEach((c) => {
    assert.ok(
      !/disponibilit/i.test(c.etichetta),
      `il calcolo comprende scommesse e risparmio: "${c.etichetta}" prometterebbe il falso`,
    );
  });
});

test('gli argomenti di aiuto referenziati dal glossario esistono', () => {
  GLOSSARIO_LIST.forEach((c) => {
    if (!c.topic) return;
    assert.ok(getHelpTopic(c.topic), `argomento mancante: ${c.topic} (concetto ${c.id})`);
  });
});

test('getConcetto restituisce null per un id sconosciuto', () => {
  assert.equal(getConcetto('non_esiste'), null);
  assert.equal(getConcetto(undefined), null);
  assert.equal(etichetta('non_esiste'), '');
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
cd client && node --test tests/glossario.test.js
```

Atteso: FAIL con `ERR_MODULE_NOT_FOUND` — `src/content/glossario.js` non esiste.

- [ ] **Step 3: Creare il glossario**

Crea `client/src/content/glossario.js`:

```js
/**
 * Glossario dei concetti finanziari mostrati all'utente.
 *
 * Nasce da un difetto concreto: lo stesso numero aveva tre nomi diversi.
 * "Saldo del conto" nella dashboard, "Patrimonio totale" nella pagina Conti
 * e "Patrimonio Totale" in un componente non usato — tutti e tre erano conti
 * piu' investimenti. Chi confrontava due pagine trovava definizioni in
 * conflitto e non poteva sapere quale credere.
 *
 * Da qui in avanti l'etichetta si legge, non si scrive in linea. Aggiungere
 * un concetto significa aggiungerlo qui.
 *
 * Solo testo: nessun calcolo, nessuna dipendenza da API, nessun dato
 * finanziario. Il file deve restare leggibile anche a utente disconnesso.
 */

const CONCETTI = [
  {
    id: 'patrimonio_totale',
    etichetta: 'Patrimonio totale',
    descrizione:
      'Tutto quello che hai registrato in WALLT: i saldi dei conti attivi piu\' il valore attuale degli investimenti.',
    formula: 'conti attivi + investimenti attivi',
    origine: 'GET /conti/patrimonio → totale',
    topic: 'patrimonio-come-si-calcola',
  },
  {
    id: 'componente_conti',
    etichetta: 'Conti',
    descrizione:
      'La somma dei saldi di tutti i tuoi conti attivi, comprese le piattaforme di scommesse e i conti di risparmio.',
    formula: 'somma dei saldi dei conti attivi',
    origine: 'GET /conti/patrimonio → totale_conti',
  },
  {
    id: 'componente_investimenti',
    etichetta: 'Investimenti',
    descrizione: 'Il valore attuale dei tuoi investimenti attivi.',
    formula: 'somma del valore attuale degli investimenti attivi',
    origine: 'GET /conti/patrimonio → totale_investimenti',
  },
  {
    id: 'risultato_mese',
    etichetta: 'Risultato del mese',
    descrizione:
      'Quanto e\' entrato meno quanto e\' uscito nel mese. Gli spostamenti fra due tuoi conti non contano ne\' come entrata ne\' come uscita.',
    formula: 'entrate − uscite, trasferimenti esclusi',
    origine: 'GET /movimenti/bilancio → saldo',
  },
];

/** Mappa id → concetto, per accessi diretti. */
export const GLOSSARIO = CONCETTI.reduce((acc, concetto) => {
  acc[concetto.id] = concetto;
  return acc;
}, {});

/** Elenco ordinato di tutti i concetti. */
export const GLOSSARIO_LIST = CONCETTI;

/** Concetto per id, o null se l'id non esiste. */
export const getConcetto = (id) => (id && GLOSSARIO[id]) || null;

/** Etichetta da mostrare, o stringa vuota se l'id non esiste. */
export const etichetta = (id) => getConcetto(id)?.etichetta || '';
```

- [ ] **Step 4: Aggiungere l'argomento di aiuto**

In `client/src/content/helpTopics.js`, inserisci questo argomento nell'array `TOPICS`, subito dopo quello con id `dashboard-riepilogo`:

```js
  {
    id: 'patrimonio-come-si-calcola',
    title: 'Come si calcola il patrimonio',
    summary: 'Patrimonio totale = saldi dei conti attivi + valore attuale degli investimenti.',
    paragraphs: [
      'Il "Patrimonio totale" della home somma due cose: i saldi di tutti i tuoi conti attivi e il valore attuale dei tuoi investimenti. Sotto la cifra trovi la composizione, cosi\' vedi sempre quanta parte e\' su conti e quanta e\' investita.',
      'Dentro "Conti" c\'e\' ogni conto che hai registrato come attivo: conto corrente, contanti, wallet, risparmio e anche le piattaforme di scommesse. Non e\' quindi la cifra che puoi spendere domani, ma tutto il denaro che tieni tracciato in WALLT.',
      'I trasferimenti fra due tuoi conti non cambiano il patrimonio: spostano denaro da una tasca all\'altra, quindi non sono ne\' entrate ne\' uscite e non compaiono nel risultato del mese.',
    ],
    bullets: [
      'Un conto eliminato non entra piu\' nel totale: i suoi movimenti restano pero\' nello storico.',
      'Il "Risultato del mese" e\' entrate meno uscite, senza i trasferimenti.',
    ],
    related: ['trasferimenti', 'dashboard-riepilogo'],
  },
```

Poi, sempre in `helpTopics.js`, aggiungi l'id alla sezione `strumenti` di `HELP_SECTIONS`, in prima posizione:

```js
    topics: ['patrimonio-come-si-calcola', 'dashboard-riepilogo', 'budget-come-funziona', 'obiettivi-contributi', 'analisi-come-funziona'],
```

- [ ] **Step 5: Eseguire i test e verificare che passino**

```bash
cd client && npm test
```

Atteso: i 6 test di `glossario.test.js` verdi, e `helpTopics.test.js` ancora verde — quest'ultimo verifica già che ogni argomento citato da una sezione esista e che i `related` puntino ad argomenti reali, quindi copre da solo l'inserimento appena fatto.

- [ ] **Step 6: Commit**

```bash
git add client/src/content/glossario.js client/tests/glossario.test.js client/src/content/helpTopics.js
git commit -m "Aggiunge il glossario delle etichette finanziarie

Lo stesso numero aveva tre nomi diversi in tre pagine: 'Saldo del
conto', 'Patrimonio totale' e 'Patrimonio Totale' erano tutti conti
piu' investimenti. Da qui in avanti l'etichetta si legge da un posto
solo. Aggiunge anche l'argomento di aiuto che spiega la formula e
chiarisce che i trasferimenti fra conti non sono entrate ne' uscite.

La prima voce si chiama 'Conti' e non 'Disponibilita' totale': il
calcolo comprende scommesse e risparmio, quindi 'immediatamente
spendibile' sarebbe falso. Un test impedisce di reintrodurre quel nome."
```

> **Nota per chi esegue:** anche il codice del Task 3 è stato eseguito in fase
> di pianificazione: 6 test nuovi verdi, e i 7 test esistenti di
> `helpTopics.test.js` restano verdi con il nuovo argomento innestato.

---

### Task 4: `conti.store` e la composizione del patrimonio

Prima fetta verticale: risorsa, componente e glossario usati insieme su una schermata vera. È il task che dimostra che i tre pezzi precedenti combaciano.

**Files:**
- Modify: `client/src/stores/conti.store.js`
- Modify: `client/src/components/custom/WOverviewCarousel.vue:217-249`
- Modify: `client/src/views/ContiView.vue:164`

**Interfaces:**
- Consumes: `creaRisorsa` (Task 1), `DataState` (Task 2), `etichetta` e il topic `patrimonio-come-si-calcola` (Task 3).
- Produces: `contiStore.risorsaConti` e `contiStore.risorsaPatrimonio` (oggetti risorsa); `contiStore.composizionePatrimonio` → `ComputedRef<{ totale: Number, conti: Number, investimenti: Number }>`. Le proprietà pubbliche esistenti (`conti`, `patrimonioTotale`, `contiAttivi`, `loading`, `fetchConti`, `fetchPatrimonio`) **restano invariate nel nome e nel significato**, così le viste non ancora migrate continuano a funzionare.

- [ ] **Step 1: Migrare lo store**

In `client/src/stores/conti.store.js`, sostituisci i `ref` di lettura e le due `fetch` con due risorse, mantenendo l'interfaccia pubblica. Il file diventa:

```js
import { defineStore } from 'pinia';
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/utils/axios';
import { refreshAfterWrite } from '@/utils/afterWrite';
import { creaRisorsa } from '@/utils/risorsa';

export const useContiStore = defineStore('conti', () => {
  const authStore = useAuthStore();

  const risorsaConti = creaRisorsa(
    async () => {
      const { data } = await api.get('/conti');
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.conti || []).length === 0 },
  );

  const risorsaPatrimonio = creaRisorsa(
    async () => {
      const { data } = await api.get('/conti/patrimonio');
      return data;
    },
    { iniziale: null },
  );

  // --- Interfaccia pubblica invariata -------------------------------------
  // Le viste non ancora migrate continuano a leggere questi nomi.
  const conti = computed(() => risorsaConti.data.value?.conti || []);
  const loading = computed(() => risorsaConti.loading.value);

  /**
   * Il patrimonio arriva da due endpoint che usano la stessa identica
   * formula (conti attivi + investimenti attivi). Vince quello dedicato
   * quando c'e', perche' porta anche la scomposizione.
   */
  const patrimonioTotale = computed(() => (
    risorsaPatrimonio.data.value?.totale
    ?? risorsaConti.data.value?.patrimonio_totale
    ?? 0
  ));
  const variazioneImporto = computed(() => risorsaPatrimonio.data.value?.variazione_importo || 0);
  const variazionePercentuale = computed(() => risorsaPatrimonio.data.value?.variazione_percentuale || 0);

  const contiAttivi = computed(() => conti.value.filter((c) => c.attivo));

  const patrimonioFormattato = computed(() => {
    const valuta = authStore.user?.valuta || 'EUR';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: valuta }).format(patrimonioTotale.value || 0);
  });

  /**
   * Le tre voci mostrate sotto il totale. Il server le manda gia' entrambe
   * (`totale_conti`, `totale_investimenti`): prima venivano scartate, ed e'
   * il motivo per cui la scheda poteva solo dire un numero senza spiegarlo.
   */
  const composizionePatrimonio = computed(() => ({
    totale: patrimonioTotale.value,
    conti: risorsaPatrimonio.data.value?.totale_conti ?? 0,
    investimenti: risorsaPatrimonio.data.value?.totale_investimenti ?? 0,
  }));

  const fetchConti = () => risorsaConti.carica();
  const fetchPatrimonio = () => risorsaPatrimonio.carica();

  /** Ricariche post-scrittura: non devono far fallire un'operazione già riuscita. */
  const refreshDopoScrittura = (tipo) => refreshAfterWrite(
    () => fetchConti(),
    () => fetchPatrimonio(),
    ...(tipo === 'scommesse' || tipo === true
      ? [async () => {
        const { useScommesseStore } = await import('./scommesse.store');
        return useScommesseStore().fetchPiattaforme();
      }]
      : []),
  );

  const createConto = async (dati) => {
    const { data } = await api.post('/conti', dati);
    await refreshDopoScrittura(dati.tipo);
    return data;
  };

  const updateConto = async (id, dati, options = {}) => {
    const { data } = await api.put(`/conti/${id}`, dati);
    await refreshDopoScrittura(options.tipo);
    return data.conto;
  };

  const deleteConto = async (id, options = {}) => {
    await api.delete(`/conti/${id}`);
    await refreshDopoScrittura(options.tipo);
  };

  const trasferimento = async (dati, options = {}) => {
    try {
      const { data } = await api.post('/conti/trasferimento', dati);
      await refreshDopoScrittura(options.involvesScommesse === true);
      return data;
    } catch (err) {
      const data = err.response?.data;
      if (data?.error === 'Saldo insufficiente') {
        const saldo = parseFloat(data.saldo_disponibile || 0).toFixed(2);
        const error = new Error(`Saldo insufficiente: disponibili €${saldo}`);
        error.response = err.response;
        throw error;
      }
      throw err;
    }
  };

  const reset = () => {
    risorsaConti.reset();
    risorsaPatrimonio.reset();
  };

  return {
    risorsaConti,
    risorsaPatrimonio,
    conti,
    patrimonioTotale,
    variazioneImporto,
    variazionePercentuale,
    loading,
    contiAttivi,
    patrimonioFormattato,
    composizionePatrimonio,
    fetchConti,
    fetchPatrimonio,
    createConto,
    updateConto,
    deleteConto,
    trasferimento,
    reset,
  };
});
```

**Attenzione — due punti da non sbagliare:**

1. `refreshAfterWrite` riceve funzioni che **non lanciano più** (`carica` restituisce `undefined` in caso di errore). Il suo valore di ritorno booleano diventa quindi sempre `true`. È accettabile e va lasciato così in questo task: il messaggio `VISTA_NON_AGGIORNATA` diventa ridondante perché ora è `DataState` a segnalare che i dati sono vecchi, in modo più preciso e nel punto giusto. Non rimuovere `afterWrite`: è ancora usato da `movimenti`, `import` e altre scritture non migrate.
2. `conti` e `loading` sono ora `computed`, non più `ref` scrivibili. `client/src/utils/session.js:36-42` assegna direttamente `contiStore.conti = []` e fallirebbe. **Il Task 10 sistema `session.js`**; fino ad allora la riga va neutralizzata subito, in questo stesso task, sostituendo quel blocco con:

```js
  try { useContiStore().reset(); } catch { /* ignore */ }
```

- [ ] **Step 2: Verificare che l'app compili e che i test non siano peggiorati**

```bash
cd client && npm run build && npm test
```

Atteso: build completata, 79 test verdi.

- [ ] **Step 3: Mostrare la composizione nella scheda principale**

In `client/src/components/custom/WOverviewCarousel.vue`, aggiungi agli import dello `<script setup>`:

```js
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import { etichetta } from '@/content/glossario';
```

Aggiungi la proprietà per la composizione accanto alle altre `defineProps`:

```js
  composizione: { type: Object, default: () => ({ conti: 0, investimenti: 0 }) },
```

Poi sostituisci il blocco della prima scheda (righe 217-249, quello che comincia con `<!-- Saldo del conto -->`) con:

```vue
        <!-- Patrimonio totale -->
        <div v-if="slides.includes('saldo')" class="w-overview__slide w-full shrink-0 snap-center">
          <template v-if="loadingSaldo">
            <WSkeleton type="text" :lines="3" />
            <WSkeleton type="card" class="mt-3" />
          </template>
          <template v-else>
            <p class="w-overview__eyebrow">
              {{ etichetta('patrimonio_totale') }}
              <HelpTrigger topic="patrimonio-come-si-calcola" variant="quiet" />
            </p>
            <p class="w-overview__amount tabular-nums">{{ formatValuta(animatedPatrimonio) }}</p>
            <p class="w-overview__composizione">
              {{ etichetta('componente_conti') }} <span class="tabular-nums">{{ formatValuta(composizione.conti) }}</span>
              ·
              {{ etichetta('componente_investimenti') }} <span class="tabular-nums">{{ formatValuta(composizione.investimenti) }}</span>
            </p>
            <p class="w-overview__variation" :class="trendPositive ? 'is-positive' : 'is-negative'">
              {{ formatVariazione(variazionePercentuale) }} questo mese
            </p>
            <svg class="w-overview__sparkline" viewBox="0 0 100 32" fill="none" aria-hidden="true">
              <path
                :d="sparklinePath"
                stroke="var(--accent-green)"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <div class="w-overview__split">
              <div class="w-overview__split-item">
                <span class="w-overview__split-label">Entrate mese</span>
                <span class="w-overview__split-val is-positive tabular-nums">{{ formatValuta(entrateMese) }}</span>
              </div>
              <div class="w-overview__split-divider" />
              <div class="w-overview__split-item">
                <span class="w-overview__split-label">Uscite mese</span>
                <span class="w-overview__split-val is-negative tabular-nums">{{ formatValuta(usciteMese) }}</span>
              </div>
            </div>
          </template>
        </div>
```

Aggiungi in fondo al blocco `<style scoped>` **solo** la regola nuova.
`.w-overview__eyebrow` esiste già alla riga 536 ed è già `inline-flex` con
`align-items: center`: non ridichiararla, creeresti un selettore duplicato
che vince sul primo e ne cambia il `gap`.

```css
/* La composizione spiega il totale invece di lasciarlo da interpretare:
   quanta parte e' sui conti e quanta e' investita. */
.w-overview__composizione {
  margin-top: 0.25rem;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}
```

**Togli il maiuscolo dalle etichette del carosello.** Nella regola
`.w-overview__eyebrow` esistente (riga 536) elimina la riga
`text-transform: uppercase;` e porta `font-size` da `0.75rem` a `0.8125rem`.

Perché qui e non nel blocco 5, che è fuori perimetro: la proposta cita
**questa** etichetta come esempio ("«Saldo del conto» è più naturale e
leggibile di «SALDO DEL CONTO»"). Stiamo riscrivendo proprio quella riga:
lasciarla così pubblicherebbe "PATRIMONIO TOTALE", cioè esattamente il
difetto segnalato, per poi correggerlo in un'iterazione successiva. La
regola è condivisa dalle altre schede del carosello ("I miei conti",
"Budget", …), che perdono anch'esse il maiuscolo: è l'effetto voluto.

L'audit completo di contrasto e dimensioni resta al blocco 5. Questo è solo
il caso che il task tocca comunque con le proprie mani.

- [ ] **Step 4: Passare la composizione dalla dashboard**

In `client/src/views/DashboardView.vue`, aggiungi al `<WOverviewCarousel>` la proprietà, subito dopo `:patrimonio="contiStore.patrimonioTotale"`:

```vue
      :composizione="contiStore.composizionePatrimonio"
```

- [ ] **Step 5: Allineare l'etichetta della pagina Conti**

In `client/src/views/ContiView.vue`, aggiungi allo `<script setup>`:

```js
import { etichetta } from '@/content/glossario';
```

e sostituisci la riga 164 con:

```vue
        <p class="page-sub">{{ etichetta('patrimonio_totale') }}: {{ formatValuta(contiStore.patrimonioTotale) }}</p>
```

- [ ] **Step 5b: Distinguere "nessun conto" da "conti non caricabili"**

`ContiView` ha lo stesso difetto di `BudgetView`, ed è altrettanto grave:
la riga 174 è `v-if="contiStore.loading"`, la 178 `v-else-if="contiVisibili.length"`
e la 197 un `v-else` che mostra **"Aggiungi il tuo primo conto"**. Se `/conti`
fallisce, `loading` è falso e la lista è vuota: all'utente che ha dei conti
viene detto di crearne il primo.

Importa `DataState` nella vista e sostituisci quella catena a tre rami con:

```vue
    <DataState
      :stato="contiStore.risorsaConti.stato.value"
      :last-updated="contiStore.risorsaConti.lastUpdated.value"
      messaggio-errore="Non è stato possibile caricare i tuoi conti."
      skeleton-type="card"
      @riprova="contiStore.risorsaConti.riprova()"
    >
      <template #vuoto>
        <!-- il WCard.empty-state esistente (righe 197-205), copiato senza
             modifiche al testo -->
      </template>

      <div v-if="contiVisibili.length" class="grid-conti">
        <!-- il contenuto attuale del ramo v-else-if, invariato -->
      </div>
    </DataState>
```

Il `v-if="contiVisibili.length"` interno resta perché `contiVisibili` è una
lista filtrata: la risorsa può essere `pronto` mentre il filtro corrente non
mostra nulla. Sono due vuoti diversi e non vanno confusi — lo stesso motivo
per cui in `MovimentiView` esiste `haMovimentiTotali`.

- [ ] **Step 6: Verificare a schermo**

```bash
cd client && npm run dev
```

Con l'app aperta sulla dashboard, controlla che:
1. la prima scheda dica **"Patrimonio totale"** e non più "Saldo del conto";
2. sotto la cifra compaia `Conti X € · Investimenti Y €`, e che `X + Y` sia **esattamente** uguale al totale mostrato sopra;
3. l'icona ⓘ accanto al titolo apra il pannello con l'argomento "Come si calcola il patrimonio";
4. la pagina "I miei conti" mostri lo stesso identico numero della dashboard;
5. bloccando `**/conti**` nel DevTools e ricaricando, "I miei conti" mostri il
   pannello d'errore e **non** "Aggiungi il tuo primo conto".

Il punto 2 è il controllo che conta: se i due addendi non fanno il totale, la scomposizione sta leggendo campi sbagliati.

- [ ] **Step 7: Commit**

```bash
git add client/src/stores/conti.store.js client/src/components/custom/WOverviewCarousel.vue client/src/views/DashboardView.vue client/src/views/ContiView.vue client/src/utils/session.js
git commit -m "Mostra il patrimonio con la sua composizione, e non piu' come 'saldo'

La scheda principale diceva 'Saldo del conto' per un numero che e'
conti piu' investimenti: sembrava riferito a un conto solo. Ora dice
'Patrimonio totale' e sotto mostra da cosa e' composto.

Il server mandava gia' totale_conti e totale_investimenti, e il client
li scartava: nessun calcolo nuovo, nessuna modifica all'API. conti.store
passa a creaRisorsa mantenendo invariata l'interfaccia pubblica, cosi'
le viste non ancora migrate continuano a funzionare."
```

---

### Task 5: `budget.store` e `BudgetView` — il difetto originale

Questo è il caso che ha fatto nascere l'intero sotto-progetto: un errore di rete che diceva all'utente "Nessun budget per settembre".

**Files:**
- Modify: `client/src/stores/budget.store.js`
- Modify: `client/src/views/BudgetView.vue:149-160`

**Interfaces:**
- Consumes: `creaRisorsa` (Task 1), `DataState` (Task 2).
- Produces: `budgetStore.risorsaBudget` e `budgetStore.risorsaStato`. Restano invariate: `budgetCorrente`, `statoBudget`, `budgetSuggerito`, `esiste`, `hasBudget`, `categorieInAlert`, `totaleSpeso`, `loading`, `fetchBudget`, `fetchStatoBudget`, `createBudget`, `updateBudget`.

- [ ] **Step 1: Migrare lo store**

In `client/src/stores/budget.store.js`, sostituisci le due funzioni di lettura. La parte da cambiare:

```js
import { defineStore } from 'pinia';
import { computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

export const useBudgetStore = defineStore('budget', () => {
  const risorsaBudget = creaRisorsa(
    async (mese, anno) => {
      const { data } = await api.get(`/budget/${anno}/${mese}`);
      return data;
    },
    // "Vuoto" qui significa: il server ha risposto e il budget non c'e'.
    // Non significa "la richiesta e' fallita" — quella e' un'altra cosa,
    // ed e' precisamente la confusione che questo task elimina.
    { iniziale: null, vuotoSe: (d) => !d || d.esiste === false },
  );

  const risorsaStato = creaRisorsa(
    async (mese, anno) => {
      const { data } = await api.get(`/budget/${anno}/${mese}/stato`);
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.stato || []).length === 0 },
  );

  const budgetCorrente = computed(() => (
    risorsaBudget.data.value?.esiste
      ? risorsaBudget.data.value.budget
      : (risorsaStato.data.value?.budget || null)
  ));
  const budgetSuggerito = computed(() => (
    risorsaBudget.data.value?.esiste ? null : (risorsaBudget.data.value?.suggerito || null)
  ));
  // INVARIANTE: su errore resta l'ultimo stato valido, non un array vuoto.
  const statoBudget = computed(() => risorsaStato.data.value?.stato || []);
  const esiste = computed(() => risorsaBudget.data.value?.esiste === true);
  const loading = computed(() => risorsaBudget.loading.value);

  const hasBudget = computed(() => esiste.value && !!budgetCorrente.value);
  const categorieInAlert = computed(() => statoBudget.value.filter((c) => c.stato === 'superato'));
  const totaleSpeso = computed(() =>
    statoBudget.value.reduce((s, c) => s + (parseFloat(c.speso) || 0), 0)
  );

  const fetchBudget = (mese, anno) => risorsaBudget.carica(mese, anno);
  const fetchStatoBudget = (mese, anno) => risorsaStato.carica(mese, anno);

  const reset = () => {
    risorsaBudget.reset();
    risorsaStato.reset();
  };
```

Le funzioni di scrittura (`createBudget`, `updateBudget`, ed eventuali altre presenti nel file) **restano identiche**, con una sola modifica: dove assegnavano `budgetCorrente.value = data.budget` non possono più farlo, perché ora è un `computed`. Sostituisci quelle assegnazioni con una ricarica:

```js
  const createBudget = async (dati) => {
    const { data } = await api.post('/budget', dati);
    await fetchBudget(dati.mese, dati.anno);
    return data.budget;
  };

  const updateBudget = async (id, dati) => {
    const { data } = await api.put(`/budget/${id}`, dati);
    await fetchBudget(dati.mese ?? data.budget?.mese, dati.anno ?? data.budget?.anno);
    return data.budget;
  };
```

Ricordati di aggiungere `risorsaBudget`, `risorsaStato` e `reset` all'oggetto restituito dallo store.

- [ ] **Step 2: Correggere la vista**

In `client/src/views/BudgetView.vue`, aggiungi agli import:

```js
import DataState from '@/components/common/DataState.vue';
```

Sostituisci la condizione della riga 150, che oggi è:

```vue
    <div v-if="!budgetStore.hasBudget && modalita === 'view' && !budgetStore.loading" class="empty-budget">
```

con una struttura che distingue vuoto ed errore. Il blocco "STATO A" diventa:

```vue
    <!-- STATO A: nessun budget, oppure impossibile saperlo -->
    <DataState
      v-if="modalita === 'view' && !budgetStore.hasBudget"
      :stato="budgetStore.risorsaBudget.stato.value"
      :last-updated="budgetStore.risorsaBudget.lastUpdated.value"
      messaggio-errore="Non è stato possibile caricare il budget."
      skeleton-type="text"
      :skeleton-lines="4"
      @riprova="budgetStore.risorsaBudget.riprova()"
    >
      <template #vuoto>
        <div class="empty-budget">
          <PieChart class="empty-icon" :size="48" :stroke-width="1.5" />
          <h2>Nessun budget per {{ meseLabel }}</h2>
          <p class="empty-desc">
            <!-- lasciare invariato il testo già presente nel file -->
          </p>
          <div class="empty-help"><HelpTrigger topic="budget-come-funziona" /></div>
        </div>
      </template>
    </DataState>
```

**Importante:** copia il contenuto dell'attuale `div.empty-budget` dentro lo slot `#vuoto` **senza riscriverlo**. Lo stato vuoto esistente va bene: sta solo cambiando il posto in cui viene mostrato, non il suo testo.

- [ ] **Step 3: Verificare che il difetto sia chiuso**

Avvia il client e simula il fallimento della sola richiesta del budget. Nel DevTools, scheda Network, usa il blocco richieste su `**/budget/**`, poi ricarica la pagina Budget.

Atteso: **non** compare "Nessun budget per settembre". Compare il pannello d'errore con "Riprova". Premendo "Riprova" dopo aver tolto il blocco, la pagina si popola.

Ripeti caricando prima la pagina con la rete attiva e bloccando **dopo**: premi "Riprova" e verifica che i dati restino a schermo con l'avviso "Dati non aggiornati" sopra, invece di sparire.

- [ ] **Step 4: Verificare build e test**

```bash
cd client && npm run build && npm test
```

Atteso: build completata, 79 test verdi.

- [ ] **Step 5: Commit**

```bash
git add client/src/stores/budget.store.js client/src/views/BudgetView.vue
git commit -m "Distingue 'budget assente' da 'budget non caricabile'

Era il difetto che ha fatto nascere questo lavoro: budget.store
azzerava lo stato nel catch e BudgetView mostrava 'Nessun budget per
<mese>' ogni volta che la richiesta falliva. All'utente veniva
comunicata l'assenza di un dato che invece esisteva.

Lo stato vuoto non e' stato riscritto: e' stato spostato nello slot
dove non puo' piu' essere confuso con un errore."
```

---

### Task 6: `analisi.store` — cinque risorse al posto di un `loading` condiviso

**Files:**
- Modify: `client/src/stores/analisi.store.js`
- Modify: `client/src/views/AnalisiView.vue:414`

**Interfaces:**
- Consumes: `creaRisorsa` (Task 1), `DataState` (Task 2).
- Produces: `risorsaSpese`, `risorsaEntrate`, `risorsaConfronto`, `risorsaAndamento`, `risorsaSuggerimenti`. Restano invariate: `distribuzioneSpese`, `totaleSpese`, `distribuzioneEntrate`, `totaleEntrate`, `confrontoPeriodi`, `confrontoUnita`, `andamentoPatrimonio`, `suggerimenti`, `periodoSelezionato`, e le cinque `fetch*`.

**Contesto:** oggi un solo `loading` è condiviso da cinque `fetch` distinte. Caricare la distribuzione delle spese accende lo scheletro anche del confronto e dei suggerimenti; spegnerlo per una lo spegne per tutte. Con cinque risorse indipendenti il difetto sparisce come conseguenza della migrazione.

- [ ] **Step 1: Migrare lo store**

Riscrivi `client/src/stores/analisi.store.js` così. **Conserva integralmente i commenti esistenti** sui parametri legacy (`mesi`, `periodo`): documentano un vincolo di compatibilità fra rilasci del client e dell'API, e vanno riportati identici.

```js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

const PERIODO_LEGACY = { 3: '3m', 6: '6m', 12: '1a' };

export const useAnalisiStore = defineStore('analisi', () => {
  const periodoSelezionato = ref('mese');

  const risorsaSpese = creaRisorsa(
    async (da, a) => {
      const { data } = await api.get('/analisi/distribuzione-spese', { params: { da, a } });
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.distribuzione || []).length === 0 },
  );

  const risorsaEntrate = creaRisorsa(
    async (da, a) => {
      const { data } = await api.get('/analisi/distribuzione-entrate', { params: { da, a } });
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.distribuzione || []).length === 0 },
  );

  /**
   * Confronto fra periodi. L'unita' segue il periodo scelto nella pagina:
   * settimane, mesi o anni. Con `da`/`a` (periodo "Custom") l'API risponde
   * invece con i mesi toccati dall'intervallo e ignora unita/quantita.
   *
   * `mesi` viene inviato accanto a `quantita` per i soli mesi: durante un
   * rilascio l'API puo' essere ancora la versione precedente, che conosce
   * solo quel parametro. Vedi il commento in analisi.controller.js.
   */
  const risorsaConfronto = creaRisorsa(
    async ({ unita = 'mese', quantita = 6, da, a } = {}) => {
      const params = da && a ? { da, a } : { unita, quantita };
      if (!da && unita === 'mese') params.mesi = quantita;
      const { data } = await api.get('/analisi/confronto-mesi', { params });
      return { ...data, unitaRichiesta: data.unita || (da && a ? 'mese' : unita) };
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.mesi || []).length === 0 },
  );

  /**
   * Andamento del patrimonio: un punto per periodo, con la stessa unita' del
   * confronto. Con `da`/`a` (periodo "Custom") l'API usa i mesi
   * dell'intervallo e ignora unita/quantita.
   *
   * `periodo` viene inviato accanto ai parametri nuovi per la stessa ragione
   * di risorsaConfronto: durante un rilascio l'API puo' essere ancora
   * quella precedente, che conosce solo quel parametro.
   */
  const risorsaAndamento = creaRisorsa(
    async ({ unita = 'mese', quantita = 6, da, a } = {}) => {
      const params = da && a ? { da, a } : { unita, quantita };
      if (!da && unita === 'mese') params.periodo = PERIODO_LEGACY[quantita] || '6m';
      const { data } = await api.get('/analisi/andamento-patrimonio', { params });
      return data;
    },
    { iniziale: {}, vuotoSe: (d) => !d || (d.punti || []).length === 0 },
  );

  const risorsaSuggerimenti = creaRisorsa(
    async () => {
      const { data } = await api.get('/analisi/suggerimenti');
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.suggerimenti || []).length === 0 },
  );

  // --- Interfaccia pubblica invariata -------------------------------------
  const distribuzioneSpese = computed(() => risorsaSpese.data.value?.distribuzione || []);
  const totaleSpese = computed(() => risorsaSpese.data.value?.totale || 0);
  const distribuzioneEntrate = computed(() => risorsaEntrate.data.value?.distribuzione || []);
  const totaleEntrate = computed(() => risorsaEntrate.data.value?.totale || 0);
  const confrontoPeriodi = computed(() => risorsaConfronto.data.value?.mesi || []);
  const confrontoUnita = computed(() => risorsaConfronto.data.value?.unitaRichiesta || 'mese');
  const andamentoPatrimonio = computed(() => risorsaAndamento.data.value || {});
  const suggerimenti = computed(() => risorsaSuggerimenti.data.value?.suggerimenti || []);

  /**
   * Compatibilita': `loading` era condiviso da tutte e cinque le letture.
   * Le viste non ancora migrate lo leggono ancora, quindi resta come somma
   * logica. Le viste migrate devono usare lo stato della singola risorsa.
   */
  const loading = computed(() => (
    risorsaSpese.loading.value
    || risorsaEntrate.loading.value
    || risorsaConfronto.loading.value
    || risorsaAndamento.loading.value
    || risorsaSuggerimenti.loading.value
  ));

  const fetchDistribuzioneSpese = (da, a) => risorsaSpese.carica(da, a);
  const fetchDistribuzioneEntrate = (da, a) => risorsaEntrate.carica(da, a);
  const fetchConfrontoPeriodi = (opzioni = {}) => risorsaConfronto.carica(opzioni);
  const fetchAndamentoPatrimonio = (opzioni = {}) => risorsaAndamento.carica(opzioni);
  const fetchSuggerimenti = () => risorsaSuggerimenti.carica();

  const reset = () => {
    risorsaSpese.reset();
    risorsaEntrate.reset();
    risorsaConfronto.reset();
    risorsaAndamento.reset();
    risorsaSuggerimenti.reset();
    periodoSelezionato.value = 'mese';
  };

  return {
    risorsaSpese, risorsaEntrate, risorsaConfronto, risorsaAndamento, risorsaSuggerimenti,
    distribuzioneSpese, totaleSpese, distribuzioneEntrate, totaleEntrate,
    confrontoPeriodi, confrontoUnita, andamentoPatrimonio, suggerimenti,
    loading, periodoSelezionato,
    fetchDistribuzioneSpese, fetchDistribuzioneEntrate, fetchConfrontoPeriodi,
    fetchAndamentoPatrimonio, fetchSuggerimenti,
    reset,
  };
});
```

- [ ] **Step 2: Correggere lo stato vuoto della vista**

In `client/src/views/AnalisiView.vue`, aggiungi l'import di `DataState` e sostituisci la riga 414, oggi:

```vue
    <div v-else-if="!hasData && isDistribuzione && !analisiStore.loading" class="empty-state">
```

Avvolgi la sezione della distribuzione in `<DataState>` usando la risorsa corrispondente al tipo mostrato, e sposta l'attuale `div.empty-state` nello slot `#vuoto` **senza modificarne il testo**:

```vue
    <DataState
      v-if="isDistribuzione"
      :stato="risorsaDistribuzione.stato.value"
      :last-updated="risorsaDistribuzione.lastUpdated.value"
      messaggio-errore="Non è stato possibile caricare le analisi."
      skeleton-type="text"
      :skeleton-lines="5"
      @riprova="risorsaDistribuzione.riprova()"
    >
      <template #vuoto>
        <!-- il div.empty-state esistente, copiato senza modifiche al testo -->
      </template>
      <!-- il contenuto che oggi viene mostrato quando hasData e' vero -->
    </DataState>
```

dove `risorsaDistribuzione` è una `computed` da aggiungere allo `<script setup>`
della vista, accanto a `isDistribuzione` (riga 142). La variabile che
distingue spese da entrate in questo file si chiama `activeTab`:

```js
const risorsaDistribuzione = computed(() => (
  activeTab.value === 'entrate' ? analisiStore.risorsaEntrate : analisiStore.risorsaSpese
));
```

**Nota:** la riga 412 usa ancora `analisiStore.loading` per le schede che non
sono distribuzioni (confronto e patrimonio). Lasciala com'è in questo task:
`loading` resta disponibile come somma logica proprio per questo. Quelle due
schede passeranno a `DataState` nel blocco 3, che le riscrive comunque.

- [ ] **Step 3: Verificare a schermo il comportamento degli scheletri**

Questa è la verifica manuale obbligatoria numero 1 della specifica, ed è il rischio principale del task.

Apri la pagina Analisi e cambia periodo più volte. Atteso: cambiando il periodo, **solo** la sezione che si sta ricaricando mostra lo scheletro. Prima lampeggiava tutta la pagina. Il comportamento è cambiato: verifica che sia migliorato e non degradato, e in particolare che nessuna sezione resti bloccata su uno scheletro che non si spegne.

- [ ] **Step 4: Verificare build e test**

```bash
cd client && npm run build && npm test
```

Atteso: build completata, 79 test verdi.

- [ ] **Step 5: Commit**

```bash
git add client/src/stores/analisi.store.js client/src/views/AnalisiView.vue
git commit -m "Da' a ognuna delle cinque letture delle analisi uno stato proprio

Un solo 'loading' era condiviso da cinque fetch: caricare la
distribuzione delle spese accendeva lo scheletro anche del confronto e
dei suggerimenti, e spegnerlo per una lo spegneva per tutte.

AnalisiView non mostra piu' lo stato vuoto quando la richiesta e'
fallita. I commenti sui parametri legacy 'mesi' e 'periodo' sono
riportati identici: documentano la compatibilita' fra rilasci separati
di client e API."
```

---

### Task 7: `movimenti.store` e la paginazione

**Files:**
- Modify: `client/src/stores/movimenti.store.js`
- Modify: `client/src/views/MovimentiView.vue`

**Interfaces:**
- Consumes: `creaRisorsa` (Task 1), `DataState` (Task 2), `etichetta` (Task 3).
- Produces: `risorsaMovimenti`, `risorsaRecenti`, `risorsaBilancio`. Restano invariate: `movimentiPerData`, `recentiHome`, `bilancioMese`, `filtri`, `pagination`, `loading`, `loadingMore`, `loadingBilancio`, `loadingRecenti`, `fetchMovimenti`, `fetchRecentiHome`, `loadMoreMovimenti`, `fetchBilancioMese`, `fetchRicorrenti`, e tutte le funzioni di scrittura.

**Il caso particolare di questo task:** `loadMoreMovimenti` non usa l'avviso standard. Se fallisce il caricamento della pagina successiva, i dati già a schermo sono validi **e freschi**: dire "stai vedendo un vecchio aggiornamento" sarebbe falso. L'errore va mostrato inline accanto al pulsante "Carica altri".

- [ ] **Step 1: Migrare le tre letture dello store**

In `client/src/stores/movimenti.store.js`, mantieni `mergeGruppi`, `saldoInsufficienteMsg`, `PAGE_SIZE` e tutte le funzioni di scrittura **esattamente come sono**. Sostituisci solo le letture:

```js
  const risorsaMovimenti = creaRisorsa(
    async (params = {}) => {
      const { data } = await api.get('/movimenti', { params: { ...params, page: 1, limit: PAGE_SIZE } });
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.gruppi || []).length === 0 },
  );

  /**
   * Ultime transazioni della home. L'API puo' rispondere con `movimenti`
   * gia' piatti oppure con `gruppi` da appiattire: la normalizzazione stava
   * gia' nel codice precedente e va conservata, altrimenti la home resta
   * vuota su una delle due forme di risposta.
   */
  const risorsaRecenti = creaRisorsa(
    async ({ limit = 6 } = {}) => {
      const { data } = await api.get('/movimenti', {
        params: { limit, ordine: 'caricamento', solo_conti_attivi: true },
      });
      const flat = Array.isArray(data?.movimenti) ? data.movimenti : [];
      if (flat.length) return flat;
      if (Array.isArray(data?.gruppi)) {
        return data.gruppi.flatMap((g) =>
          (g.movimenti || []).map((m) => ({ ...m, dataLabel: g.label })),
        );
      }
      return [];
    },
    { iniziale: [] },
  );

  const risorsaBilancio = creaRisorsa(
    async (mese, anno) => {
      const { data } = await api.get('/movimenti/bilancio', { params: { mese, anno } });
      return data;
    },
    { iniziale: {}, vuotoSe: () => false },
  );
```

**Attenzione:** `recentiHome` diventa `computed(() => risorsaRecenti.data.value || [])`.
Il `vuotoSe` di `risorsaBilancio` restituisce sempre `false` perché un bilancio
a zero è un dato legittimo, non un'assenza: senza questo, un mese senza
movimenti mostrerebbe uno stato vuoto al posto di "0,00 €".

Il vecchio `fetchRecentiHome` teneva anche una cache manuale (`hadCache`) per
non accendere lo scheletro quando c'erano già dati. Quel meccanismo va
**rimosso**: `creaRisorsa` lo copre già, perché `stato` vale `caricamento`
solo quando `lastUpdated` è ancora `null`.

Le pagine successive vengono accumulate fuori dalla risorsa, perché `creaRisorsa` modella una lettura sola:

```js
  /** Gruppi accumulati dalle pagine successive alla prima. */
  const paginaExtra = ref([]);
  const loadingMore = ref(false);
  const errorMore = ref(null);
  const paginaCorrente = ref(1);

  const movimentiPerData = computed(() => {
    const prima = risorsaMovimenti.data.value?.gruppi || [];
    return paginaExtra.value.length ? mergeGruppi(prima, paginaExtra.value) : prima;
  });

  const pagination = computed(() => ({
    page: paginaCorrente.value,
    total: risorsaMovimenti.data.value?.pagination?.total || 0,
    pages: risorsaMovimenti.data.value?.pagination?.pages || 0,
  }));

  const fetchMovimenti = async (params = {}) => {
    filtri.value = params;
    // Una nuova ricerca annulla le pagine accumulate: appartenevano ai
    // filtri precedenti.
    paginaExtra.value = [];
    paginaCorrente.value = 1;
    errorMore.value = null;
    return risorsaMovimenti.carica(params);
  };

  /**
   * Una pagina successiva che fallisce non rende vecchi i dati gia' a
   * schermo: sono validi e freschi, manca solo il seguito. L'errore resta
   * quindi locale al pulsante e non passa da DataState.
   */
  const loadMoreMovimenti = async () => {
    if (loadingMore.value) return;
    loadingMore.value = true;
    errorMore.value = null;
    try {
      const { data } = await api.get('/movimenti', {
        params: { ...filtri.value, page: paginaCorrente.value + 1, limit: PAGE_SIZE },
      });
      paginaExtra.value = mergeGruppi(paginaExtra.value, data.gruppi || []);
      paginaCorrente.value += 1;
    } catch (e) {
      errorMore.value = e;
    } finally {
      loadingMore.value = false;
    }
  };
```

Esponi `risorsaMovimenti`, `risorsaRecenti`, `risorsaBilancio`, `errorMore` e una `reset()` che azzera le tre risorse più `paginaExtra`, `paginaCorrente`, `errorMore` e `filtri`.

- [ ] **Step 2: Correggere la vista**

In `client/src/views/MovimentiView.vue`:

1. importa `DataState` e `etichetta`;
2. avvolgi la lista in `<DataState>` usando `movimentiStore.risorsaMovimenti`, spostando nello slot `#vuoto` l'attuale stato vuoto **senza riscriverne il testo**;
3. sotto il pulsante "Carica altri", aggiungi l'errore inline:

```vue
      <p v-if="movimentiStore.errorMore" class="carica-altri-errore" role="alert">
        Non è stato possibile caricare altri movimenti.
        <button type="button" class="carica-altri-riprova" @click="movimentiStore.loadMoreMovimenti()">
          Riprova
        </button>
      </p>
```

con lo stile:

```css
.carica-altri-errore {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-align: center;
}

.carica-altri-riprova {
  min-height: 44px;
  padding: 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-link);
  background: none;
  border: none;
  cursor: pointer;
}

.carica-altri-riprova:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--radius-xs);
}
```

4. nell'intestazione, sostituisci la parola "Bilancio" con l'etichetta del glossario. La riga oggi è `Bilancio {{ oggi.format('MMMM') }}:` e diventa:

```vue
          {{ etichetta('risultato_mese') }} ({{ oggi.format('MMMM') }}):
```

- [ ] **Step 3: Verificare che la distinzione regga**

Con la pagina Movimenti aperta:
1. blocca `**/movimenti**` nel DevTools e ricarica → deve comparire il pannello d'errore, **non** lo stato vuoto "non hai ancora registrato nulla";
2. carica normalmente, poi blocca la rete e premi "Carica altri" → i movimenti devono restare a schermo con l'errore **inline** sotto il pulsante, **senza** il banner "Dati non aggiornati" in cima. È questa la distinzione che il task introduce.

- [ ] **Step 4: Verificare build e test**

```bash
cd client && npm run build && npm test
```

Atteso: build completata, 79 test verdi.

- [ ] **Step 5: Commit**

```bash
git add client/src/stores/movimenti.store.js client/src/views/MovimentiView.vue
git commit -m "Separa 'nessun movimento' da 'movimenti non caricabili'

La lista vuota per un filtro senza risultati e la lista vuota per una
richiesta fallita erano indistinguibili. Aggiunge anche la distinzione
opposta: una pagina successiva che non arriva non rende vecchi i dati
gia' a schermo, quindi l'errore resta accanto al pulsante e non
diventa un avviso 'dati non aggiornati' in cima alla pagina."
```

---

### Task 8: `obiettivi`, `investimenti` e `scommesse`

Tre store piccoli e con la stessa struttura, migrati insieme: le differenze fra loro non giustificano tre revisioni separate.

**Files:**
- Modify: `client/src/stores/obiettivi.store.js`
- Modify: `client/src/stores/investimenti.store.js`
- Modify: `client/src/stores/scommesse.store.js`
- Modify: `client/src/views/ObiettiviView.vue`
- Modify: `client/src/views/InvestimentiView.vue`
- Modify: `client/src/views/ScommesseView.vue`

**Interfaces:**
- Consumes: `creaRisorsa` (Task 1), `DataState` (Task 2).
- Produces: ogni store espone `risorsa<Nome>` per ciascuna lettura, una `reset()`, e mantiene invariate tutte le proprietà pubbliche già usate dalle viste e da `DashboardView`.

**Contesto:** questi tre conservano già i dati in caso di errore, per due meccanismi diversi. `DashboardView.vue:171` e `:189` intercettano l'errore con un `catch` commentato "la card resta nello stato precedente"; `obiettivi.store.fetchObiettivi` invece usa `try/finally` senza azzerare e lascia risalire l'errore. Manca solo comunicarlo all'utente. La migrazione unifica i due meccanismi.

- [ ] **Step 1: Migrare `obiettivi.store`**

```js
import { defineStore } from 'pinia';
import { computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

export const useObiettiviStore = defineStore('obiettivi', () => {
  const risorsaObiettivi = creaRisorsa(
    async () => {
      const { data } = await api.get('/obiettivi');
      return { attivi: data.attivi, completati: data.completati };
    },
    {
      iniziale: { attivi: [], completati: [] },
      vuotoSe: (d) => !d || ((d.attivi || []).length === 0 && (d.completati || []).length === 0),
    },
  );

  const obiettivi = computed(() => risorsaObiettivi.data.value || { attivi: [], completati: [] });
  const loading = computed(() => risorsaObiettivi.loading.value);

  const fetchObiettivi = () => risorsaObiettivi.carica();
  const reset = () => risorsaObiettivi.reset();

  // Le funzioni di scrittura restano identiche a quelle attuali: createObiettivo,
  // updateObiettivo, deleteObiettivo e le eventuali altre presenti nel file,
  // ciascuna seguita da `await fetchObiettivi()` come gia' fa oggi.

  return { risorsaObiettivi, obiettivi, loading, fetchObiettivi, reset /* + scritture */ };
});
```

- [ ] **Step 2: Migrare `investimenti.store` e `scommesse.store`**

Applica lo stesso schema. Per ciascuna lettura presente nel file crea una risorsa; per ciascuna proprietà oggi esposta come `ref` crea una `computed` che legge dalla risorsa, **mantenendo lo stesso nome**, così le viste e `DashboardView` non cambiano.

**I nomi delle risorse sono vincolanti**, perché il Task 9 li usa: crea
esattamente questi, una per ogni lettura oggi presente nei due file.

| Store | Lettura attuale | Nome della risorsa |
|---|---|---|
| `investimenti` | `fetchInvestimenti` (riga 22) | `risorsaInvestimenti` |
| `investimenti` | `fetchAnalisi` (riga 59) | `risorsaAnalisi` |
| `investimenti` | `fetchMovimenti` (riga 65) | `risorsaMovimenti` |
| `investimenti` | `fetchAllMovimenti` (riga 71) | `risorsaTuttiMovimenti` |
| `scommesse` | `fetchPiattaforme` (riga 12) | `risorsaPiattaforme` |
| `scommesse` | `fetchPanoramica` (riga 58) | `risorsaPanoramica` |
| `scommesse` | `fetchMovimenti` (riga 68) | `risorsaMovimenti` |
| `scommesse` | `fetchAnalisi` (riga 74) | `risorsaAnalisi` |

Punti a cui fare attenzione:
- `investimenti.store` espone tre `ref` derivati — `patrimonioInvestitoTotale` (riga 9), `rendimentoTotale` (riga 10), `rendimentoTotalePercentuale` (riga 11) — che oggi vengono **assegnati dentro `fetchInvestimenti`**. Diventano `computed` che leggono da `risorsaInvestimenti.data`, riproducendo lo stesso calcolo che oggi sta nella `fetch`. Copialo dal file, non reinventarlo: sono cifre di rendimento e un errore qui si vede in dashboard.
- `scommesse.store` ha i campi `panoramica` e `analisi` che il difetto noto numero 9 del `CLAUDE.md` segnala come non ripuliti al logout. Diventando risorse, la loro `reset()` li copre: è la parte di quel difetto che si chiude qui.
- Entrambe le viste sono dietro un controllo di accesso per fascia d'età. **Non toccare** `canAccessScommesseFeature` / `canAccessInvestimentiFeature` né le guardie del router: sono estranei a questo lavoro.

- [ ] **Step 3: Avvolgere le tre viste in `DataState`**

Per ciascuna di `ObiettiviView`, `InvestimentiView` e `ScommesseView`: importa `DataState`, avvolgi la sezione principale usando la risorsa corrispondente, sposta lo stato vuoto esistente nello slot `#vuoto` **senza riscriverne il testo**, e collega `@riprova` alla `riprova()` della risorsa.

- [ ] **Step 4: Verificare build e test**

```bash
cd client && npm run build && npm test
```

Atteso: build completata, 79 test verdi.

- [ ] **Step 5: Commit**

```bash
git add client/src/stores/obiettivi.store.js client/src/stores/investimenti.store.js client/src/stores/scommesse.store.js client/src/views/ObiettiviView.vue client/src/views/InvestimentiView.vue client/src/views/ScommesseView.vue
git commit -m "Porta obiettivi, investimenti e scommesse allo stesso stato di lettura

I tre conservavano gia' i dati in caso di errore, ma per due meccanismi
diversi e senza dirlo all'utente: un catch nella vista per due, un
try/finally nello store per il terzo. Ora sono la stessa cosa e la
scheda dichiara quando sta mostrando un dato vecchio.

I campi panoramica e analisi di scommesse rientrano nel reset: e' la
parte del difetto noto numero 9 che si chiude qui."
```

---

### Task 9: La dashboard, scheda per scheda

Il task che rende visibile tutto il lavoro precedente. Dipende dai Task 4-8: eseguilo solo quando i sette store sono migrati.

**Files:**
- Modify: `client/src/views/DashboardView.vue`
- Modify: `client/src/components/custom/WOverviewCarousel.vue`
- Modify: `client/src/components/dashboard/RecentTransactions.vue`

**Interfaces:**
- Consumes: le sette risorse esposte dai Task 4-8, `DataState` (Task 2).
- Produces: nessuna interfaccia nuova.

- [ ] **Step 1: Semplificare i caricamenti della vista**

In `client/src/views/DashboardView.vue`, i blocchi `try/catch` intorno ai caricamenti non servono più: `carica()` non lancia. Sostituisci `loadScommesse`, `loadInvestimenti`, `loadObiettivi`, `loadAnalisi` e `loadConti` con chiamate dirette.

I flag `contiCaricati`, `budgetCaricato` e `haMovimenti`, usati dal riquadro "Primi passi" per distinguere "traguardo non raggiunto" da "non lo sappiamo", possono ora leggere lo stato delle risorse invece di essere mantenuti a mano:

```js
const contiState = computed(() => {
  if (contiStore.risorsaConti.lastUpdated.value === null) return 'sconosciuto';
  return contiStore.contiAttivi.length > 0 ? 'fatto' : 'da-fare';
});

const budgetState = computed(() => {
  if (budgetStore.risorsaBudget.lastUpdated.value === null) return 'sconosciuto';
  return budgetStore.hasBudget ? 'fatto' : 'da-fare';
});
```

`lastUpdated === null` significa esattamente "non abbiamo mai ricevuto una risposta valida", che è la definizione di "sconosciuto" già usata dal file. `haMovimenti` e `checkHaMovimenti` restano invece **invariati**: sono una lettura non filtrata a parte, con uno scopo diverso dalla lista.

- [ ] **Step 2: Portare lo stato dentro il carosello**

`WOverviewCarousel` riceve oggi i dati come proprietà separate. Aggiungi una proprietà per lo stato di ciascuna scheda, senza cambiare quelle esistenti:

```js
  statoSaldo: { type: String, default: 'pronto' },
  lastUpdatedSaldo: { type: Number, default: null },
  statoBudgetSezione: { type: String, default: 'pronto' },
  lastUpdatedBudget: { type: Number, default: null },
  statoScommesse: { type: String, default: 'pronto' },
  lastUpdatedScommesse: { type: Number, default: null },
  statoInvestimenti: { type: String, default: 'pronto' },
  lastUpdatedInvestimenti: { type: Number, default: null },
  statoObiettivi: { type: String, default: 'pronto' },
  lastUpdatedObiettivi: { type: Number, default: null },
```

Il nome `statoBudgetSezione` evita la collisione con la proprietà `budgetStato` già esistente, che contiene i dati del budget e non il suo stato di caricamento.

Aggiungi gli eventi:

```js
const emit = defineEmits(['riprova-saldo', 'riprova-budget', 'riprova-scommesse', 'riprova-investimenti', 'riprova-obiettivi']);
```

Poi avvolgi il **contenuto** di ciascuna slide in `<DataState>`, lasciando la slide stessa dov'è. Per la scheda del patrimonio:

```vue
        <div v-if="slides.includes('saldo')" class="w-overview__slide w-full shrink-0 snap-center">
          <DataState
            :stato="statoSaldo"
            :last-updated="lastUpdatedSaldo"
            messaggio-errore="Non è stato possibile caricare il patrimonio."
            skeleton-type="text"
            :skeleton-lines="3"
            @riprova="emit('riprova-saldo')"
          >
            <!-- il contenuto attuale della scheda, invariato -->
          </DataState>
        </div>
```

Le proprietà `loadingSaldo`, `loadingBudget`, `loadingScommesse`, `loadingInvestimenti`, `loadingObiettivi` e i rispettivi `v-if="loading*"` con `WSkeleton` diventano ridondanti: lo scheletro lo rende `DataState`. Rimuovile.

- [ ] **Step 3: Collegare le risorse dalla dashboard**

Nel template di `DashboardView.vue`:

```vue
      :stato-saldo="contiStore.risorsaPatrimonio.stato.value"
      :last-updated-saldo="contiStore.risorsaPatrimonio.lastUpdated.value"
      :stato-budget-sezione="budgetStore.risorsaBudget.stato.value"
      :last-updated-budget="budgetStore.risorsaBudget.lastUpdated.value"
      :stato-scommesse="scommesseStore.risorsaPiattaforme.stato.value"
      :last-updated-scommesse="scommesseStore.risorsaPiattaforme.lastUpdated.value"
      :stato-investimenti="investimentiStore.risorsaInvestimenti.stato.value"
      :last-updated-investimenti="investimentiStore.risorsaInvestimenti.lastUpdated.value"
      :stato-obiettivi="obiettiviStore.risorsaObiettivi.stato.value"
      :last-updated-obiettivi="obiettiviStore.risorsaObiettivi.lastUpdated.value"
      @riprova-saldo="contiStore.risorsaPatrimonio.riprova()"
      @riprova-budget="budgetStore.risorsaBudget.riprova()"
      @riprova-scommesse="scommesseStore.risorsaPiattaforme.riprova()"
      @riprova-investimenti="investimentiStore.risorsaInvestimenti.riprova()"
      @riprova-obiettivi="obiettiviStore.risorsaObiettivi.riprova()"
```

**Nota:** questi nomi sono quelli fissati dalla tabella del Task 8. Se non
combaciano con ciò che trovi negli store, è il Task 8 a essere stato eseguito
male: correggi lì, non qui.

- [ ] **Step 4: Le transazioni recenti**

In `RecentTransactions.vue` aggiungi le proprietà `stato` e `lastUpdated` e l'evento `riprova`, avvolgendo la lista in `DataState` con lo stato vuoto attuale spostato nello slot `#vuoto`. Collega da `DashboardView`:

```vue
    <RecentTransactions
      :movimenti="recentiHome"
      :stato="movimentiStore.risorsaRecenti.stato.value"
      :last-updated="movimentiStore.risorsaRecenti.lastUpdated.value"
      @riprova="movimentiStore.risorsaRecenti.riprova()"
      @select="onSelectMovimento"
    />
```

- [ ] **Step 5: Verifica manuale — è la prova del sotto-progetto**

Questa è la verifica manuale numero 2 della specifica.

1. Apri la dashboard con la rete attiva e lascia caricare tutto.
2. Nel DevTools imposta la rete su **Offline**.
3. Premi "Riprova" su una scheda qualsiasi.

Atteso: la scheda **continua a mostrare i suoi numeri**, con sopra l'avviso "Dati non aggiornati" e l'orario dell'ultimo caricamento riuscito. Le altre schede restano normali. Nessuna scheda si svuota.

4. Ricarica la pagina **da offline**.

Atteso: ora le schede mostrano il pannello d'errore con "Riprova" — è corretto, la persistenza è solo in memoria e un ricaricamento la azzera. Verifica che il messaggio sia il pannello evidente e non uno stato vuoto tipo "non hai ancora conti".

5. Torna online e premi "Riprova".

Atteso: le schede si popolano e l'avviso sparisce.

- [ ] **Step 6: Verificare build e test**

```bash
cd client && npm run build && npm test
```

Atteso: build completata, 79 test verdi.

- [ ] **Step 7: Commit**

```bash
git add client/src/views/DashboardView.vue client/src/components/custom/WOverviewCarousel.vue client/src/components/dashboard/RecentTransactions.vue
git commit -m "Ogni scheda della dashboard dichiara se sta mostrando un dato vecchio

L'avviso e' per scheda e non per pagina: quando fallisce solo il
budget, dire 'non e' stato possibile aggiornare i dati' farebbe
dubitare anche dei saldi, che invece sono corretti.

I try/catch intorno ai caricamenti spariscono perche' carica() non
lancia, e i flag di 'Primi passi' leggono lastUpdated invece di essere
tenuti a mano: 'mai ricevuta una risposta valida' e' esattamente la
definizione di 'sconosciuto' che il riquadro usava gia'."
```

---

### Task 10: Reset di sessione uniforme

**Files:**
- Modify: `client/src/utils/session.js:20-60`

**Interfaces:**
- Consumes: la `reset()` esposta da ciascuno dei sette store (Task 4-8).
- Produces: nessuna interfaccia nuova.

**Contesto:** `resetPiniaStores` azzera i campi a mano, store per store. Il difetto noto numero 9 del `CLAUDE.md` segnala che dimentica `recentiHome` e parti di `scommesse` — un difetto di questa forma, non di quelle righe: elencare campi significa prima o poi dimenticarne uno.

- [ ] **Step 1: Sostituire le assegnazioni a mano**

In `client/src/utils/session.js`, sostituisci i blocchi che assegnano campi dei sette store migrati con chiamate a `reset()`:

```js
  // Ogni store migrato azzera le proprie risorse: elencare i campi a mano
  // era il motivo per cui `recentiHome` e i campi di scommesse restavano
  // popolati dopo il logout (difetto noto numero 9).
  [
    useContiStore,
    useMovimentiStore,
    useBudgetStore,
    useAnalisiStore,
    useObiettiviStore,
    useInvestimentiStore,
    useScommesseStore,
  ].forEach((useStore) => {
    try { useStore().reset(); } catch { /* ignore */ }
  });
```

**Non toccare** il resto della funzione: `resetCategorie()`, il salvataggio di `savedProfilo`, `useImportazioniStore().clear()` e il blocco di `profiloStore` restano esattamente come sono. Aggiungi gli `import` mancanti per gli store non ancora importati nel file.

- [ ] **Step 2: Verificare che il logout pulisca davvero**

1. Accedi, visita dashboard, movimenti, obiettivi e — se abilitate — scommesse e investimenti, così ogni store si popola.
2. Esci.
3. Accedi con un **altro** account.

Atteso: nessun dato del primo account compare, nemmeno per un istante, in nessuna pagina. Controlla in particolare le transazioni recenti della home, che erano il caso segnalato dal difetto noto.

- [ ] **Step 3: Verificare build e test**

```bash
cd client && npm run build && npm test
```

Atteso: build completata, 79 test verdi.

- [ ] **Step 4: Commit**

```bash
git add client/src/utils/session.js
git commit -m "Azzera gli store al logout chiamando reset invece di elencare campi

Elencare i campi a mano e' la forma di difetto che ha lasciato
recentiHome e i campi di scommesse popolati dopo il logout (difetto
noto numero 9). Ora ogni store migrato sa azzerare se stesso, e
reset() invalida anche le richieste in volo: una risposta in ritardo
non puo' ripopolare la vista con i dati dell'utente precedente."
```

---

### Task 11: Rimozione dei componenti non utilizzati

**Files:**
- Delete: `client/src/components/dashboard/GlassBalanceCard.vue`
- Delete: `client/src/components/dashboard/SummaryCards.vue`
- Delete: `client/src/components/dashboard/CategoryCarousel.vue`
- Delete: `client/src/components/dashboard/CategoryCard.vue`
- Delete: `client/src/views/PlaceholderView.vue`

**Interfaces:** nessuna. Nessuno di questi file è importato.

**Contesto:** la ragione non è la pulizia in sé. `GlassBalanceCard.vue:29` contiene `Patrimonio Totale`, un'etichetta concorrente per lo stesso numero che il Task 3 ha appena centralizzato nel glossario: lasciandola, il repository conserverebbe una fonte di verità rivale, e il prossimo che apre quel file la userebbe in buona fede.

- [ ] **Step 1: Verificare di nuovo che nessuno li usi**

La verifica va rifatta ora, non fidandosi di quella fatta in fase di pianificazione: i Task 4-9 hanno modificato proprio i file che potrebbero importarli.

```bash
cd client && for c in GlassBalanceCard SummaryCards CategoryCarousel CategoryCard PlaceholderView; do
  echo "--- $c"
  grep -rn "$c" src/ --include=*.vue --include=*.js | grep -v "^src/components/dashboard/$c.vue\|^src/views/$c.vue"
done
```

Atteso: nessun risultato, tranne `CategoryCard` citato da `CategoryCarousel.vue` — che viene eliminato anch'esso.

**Se compare qualsiasi altro risultato, fermati** e segnala: significa che uno dei task precedenti ha introdotto un uso, e il file non va eliminato.

- [ ] **Step 2: Eliminare i file**

```bash
cd /Users/christianmaiolo/Developer/wallt
git rm client/src/components/dashboard/GlassBalanceCard.vue \
       client/src/components/dashboard/SummaryCards.vue \
       client/src/components/dashboard/CategoryCarousel.vue \
       client/src/components/dashboard/CategoryCard.vue \
       client/src/views/PlaceholderView.vue
```

- [ ] **Step 3: Verificare che la build regga**

```bash
cd client && npm run build && npm test
```

Atteso: build completata (fallirebbe su un import mancante, ed è la prova che nessuno li importava dinamicamente), 79 test verdi.

- [ ] **Step 4: Commit**

```bash
git commit -m "Elimina cinque componenti non utilizzati

Nessuno era importato. Il motivo non e' la pulizia: GlassBalanceCard
conteneva 'Patrimonio Totale', un'etichetta concorrente per lo stesso
numero appena centralizzato nel glossario, e il prossimo che avesse
aperto quel file l'avrebbe usata in buona fede.

Chiude il difetto noto numero 4 del CLAUDE.md."
```

---

### Task 12: Documentazione

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PROJECT_STATUS.md`

- [ ] **Step 1: Aggiungere le regole al `CLAUDE.md`**

Nella sezione **Coding Rules**, aggiungi in fondo:

```markdown
17. Le letture dall'API negli store passano da `creaRisorsa` (`client/src/utils/risorsa.js`). Un gestore d'errore non deve **mai** azzerare i dati già ottenuti: è la regola che ha reso indistinguibili "dati assenti" ed "errore di rete" (`catch { lista.value = [] }`). Le viste mostrano lo stato con `DataState`, e lo stato vuoto va nello slot `vuoto`, mai in un `v-if="!dati && !loading"`.
18. Le etichette dei concetti finanziari si leggono da `client/src/content/glossario.js`, non si scrivono in linea. Lo stesso numero aveva tre nomi diversi in tre pagine. "Patrimonio totale" è conti attivi + investimenti attivi; la prima componente si chiama "Conti" e non "Disponibilità", perché comprende scommesse e risparmio.
```

Nella sezione **Known Issues**, marca come risolti il numero 4 (codice morto) e la parte del numero 9 relativa agli store migrati, con lo stesso stile barrato già usato per gli altri.

Nella tabella **Sensitive Areas**, aggiungi:

```markdown
| **Stato delle letture** | `creaRisorsa` garantisce che un errore non azzeri i dati e che una risposta sorpassata non sovrascriva una più recente. Cambiarne la semantica rimette in circolo il difetto per cui un errore di rete sembrava una perdita di dati | `utils/risorsa.js`, `components/common/DataState.vue` |
```

- [ ] **Step 2: Documentare il pattern in `ARCHITECTURE.md`**

Aggiungi una sezione che descriva: i cinque stati, le due invarianti, la guardia di sequenza, la divisione di responsabilità fra `risorsa.js` (logica, testata) e `DataState.vue` (presentazione, non testata perché non decide), e la distinzione fra `afterWrite` (scritture) e `DataState` (letture), che restano due meccanismi separati.

- [ ] **Step 3: Aggiornare `PROJECT_STATUS.md`**

Aggiorna il conteggio dei test del client (79) e annota nella roadmap il completamento del sotto-progetto A, indicando che i blocchi 3, 4, 5 e 6 restano da fare come sotto-progetti separati.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md docs/PROJECT_STATUS.md
git commit -m "Documenta il pattern delle risorse e il glossario

Le due regole nuove nelle Coding Rules sono quelle che impediscono il
ritorno dei difetti appena chiusi: non azzerare i dati in un catch, e
non scrivere in linea l'etichetta di un concetto finanziario."
```

---

## Verifica finale del sotto-progetto

Da eseguire dopo il Task 12, prima di considerare chiuso il lavoro.

- [ ] `cd client && npm test` → 79 verdi, 0 falliti
- [ ] `cd client && npm run build` → completata
- [ ] `cd server && npm test` → invariato rispetto a prima di iniziare. Nessun file del server è stato toccato: qualunque differenza è un segnale da investigare, non da accettare
- [ ] `git log --oneline` mostra 12 commit, uno per task
- [ ] Ricerca di controllo — non deve restare nessun azzeramento dei dati nei gestori d'errore degli store migrati:

```bash
cd client && grep -rn "catch" -A 2 src/stores/*.js | grep -E "= \[\]|= \{\}|= 0;|= null"
```

Atteso: nessun risultato dai sette store migrati. `profilo.store.js` può ancora comparire: non è fra quelli di questo sotto-progetto.

- [ ] Ricerca di controllo — nessuna etichetta finanziaria scritta in linea:

```bash
cd client && grep -rn "Saldo del conto\|Patrimonio Totale" src/
```

Atteso: nessun risultato.
