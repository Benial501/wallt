<script setup>
import { computed } from 'vue';
import WCard from '@/components/common/WCard.vue';
import { passiIniziali } from '@/utils/situazioneSemplice';

/**
 * La pagina d'avvio per chi non ha ancora registrato nulla. Al posto di
 * numeri vuoti dice a cosa serve la scheda e cosa fare per vederla
 * funzionare, con un solo pulsante grande sul primo passo da fare.
 */
const props = defineProps({
  situazione: { type: Object, default: null },
  scheda: { type: String, default: 'today' },
});

const TESTI = {
  today: { titolo: 'Qui vedrai quanto puoi spendere', testo: 'WALLT tiene conto delle spese che devi ancora pagare e ti dice quanti soldi puoi usare, giorno per giorno.' },
  upcoming: { titolo: 'Qui vedrai cosa devi pagare', testo: 'Affitto, bollette, abbonamenti: WALLT li mette in fila e ti dice se i soldi bastano per pagarli tutti.' },
  analysis: { titolo: 'Qui vedrai dove vanno i tuoi soldi', testo: 'Dopo le prime spese WALLT ti mostra in cosa spendi di più e se stai spendendo più o meno di prima.' },
};

const testi = computed(() => TESTI[props.scheda] ?? TESTI.today);
const passi = computed(() => passiIniziali(props.situazione));
const mancanti = computed(() => passi.value.filter((passo) => !passo.fatto).length);
const prossimo = computed(() => passi.value.find((passo) => !passo.fatto) ?? passi.value[0]);
</script>

<template>
  <WCard class="inizio">
    <h2 class="inizio__titolo">{{ testi.titolo }}</h2>
    <p class="inizio__testo">{{ testi.testo }}</p>
    <RouterLink :to="prossimo.to" class="inizio__azione">{{ prossimo.testo }}</RouterLink>

    <div class="inizio__passi">
      <p class="inizio__conta">{{ mancanti === 1 ? 'Ti manca 1 passo' : `Ti mancano ${mancanti} passi` }}</p>
      <ol>
        <li v-for="passo in passi" :key="passo.chiave" :class="{ fatto: passo.fatto }">
          <span class="segno" aria-hidden="true">{{ passo.fatto ? '✓' : '' }}</span>
          <RouterLink v-if="!passo.fatto" :to="passo.to">{{ passo.testo }}</RouterLink>
          <span v-else>{{ passo.testo }} <span class="sr-only">(fatto)</span></span>
        </li>
      </ol>
    </div>
  </WCard>
</template>

<style scoped>
.inizio { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
.inizio__titolo { margin: 0; color: var(--text-primary); font-size: 1.5rem; line-height: 1.25; }
.inizio__testo { margin: 0; color: var(--text-secondary); font-size: var(--text-base); line-height: 1.6; }
.inizio__azione { display: flex; align-items: center; justify-content: center; min-height: 52px; padding: .75rem 1rem; border-radius: var(--radius-md); background: var(--accent-green); color: var(--accent-on); font-size: var(--text-base); font-weight: 700; text-align: center; text-decoration: none; }
.inizio__azione:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 3px; }
.inizio__passi { border-top: 1px solid var(--divider); padding-top: 1rem; }
.inizio__conta { margin: 0 0 .5rem; color: var(--text-primary); font-weight: 600; }
.inizio ol { display: grid; gap: .6rem; margin: 0; padding: 0; list-style: none; }
.inizio li { display: flex; align-items: center; gap: .65rem; font-size: var(--text-base); color: var(--text-primary); }
.inizio li a { color: var(--accent-text); text-underline-offset: 3px; }
.inizio li.fatto { color: var(--text-secondary); }
.segno { display: grid; place-items: center; flex: 0 0 1.5rem; height: 1.5rem; border: 2px solid var(--divider); border-radius: 50%; font-size: var(--text-xs); font-weight: 700; }
.fatto .segno { border-color: var(--positive); background: var(--positive); color: var(--positive-on); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
</style>
