<script setup>
import { computed } from 'vue';
import WCard from '@/components/common/WCard.vue';
import { formattaEuro } from '@/utils/pianoSmart';

/**
 * Il dettaglio delle uscite dei prossimi 30 giorni, raggruppate per tipo, con
 * il collegamento al posto dove ognuna si gestisce. Le righe sono le stesse di
 * `cashFlowTimeline` che la scheda mostra settimana per settimana: qui cambia
 * il raggruppamento, non i numeri. Prima c'era «Uscite entro fine mese», che
 * ripeteva le stesse voci con un totale già scritto in alto.
 */
const props = defineProps({
  situazione: { type: Object, required: true },
});

const LINK_PROGRAMMATE = '/funzionalita/situazione/programmate';
const LINK_ABBONAMENTI = { path: LINK_PROGRAMMATE, query: { scheda: 'abbonamenti' } };

// Le chiavi le dà `financialContext`: `programmata:` per i pagamenti a data
// fissa (rate, spese una tantum), `abbonamento:` per i rinnovi degli
// abbonamenti senza programmazione; ogni altra uscita è una ricorrenza.
const gruppi = computed(() => {
  const uscite = (props.situazione.cashFlowTimeline ?? []).filter((item) => item.direction === 'uscita');
  const definizioni = [
    { chiave: 'ricorrenti', titolo: 'Spese che si ripetono', link: LINK_PROGRAMMATE, righe: uscite.filter((item) => !/^(programmata|abbonamento):/.test(String(item.occurrenceKey))) },
    { chiave: 'programmate', titolo: 'Rate e pagamenti a data fissa', link: LINK_PROGRAMMATE, righe: uscite.filter((item) => String(item.occurrenceKey).startsWith('programmata:')) },
    { chiave: 'abbonamenti', titolo: 'Rinnovi degli abbonamenti', link: LINK_ABBONAMENTI, righe: uscite.filter((item) => String(item.occurrenceKey).startsWith('abbonamento:')) },
  ];
  return definizioni
    .filter((gruppo) => gruppo.righe.length)
    .map((gruppo) => ({ ...gruppo, totale: gruppo.righe.reduce((somma, item) => somma + Number(item.amount || 0), 0) }));
});

const dataBreve = (iso) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
</script>

<template>
  <WCard class="dettaglio">
    <template v-if="gruppi.length">
      <section v-for="gruppo in gruppi" :key="gruppo.chiave" class="gruppo">
        <div class="gruppo__testa">
          <h3>{{ gruppo.titolo }}</h3>
          <strong>{{ formattaEuro(gruppo.totale) }}</strong>
        </div>
        <ul class="righe">
          <li v-for="item in gruppo.righe" :key="item.occurrenceKey">
            <span>{{ item.description || 'Pagamento' }} <small>{{ dataBreve(item.dueDate) }}</small></span>
            <strong>{{ formattaEuro(item.amount) }}</strong>
          </li>
        </ul>
        <RouterLink :to="gruppo.link" class="vai">
          {{ gruppo.chiave === 'abbonamenti' ? 'Gestisci gli abbonamenti (puoi saltare un rinnovo)' : 'Vedi e modifica in Programmate' }}
        </RouterLink>
      </section>
    </template>
    <p v-else class="vuota">Nei prossimi 30 giorni non hai uscite programmate.</p>
    <RouterLink v-if="!gruppi.some((gruppo) => gruppo.chiave === 'abbonamenti')" :to="LINK_ABBONAMENTI" class="vai">Vedi i tuoi abbonamenti</RouterLink>
  </WCard>
</template>

<style scoped>
.dettaglio { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
.gruppo { display: flex; flex-direction: column; gap: .35rem; padding-bottom: .75rem; border-bottom: 1px solid var(--divider); }
.gruppo__testa { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
.gruppo__testa h3 { margin: 0; color: var(--text-primary); font-size: var(--text-base); }
.gruppo__testa strong { color: var(--text-primary); font-variant-numeric: tabular-nums; }
.righe { margin: 0; padding: 0; list-style: none; }
.righe li { display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; padding: .4rem 0; color: var(--text-primary); font-size: var(--text-sm); }
.righe span { min-width: 0; overflow-wrap: anywhere; }
.righe small { color: var(--text-secondary); font-size: var(--text-xs); }
.righe strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
.vai { align-self: flex-start; min-height: 44px; display: inline-flex; align-items: center; color: var(--accent-text); font-size: var(--text-sm); font-weight: 600; text-underline-offset: 3px; }
.vuota { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); }
</style>
