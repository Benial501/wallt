<script setup>
import { computed } from 'vue';
import WCard from '@/components/common/WCard.vue';
import StatoRiga from '@/components/situazione/StatoRiga.vue';
import { GLOSSARIO } from '@/content/glossario';
import { getCategoriaUscita } from '@/utils/categorie';
import { formattaEuro } from '@/utils/pianoSmart';
import { confrontoTrentaGiorni, vociPrincipali } from '@/utils/situazioneSemplice';

/**
 * Analisi, in forma semplice: «come sto andando?». Quanto hai speso questo
 * mese, se più o meno di prima, in cosa spendi di più e quanto ti copre il
 * fondo di emergenza. Medie e timeline restano nei
 * dettagli della vista.
 */
const props = defineProps({
  situazione: { type: Object, required: true },
});

const speso = computed(() => props.situazione.monthProgress?.expenses ?? null);
const confronto = computed(() => confrontoTrentaGiorni(props.situazione.changes));
const voci = computed(() => vociPrincipali(props.situazione.frequentExpenses));
const fondo = computed(() => props.situazione.financialDirection?.emergencyFund ?? null);
const nomeCategoria = (id) => getCategoriaUscita(id)?.nome ?? 'Altro';

const stato = computed(() => {
  if (!confronto.value) return { tono: 'neutro', testo: 'Fra qualche settimana WALLT ti dirà se stai spendendo più o meno di prima.' };
  const { delta } = confronto.value;
  if (delta > 0) return { tono: 'attenzione', testo: `Negli ultimi 30 giorni hai speso ${formattaEuro(delta)} in più rispetto ai 30 giorni prima.` };
  if (delta < 0) return { tono: 'bene', testo: `Negli ultimi 30 giorni hai speso ${formattaEuro(Math.abs(delta))} in meno rispetto ai 30 giorni prima.` };
  return { tono: 'bene', testo: 'Negli ultimi 30 giorni hai speso come nei 30 giorni prima.' };
});

const mesiCopertura = computed(() => {
  const mesi = fondo.value?.coverageMonths;
  if (mesi === null || mesi === undefined) return null;
  const n = Math.floor(Number(mesi) * 10) / 10;
  return Number.isFinite(n) ? n : null;
});
</script>

<template>
  <WCard class="analisi">
    <div>
      <p class="etichetta">Questo mese hai speso</p>
      <strong class="numero">{{ formattaEuro(speso) }}</strong>
    </div>
    <StatoRiga :tono="stato.tono" :testo="stato.testo" />
  </WCard>

  <WCard class="blocco">
    <h2>In cosa spendi di più</h2>
    <template v-if="voci.principali.length">
      <p class="testo testo--tenue">Quanto spendi in media ogni mese.</p>
      <div v-for="voce in voci.principali" :key="voce.category" class="voce">
        <div class="voce__riga"><span>{{ voce.name }}</span><strong>{{ formattaEuro(voce.average) }}</strong></div>
        <div class="barra" aria-hidden="true"><i :style="{ width: `${voce.percentuale}%`, background: voce.color || 'var(--accent-green)' }" /></div>
      </div>
      <p v-if="voci.resto" class="testo testo--tenue">Il resto: {{ formattaEuro(voci.resto.totale) }} {{ voci.resto.voci === 1 ? 'in un’altra voce' : `in altre ${voci.resto.voci} voci` }}.</p>
    </template>
    <p v-else class="testo testo--tenue">Lo vedrai dopo il primo mese completo di spese.</p>
  </WCard>

  <WCard v-if="confronto && confronto.categorie.length" class="blocco">
    <h2>Cosa è cambiato</h2>
    <ul class="cambi">
      <li v-for="voce in confronto.categorie" :key="voce.category">
        <span class="freccia" :class="Number(voce.delta) > 0 ? 'freccia--su' : 'freccia--giu'" aria-hidden="true">{{ Number(voce.delta) > 0 ? '↑' : '↓' }}</span>
        {{ nomeCategoria(voce.category) }}: {{ formattaEuro(Math.abs(Number(voce.delta))) }} {{ Number(voce.delta) > 0 ? 'in più' : 'in meno' }} rispetto ai 30 giorni prima
      </li>
    </ul>
  </WCard>

  <WCard class="blocco">
    <h2>{{ GLOSSARIO.fondo_emergenza.etichetta }}</h2>
    <template v-if="fondo && fondo.current !== null && fondo.current !== undefined">
      <p class="testo">
        Hai messo da parte <strong>{{ formattaEuro(fondo.current) }}</strong> per gli imprevisti.
        <template v-if="mesiCopertura !== null">Basterebbero per circa <strong>{{ mesiCopertura === 1 ? '1 mese' : `${String(mesiCopertura).replace('.', ',')} mesi` }}</strong> di spese necessarie.</template>
      </p>
      <p v-if="fondo.target !== null && fondo.target !== undefined" class="testo testo--tenue">L’obiettivo è {{ formattaEuro(fondo.target) }}.</p>
    </template>
    <template v-else>
      <p class="testo">Un conto a parte per gli imprevisti: una spesa improvvisa non ti mette in difficoltà.</p>
      <RouterLink to="/fondo-emergenza" class="aggiungi">Crea il fondo di emergenza</RouterLink>
    </template>
  </WCard>
</template>

<style scoped>
.analisi { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
.etichetta { margin: 0; color: var(--text-secondary); font-size: var(--text-base); }
.numero { display: block; margin: .15rem 0; color: var(--text-primary); font-size: 3rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
.blocco { display: flex; flex-direction: column; gap: .75rem; margin-bottom: 1rem; }
h2 { margin: 0; color: var(--text-primary); font-size: 1.2rem; }
.testo { margin: 0; color: var(--text-primary); font-size: var(--text-base); line-height: 1.6; }
.testo--tenue { color: var(--text-secondary); font-size: var(--text-sm); }
.voce__riga { display: flex; justify-content: space-between; gap: 1rem; font-size: var(--text-base); color: var(--text-primary); }
.voce__riga strong { font-variant-numeric: tabular-nums; }
.barra { height: .6rem; margin-top: .35rem; overflow: hidden; border-radius: 999px; background: var(--surface-inset); }
.barra i { display: block; height: 100%; border-radius: inherit; }
.cambi { display: grid; gap: .55rem; margin: 0; padding: 0; list-style: none; font-size: var(--text-base); color: var(--text-primary); line-height: 1.5; }
.freccia { display: inline-block; width: 1.2rem; font-weight: 700; }
.freccia--su { color: var(--negative); }
.freccia--giu { color: var(--positive); }
.aggiungi { align-self: flex-start; min-height: 44px; display: inline-flex; align-items: center; color: var(--accent-text); font-size: var(--text-base); font-weight: 600; text-underline-offset: 3px; }
</style>
