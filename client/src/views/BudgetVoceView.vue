<script setup>
/**
 * Dettaglio di una voce del budget: cosa racchiude e dove sono andati i soldi
 * questo mese. Da qui una categoria passa fra Bisogni e Desideri, cambiando
 * la sua essenzialità: la stessa classificazione del fondo di emergenza.
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import WCard from '@/components/common/WCard.vue';
import DataState from '@/components/common/DataState.vue';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { useBudgetStore } from '@/stores/budget.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { GLOSSARIO } from '@/content/glossario';
import { getCategoriaUscita } from '@/utils/categorie';
import { formatData } from '@/utils/formatters';
import { coloreVoce } from '@/components/budget/coloriVoci';

const MOSTRATE_SENZA_SPESE = 5;

const route = useRoute();
const router = useRouter();
const budgetStore = useBudgetStore();
const toastStore = useToastStore();
const { formatValuta } = useValuta();

const voce = computed(() => route.params.voce);
const concetto = computed(() => GLOSSARIO[`budget_${voce.value}`]);
const dati = computed(() => budgetStore.voci?.[voce.value] || null);
const isFuturo = computed(() => voce.value === 'futuro');
const altraVoce = computed(() => (voce.value === 'bisogni' ? 'desideri' : 'bisogni'));
const etichettaAltra = computed(() => GLOSSARIO[`budget_${altraVoce.value}`].etichetta);

const menuAperto = ref(null);
const spostando = ref(false);
const tutteSenzaSpese = ref(false);

onMounted(() => {
  if (!budgetStore.stato) budgetStore.carica();
});

const nomeCategoria = (id) => getCategoriaUscita(id)?.nome || id;

const oltre = computed(() => dati.value && !isFuturo.value && dati.value.usato > dati.value.obiettivo);
const larghezza = computed(() => Math.min(Math.max(dati.value?.percentuale_usata || 0, 0), 100));
const percentualeModello = computed(() => budgetStore.stato?.percentuali?.[voce.value]);

const nota = computed(() => {
  if (!dati.value) return '';
  const { usato, obiettivo, restante } = dati.value;
  if (isFuturo.value) return usato >= obiettivo ? 'Obiettivo raggiunto' : `Mancano ${formatValuta(obiettivo - usato)}`;
  const giorni = budgetStore.stato?.giorni_rimanenti || 0;
  if (restante < 0) return `Superato di ${formatValuta(-restante)}`;
  return giorni > 0 ? `Restano ${formatValuta(restante)} per i prossimi ${giorni} giorni` : `Restano ${formatValuta(restante)}`;
});

const senzaSpese = computed(() => (dati.value?.categorie_senza_spese || []).map(nomeCategoria));
const senzaSpeseMostrate = computed(() => (tutteSenzaSpese.value
  ? senzaSpese.value
  : senzaSpese.value.slice(0, MOSTRATE_SENZA_SPESE)));

const sposta = async (categoria) => {
  spostando.value = true;
  try {
    await budgetStore.spostaCategoria(categoria, altraVoce.value);
    toastStore.success(`${nomeCategoria(categoria.categoria)} ora fa parte dei ${etichettaAltra.value}`);
    menuAperto.value = null;
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Non è stato possibile spostare la categoria');
  } finally {
    spostando.value = false;
  }
};
</script>

<template>
  <div class="voce-view animate-fade-in">
    <button type="button" class="voce-view__indietro" @click="router.push({ name: 'budget' })">← Budget</button>

    <DataState
      :stato="budgetStore.statoPagina"
      :last-updated="budgetStore.lastUpdatedPagina"
      messaggio-errore="Non è stato possibile caricare il budget."
      skeleton-type="text"
      :skeleton-lines="5"
      @riprova="budgetStore.riprovaPagina()"
    >
      <template #vuoto>
        <WCard padding="1rem">
          <p class="voce-view__testo">Non hai ancora scelto come dividere i tuoi soldi.</p>
          <button type="button" class="voce-view__link" @click="router.push({ name: 'budget' })">Scegli un modello</button>
        </WCard>
      </template>

      <div v-if="dati">
        <h1 class="voce-view__titolo">
          <span class="voce-view__punto" :style="{ background: coloreVoce(voce) }" aria-hidden="true" />
          {{ concetto.etichetta }}
        </h1>
        <p class="voce-view__spiegazione">
          {{ concetto.descrizione }}
          <template v-if="percentualeModello !== undefined">Nel tuo modello vale il {{ percentualeModello }}% dell'entrata.</template>
        </p>

        <WCard padding="1rem" class="voce-view__blocco">
          <div class="voce-view__cifre">
            <span class="voce-view__usato">{{ formatValuta(dati.usato) }}</span>
            <span class="voce-view__obiettivo">di {{ formatValuta(dati.obiettivo) }}</span>
          </div>
          <div class="voce-view__barra" aria-hidden="true">
            <div class="voce-view__riempimento" :style="{ width: larghezza + '%', background: oltre ? 'var(--negative)' : coloreVoce(voce) }" />
          </div>
          <p class="voce-view__nota" :class="{ 'voce-view__nota--oltre': oltre }">{{ nota }}</p>
        </WCard>

        <template v-if="!isFuturo">
          <WCard padding="1rem" class="voce-view__blocco">
            <p class="voce-view__etichetta">Dove sono andati questo mese</p>
            <p v-if="!dati.categorie.length" class="voce-view__testo">Nessuna spesa questo mese.</p>
            <ul v-else class="voce-view__elenco">
              <li v-for="cat in dati.categorie" :key="cat.categoria" class="voce-view__cat">
                <div class="voce-view__cat-riga">
                  <span class="voce-view__cat-nome">
                    <CategoryIcon :categoria="cat.categoria" tipo="uscita" :size="18" class="voce-view__cat-icona" />
                    {{ nomeCategoria(cat.categoria) }}
                  </span>
                  <span class="voce-view__cat-destra">
                    {{ formatValuta(cat.importo) }}
                    <button
                      v-if="cat.spostabile"
                      type="button"
                      class="voce-view__menu"
                      :aria-expanded="menuAperto === cat.categoria"
                      :aria-label="`Altre azioni per ${nomeCategoria(cat.categoria)}`"
                      @click="menuAperto = menuAperto === cat.categoria ? null : cat.categoria"
                    >⋯</button>
                  </span>
                </div>
                <div v-if="menuAperto === cat.categoria" class="voce-view__popover">
                  <button type="button" class="voce-view__sposta" :disabled="spostando" @click="sposta(cat)">
                    Sposta nei <b>{{ etichettaAltra }}</b>
                  </button>
                  <p class="voce-view__avviso">Vale anche per il calcolo del fondo di emergenza.</p>
                </div>
              </li>
            </ul>
          </WCard>

          <WCard v-if="senzaSpese.length" padding="1rem" class="voce-view__blocco">
            <p class="voce-view__etichetta">Fanno parte dei {{ concetto.etichetta }}, nessuna spesa questo mese</p>
            <p class="voce-view__testo">
              {{ senzaSpeseMostrate.join(', ') }}<template v-if="!tutteSenzaSpese && senzaSpese.length > MOSTRATE_SENZA_SPESE"> e altre {{ senzaSpese.length - MOSTRATE_SENZA_SPESE }}</template>
            </p>
            <button
              v-if="senzaSpese.length > MOSTRATE_SENZA_SPESE"
              type="button"
              class="voce-view__link"
              @click="tutteSenzaSpese = !tutteSenzaSpese"
            >{{ tutteSenzaSpese ? 'Mostra meno' : 'Mostra tutte' }}</button>
          </WCard>
        </template>

        <WCard v-else padding="1rem" class="voce-view__blocco">
          <p class="voce-view__etichetta">Messi da parte questo mese</p>
          <p v-if="!dati.movimenti.length" class="voce-view__testo">
            Ancora nulla: un trasferimento verso il conto risparmio, il fondo di emergenza o un investimento conta qui.
          </p>
          <ul v-else class="voce-view__elenco">
            <li v-for="mov in dati.movimenti" :key="mov.id" class="voce-view__cat-riga voce-view__mov">
              <span>
                <span class="voce-view__mov-descrizione">{{ mov.descrizione }}</span>
                <span class="voce-view__mov-data">{{ formatData(mov.data, 'medio') }}</span>
              </span>
              <span :class="mov.importo < 0 ? 'voce-view__negativo' : 'voce-view__positivo'">
                {{ mov.importo < 0 ? '−' : '+' }}{{ formatValuta(Math.abs(mov.importo)) }}
              </span>
            </li>
          </ul>
        </WCard>
      </div>
    </DataState>
  </div>
</template>

<style scoped>
.voce-view { max-width: 640px; margin: 0 auto; }
.voce-view__indietro { background: none; border: 0; color: var(--accent-text); font: inherit; font-weight: 600; cursor: pointer; padding: 0.25rem 0; margin-bottom: 0.75rem; }
.voce-view__titolo { display: flex; align-items: center; gap: 0.5rem; font-size: 1.25rem; font-weight: 700; color: var(--text-primary); }
.voce-view__punto { width: 12px; height: 12px; border-radius: 50%; }
.voce-view__spiegazione { color: var(--text-secondary); margin: 0.375rem 0 1rem; line-height: 1.5; }
.voce-view__blocco { margin-bottom: 0.75rem; }
.voce-view__cifre { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
.voce-view__usato { font-size: 1.375rem; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.voce-view__obiettivo { font-size: var(--text-xs); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.voce-view__barra { height: 8px; background: var(--bg-input); border-radius: 4px; overflow: hidden; margin: 0.625rem 0 0.375rem; }
.voce-view__riempimento { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.voce-view__nota { font-size: var(--text-xs); color: var(--text-secondary); }
.voce-view__nota--oltre { color: var(--negative); font-weight: 600; }
.voce-view__etichetta { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 0.5rem; }
.voce-view__testo { color: var(--text-secondary); line-height: 1.5; }
.voce-view__link { background: none; border: 0; color: var(--accent-text); font: inherit; font-weight: 600; cursor: pointer; padding: 0.375rem 0 0; }
.voce-view__elenco { list-style: none; margin: 0; padding: 0; }
.voce-view__cat { border-bottom: 1px solid var(--border); }
.voce-view__cat:last-child { border-bottom: 0; }
.voce-view__cat-riga { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding: 0.625rem 0; }
.voce-view__cat-nome { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--text-primary); }
.voce-view__cat-icona { color: var(--text-muted); flex-shrink: 0; }
.voce-view__cat-destra { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.voce-view__menu {
  background: none; border: 0; color: var(--text-muted); font-size: 1.125rem; letter-spacing: 1px;
  min-width: 44px; min-height: 44px; cursor: pointer; border-radius: 8px;
}
.voce-view__menu:focus-visible { outline: 2px solid var(--border-focus); }
.voce-view__popover {
  margin: 0 0 0.625rem 2rem; padding: 0.625rem 0.75rem; border: 1px solid var(--border-strong);
  border-radius: 10px; background: var(--bg-secondary);
}
.voce-view__sposta { background: none; border: 0; color: var(--text-primary); font: inherit; cursor: pointer; padding: 0.25rem 0; }
.voce-view__avviso { font-size: var(--text-xs); color: var(--text-muted); margin-top: 0.25rem; }
.voce-view__mov { border-bottom: 1px solid var(--border); }
.voce-view__mov:last-child { border-bottom: 0; }
.voce-view__mov-descrizione { display: block; color: var(--text-primary); }
.voce-view__mov-data { display: block; font-size: var(--text-xs); color: var(--text-muted); }
.voce-view__positivo { color: var(--positive); font-variant-numeric: tabular-nums; }
.voce-view__negativo { color: var(--negative); font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .voce-view__riempimento { transition: none; } }
</style>
