<script setup>
/**
 * Budget a tre voci: un consulente, non un modulo da compilare.
 *
 * In testa una frase dice com'è andata e cosa fare; sotto le tre voci
 * (Bisogni, Desideri, Futuro), ciascuna con la frase che spiega cosa contiene.
 * Senza un piano la pagina è la scelta del modello. Il piano vale per ogni
 * mese finché l'utente non lo cambia, e non muove mai denaro.
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import 'dayjs/locale/it';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import DataState from '@/components/common/DataState.vue';
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import BudgetVoceRiga from '@/components/budget/BudgetVoceRiga.vue';
import BudgetSceltaModello from '@/components/budget/BudgetSceltaModello.vue';
import { useBudgetStore } from '@/stores/budget.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { fraseConsiglio } from '@/content/budgetConsigli';
import { getCategoriaUscita } from '@/utils/categorie';
import { VOCI } from '@/utils/budget';

dayjs.locale('it');

const router = useRouter();
const budgetStore = useBudgetStore();
const toastStore = useToastStore();
const { formatValuta } = useValuta();

const sceltaAperta = ref(false);
const salvando = ref(false);

onMounted(() => budgetStore.carica());

const mese = computed(() => {
  const nome = dayjs().format('MMMM');
  return nome.charAt(0).toUpperCase() + nome.slice(1);
});

const percentuali = computed(() => budgetStore.stato?.percentuali);
const chipModello = computed(() => (percentuali.value
  ? VOCI.map((v) => percentuali.value[v]).join('/')
  : ''));

const giorni = computed(() => budgetStore.stato?.giorni_rimanenti ?? 0);
const rigaMese = computed(() => {
  const parti = [mese.value];
  if (budgetStore.stato?.entrata > 0) parti.push(`su ${formatValuta(budgetStore.stato.entrata)} di entrata`);
  if (giorni.value === 1) parti.push('manca 1 giorno');
  else if (giorni.value > 1) parti.push(`mancano ${giorni.value} giorni`);
  else parti.push('ultimo giorno del mese');
  return parti.join(' · ');
});

const frase = computed(() => fraseConsiglio(budgetStore.consiglio, {
  formatValuta,
  nomeCategoria: (id) => getCategoriaUscita(id)?.nome || id,
}));
const entrataMancante = computed(() => budgetStore.consiglio?.codice === 'entrata_mancante');

const apriVoce = (voce) => router.push({ name: 'budget-voce', params: { voce } });

const scegli = async (piano) => {
  salvando.value = true;
  try {
    await budgetStore.salvaPiano(piano);
    toastStore.success('Piano del budget salvato');
    sceltaAperta.value = false;
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Non è stato possibile salvare il piano');
  } finally {
    salvando.value = false;
  }
};

const modificaEntrata = async (importo) => {
  salvando.value = true;
  try {
    await budgetStore.salvaEntrata(importo);
    toastStore.success('Entrata mensile aggiornata');
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Non è stato possibile salvare l’entrata');
  } finally {
    salvando.value = false;
  }
};
</script>

<template>
  <div class="budget-view animate-fade-in">
    <!-- La scelta del modello è un modulo, non una lettura: resta fuori da DataState. -->
    <BudgetSceltaModello
      v-if="sceltaAperta"
      :modelli="budgetStore.modelli"
      :consigliato="budgetStore.consigliato"
      :entrata="budgetStore.entrata"
      :piano-attuale="budgetStore.piano"
      :salvando="salvando"
      @scegli="scegli"
      @modifica-entrata="modificaEntrata"
      @annulla="sceltaAperta = false"
    />

    <DataState
      v-else
      :stato="budgetStore.statoPagina"
      :last-updated="budgetStore.lastUpdatedPagina"
      messaggio-errore="Non è stato possibile caricare il budget."
      skeleton-type="text"
      :skeleton-lines="5"
      @riprova="budgetStore.riprovaPagina()"
    >
      <template #vuoto>
        <BudgetSceltaModello
          :modelli="budgetStore.modelli"
          :consigliato="budgetStore.consigliato"
          :entrata="budgetStore.entrata"
          :salvando="salvando"
          @scegli="scegli"
          @modifica-entrata="modificaEntrata"
        />
      </template>

      <div v-if="budgetStore.stato" class="budget">
        <div class="budget__testa">
          <div class="budget__titolo-riga">
            <h1 class="budget__titolo">Budget</h1>
            <HelpTrigger topic="budget-come-funziona" />
          </div>
          <span class="budget__chip">{{ chipModello }}</span>
        </div>
        <p class="budget__mese">{{ rigaMese }}</p>

        <WCard v-if="frase" class="budget__consiglio" padding="1rem">
          <p class="budget__consiglio-etichetta">Il punto della situazione</p>
          <p class="budget__consiglio-testo">{{ frase }}</p>
          <WButton v-if="entrataMancante" variant="secondary" size="sm" class="budget__consiglio-azione" @click="sceltaAperta = true">
            Indica l’entrata
          </WButton>
        </WCard>

        <WCard padding="0 1rem">
          <BudgetVoceRiga
            v-for="voce in VOCI"
            :key="voce"
            :voce="voce"
            :dati="budgetStore.voci[voce]"
            :entrata-mancante="entrataMancante"
            @apri="apriVoce"
          />
        </WCard>

        <div class="budget__azioni">
          <WButton variant="secondary" size="sm" @click="sceltaAperta = true">Cambia modello</WButton>
        </div>
      </div>
    </DataState>
  </div>
</template>

<style scoped>
.budget-view { max-width: 640px; margin: 0 auto; }
.budget__testa { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.budget__titolo-riga { display: flex; align-items: center; gap: 0.625rem; }
.budget__titolo { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); }
.budget__chip {
  font-size: var(--text-xs); font-weight: 600; color: var(--accent-text); background: var(--accent-light);
  border-radius: 999px; padding: 0.125rem 0.625rem; font-variant-numeric: tabular-nums;
}
.budget__mese { font-size: var(--text-xs); color: var(--text-secondary); margin: 0.25rem 0 1rem; }
.budget__consiglio { margin-bottom: 0.875rem; border-color: var(--accent-text); background: var(--accent-light); }
.budget__consiglio-etichetta {
  font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 0.375rem;
}
.budget__consiglio-testo { color: var(--text-primary); line-height: 1.5; }
.budget__consiglio-azione { margin-top: 0.75rem; }
.budget__azioni { display: flex; justify-content: flex-end; margin-top: 1rem; }
</style>
