<script setup>
/**
 * Scelta del modello del budget: si vede la prima volta e da «Cambia modello».
 *
 * Il modello consigliato arriva dal server (dal profilo dell'onboarding) ed è
 * preselezionato, mai imposto. Il piano vale per ogni mese finché l'utente
 * non lo cambia. L'entrata è quella del profilo: modificarla qui cambia quella.
 */
import { ref, computed, watch } from 'vue';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import { useValuta } from '@/composables/useValuta';
import { GLOSSARIO } from '@/content/glossario';
import { NOMI_MODELLI, DESCRIZIONI_MODELLI, fraseMotivoModello } from '@/content/budgetConsigli';
import { VOCI, MODELLO_PERSONALIZZATO, percentualiValide } from '@/utils/budget';
import { coloreVoce } from '@/components/budget/coloriVoci';

const props = defineProps({
  modelli: { type: Array, default: () => [] },
  consigliato: { type: Object, default: null },
  entrata: { type: Number, default: null },
  pianoAttuale: { type: Object, default: null },
  salvando: { type: Boolean, default: false },
});
const emit = defineEmits(['scegli', 'modifica-entrata', 'annulla']);

const { formatValuta } = useValuta();

const selezionato = ref(props.pianoAttuale?.modello || props.consigliato?.modello || 'equilibrato');
const personalizzate = ref({
  ...(props.pianoAttuale?.modello === MODELLO_PERSONALIZZATO
    ? props.pianoAttuale.percentuali
    : { bisogni: 50, desideri: 30, futuro: 20 }),
});

// Se il consigliato arriva dopo il primo disegno, la preselezione lo segue
// finché l'utente non ha scelto niente.
watch(() => props.consigliato?.modello, (modello) => {
  if (modello && !props.pianoAttuale) selezionato.value = modello;
});

const haEntrata = computed(() => props.entrata > 0);
const modificaEntrata = ref(!haEntrata.value);
const entrataInserita = ref(props.entrata || null);
watch(() => props.entrata, (valore) => {
  entrataInserita.value = valore || null;
  modificaEntrata.value = !(valore > 0);
});

const salvaEntrata = () => {
  const importo = Number(entrataInserita.value);
  if (!(importo > 0)) return;
  emit('modifica-entrata', importo);
};

const modelliOrdinati = computed(() => {
  const consigliato = props.consigliato?.modello;
  return [...props.modelli].sort((a, b) => (b.id === consigliato) - (a.id === consigliato));
});

const sommaPersonalizzata = computed(() => VOCI.reduce((s, v) => s + (Number(personalizzate.value[v]) || 0), 0));
const personalizzateNumeri = computed(() => VOCI.reduce((acc, v) => ({ ...acc, [v]: Number(personalizzate.value[v]) }), {}));
const personalizzateValide = computed(() => percentualiValide(personalizzateNumeri.value));

const importoStimato = (percentuale) => (haEntrata.value ? Math.round(props.entrata * percentuale) / 100 : null);

const puoSalvare = computed(() => haEntrata.value
  && (selezionato.value !== MODELLO_PERSONALIZZATO || personalizzateValide.value));

const conferma = () => {
  if (!puoSalvare.value) return;
  emit('scegli', selezionato.value === MODELLO_PERSONALIZZATO
    ? { modello: MODELLO_PERSONALIZZATO, percentuali: personalizzateNumeri.value }
    : { modello: selezionato.value });
};

const etichettaVoce = (voce) => GLOSSARIO[`budget_${voce}`].etichetta;
</script>

