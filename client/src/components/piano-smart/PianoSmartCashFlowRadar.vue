<script setup>
const props = defineProps({ items: { type: Array, default: () => [] } });
const euro = (amount) => amount === null || amount === undefined
  ? '—'
  : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(amount));
const data = (value) => new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T12:00:00Z`));
</script>

<template>
  <section class="radar" aria-labelledby="radar-title">
    <h2 id="radar-title">Radar dei prossimi 30 giorni</h2>
    <p class="intro">Entrate e uscite ricorrenti previste e margine spendibile stimato dopo ogni evento. Il radar considera solo le ricorrenze registrate, non è una garanzia del saldo futuro.</p>
    <ol v-if="items.length" class="events">
      <li v-for="item in items" :key="item.occurrenceKey" :class="`event--${item.direction}`">
        <span class="marker" aria-hidden="true">{{ item.direction === 'entrata' ? '+' : '−' }}</span>
        <div class="event-copy">
          <time :datetime="item.dueDate">{{ data(item.dueDate) }}</time>
          <strong>{{ item.description || (item.direction === 'entrata' ? 'Entrata ricorrente' : 'Uscita ricorrente') }}</strong>
          <small>{{ item.direction === 'entrata' ? 'Entrata prevista' : 'Uscita prevista' }}{{ item.reserved ? ' · già considerata nello spendibile' : '' }}</small>
        </div>
        <div class="event-values"><strong>{{ item.direction === 'entrata' ? '+' : '−' }}{{ euro(item.amount) }}</strong><small>Spendibile dopo: {{ euro(item.marginAfter) }}</small></div>
      </li>
    </ol>
    <p v-else class="empty">Non ci sono entrate o uscite ricorrenti previste nei prossimi 30 giorni.</p>
  </section>
</template>

<style scoped>
.radar { padding: 1.1rem; border: 1px solid var(--divider); border-radius: var(--radius-lg); background: var(--surface); color: var(--text-primary); }
h2 { margin: 0; font-size: 1.1rem; }
.intro, .empty { color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.5; }
.events { position: relative; display: grid; gap: .2rem; margin: 1rem 0 0; padding: 0; list-style: none; }
.events::before { position: absolute; top: 1rem; bottom: 1rem; left: .95rem; width: 1px; background: var(--divider); content: ''; }
.events li { position: relative; display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto; align-items: center; gap: .65rem; padding: .7rem 0; }
.marker { z-index: 1; display: grid; width: 1.9rem; height: 1.9rem; place-items: center; border: 1px solid currentColor; border-radius: 50%; background: var(--surface); font-weight: 700; }
.event--entrata .marker, .event--entrata .event-values > strong { color: var(--positive, #25845a); }
.event--uscita .marker, .event--uscita .event-values > strong { color: var(--negative, #b84e4e); }
.event-copy, .event-values { display: grid; gap: .2rem; }
.event-copy time, .event-copy small, .event-values small { color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.4; }
.event-copy strong, .event-values > strong { font-size: var(--text-sm); }
.event-values { text-align: right; }
.empty { margin-bottom: 0; }
@media (max-width: 520px) { .events li { grid-template-columns: 2rem minmax(0, 1fr); } .event-values { grid-column: 2; display: flex; justify-content: space-between; text-align: left; } }
</style>
