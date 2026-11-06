<script setup>
import { computed } from 'vue';
import WCard from '@/components/common/WCard.vue';
import StatoRiga from '@/components/situazione/StatoRiga.vue';
import { formattaEuro } from '@/utils/pianoSmart';
import { gruppiScadenze, riepilogoProssimi } from '@/utils/situazioneSemplice';

/**
 * Prossimi 30 giorni, in forma semplice: «ce la faccio a pagare tutto?».
 * Le righe sono quelle di `cashFlowTimeline` e quanto resta dopo l'ultima è
 * il `marginAfter` che il server ha già calcolato: qui si somma soltanto ciò
 * che è elencato.
 */
const props = defineProps({
  situazione: { type: Object, required: true },
});

const timeline = computed(() => props.situazione.cashFlowTimeline ?? []);
const riepilogo = computed(() => riepilogoProssimi(timeline.value));
const gruppi = computed(() => gruppiScadenze(timeline.value, props.situazione.current?.period));
const dataBreve = (iso) => new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

const stato = computed(() => {
  const resta = riepilogo.value.restaDopo;
  if (!timeline.value.length) return { tono: 'bene', testo: 'Nei prossimi 30 giorni non hai pagamenti segnati.' };
  if (resta === null) {
    // Lo spendibile non è ancora stimabile: diciamo soltanto ciò che è certo,
    // cioè se sui conti c'è più o meno di quanto è elencato.
    const liquidita = props.situazione.current?.liquidity;
    if (liquidita === null || liquidita === undefined) return { tono: 'neutro', testo: 'Aggiungi il saldo del tuo conto: WALLT ti dirà se i soldi bastano.' };
    return Number(liquidita) >= Number(riepilogo.value.uscite)
      ? { tono: 'bene', testo: `Sui tuoi conti hai ${formattaEuro(liquidita)}: più di quanto devi pagare.` }
      : { tono: 'attenzione', testo: `Sui tuoi conti hai ${formattaEuro(liquidita)}: meno di quanto devi pagare.` };
  }
  if (resta < 0) return { tono: 'male', testo: `I soldi non bastano per pagare tutto: mancano circa ${formattaEuro(Math.abs(resta))}.` };
  return { tono: 'bene', testo: `I soldi bastano. Dopo aver pagato tutto ti restano circa ${formattaEuro(resta)} da spendere.` };
});
</script>

<template>
  <WCard class="prossimi">
    <div>
      <p class="etichetta">Nei prossimi 30 giorni devi pagare</p>
      <strong class="numero">{{ formattaEuro(riepilogo.uscite) }}</strong>
      <p v-if="riepilogo.numeroUscite" class="sotto">
        {{ riepilogo.numeroUscite === 1 ? '1 pagamento' : `${riepilogo.numeroUscite} pagamenti` }}<template v-if="Number(riepilogo.entrate) > 0">, e ti arrivano {{ formattaEuro(riepilogo.entrate) }}</template>
      </p>
    </div>
    <StatoRiga :tono="stato.tono" :testo="stato.testo" />
  </WCard>

  <WCard class="blocco">
    <h2>Cosa arriva e quando</h2>
    <!-- Una settimana per scheda, da scorrere di lato: trenta giorni in una
         sola colonna erano una lista lunga da leggere tutta. -->
    <template v-if="timeline.length">
      <div class="settimane" role="region" aria-label="Pagamenti e entrate, settimana per settimana" tabindex="0">
        <section v-for="gruppo in gruppi" :key="gruppo.chiave" class="settimana">
          <h3>{{ gruppo.titolo }}</h3>
          <ul v-if="gruppo.righe.length" class="righe">
            <li v-for="item in gruppo.righe" :key="item.occurrenceKey" :class="`riga--${item.direction}`">
              <span>{{ item.description || (item.direction === 'entrata' ? 'Soldi in arrivo' : 'Pagamento') }} <small>{{ dataBreve(item.dueDate) }}</small></span>
              <strong>{{ item.direction === 'entrata' ? '+' : '' }}{{ formattaEuro(item.amount) }}</strong>
            </li>
          </ul>
          <p v-else class="vuota">Niente in questa settimana.</p>
        </section>
      </div>
      <p class="testo testo--tenue suggerimento">Scorri di lato per vedere le altre settimane.</p>
    </template>
    <p v-else class="testo testo--tenue">Segna qui affitto, bollette e abbonamenti: WALLT li terrà da parte per te.</p>
    <RouterLink to="/funzionalita/situazione/programmate" class="aggiungi">+ Aggiungi un pagamento</RouterLink>
  </WCard>
</template>

<style scoped>
.prossimi { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
.etichetta { margin: 0; color: var(--text-secondary); font-size: var(--text-base); }
.numero { display: block; margin: .15rem 0; color: var(--text-primary); font-size: 3rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
.sotto { margin: 0; color: var(--text-primary); font-size: var(--text-lg); line-height: 1.5; }
.blocco { display: flex; flex-direction: column; gap: .75rem; margin-bottom: 1rem; }
h2 { margin: 0; color: var(--text-primary); font-size: 1.2rem; }
h3 { margin: 0 0 .25rem; color: var(--text-secondary); font-size: var(--text-sm); font-weight: 600; }
.testo { margin: 0; font-size: var(--text-base); line-height: 1.55; }
.testo--tenue { color: var(--text-secondary); }
.settimane { display: flex; gap: .75rem; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; padding-bottom: .25rem; scrollbar-width: thin; }
.settimane:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 2px; }
.settimana { flex: 0 0 min(85%, 300px); scroll-snap-align: start; padding: .75rem; border: 1px solid var(--divider); border-radius: var(--radius-md); }
.righe { margin: 0; padding: 0; list-style: none; }
.righe li { display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; padding: .45rem 0; border-bottom: 1px solid var(--divider); font-size: var(--text-sm); color: var(--text-primary); }
.righe li:last-child { border-bottom: 0; }
.righe span { min-width: 0; overflow-wrap: anywhere; }
.righe small { display: block; color: var(--text-secondary); font-size: var(--text-xs); }
.righe strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
.riga--entrata strong { color: var(--positive); }
.vuota { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); }
.suggerimento { font-size: var(--text-xs); }
.aggiungi { align-self: flex-start; min-height: 44px; display: inline-flex; align-items: center; color: var(--accent-text); font-size: var(--text-base); font-weight: 600; text-underline-offset: 3px; }
</style>
