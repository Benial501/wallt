<script setup>
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import StatoRiga from '@/components/situazione/StatoRiga.vue';
import { usePianoSmartStore } from '@/stores/pianoSmart.store';
import { purchaseAmountCents } from '@/utils/pianoSmartSimulation';
import { formattaEuro } from '@/utils/pianoSmart';
import { statoOggi, rispostaSimulazione } from '@/utils/situazioneSemplice';

/**
 * Oggi, in forma semplice: un numero («quanto posso spendere»), una frase su
 * come sta andando, cosa resta da pagare e una domanda sola per il
 * simulatore. Nessun calcolo: i valori arrivano da `current-situation`.
 */
const props = defineProps({
  situazione: { type: Object, required: true },
});
const emit = defineEmits(['suggerimento']);

const store = usePianoSmartStore();
const { purchaseSimulation, purchaseSimulationState } = storeToRefs(store);

const h = computed(() => props.situazione.horizon ?? {});
const dataLunga = (iso) => (iso
  ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
  : '');
const dataBreve = (iso) => new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

const spendibile = computed(() => h.value.capitaleLibero ?? props.situazione.current?.availableToSpend ?? null);
const stato = computed(() => statoOggi(props.situazione, { euro: formattaEuro, data: dataLunga }));
const daPagare = computed(() => (props.situazione.upcoming?.items ?? []).slice(0, 4));
const altriDaPagare = computed(() => Math.max((props.situazione.upcoming?.items ?? []).length - daPagare.value.length, 0));
const consiglio = computed(() => props.situazione.suggestions?.[0] ?? null);

const importo = ref('');
const errore = computed(() => importo.value !== '' && purchaseAmountCents(importo.value) === null);
const risposta = computed(() => rispostaSimulazione(purchaseSimulation.value, { euro: formattaEuro }));
const simulabile = computed(() => props.situazione.current?.availableToSpend !== null);
const verifica = async () => {
  if (!errore.value && importo.value && simulabile.value) await store.simulatePurchase(importo.value);
};
</script>

