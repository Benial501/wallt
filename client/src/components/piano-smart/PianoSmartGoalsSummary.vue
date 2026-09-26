<script setup>
const props = defineProps({ goals: { type: Array, default: () => [] } });
const euro = (amount) => amount === null || amount === undefined
  ? '—'
  : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(amount));
const data = (value) => value
  ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
  : 'nessuna scadenza';
</script>

<template>
  <section class="goals" aria-labelledby="goals-title">
    <h2 id="goals-title">Obiettivi e margine attuale</h2>
    <p class="intro">Ogni stima considera un obiettivo alla volta e non assegna lo stesso margine a più obiettivi.</p>
    <p v-if="!goals.length" class="empty">Non hai ancora obiettivi di risparmio.</p>
    <ul v-else>
      <li v-for="goal in goals" :key="goal.id">
        <div class="goal-head"><strong>{{ goal.nome || 'Obiettivo' }}</strong><span>{{ (goal.stato || 'stato non disponibile').replaceAll('_', ' ') }}</span></div>
        <dl>
          <div><dt>Importo residuo</dt><dd>{{ euro(goal.importo_restante) }}</dd></div>
          <div><dt>Contributo richiesto / mese</dt><dd>{{ euro(goal.contributo_mensile_richiesto) }}</dd></div>
          <div><dt>Scadenza</dt><dd>{{ data(goal.scadenza) }}</dd></div>
        </dl>
        <p v-if="goal.estimatedMonthsAtCurrentMargin !== null" class="estimate">
          Circa {{ goal.estimatedMonthsAtCurrentMargin }} {{ goal.estimatedMonthsAtCurrentMargin === 1 ? 'mese' : 'mesi' }} al margine attuale
        </p>
        <p v-else class="reason">{{ goal.estimateReason || 'La stima non è disponibile.' }}</p>
        <small v-if="goal.estimatedMonthsAtCurrentMargin !== null" class="note">Stima teorica individuale basata sul margine medio mensile; non è una data garantita.</small>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.goals { padding: 1.1rem; border: 1px solid var(--divider); border-radius: var(--radius-lg); background: var(--surface); color: var(--text-primary); }
h2 { margin: 0; font-size: 1.1rem; }
.intro, .empty, .reason, .note { color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.5; }
ul { display: grid; gap: .8rem; margin: 1rem 0 0; padding: 0; list-style: none; }
li { padding: .8rem; border: 1px solid var(--divider); border-radius: var(--radius-md); }
.goal-head { display: flex; justify-content: space-between; gap: .75rem; }
.goal-head span { color: var(--text-secondary); font-size: var(--text-xs); }
dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .6rem; margin: .8rem 0; }
dl div { display: grid; gap: .2rem; }
dt { color: var(--text-secondary); font-size: var(--text-xs); }
dd { margin: 0; font-size: var(--text-sm); font-weight: 600; }
.estimate { margin: .6rem 0 .2rem; font-weight: 700; }
.note { font-size: var(--text-xs); }
.reason { margin-bottom: 0; }
.empty { margin-bottom: 0; }
@media (max-width: 560px) { dl { grid-template-columns: 1fr; } }
</style>
