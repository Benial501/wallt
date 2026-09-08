<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import WSkeleton from '@/components/common/WSkeleton.vue';
import { useBudgetStore } from '@/stores/budget.store';
import { useAuthStore } from '@/stores/auth.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { formatPercentuale } from '@/utils/formatters';
import { getCategoriaBudgetInfo, getCategorieBudgetPerProfilo, getBarColor } from '@/utils/budgetCategorie';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { PieChart } from '@/utils/appIcons';
import dayjs from 'dayjs';
import 'dayjs/locale/it';
import HelpTrigger from '@/components/help/HelpTrigger.vue';

dayjs.locale('it');

const budgetStore = useBudgetStore();
const { formatValuta } = useValuta();
const authStore = useAuthStore();
const toastStore = useToastStore();

const oggi = dayjs();
const mese = oggi.month() + 1;
const anno = oggi.year();
const meseLabel = computed(() => oggi.format('MMMM YYYY'));

const modalita = ref('view'); // view | setup | edit
const importoTotale = ref(0);
const categorieForm = ref([]);
const saving = ref(false);

const totaleAllocato = computed(() =>
  categorieForm.value.reduce((s, c) => s + (parseFloat(c.importo) || 0), 0)
);

const percentualeAllocata = computed(() =>
  importoTotale.value > 0 ? (totaleAllocato.value / importoTotale.value) * 100 : 0
);

const allocazioneStato = computed(() => {
  const pct = percentualeAllocata.value;
  if (pct > 100) return { tipo: 'error', msg: `Allocato troppo (${formatValuta(totaleAllocato.value - importoTotale.value)} in eccesso)` };
  if (pct < 100) return { tipo: 'warning', msg: `${formatValuta(importoTotale.value - totaleAllocato.value)} non allocati` };
  return { tipo: 'ok', msg: 'Budget allocato al 100%' };
});

const initSetup = () => {
  modalita.value = 'setup';
  const suggerito = budgetStore.budgetSuggerito;
  importoTotale.value = suggerito?.importo_totale || authStore.user?.profilo?.entrata_mensile || 0;

  if (suggerito?.categorie?.length) {
    categorieForm.value = suggerito.categorie.map((c) => ({
      categoria: c.categoria === 'cibo' ? 'cibo_spesa' : c.categoria === 'acquisti' ? 'acquisti_vari' : c.categoria === 'scommesse' ? 'deposito_scommesse' : c.categoria,
      percentuale: c.percentuale,
      importo: parseFloat(c.importo),
    }));
  } else {
    const cats = getCategorieBudgetPerProfilo(authStore.user?.profilo);
    const pct = cats.length ? 100 / cats.length : 0;
    categorieForm.value = cats.map((c) => ({
      categoria: c.id,
      percentuale: Math.round(pct * 100) / 100,
      importo: Math.round((importoTotale.value * pct / 100) * 100) / 100,
    }));
  }
};

const initEdit = () => {
  modalita.value = 'edit';
  importoTotale.value = parseFloat(budgetStore.budgetCorrente.importo_totale);
  categorieForm.value = budgetStore.budgetCorrente.categorie.map((c) => ({
    categoria: c.categoria,
    percentuale: parseFloat(c.percentuale),
    importo: parseFloat(c.importo),
  }));
};

const updatePercentuale = (idx, pct) => {
  categorieForm.value[idx].percentuale = pct;
  categorieForm.value[idx].importo = Math.round((importoTotale.value * pct / 100) * 100) / 100;
};

const updateImporto = (idx, imp) => {
  categorieForm.value[idx].importo = imp;
  categorieForm.value[idx].percentuale = importoTotale.value > 0
    ? Math.round((imp / importoTotale.value) * 10000) / 100
    : 0;
};

watch(importoTotale, (val) => {
  categorieForm.value.forEach((c, i) => updatePercentuale(i, c.percentuale));
});

const salvaBudget = async () => {
  if (percentualeAllocata.value > 100) return;
  saving.value = true;
  try {
    const payload = {
      mese, anno,
      importo_totale: importoTotale.value,
      categorie: categorieForm.value.map((c) => ({
        categoria: c.categoria,
        percentuale: c.percentuale,
        importo: c.importo,
      })),
    };

    if (modalita.value === 'edit' && budgetStore.budgetCorrente) {
      await budgetStore.updateBudget(budgetStore.budgetCorrente.id, payload);
      toastStore.success('Budget aggiornato!');
    } else {
      await budgetStore.createBudget(payload);
      toastStore.success('Budget creato!');
    }

    modalita.value = 'view';
    await budgetStore.fetchStatoBudget(mese, anno);
    localStorage.removeItem('wallt_budget_skipped');
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Errore nel salvataggio');
  } finally {
    saving.value = false;
  }
};