<template>
  <div class="scelta">
    <h1 class="scelta__titolo">Come dividere i tuoi soldi</h1>
    <p class="scelta__sottotitolo">Scegli un modello: vale per ogni mese finché non lo cambi.</p>

    <WCard class="scelta__entrata" padding="1rem">
      <template v-if="!modificaEntrata">
        <div class="scelta__entrata-riga">
          <div>
            <p class="scelta__etichetta">Entrata mensile</p>
            <p class="scelta__entrata-valore">{{ formatValuta(entrata) }}</p>
          </div>
          <button type="button" class="scelta__link" @click="modificaEntrata = true">Modifica</button>
        </div>
      </template>
      <form v-else class="scelta__entrata-modulo" @submit.prevent="salvaEntrata">
        <label class="scelta__etichetta" for="budget-entrata">Quanto entra ogni mese, al netto?</label>
        <div class="scelta__entrata-campi">
          <input
            id="budget-entrata"
            v-model.number="entrataInserita"
            type="number" min="1" step="0.01" inputmode="decimal"
            class="form-input scelta__entrata-input"
            placeholder="Per esempio 1500"
          />
          <WButton type="submit" variant="secondary" size="md" :loading="salvando" :disabled="!(entrataInserita > 0)">
            Salva
          </WButton>
        </div>
        <p class="scelta__nota">È la stessa entrata del tuo profilo: gli importi di ogni voce si calcolano da qui.</p>
      </form>
    </WCard>

    <div class="scelta__modelli" role="radiogroup" aria-label="Modello di budget">
      <button
        v-for="modello in modelliOrdinati"
        :key="modello.id"
        type="button"
        role="radio"
        :aria-checked="selezionato === modello.id"
        class="scelta__modello"
        :class="{ 'scelta__modello--scelto': selezionato === modello.id }"
        @click="selezionato = modello.id"
      >
        <span v-if="consigliato && consigliato.modello === modello.id" class="scelta__chip">Consigliato per te</span>
        <span class="scelta__modello-testa">
          <span class="scelta__modello-nome">{{ NOMI_MODELLI[modello.id] }}</span>
          <span v-if="modello.percentuali" class="scelta__modello-pct">
            {{ modello.percentuali.bisogni }} / {{ modello.percentuali.desideri }} / {{ modello.percentuali.futuro }}
          </span>
          <span v-else class="scelta__modello-pct">scegli tu</span>
        </span>
        <span class="scelta__modello-testo">
          {{ consigliato && consigliato.modello === modello.id ? fraseMotivoModello(consigliato.motivo) : DESCRIZIONI_MODELLI[modello.id] }}
        </span>
        <template v-if="selezionato === modello.id && modello.percentuali">
          <span class="scelta__barra" aria-hidden="true">
            <span v-for="voce in VOCI" :key="voce" :style="{ flex: modello.percentuali[voce], background: coloreVoce(voce) }" />
          </span>
          <span v-if="modello.importi" class="scelta__importi">
            <span v-for="voce in VOCI" :key="voce">
              {{ etichettaVoce(voce) }}<b>{{ formatValuta(modello.importi[voce]) }}</b>
            </span>
          </span>
        </template>
      </button>
    </div>

    <WCard v-if="selezionato === MODELLO_PERSONALIZZATO" class="scelta__personalizza" padding="1rem">
      <div v-for="voce in VOCI" :key="voce" class="scelta__pct-riga">
        <label :for="`pct-${voce}`" class="scelta__pct-nome">
          <span class="scelta__punto" :style="{ background: coloreVoce(voce) }" aria-hidden="true" />
          {{ etichettaVoce(voce) }}
        </label>
        <input
          :id="`pct-${voce}`"
          v-model.number="personalizzate[voce]"
          type="number" min="0" max="100" step="1" inputmode="numeric"
          class="form-input scelta__pct-input"
        />
        <span class="scelta__pct-segno">%</span>
        <span class="scelta__pct-importo">
          {{ importoStimato(Number(personalizzate[voce]) || 0) !== null ? formatValuta(importoStimato(Number(personalizzate[voce]) || 0)) : '' }}
        </span>
      </div>
      <p class="scelta__somma" :class="{ 'scelta__somma--errore': !personalizzateValide }" role="status">
        {{ personalizzateValide ? 'Le tre voci fanno 100%.' : `Le tre voci fanno ${sommaPersonalizzata}%: devono fare 100, con numeri interi.` }}
      </p>
    </WCard>

    <div class="scelta__azioni">
      <WButton v-if="pianoAttuale" variant="secondary" size="md" @click="emit('annulla')">Annulla</WButton>
      <WButton variant="primary" size="md" :loading="salvando" :disabled="!puoSalvare" @click="conferma">
        Usa questo modello
      </WButton>
    </div>
    <p v-if="!haEntrata" class="scelta__nota scelta__nota--centro">Indica prima la tua entrata mensile.</p>
    <p class="scelta__nota scelta__nota--centro">
      {{ etichettaVoce('bisogni') }}: ciò che devi pagare · {{ etichettaVoce('desideri') }}: ciò che scegli di spendere ·
      {{ etichettaVoce('futuro') }}: ciò che metti da parte
    </p>
  </div>
