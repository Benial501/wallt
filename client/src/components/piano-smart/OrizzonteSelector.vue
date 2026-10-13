<script setup>
import { computed, ref, watch } from 'vue';
import {
  ETICHETTE_ORIZZONTE, ORIZZONTE_MESI_MAX, RISERVA_MESI_MIN, RISERVA_MESI_MAX,
} from '@/utils/pianoSmart';

const props = defineProps({
  tipo: { type: String, default: 'mensile' },
  dataFine: { type: String, default: null },
  mesiRiserva: { type: Number, default: 1 },
  // Il giudizio del server sulla stabilità delle entrate ('ricorrente' /
  // 'irregolare'): decide se i mesi di riserva contano davvero, ma il
  // controllo resta visibile in entrambi i casi — non è lui a far
  // comparire o sparire un comando.
  incomeMode: { type: String, default: 'ricorrente' },
  // Il giudizio del server sulla stabilità delle entrate diventa una frase
  // visibile, non un criterio che decide in silenzio quali controlli esistono.
  suggerisciData: { type: Boolean, default: false },
  salvataggioInCorso: { type: Boolean, default: false },
});
const emit = defineEmits(['cambia']);

const aperto = ref(false);
const dataScelta = ref(props.dataFine ?? '');

// L'orizzonte può cambiare altrove (un altro pannello, un refresh della
// situazione): senza questo watch il campo data resta sull'ultimo valore
// digitato anche quando non è più coerente con `dataFine`.
watch(() => props.dataFine, (nuovaData) => {
  dataScelta.value = nuovaData ?? '';
});

const entrateIrregolari = computed(() => props.incomeMode === 'irregolare');

const minima = computed(() => {
  const domani = new Date(Date.now() + 86400000);
  return domani.toISOString().slice(0, 10);
});
const massima = computed(() => {
  const limite = new Date();
  limite.setUTCMonth(limite.getUTCMonth() + ORIZZONTE_MESI_MAX);
  return limite.toISOString().slice(0, 10);
});
// L'orizzonte arriva a ORIZZONTE_MESI_MAX mesi: "fino al 30 giugno" è
// ambiguo quando non è l'anno corrente. L'anno compare solo quando serve.
const dataLunga = (iso) => {
  const data = new Date(`${iso}T12:00:00Z`);
  const opzioni = { day: 'numeric', month: 'long', timeZone: 'UTC' };
  if (data.getUTCFullYear() !== new Date().getUTCFullYear()) opzioni.year = 'numeric';
  return new Intl.DateTimeFormat('it-IT', opzioni).format(data);
};
const etichettaCorrente = computed(() => (props.tipo === 'data' && props.dataFine
  ? `fino al ${dataLunga(props.dataFine)}`
  : ETICHETTE_ORIZZONTE.mensile.toLowerCase()));

const scegliMensile = () => {
  emit('cambia', { orizzonte_tipo: 'mensile', orizzonte_data: null });
  aperto.value = false;
};
const scegliData = () => {
  if (!dataScelta.value) return;
  emit('cambia', { orizzonte_tipo: 'data', orizzonte_data: dataScelta.value });
  aperto.value = false;
};
const cambiaMesi = (event) => {
  const months = Number(event.target.value);
  if (Number.isInteger(months) && months >= RISERVA_MESI_MIN && months <= RISERVA_MESI_MAX) {
    emit('cambia', { mesi_riserva_piano_smart: months });
  }
};
</script>