const getCatDisplay = (id) => getCategoriaBudgetInfo(id);

const getStatoItem = (categoria) =>
  budgetStore.statoBudget.find((s) => s.categoria === categoria);

onMounted(async () => {
  await budgetStore.fetchBudget(mese, anno);
  if (budgetStore.hasBudget) {
    await budgetStore.fetchStatoBudget(mese, anno);
    modalita.value = 'view';
  }
});

const totaleBudget = computed(() => parseFloat(budgetStore.budgetCorrente?.importo_totale) || 0);
const totaleRimanente = computed(() => totaleBudget.value - budgetStore.totaleSpeso);
</script>

<template>
  <div class="budget-view animate-fade-in">
    <!-- STATO A: Nessun budget -->
    <div v-if="!budgetStore.hasBudget && modalita === 'view' && !budgetStore.loading" class="empty-budget">
      <PieChart class="empty-icon" :size="48" :stroke-width="1.5" />
      <h2>Nessun budget per {{ meseLabel }}</h2>
      <p class="empty-desc">
        Il budget è facoltativo: fissa un tetto di spesa mensile per categoria e WALLT
        lo confronta con le uscite già registrate. I trasferimenti tra i tuoi conti non lo consumano.
      </p>
      <WButton variant="primary" size="md" @click="initSetup">Imposta il budget →</WButton>
      <div class="empty-help"><HelpTrigger topic="budget-come-funziona" /></div>
    </div>

    <WSkeleton v-else-if="budgetStore.loading" type="card" />

    <!-- STATO B/C: Setup o Edit -->
    <div v-else-if="modalita === 'setup' || modalita === 'edit'">
      <h1 class="page-title">Budget {{ meseLabel }}</h1>

      <WCard class="mb-4">
        <label class="field-label">Importo totale disponibile (€)</label>
        <input v-model.number="importoTotale" type="number" min="0" class="form-input form-input--lg" />
      </WCard>

      <WCard>
        <div v-for="(cat, idx) in categorieForm" :key="cat.categoria" class="cat-row">
          <CategoryIcon :categoria="cat.categoria" tipo="uscita" :size="18" class="cat-icon" />
          <span class="cat-nome">{{ getCatDisplay(cat.categoria).nome }}</span>
          <input
            :value="cat.percentuale"
            type="number" min="0" max="100" step="0.1"
            class="form-input form-input--sm"
            @input="updatePercentuale(idx, parseFloat($event.target.value) || 0)"
          />
          <span class="pct-sign">%</span>
          <input
            :value="cat.importo"
            type="number" min="0" step="0.01"
            class="form-input form-input--sm"
            @input="updateImporto(idx, parseFloat($event.target.value) || 0)"
          />
        </div>

        <div class="alloc-bar-wrap">
          <div
            class="alloc-bar"
            :class="allocazioneStato.tipo"
            :style="{ width: Math.min(percentualeAllocata, 100) + '%' }"
          />
        </div>
        <p class="alloc-msg" :class="allocazioneStato.tipo">{{ allocazioneStato.msg }} ({{ Math.round(percentualeAllocata) }}%)</p>

        <div class="form-actions">
          <WButton variant="secondary" size="md" @click="modalita = budgetStore.hasBudget ? 'view' : 'view'">Annulla</WButton>
          <WButton
            variant="primary" size="md"
            :loading="saving"
            :disabled="percentualeAllocata > 100"
            @click="salvaBudget"
          >
            {{ modalita === 'edit' ? 'Salva modifiche' : 'Conferma Budget' }}
          </WButton>
        </div>
      </WCard>
    </div>

    <!-- STATO C: Budget attivo -->
    <div v-else-if="budgetStore.hasBudget">
      <div class="page-header">
        <div class="page-title-row">
          <h1 class="page-title">Budget {{ meseLabel }} · {{ formatValuta(totaleBudget) }}</h1>
          <HelpTrigger topic="budget-come-funziona" />
        </div>
        <WButton variant="secondary" size="sm" @click="initEdit">Modifica</WButton>
      </div>

      <div class="budget-categories">
        <WCard v-for="item in budgetStore.statoBudget" :key="item.categoria" class="budget-cat-card mb-3">
          <div class="cat-header">
            <CategoryIcon :categoria="item.categoria" tipo="uscita" :size="16" class="cat-icon" />
            <span>{{ getCatDisplay(item.categoria).nome }}</span>
            <span class="cat-stats">
              {{ formatValuta(item.speso) }} spesi di {{ formatValuta(item.budget_importo) }}
              ({{ Math.round(item.percentuale_usata) }}%)
            </span>
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :class="{ pulse: item.stato === 'superato' }"
              :style="{
                width: Math.min(item.percentuale_usata, 100) + '%',
                background: getBarColor(item.percentuale_usata),
              }"
            />
          </div>
          <p class="cat-rimanente" :class="item.rimanente < 0 ? 'negative' : ''">
            {{ item.rimanente >= 0 ? `Rimangono ${formatValuta(item.rimanente)}` : `Superato di ${formatValuta(Math.abs(item.rimanente))}` }}
          </p>
        </WCard>
      </div>

      <WCard class="riepilogo-card">
        <div class="riepilogo-grid">
          <div><span class="riep-label">Totale budget</span><span class="riep-val">{{ formatValuta(totaleBudget) }}</span></div>
          <div><span class="riep-label">Totale speso</span><span class="riep-val negative">{{ formatValuta(budgetStore.totaleSpeso) }}</span></div>
          <div><span class="riep-label">Rimanente</span><span class="riep-val" :class="totaleRimanente >= 0 ? 'positive' : 'negative'">{{ formatValuta(totaleRimanente) }}</span></div>
        </div>
      </WCard>
    </div>
  </div>
