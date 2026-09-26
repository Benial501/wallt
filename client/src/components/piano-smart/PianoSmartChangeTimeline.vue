<script setup>
import { computed, ref, watch } from 'vue';
import { CATEGORIE_USCITA } from '@/utils/categorie';

const props = defineProps({ changes: { type: Object, default: null } });
const points = computed(() => props.changes?.points || []);
const indice = ref(Math.max(points.value.findIndex((point) => point.days === 7), 0));
watch(points, (next) => { indice.value = Math.max(next.findIndex((point) => point.days === 7), 0); });
const point = computed(() => points.value[indice.value] || null);
const euro = (amount) => amount === null || amount === undefined
  ? '—'
  : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(amount));
const variazione = (amount) => amount === null || amount === undefined
  ? '—'
  : `${Number(amount) > 0 ? '+' : Number(amount) < 0 ? '−' : ''}${euro(Math.abs(Number(amount)))}`;
const data = (value) => new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T12:00:00Z`));
const categoria = (id) => CATEGORIE_USCITA.find((item) => item.id === id)?.nome || id;
const qualita = (value) => ({
  storico_disponibile: 'Storico sufficiente per questo confronto',
  storico_limitato: 'Confronto parziale: lo storico non copre entrambi i periodi',
  dati_insufficienti: 'Non ci sono ancora movimenti sufficienti',
})[value] || 'Qualità dello storico non disponibile';
const testoPasso = computed(() => {
  if (!point.value) return '';
  return point.value.days <= 30
    ? `Passo giornaliero · ${point.value.days} ${point.value.days === 1 ? 'giorno' : 'giorni'}`
    : `Passo settimanale · ${point.value.days} giorni`;
});
</script>

<template>
  <section class="change-card" aria-labelledby="change-title">
    <div class="heading">
      <div>
        <h2 id="change-title">Cosa è cambiato</h2>
        <p>Confronta periodi della stessa durata. Il cursore avanza giorno per giorno nel primo mese e settimana per settimana fino a tre mesi.</p>
      </div>
      <strong v-if="point" class="selection-label">{{ point.days }} {{ point.days === 1 ? 'giorno' : 'giorni' }}</strong>
    </div>

    <template v-if="point">
      <label class="sr-only" for="change-range">Durata dei periodi da confrontare</label>
      <input
        id="change-range"
        v-model.number="indice"
        class="range"
        type="range"
        min="0"
        :max="Math.max(points.length - 1, 0)"
        step="1"
        :aria-valuetext="testoPasso"
      >
      <div class="range-labels" aria-hidden="true"><span>1 giorno</span><span class="month-mark">1 mese</span><span>3 mesi</span></div>
      <p class="step-copy" aria-live="polite">{{ testoPasso }}</p>

      <div class="periods">
        <article>
          <span>Periodo selezionato</span>
          <strong>{{ data(point.recent.from) }} – {{ data(point.recent.to) }}</strong>
          <small>Entrate {{ euro(point.recent.income) }} · Uscite {{ euro(point.recent.expenses) }} · {{ point.recent.observedDays }}/{{ point.days }} giorni osservati</small>
        </article>
        <article>
          <span>Periodo precedente equivalente</span>
          <strong>{{ data(point.previous.from) }} – {{ data(point.previous.to) }}</strong>
          <small>Entrate {{ euro(point.previous.income) }} · Uscite {{ euro(point.previous.expenses) }} · {{ point.previous.observedDays }}/{{ point.days }} giorni osservati</small>
        </article>
      </div>
      <dl class="deltas">
        <div><dt>Variazione entrate</dt><dd>{{ variazione(point.delta.income) }}</dd></div>
        <div><dt>Variazione uscite</dt><dd>{{ variazione(point.delta.expenses) }}</dd></div>
        <div><dt>Ritmo spese recente</dt><dd>{{ euro(point.recent.averageDailyExpenses) }}{{ point.recent.averageDailyExpenses === null ? '' : '/giorno' }}</dd></div>
        <div><dt>Ritmo precedente</dt><dd>{{ euro(point.previous.averageDailyExpenses) }}{{ point.previous.averageDailyExpenses === null ? '' : '/giorno' }}</dd></div>
      </dl>
      <div class="quality" role="status">
        <strong>{{ qualita(point.quality) }}</strong>
        <span v-if="point.quality !== 'storico_disponibile'">Giorni osservati: {{ point.observedDays }} su {{ point.days }}.</span>
        <span v-if="point.currentPeriodPartial">Il giorno di oggi è parziale.</span>
      </div>
      <p class="history-note">Il confronto mostra solo entrate e uscite registrate nelle due finestre; WALLT non può verificare se siano state annotate tutte.</p>
      <ul v-if="point.changedCategories?.length" class="categories" aria-label="Categorie con la maggiore variazione">
        <li v-for="item in point.changedCategories" :key="item.category">
          <span>{{ categoria(item.category) }}</span><strong>{{ variazione(item.delta) }}</strong>
        </li>
      </ul>
      <p v-else class="empty">Nessuna variazione di categoria significativa in questo confronto.</p>
    </template>
    <p v-else class="empty">La timeline non è ancora disponibile.</p>
  </section>
</template>

<style scoped>
.change-card { padding: 1.1rem; border: 1px solid var(--divider); border-radius: var(--radius-lg); background: var(--surface); color: var(--text-primary); }
.heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
h2 { margin: 0; font-size: 1.1rem; }
.heading p, .empty { color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.5; }
.selection-label { white-space: nowrap; font-size: 1.15rem; }
.range { width: 100%; min-height: 44px; accent-color: var(--accent-green); cursor: pointer; }
.range:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 3px; border-radius: 4px; }
.range-labels { position: relative; display: flex; justify-content: space-between; color: var(--text-secondary); font-size: var(--text-xs); }
.month-mark { position: absolute; left: 76%; transform: translateX(-50%); }
.step-copy { margin: .4rem 0 1rem; color: var(--accent-text); font-size: var(--text-xs); font-weight: 600; }
.periods { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; }
.periods article, .deltas > div { display: grid; gap: .35rem; padding: .75rem; border: 1px solid var(--divider); border-radius: var(--radius-md); }
.periods span, .periods small, dt { color: var(--text-secondary); font-size: var(--text-xs); }
.periods strong { font-size: var(--text-sm); }
.periods small { line-height: 1.45; }
.deltas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; margin: .8rem 0; }
.deltas dt, .deltas dd { margin: 0; }
.deltas dd { font-weight: 700; font-variant-numeric: tabular-nums; }
.quality { display: flex; flex-wrap: wrap; gap: .35rem .75rem; padding: .75rem 0; border-top: 1px solid var(--divider); color: var(--text-secondary); font-size: var(--text-xs); }
.quality strong { color: var(--text-primary); }
.history-note { color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.45; }
.categories { display: grid; gap: .4rem; margin: 0; padding: 0; list-style: none; }
.categories li { display: flex; justify-content: space-between; gap: 1rem; padding: .4rem 0; border-bottom: 1px solid var(--divider); font-size: var(--text-sm); }
.empty { margin-bottom: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@media (max-width: 600px) { .periods, .deltas { grid-template-columns: 1fr; } }
</style>
