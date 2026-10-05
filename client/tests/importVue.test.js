import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Il difetto che questo test esiste per impedire è arrivato in produzione.
 *
 * `PianoAbbonamento.vue` usava `computed()` importando dal pacchetto `vue`
 * soltanto `onMounted, ref`. Niente lo ha fermato: Vite compila
 * `<script setup>` così com'è, non c'è ESLint in questo progetto, e nessun
 * test monta i componenti. L'errore è esploso nel browser di un utente —
 * «ReferenceError: Can't find variable: computed» nel setup — rompendo
 * l'intera pagina Impostazioni, cioè il posto da cui si cambia tema, si
 * esce dall'account e si resetta il conto.
 *
 * Un identificatore dell'API Vue non importato è invisibile a ogni verifica
 * che il progetto possiede. L'unico punto in cui può essere visto prima del
 * deploy è un grep sul sorgente, nello stesso spirito di
 * `vistaValue.test.js`: non elegante, ma è la differenza fra un errore
 * trovato in CI e un errore trovato da chi usa l'app.
 *
 * Le macro di compilazione (`defineProps`, `defineEmits`, …) non sono in
 * elenco di proposito: non si importano, e pretenderlo romperebbe ogni
 * componente corretto.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * API di runtime di `vue` che vanno importate per essere usate.
 *
 * Nomi specifici e non ambigui: `h` è deliberatamente escluso, perché una
 * variabile locale chiamata `h` è plausibile e produrrebbe falsi positivi.
 */
export const API_VUE = [
  'computed', 'reactive', 'readonly', 'shallowRef', 'shallowReactive',
  'toRef', 'toRefs', 'toValue', 'unref', 'isRef', 'customRef', 'triggerRef',
  'watch', 'watchEffect', 'watchPostEffect', 'nextTick',
  'onMounted', 'onBeforeMount', 'onUnmounted', 'onBeforeUnmount',
  'onUpdated', 'onBeforeUpdate', 'onActivated', 'onDeactivated',
  'onErrorCaptured', 'onWatcherCleanup',
  'provide', 'inject', 'useTemplateRef', 'useId', 'useAttrs', 'useSlots',
  'defineAsyncComponent', 'markRaw', 'getCurrentInstance', 'createApp',
];
// `ref` sta a parte: è l'API più usata del progetto, ma `ref` è anche un
// attributo del template e una prop frequente. Dentro il blocco script,
// `ref(` come chiamata non è ambiguo, quindi entra anche lui.
API_VUE.push('ref');

/** Blocco script di un `.vue` (`<script setup>` o `<script>`), o il file intero. */
export const codiceScript = (sorgente, percorso) => {
  if (!percorso.endsWith('.vue')) return sorgente;
  const blocchi = [...sorgente.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  return blocchi.map((m) => m[1]).join('\n');
};

/**
 * Rimuove i commenti che potrebbero menzionare un'API senza usarla.
 *
 * Si limita ai blocchi `/* … *\/` e alle righe interamente di commento: un
 * `//` a metà riga non si toglie senza distinguerlo da `https://`, e un
 * commento in coda che nomina un'API sta comunque in un file che la importa.
 */
export const senzaCommenti = (codice) => codice
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((riga) => !/^\s*(\/\/|\*)/.test(riga))
  .join('\n');

/** Nomi legati localmente: import da qualunque modulo, const/let/var, parametri destrutturati. */
export const nomiDisponibili = (codice) => {
  const nomi = new Set();

  for (const m of codice.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    const clausola = m[1];
    for (const g of clausola.matchAll(/\{([\s\S]*?)\}/g)) {
      for (const voce of g[1].split(',')) {
        const parti = voce.trim().split(/\s+as\s+/);
        const nome = (parti[1] ?? parti[0]).trim();
        if (nome) nomi.add(nome);
      }
    }
    const diretto = clausola.replace(/\{[\s\S]*?\}/g, '').replace(/,/g, ' ').trim();
    for (const nome of diretto.split(/\s+/)) if (/^\w+$/.test(nome)) nomi.add(nome);
  }

  for (const m of codice.matchAll(/\b(?:const|let|var|function|class)\s+(\w+)/g)) nomi.add(m[1]);
  for (const m of codice.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const voce of m[1].split(',')) {
      const nome = voce.trim().split(/[:=]/)[0].trim();
      if (/^\w+$/.test(nome)) nomi.add(nome);
    }
  }

  return nomi;
};

/**
 * API Vue chiamate nel codice senza essere disponibili.
 *
 * Il lookbehind esclude `qualcosa.watch(` e `useWatch(`: conta solo
 * l'identificatore nudo seguito da una parentesi di chiamata.
 */
export const apiNonImportate = (codice) => {
  const pulito = senzaCommenti(codice);
  const disponibili = nomiDisponibili(pulito);
  return API_VUE.filter(
    (api) => !disponibili.has(api) && new RegExp(`(?<![.\\w$])${api}\\s*\\(`).test(pulito),
  );
};

const fileSorgente = (dir) => readdirSync(dir).flatMap((nome) => {
  const percorso = join(dir, nome);
  if (statSync(percorso).isDirectory()) return fileSorgente(percorso);
  return /\.(vue|js)$/.test(nome) ? [percorso] : [];
});

test('nessun file usa un\'API di vue senza importarla', () => {
  const colpevoli = [];

  for (const percorso of fileSorgente(SRC)) {
    const codice = codiceScript(readFileSync(percorso, 'utf8'), percorso);
    const mancanti = apiNonImportate(codice);
    if (mancanti.length) colpevoli.push(`${relative(SRC, percorso)} → ${mancanti.join(', ')}`);
  }

  assert.deepEqual(
    colpevoli, [],
    'Un\'API di vue usata senza import lancia un ReferenceError a runtime e '
    + 'rompe la pagina intera.\n'
    + `Punti trovati:\n${colpevoli.join('\n')}`,
  );
});

test('il rilevatore riconosce il caso che è arrivato in produzione', () => {
  // Blindaggio: un controllo che non può fallire non protegge nessuno.
  const rotto = "import { onMounted, ref } from 'vue';\nconst x = computed(() => 1);";
  assert.deepEqual(apiNonImportate(rotto), ['computed']);

  const corretto = "import { computed, onMounted, ref } from 'vue';\nconst x = computed(() => 1);";
  assert.deepEqual(apiNonImportate(corretto), []);
});

test('il rilevatore non segnala il codice corretto', () => {
  // Import multi-riga: la forma più diffusa nel progetto.
  const multiriga = "import {\n  computed, onMounted, ref, watch,\n} from 'vue';\n"
    + 'const a = computed(() => 1); watch(a, () => {}); onMounted(() => {}); const b = ref(0);';
  assert.deepEqual(apiNonImportate(multiriga), []);

  // Un metodo omonimo su un oggetto non è l'API Vue.
  assert.deepEqual(apiNonImportate('store.watch(() => {});\nrouter.inject();'), []);

  // Un alias in import resta disponibile con il nome nuovo, non con l'originale.
  assert.deepEqual(
    apiNonImportate("import { computed as calcola } from 'vue';\nconst x = calcola(() => 1);"),
    [],
  );

  // Un binding locale omonimo non richiede l'import.
  assert.deepEqual(apiNonImportate('const inject = () => {};\ninject();'), []);

  // Il nome dentro un commento non è un uso.
  assert.deepEqual(apiNonImportate('// usa computed() per derivare\nconst x = 1;'), []);
});
