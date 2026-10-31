<script setup>
import { computed } from 'vue';
import WCard from '@/components/common/WCard.vue';
import ServizioIcona from './ServizioIcona.vue';
import { formatData, formatValuta } from '@/utils/formatters';
import { descriviDurata } from '@/utils/abbonamenti';
import { GLOSSARIO } from '@/content/glossario';
import { AlertTriangle } from '@/utils/appIcons';

const props = defineProps({
  abbonamento: { type: Object, required: true },
  valuta: { type: String, default: 'EUR' },
});

defineEmits(['apri']);

const soldi = (importo) => formatValuta(importo, props.valuta);
const aTempo = computed(() => props.abbonamento.durata_mesi != null);
const durata = computed(() => descriviDurata(props.abbonamento));

const dati = computed(() => {
  const { costi } = props.abbonamento;
  const voci = [{ etichetta: 'Durata', valore: durata.value }];
  if (aTempo.value) {
    voci.push({ etichetta: 'In totale', valore: soldi(costi.in_totale) });
    voci.push({ etichetta: 'In un anno', valore: soldi(costi.in_un_anno) });
  } else {
    voci.push({ etichetta: GLOSSARIO.abbonamenti_all_anno.etichetta, valore: soldi(costi.in_un_anno) });
  }
  return voci;
});

const avviso = computed(() => {
  const { riattivato_da_addebito: riattivato, annullato_il: chiuso, ultimo_addebito_data: addebito, da_verificare: daVerificare } = props.abbonamento;
  if (riattivato && chiuso && addebito) {
    return `Chiuso il ${formatData(chiuso, 'medio')}, ma addebitato di nuovo il ${formatData(addebito, 'medio')}`;
  }
  return daVerificare ? 'Controlla la durata' : '';
});

const etichettaAccessibile = computed(() => [
  props.abbonamento.nome,
  soldi(props.abbonamento.costo),
  ...dati.value.map((voce) => `${voce.etichetta} ${voce.valore}`),
  avviso.value,
  'Apri per modificare',
].filter(Boolean).join(', '));
</script>

<template>
  <WCard class="abbonamento-card" hoverable padding="0">
    <button type="button" class="abbonamento-card__apri" :aria-label="etichettaAccessibile" @click="$emit('apri', abbonamento)">
      <span class="abbonamento-card__testa">
        <ServizioIcona :icona="abbonamento.icona" :nome="abbonamento.nome" :size="44" />
        <span class="abbonamento-card__titolo">
          <span class="abbonamento-card__nome">{{ abbonamento.nome }}</span>
          <span v-if="avviso" class="abbonamento-card__avviso">
            <AlertTriangle :size="14" aria-hidden="true" />
            {{ avviso }}
          </span>
        </span>
        <span class="abbonamento-card__costo">{{ soldi(abbonamento.costo) }}</span>
      </span>
      <span class="abbonamento-card__dati">
        <span v-for="voce in dati" :key="voce.etichetta" class="abbonamento-card__dato">
          <span class="abbonamento-card__etichetta">{{ voce.etichetta }}</span>
          <span class="abbonamento-card__valore">{{ voce.valore }}</span>
        </span>
      </span>
    </button>
  </WCard>
</template>

<style scoped>
.abbonamento-card { overflow: hidden; }
.abbonamento-card__apri {
  display: block;
  width: 100%;
  padding: 1rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.abbonamento-card__apri:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -2px; border-radius: inherit; }
.abbonamento-card__testa { display: flex; align-items: center; gap: 0.75rem; }
.abbonamento-card__titolo { display: flex; flex: 1; flex-direction: column; gap: 0.2rem; min-width: 0; }
.abbonamento-card__nome { color: var(--text-primary); font-size: 1rem; font-weight: 650; overflow-wrap: anywhere; }
.abbonamento-card__avviso { display: flex; align-items: flex-start; gap: 0.3rem; color: var(--warning); font-size: var(--text-xs); font-weight: 600; line-height: 1.35; }
.abbonamento-card__avviso svg { flex-shrink: 0; margin-top: 0.15rem; }
.abbonamento-card__costo { flex-shrink: 0; color: var(--text-primary); font-size: 1.0625rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.abbonamento-card__dati {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
  gap: 0.75rem;
  margin-top: 0.875rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--divider);
}
.abbonamento-card__dato { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.abbonamento-card__etichetta { color: var(--text-muted); font-size: var(--text-xs); }
.abbonamento-card__valore { color: var(--text-primary); font-size: var(--text-xs); font-weight: 650; font-variant-numeric: tabular-nums; }
</style>