</template>

<style scoped>
.page-title { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin-bottom: 1rem; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem; }
.page-title-row { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.empty-help { display: flex; justify-content: center; margin-top: 0.875rem; }
.empty-budget { text-align: center; padding: 4rem 1rem; }
.empty-icon { display: block; margin: 0 auto 1rem; color: var(--text-muted); stroke: currentColor; }
.cat-icon { flex-shrink: 0; color: var(--text-muted); }
.empty-desc { color: var(--text-secondary); margin: 0.5rem 0 1.5rem; }
.field-label { display: block; font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
.form-input { width: 100%; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.75rem; color: var(--text-primary); }
.form-input--lg { font-size: 1.5rem; font-weight: 700; text-align: center; }
/* 16px: sotto questa soglia iOS ingrandisce la pagina appena il campo
   prende il fuoco. Vedi la nota in assets/styles/main.css. */
.form-input--sm { width: 70px; padding: 0.375rem 0.5rem; font-size: 16px; }
.cat-row { display: grid; grid-template-columns: 32px 1fr 70px 16px 80px; align-items: center; gap: 0.5rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
.cat-nome { font-size: 0.875rem; color: var(--text-primary); }
.pct-sign { color: var(--text-muted); font-size: 0.75rem; }
.alloc-bar-wrap { height: 8px; background: var(--bg-input); border-radius: 4px; margin: 1rem 0 0.5rem; overflow: hidden; }
.alloc-bar { height: 100%; border-radius: 4px; transition: width 0.3s; }
.alloc-bar.ok { background: var(--positive); }
.alloc-bar.warning { background: var(--warning); }
.alloc-bar.error { background: var(--negative); }
.alloc-msg { font-size: 0.8125rem; margin-bottom: 1rem; }
.alloc-msg.ok { color: var(--positive); }
.alloc-msg.warning { color: var(--warning); }
.alloc-msg.error { color: var(--negative); }
.form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }
.mb-3 { margin-bottom: 0.75rem; }
.mb-4 { margin-bottom: 1rem; }
.cat-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; font-size: 0.875rem; color: var(--text-primary); flex-wrap: wrap; gap: 0.25rem; }
.cat-stats { color: var(--text-secondary); font-size: 0.8125rem; }
.progress-bar { height: 8px; background: var(--bg-input); border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
.progress-fill.pulse { animation: pulse 1s ease-in-out infinite; }
.cat-rimanente { font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.5rem; }
.cat-rimanente.negative { color: var(--negative); }
.riepilogo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; text-align: center; }
.riep-label { display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; }
.riep-val { font-size: 1.125rem; font-weight: 700; color: var(--text-primary); }
.positive { color: var(--positive); }
.negative { color: var(--negative); }
</style>