<template>
  <div class="orizzonte">
    <button
      type="button" class="orizzonte__trigger" :aria-expanded="aperto"
      @click="aperto = !aperto"
    >Orizzonte: {{ etichettaCorrente }}</button>

    <div v-if="aperto" class="orizzonte__pannello">
      <p v-if="suggerisciData" class="orizzonte__suggerimento">
        Le tue entrate risultano irregolari negli ultimi tre mesi: l’orizzonte a
        data potrebbe descriverti meglio.
      </p>

      <fieldset class="orizzonte__opzione">
        <legend>{{ ETICHETTE_ORIZZONTE.mensile }}</legend>
        <p>Le tue entrate si rinnovano ogni mese: il budget riparte col mese.</p>
        <label for="orizzonte-mesi">Mesi di spese da proteggere</label>
        <select
          id="orizzonte-mesi" :value="mesiRiserva"
          :disabled="salvataggioInCorso || !entrateIrregolari" @change="cambiaMesi"
        >
          <option v-for="m in RISERVA_MESI_MAX" :key="m" :value="m">{{ m }} {{ m === 1 ? 'mese' : 'mesi' }}</option>
        </select>
        <p v-if="!entrateIrregolari" class="orizzonte__nota">
          I mesi di riserva contano solo con entrate irregolari.
        </p>
        <button
          type="button" :disabled="tipo === 'mensile' || salvataggioInCorso"
          @click="scegliMensile"
        >Usa il ciclo mensile</button>
      </fieldset>

      <fieldset class="orizzonte__opzione">
        <legend>{{ ETICHETTE_ORIZZONTE.data }}</legend>
        <p>Il capitale deve bastare fino al giorno che scegli.</p>
        <label for="orizzonte-data">Fino al</label>
        <input
          id="orizzonte-data" v-model="dataScelta" type="date"
          :min="minima" :max="massima" :disabled="salvataggioInCorso"
        >
        <button
          type="button" :disabled="!dataScelta || salvataggioInCorso"
          @click="scegliData"
        >Usa questa data</button>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.orizzonte { position: relative; width: 100%; text-align: left; }
.orizzonte__trigger {
  min-height: 44px; padding: .5rem .9rem; border: 1px solid var(--divider);
  border-radius: 999px; background: color-mix(in srgb, var(--surface) 72%, transparent);
  color: var(--text-secondary); font: inherit; font-size: var(--text-xs);
  cursor: pointer;
}
.orizzonte__trigger:hover, .orizzonte__trigger:focus-visible { border-color: var(--accent-green); color: var(--text-primary); }
.orizzonte__trigger:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 2px; }
.orizzonte__trigger[aria-expanded="true"] { color: var(--text-primary); border-color: var(--accent-green); }

.orizzonte__pannello {
  display: flex; flex-direction: column; gap: .75rem; width: 100%;
  margin-top: .5rem; padding: .85rem; border: 1px solid var(--divider);
  border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface) 72%, transparent);
}
.orizzonte__suggerimento { margin: 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; }

.orizzonte__opzione {
  display: flex; flex-direction: column; gap: .4rem; border: 0; margin: 0; padding: 0;
  padding-top: .6rem; border-top: 1px solid var(--divider);
}
.orizzonte__opzione:first-of-type { padding-top: 0; border-top: 0; }
.orizzonte__opzione legend {
  padding: 0; color: var(--text-primary); font-size: var(--text-sm); font-weight: 600;
}
.orizzonte__opzione p { margin: 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; }
.orizzonte__opzione label { color: var(--text-primary); font-size: var(--text-xs); font-weight: 600; }
.orizzonte__nota { margin: 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.4; }
.orizzonte__opzione select, .orizzonte__opzione input {
  width: 100%; min-height: 44px; padding: .5rem .65rem; border: 1px solid var(--border);
  border-radius: var(--radius-sm); background: var(--surface); color: var(--text-primary); font: inherit;
}
.orizzonte__opzione select:focus-visible, .orizzonte__opzione input:focus-visible {
  outline: 2px solid var(--accent-green); outline-offset: 2px;
}
.orizzonte__opzione button {
  min-height: 44px; padding: .5rem .85rem; border: 1px solid var(--border);
  border-radius: var(--radius-md); background: var(--surface-subtle); color: var(--text-primary);
  font: inherit; font-weight: 600; cursor: pointer;
}
.orizzonte__opzione button:hover:not(:disabled), .orizzonte__opzione button:focus-visible {
  border-color: var(--accent-green);
}
.orizzonte__opzione button:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 2px; }
.orizzonte__opzione button:disabled { opacity: .55; cursor: default; }
</style>