</template>

<style scoped>
.scelta { max-width: 560px; margin: 0 auto; }
.scelta__titolo { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem; }
.scelta__sottotitolo { color: var(--text-secondary); margin-bottom: 1rem; }
.scelta__entrata { margin-bottom: 1rem; }
.scelta__entrata-riga { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
.scelta__etichetta { font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 0.25rem; display: block; }
.scelta__entrata-valore { font-size: 1.375rem; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.scelta__link { background: none; border: 0; color: var(--accent-text); font: inherit; font-weight: 600; cursor: pointer; padding: 0.25rem; }
.scelta__entrata-campi { display: flex; gap: 0.5rem; align-items: center; }
/* 16px: sotto questa soglia iOS ingrandisce la pagina appena il campo prende il fuoco. */
.scelta__entrata-input { flex: 1; font-size: 16px; }
.scelta__nota { font-size: var(--text-xs); color: var(--text-muted); margin-top: 0.5rem; line-height: 1.45; }
.scelta__nota--centro { text-align: center; }
.scelta__modelli { display: flex; flex-direction: column; gap: 0.625rem; margin-bottom: 1rem; }
.scelta__modello {
  display: flex; flex-direction: column; gap: 0.375rem; width: 100%; text-align: left;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; padding: 0.875rem 1rem;
  color: inherit; font: inherit; cursor: pointer;
}
.scelta__modello--scelto { border: 2px solid var(--accent-text); background: var(--accent-light); padding: calc(0.875rem - 1px) calc(1rem - 1px); }
.scelta__modello:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.scelta__chip {
  align-self: flex-start; font-size: var(--text-xs); font-weight: 600; color: var(--accent-text);
  background: var(--accent-light); border-radius: 999px; padding: 0.125rem 0.625rem;
}
.scelta__modello-testa { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
.scelta__modello-nome { font-weight: 700; color: var(--text-primary); }
.scelta__modello-pct { font-size: var(--text-xs); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.scelta__modello-testo { font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.45; }
.scelta__barra { display: flex; gap: 2px; height: 8px; border-radius: 4px; overflow: hidden; margin-top: 0.25rem; }
.scelta__importi { display: grid; grid-template-columns: repeat(3, 1fr); font-size: var(--text-xs); color: var(--text-secondary); }
.scelta__importi span { display: flex; flex-direction: column; }
.scelta__importi b { color: var(--text-primary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.scelta__personalizza { margin-bottom: 1rem; }
.scelta__pct-riga { display: grid; grid-template-columns: 1fr 72px 16px minmax(84px, auto); align-items: center; gap: 0.5rem; padding: 0.375rem 0; }
.scelta__pct-nome { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--text-primary); }
.scelta__punto { width: 10px; height: 10px; border-radius: 50%; }
/* 16px per lo stesso motivo del campo dell'entrata. */
.scelta__pct-input { font-size: 16px; padding: 0.375rem 0.5rem; text-align: right; }
.scelta__pct-segno { color: var(--text-muted); font-size: var(--text-xs); }
.scelta__pct-importo { font-size: var(--text-xs); color: var(--text-secondary); text-align: right; font-variant-numeric: tabular-nums; }
.scelta__somma { font-size: var(--text-xs); color: var(--positive); margin-top: 0.5rem; }
.scelta__somma--errore { color: var(--negative); }
.scelta__azioni { display: flex; justify-content: flex-end; gap: 0.75rem; }
</style>
