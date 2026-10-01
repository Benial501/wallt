<script setup>
import { reactive } from 'vue';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import { createContributionPayload } from '@/utils/expenseFunding';

defineProps({
  plans: { type: Array, default: () => [] },
  busyPaymentId: { type: [Number, String], default: null },
});
const emit = defineEmits(['add-contribution', 'confirm-payment']);
const forms = reactive({});

const formattaEuro = (value) => {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value));
};
const contributionDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const dataDiScadenza = (value) => new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T12:00:00Z`));
const getForm = (id) => {
  if (!forms[id]) forms[id] = { amount: '', error: '' };
  return forms[id];
};
const inviaAccantonamento = (plan) => {
  const form = getForm(plan.paymentId);
  const payload = createContributionPayload(
    plan.paymentId, form.amount, contributionDate(), plan.remaining,
  );
  if (!payload) {
    form.error = 'Inserisci un importo positivo che non superi il residuo.';
    return;
  }
  form.error = '';
  emit('add-contribution', payload);
  form.amount = '';
};
</script>

<template>
<section v-if="plans.length" class="expense-funding" aria-labelledby="expense-funding-title">
  <div class="expense-funding__heading">
    <div>
      <p class="expense-funding__eyebrow">Obiettivi futuri</p>
      <h2 id="expense-funding-title">Preparati alle spese programmate</h2>
      <p>Volt calcola una quota da mettere da parte. Decidi tu se accantonare: nessun denaro viene spostato automaticamente.</p>
    </div>
  </div>

  <WCard v-for="plan in plans" :key="plan.paymentId" class="expense-funding__card">
    <header class="expense-funding__topline">
      <div>
        <h3>{{ plan.description || 'Spesa programmata' }}</h3>
        <p>{{ dataDiScadenza(plan.dueDate) }}<span v-if="plan.accountName"> · {{ plan.accountName }}</span></p>
      </div>
      <strong>{{ formattaEuro(plan.amount) }}</strong>
    </header>

    <div class="expense-funding__progress" role="group" :aria-label="`Accantonamento spesa ${plan.paymentId}`">
      <div><span>Già accantonato</span><strong>{{ formattaEuro(plan.contributed) }}</strong></div>
      <div><span>Ancora da coprire</span><strong>{{ formattaEuro(plan.remaining) }}</strong></div>
      <div><span>Quota settimanale aggiornata</span><strong>{{ formattaEuro(plan.weeklyQuota) }}</strong></div>
      <p v-if="plan.remaining !== '0.00'">{{ plan.periodsRemaining }} {{ plan.periodsRemaining === 1 ? 'settimana utile' : 'settimane utili' }} · la quota cresce se il residuo non viene accantonato.</p>
      <p v-else>Obiettivo coperto. La spesa resta da confermare quando sarà stata pagata.</p>
    </div>

    <div v-if="plan.suggestions?.length" class="expense-funding__suggestions">
      <h4>Possibili somme da liberare</h4>
      <p class="expense-funding__explanation">Sono importi in euro basati su spese più basse già osservate nei mesi completi; sono proposte, non tagli automatici.</p>
      <p class="expense-funding__explanation">Un mese completo descrive il calendario: WALLT non può verificare se tutte le spese manuali siano state registrate.</p>
      <p class="expense-funding__explanation">Per seguire la quota servirebbero circa {{ formattaEuro(plan.monthlyNeed) }} al mese; le possibilità osservate coprono {{ formattaEuro(plan.suggestedMonthlyTotal) }}.</p>
      <ul>
        <li v-for="suggestion in plan.suggestions" :key="suggestion.category">
          <span><strong>{{ suggestion.name }}</strong><small>{{ suggestion.essentiality.replace('_', ' ') }} · media {{ formattaEuro(suggestion.averageMonthly) }}, livello più basso osservato {{ formattaEuro(suggestion.lowerObservedMonthly) }}</small>
            <small v-if="suggestion.conditional">Valuta questa possibilità solo se non compromette una necessità essenziale.</small></span>
          <strong>fino a {{ formattaEuro(suggestion.suggestedMonthlyReduction) }}/mese</strong>
        </li>
      </ul>
    </div>
    <p v-else class="expense-funding__hint">{{ plan.coverage === 'storico_insufficiente' ? 'Per proporre importi per categoria servono almeno tre mesi completi di storico classificato.' : 'Non ci sono riduzioni osservate che possiamo proporre con prudenza.' }}</p>
    <p class="expense-funding__hint" v-if="plan.sustainability === 'supera_margine_stimato'">La quota supera il margine settimanale stimato: puoi versare importi diversi e rivalutare il piano nel tempo.</p>
    <p class="expense-funding__hint" v-else-if="plan.sustainability === 'compatibile_con_margine'">La quota è entro il margine settimanale stimato di {{ formattaEuro(plan.weeklyMargin) }}. È un’indicazione, non una garanzia di copertura.</p>
    <p class="expense-funding__hint" v-else-if="plan.sustainability === 'non_stimabile'">Non abbiamo dati sufficienti per confrontare la quota con il margine settimanale.</p>

    <div class="expense-funding__form">
      <label :for="`contribution-${plan.paymentId}`">Aggiungi manualmente al salvadanaio virtuale</label>
      <div>
        <input
          :id="`contribution-${plan.paymentId}`"
          v-model="getForm(plan.paymentId).amount"
          inputmode="decimal" type="number" min="0.01" step="0.01"
          :max="plan.remaining" :disabled="plan.remaining === '0.00' || busyPaymentId === plan.paymentId"
          :aria-describedby="`contribution-help-${plan.paymentId}`"
        />
        <WButton
          variant="primary" :disabled="plan.remaining === '0.00' || busyPaymentId === plan.paymentId"
          @click="inviaAccantonamento(plan)"
        >{{ busyPaymentId === plan.paymentId ? 'Salvataggio…' : 'Accantona' }}</WButton>
      </div>
      <small :id="`contribution-help-${plan.paymentId}`">Il contributo riduce lo spendibile, ma non cambia il saldo del conto e non registra una spesa.</small>
      <p v-if="getForm(plan.paymentId).error" class="expense-funding__error" role="alert">{{ getForm(plan.paymentId).error }}</p>
    </div>

    <ol v-if="plan.contributions?.length" class="expense-funding__history" aria-label="Versamenti effettuati">
      <li v-for="contribution in plan.contributions" :key="contribution.id">
        <span>{{ dataDiScadenza(contribution.date) }}</span><strong>{{ formattaEuro(contribution.amount) }}</strong>
      </li>
    </ol>

    <div v-if="plan.daysRemaining <= 7 || plan.status === 'in_ritardo'" class="expense-funding__confirm" role="group" aria-label="Conferma pagamento effettivo">
      <p>Hai pagato questa spesa? Solo la tua conferma registrerà l'uscita nelle analisi.</p>
      <div>
        <WButton variant="primary" :disabled="busyPaymentId === plan.paymentId" @click="emit('confirm-payment', plan.paymentId)">Sì, conferma pagamento</WButton>
        <WButton variant="secondary" :disabled="busyPaymentId === plan.paymentId">Non ancora</WButton>
      </div>
    </div>
  </WCard>
</section>
</template>

<style scoped>
.expense-funding {
  display: grid;
  gap: 1rem;
  margin-block: 1.25rem;
}

.expense-funding__heading h2,
.expense-funding__topline h3,
.expense-funding__suggestions h4 {
  margin: 0;
  color: var(--text-primary);
}

.expense-funding__heading p,
.expense-funding__topline p,
.expense-funding__hint,
.expense-funding__explanation {
  margin: 0.35rem 0 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.expense-funding__eyebrow {
  margin: 0 0 0.25rem !important;
  color: var(--accent-green) !important;
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.expense-funding__card {
  display: grid;
  gap: 1rem;
}

.expense-funding__topline,
.expense-funding__topline > div,
.expense-funding__progress > div,
.expense-funding__history li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.expense-funding__topline > strong {
  color: var(--text-primary);
  font-size: 1.15rem;
  white-space: nowrap;
}

.expense-funding__progress {
  display: grid;
  gap: 0.45rem;
  padding: 0.85rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-secondary);
}

.expense-funding__progress span,
.expense-funding__history span {
  color: var(--text-secondary);
}

.expense-funding__progress strong,
.expense-funding__history strong {
  color: var(--text-primary);
}

.expense-funding__progress p {
  margin: 0.25rem 0 0;
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.expense-funding__suggestions ul,
.expense-funding__history {
  display: grid;
  gap: 0.65rem;
  margin: 0.65rem 0 0;
  padding: 0;
  list-style: none;
}

.expense-funding__suggestions li {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.65rem;
  border-top: 1px solid var(--border-subtle);
}

.expense-funding__suggestions li > span {
  display: grid;
  gap: 0.2rem;
}

.expense-funding__suggestions small,
.expense-funding__form > small {
  color: var(--text-secondary);
  line-height: 1.45;
}

.expense-funding__suggestions li > strong {
  color: var(--text-primary);
  white-space: nowrap;
}

.expense-funding__form {
  display: grid;
  gap: 0.5rem;
}

.expense-funding__form label {
  color: var(--text-primary);
  font-weight: 600;
}

.expense-funding__form > div,
.expense-funding__confirm > div {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.expense-funding__form input {
  width: min(100%, 12rem);
  min-height: 44px;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-primary);
  color: var(--text-primary);
  font: inherit;
}

.expense-funding__form input:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.expense-funding__error {
  margin: 0;
  color: var(--negative);
}

.expense-funding__history {
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-subtle);
}

.expense-funding__confirm {
  display: grid;
  gap: 0.55rem;
  padding: 0.85rem;
  border: 1px solid color-mix(in srgb, var(--accent-green) 35%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent-green) 7%, transparent);
}

.expense-funding__confirm p { margin: 0; color: var(--text-primary); }

@media (max-width: 520px) {
  .expense-funding__topline { align-items: flex-start; }
  .expense-funding__suggestions li { display: grid; }
  .expense-funding__form > div > * { flex: 1 1 100%; }
}
</style>