<template>
  <WCard class="oggi">
    <!-- Quando il server non può ancora stimare lo spendibile, un trattino
         grande sarebbe proprio il «numero messo lì a caso»: mostriamo ciò che
         è certo (i soldi sui conti, le spese già previste) e cosa manca. -->
    <div v-if="spendibile === null">
      <p class="etichetta">Sui tuoi conti hai</p>
      <strong class="numero">{{ formattaEuro(situazione.current?.liquidity) }}</strong>
      <p v-if="Number(h.impegniFinoA) > 0" class="sotto">
        Di questi, <strong>{{ formattaEuro(h.impegniFinoA) }}</strong> servono per le spese già previste fino al {{ dataLunga(h.dataFine) }}.
      </p>
      <p class="spiega">Per dirti quanto puoi spendere ogni giorno, WALLT deve vedere le tue spese per almeno un mese intero.</p>
    </div>
    <div v-else>
      <p class="etichetta">{{ h.tipo === 'data' ? `Per arrivare al ${dataLunga(h.dataFine)} puoi spendere ancora` : 'Puoi spendere ancora' }}</p>
      <strong class="numero">{{ formattaEuro(spendibile) }}</strong>
      <p v-if="h.budgetGiornaliero !== null && h.budgetGiornaliero !== undefined" class="sotto">
        <!-- Non «cioè»: il limite giornaliero può essere più basso della
             semplice divisione, quando lo frena la spesa media (vedi
             `dailyLimitBasis`). -->
        <template v-if="h.tipo !== 'data'">fino al {{ dataLunga(h.dataFine) }}. </template>Per arrivarci senza problemi, spendi al massimo <strong>{{ formattaEuro(h.budgetGiornaliero) }} al giorno</strong>.
      </p>
      <p class="spiega">Abbiamo già tolto le spese che devi ancora pagare e i soldi messi da parte per i tuoi obiettivi.</p>
    </div>
    <StatoRiga v-if="spendibile !== null || stato.tono !== 'neutro'" :tono="stato.tono" :testo="stato.testo" />
  </WCard>

  <WCard v-if="consiglio && stato.tono !== 'bene'" class="blocco">
    <h2>Cosa puoi fare</h2>
    <p class="testo">{{ consiglio.reason }}</p>
    <p class="testo testo--tenue">{{ consiglio.effect }}</p>
    <WButton v-if="consiglio.action" variant="secondary" @click="emit('suggerimento', consiglio)">{{ consiglio.title }}</WButton>
  </WCard>

  <WCard class="blocco">
    <h2>Cosa devi ancora pagare questo mese</h2>
    <ul v-if="daPagare.length" class="righe">
      <li v-for="item in daPagare" :key="item.occurrenceKey">
        <span>{{ item.description || 'Spesa fissa' }} <small>· {{ dataBreve(item.dueDate) }}</small></span>
        <strong>{{ formattaEuro(item.amount) }}</strong>
      </li>
    </ul>
    <p v-if="altriDaPagare" class="testo testo--tenue">E altre {{ altriDaPagare }}: le trovi in «Prossimi 30 giorni».</p>
    <p v-if="!daPagare.length" class="testo testo--tenue">Niente da pagare fino a fine mese.</p>
  </WCard>

  <WCard class="blocco">
    <h2 id="simulatore-title">Posso permettermi questa spesa?</h2>
    <label for="simulatore-importo" class="testo testo--tenue">Scrivi quanto costa e premi «Verifica». Non registriamo nessuna spesa.</label>
    <div class="domanda">
      <input
        id="simulatore-importo" v-model="importo" inputmode="decimal" placeholder="50 €"
        :aria-invalid="errore" @keydown.enter="verifica"
      >
      <WButton variant="primary" :disabled="!simulabile" :loading="purchaseSimulationState === 'loading'" @click="verifica">Verifica</WButton>
    </div>
    <p v-if="errore" class="errore" role="alert">Scrivi un importo, per esempio 50 oppure 12,50.</p>
    <p v-else-if="!simulabile" class="testo testo--tenue">Potrai usarlo quando WALLT saprà quanto puoi spendere.</p>
    <p v-if="purchaseSimulationState === 'error'" class="errore" role="alert">Non siamo riusciti a rispondere. Riprova.</p>
    <div v-if="risposta" class="risposta" aria-live="polite">
      <StatoRiga :tono="risposta.tono" :testo="`${risposta.titolo}. ${risposta.testo}`" />
    </div>
  </WCard>
</template>

<style scoped>
.oggi { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
.etichetta { margin: 0; color: var(--text-secondary); font-size: var(--text-base); }
.numero { display: block; margin: .15rem 0; color: var(--text-primary); font-size: 3rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
.sotto { margin: 0; color: var(--text-primary); font-size: var(--text-lg); line-height: 1.5; }
.spiega { margin: .6rem 0 0; color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.55; }
.blocco { display: flex; flex-direction: column; gap: .75rem; margin-bottom: 1rem; }
h2 { margin: 0; color: var(--text-primary); font-size: 1.2rem; }
.testo { margin: 0; color: var(--text-primary); font-size: var(--text-base); line-height: 1.55; }
.testo--tenue { color: var(--text-secondary); font-size: var(--text-sm); }
.righe { margin: 0; padding: 0; list-style: none; }
.righe li { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; padding: .7rem 0; border-bottom: 1px solid var(--divider); font-size: var(--text-base); color: var(--text-primary); }
.righe li:last-child { border-bottom: 0; }
.righe small { color: var(--text-secondary); font-size: var(--text-sm); }
.righe strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
.domanda { display: flex; gap: .6rem; }
.domanda input { flex: 1; min-width: 0; min-height: 48px; padding: .7rem .9rem; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-elevated); color: var(--text-primary); font: inherit; font-size: var(--text-lg); }
.errore { margin: 0; color: var(--negative); font-size: var(--text-sm); }
</style>
