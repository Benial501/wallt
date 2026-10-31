<script setup>
import { computed, ref } from 'vue';
import dayjs from 'dayjs';
import WButton from '@/components/common/WButton.vue';
import ServizioIcona from './ServizioIcona.vue';
import ServizioPicker from './ServizioPicker.vue';
import { formatData, formatValuta } from '@/utils/formatters';
import {
  DURATA_MESI_MAX, ORIGINI, PERIODI_MESI, calcolaCosti,
} from '@/utils/abbonamenti';

// Il contenuto del modulo, senza finestra né chiamate: riceve l'abbonamento e
// dichiara le scelte, e a salvare ci pensa AbbonamentiSezione.
const props = defineProps({
  abbonamento: { type: Object, default: null },
  valuta: { type: String, default: 'EUR' },
  occupato: { type: Boolean, default: false },
});

const emit = defineEmits(['salva', 'annulla', 'escludi', 'vai-programmate']);

const ETICHETTE_PERIODO = {
  1: 'Mese', 3: '3 mesi', 6: '6 mesi', 12: 'Anno',
};

const a = props.abbonamento;
const inModifica = Boolean(a);
const trovato = a?.origine === ORIGINI.RILEVATO;

const form = ref({
  servizio_id: a?.servizio_id ?? null,
  icona: a?.icona ?? null,
  nome: a?.nome ?? '',
  costo: a?.costo ?? null,
  periodo_mesi: a?.periodo_mesi ?? 1,
  aTempo: a?.durata_mesi != null,
  durata_mesi: a?.durata_mesi ?? 3,
  data_inizio: a?.data_inizio ?? a?.ultimo_addebito_data ?? dayjs().format('YYYY-MM-DD'),
});
const mostraIcone = ref(!inModifica);

const scegliServizio = (voce) => {
  form.value.servizio_id = voce.id;
  form.value.icona = voce.id;
  form.value.nome = voce.nome;
};

const scegliGenerica = (voce) => {
  form.value.servizio_id = null;
  form.value.icona = voce.id;
};

const durataValida = computed(() => {
  if (!form.value.aTempo) return true;
  const mesi = Number(form.value.durata_mesi);
  return Number.isInteger(mesi) && mesi >= 1 && mesi <= DURATA_MESI_MAX && Boolean(form.value.data_inizio);
});

const costoValido = computed(() => Number(form.value.costo) > 0);
const puoSalvare = computed(() => form.value.nome.trim().length > 0 && costoValido.value && durataValida.value);

// Lo stesso conto che farà il server, mostrato prima del salvataggio.
const anteprima = computed(() => {
  if (!costoValido.value || !durataValida.value) return null;
  const costi = calcolaCosti({
    costo: form.value.costo,
    periodo_mesi: form.value.periodo_mesi,
    durata_mesi: form.value.aTempo ? Number(form.value.durata_mesi) : null,
  });
  return {
    totale: costi.in_totale === null ? null : formatValuta(costi.in_totale / 100, props.valuta),
    anno: formatValuta(costi.in_un_anno / 100, props.valuta),
  };
});

const salva = () => {
  if (!puoSalvare.value) return;
  emit('salva', {
    servizio_id: form.value.servizio_id,
    icona: form.value.icona,
    nome: form.value.nome.trim(),
    costo: Number(form.value.costo).toFixed(2),
    periodo_mesi: form.value.periodo_mesi,
    durata_mesi: form.value.aTempo ? Number(form.value.durata_mesi) : null,
    data_inizio: form.value.aTempo ? form.value.data_inizio : null,
  });
};
</script>

<template>
  <form class="abbonamento-form" @submit.prevent="salva">
    <div v-if="trovato && a.ultimo_addebito_data" class="abbonamento-form__trovato">
      <ServizioIcona :icona="form.icona" :nome="form.nome" :size="36" />
      <p>
        <strong>Trovato nelle tue transazioni</strong>
        Ultimo addebito {{ formatData(a.ultimo_addebito_data, 'medio') }}, {{ formatValuta(a.ultimo_addebito_importo, valuta) }}.
        <template v-if="a.da_verificare">Controlla che la durata sia giusta.</template>
      </p>
    </div>

    <div v-if="inModifica" class="abbonamento-form__icona-attuale">
      <ServizioIcona v-if="!trovato" :icona="form.icona" :nome="form.nome" :size="36" />
      <button type="button" class="abbonamento-form__testuale" @click="mostraIcone = !mostraIcone">
        {{ mostraIcone ? 'Nascondi le icone' : 'Cambia icona' }}
      </button>
    </div>

    <div v-if="mostraIcone" class="abbonamento-form__campo">
      <span v-if="!inModifica" class="abbonamento-form__etichetta">Scegli il servizio</span>
      <ServizioPicker :icona="form.icona" @scegli-servizio="scegliServizio" @scegli-generica="scegliGenerica" />
    </div>

    <div class="abbonamento-form__due">
      <div class="abbonamento-form__campo">
        <label class="abbonamento-form__etichetta" for="abbonamento-nome">Nome</label>
        <input id="abbonamento-nome" v-model="form.nome" class="form-input" type="text" maxlength="100" autocomplete="off" />
      </div>
      <div class="abbonamento-form__campo">
        <label class="abbonamento-form__etichetta" for="abbonamento-costo">Costo</label>
        <input id="abbonamento-costo" v-model.number="form.costo" class="form-input" type="number" min="0" step="0.01" inputmode="decimal" />
      </div>
    </div>

    <div class="abbonamento-form__campo">
      <span id="abbonamento-periodo" class="abbonamento-form__etichetta">Si paga ogni</span>
      <div class="abbonamento-form__segmenti" role="radiogroup" aria-labelledby="abbonamento-periodo">
        <button
          v-for="periodo in PERIODI_MESI"
          :key="periodo"
          type="button"
          role="radio"
          :aria-checked="form.periodo_mesi === periodo"
          :class="{ scelto: form.periodo_mesi === periodo }"
          @click="form.periodo_mesi = periodo"
        >{{ ETICHETTE_PERIODO[periodo] }}</button>
      </div>
    </div>

    <div class="abbonamento-form__campo">
      <span id="abbonamento-durata" class="abbonamento-form__etichetta">Quanto dura</span>
      <div class="abbonamento-form__segmenti" role="radiogroup" aria-labelledby="abbonamento-durata">
        <button type="button" role="radio" :aria-checked="!form.aTempo" :class="{ scelto: !form.aTempo }" @click="form.aTempo = false">Finché non lo annullo</button>
        <button type="button" role="radio" :aria-checked="form.aTempo" :class="{ scelto: form.aTempo }" @click="form.aTempo = true">Solo per un periodo</button>
      </div>
    </div>

    <div v-if="form.aTempo" class="abbonamento-form__due">
      <div class="abbonamento-form__campo">
        <label class="abbonamento-form__etichetta" for="abbonamento-mesi">Per quanti mesi</label>
        <input id="abbonamento-mesi" v-model.number="form.durata_mesi" class="form-input" type="number" min="1" :max="DURATA_MESI_MAX" step="1" inputmode="numeric" />
      </div>
      <div class="abbonamento-form__campo">
        <label class="abbonamento-form__etichetta" for="abbonamento-inizio">Dal</label>
        <input id="abbonamento-inizio" v-model="form.data_inizio" class="form-input" type="date" />
      </div>
    </div>

    <p v-if="anteprima" class="abbonamento-form__anteprima" aria-live="polite">
      <template v-if="anteprima.totale">
        Ti costa {{ anteprima.totale }} in totale
        <small>In un anno sarebbero {{ anteprima.anno }}</small>
      </template>
      <template v-else>Ti costa {{ anteprima.anno }} all’anno</template>
    </p>

    <div v-if="a?.movimento_ricorrente_id" class="abbonamento-form__legame">
      <p>È legato a una programmazione: annullarlo o modificarlo qui non ferma l’addebito sul conto. Per fermarlo, sospendi la programmazione.</p>
      <button type="button" class="abbonamento-form__testuale" @click="emit('vai-programmate')">Vai a Programmate</button>
    </div>

    <div class="abbonamento-form__azioni">
      <WButton type="submit" variant="primary" size="lg" :loading="occupato" :disabled="!puoSalvare">
        {{ inModifica ? 'Salva modifiche' : 'Salva abbonamento' }}
      </WButton>
      <WButton v-if="inModifica" variant="secondary" size="lg" :disabled="occupato" @click="emit('annulla')">Annulla abbonamento</WButton>
      <button v-if="trovato" type="button" class="abbonamento-form__testuale" :disabled="occupato" @click="emit('escludi')">Non è un abbonamento</button>
    </div>
  </form>
</template>

<style scoped>
.abbonamento-form { display: flex; flex-direction: column; gap: 1rem; }
.abbonamento-form__campo { min-width: 0; }
.abbonamento-form__etichetta {
  display: block;
  margin-bottom: 0.4375rem;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
}
.abbonamento-form__due { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
.abbonamento-form__trovato {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--warning) 9%, transparent);
}
.abbonamento-form__trovato p { margin: 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.45; }
.abbonamento-form__trovato strong { display: block; color: var(--text-primary); font-weight: 650; }
.abbonamento-form__icona-attuale { display: flex; align-items: center; gap: 0.625rem; }
.abbonamento-form__segmenti {
  display: grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-md);
  background: var(--glass-secondary-bg);
}
.abbonamento-form__segmenti button {
  min-height: 40px;
  padding: 0.4375rem 0.25rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 550;
  line-height: 1.2;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.abbonamento-form__segmenti button.scelto { background: var(--glass-interactive-bg-active); color: var(--text-primary); box-shadow: var(--shadow-xs); }
.abbonamento-form__segmenti button:focus-visible { outline: none; box-shadow: var(--focus-ring-tight); }
.abbonamento-form__anteprima {
  margin: 0;
  padding: 0.75rem 0.875rem;
  border: 1px solid color-mix(in srgb, var(--accent-green) 28%, var(--border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent-green) 8%, transparent);
  color: var(--text-primary);
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.abbonamento-form__anteprima small { display: block; margin-top: 0.15rem; color: var(--text-secondary); font-size: var(--text-xs); font-weight: 500; }
.abbonamento-form__legame {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
}
.abbonamento-form__legame p { margin: 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.45; }
.abbonamento-form__azioni { display: flex; flex-direction: column; gap: 0.5rem; }
.abbonamento-form__testuale {
  min-height: 40px;
  padding: 0.25rem 0.5rem;
  border: 0;
  background: transparent;
  color: var(--accent-text);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}
.abbonamento-form__azioni .abbonamento-form__testuale { color: var(--text-secondary); }
.abbonamento-form__testuale:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; border-radius: var(--radius-sm); }
.abbonamento-form__testuale:disabled { opacity: 0.6; cursor: default; }
</style>
