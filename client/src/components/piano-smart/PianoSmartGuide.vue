<script setup>
import { computed, ref, watch } from 'vue';
import AppDialog from '@/components/common/AppDialog.vue';
import WButton from '@/components/common/WButton.vue';
import { GUIDA_ESEMPIO, GUIDA_PIANO_SMART, calcolaTotaleEsempio } from '@/content/pianoSmartGuide';

const props = defineProps({ open: Boolean });
const emit = defineEmits(['close', 'start']);
const sezione = ref(0);
const allocazioni = ref({ ...GUIDA_ESEMPIO.allocazioni });
const contenuto = computed(() => GUIDA_PIANO_SMART[sezione.value]);
const totaleDistribuito = computed(() => calcolaTotaleEsempio(allocazioni.value));
const differenza = computed(() => GUIDA_ESEMPIO.totale - totaleDistribuito.value);
const ultima = computed(() => sezione.value === GUIDA_PIANO_SMART.length - 1);

watch(() => props.open, (open) => {
  if (open) {
    sezione.value = 0;
    allocazioni.value = { ...GUIDA_ESEMPIO.allocazioni };
  }
});

const avanti = () => { if (!ultima.value) sezione.value += 1; };
const indietro = () => { if (sezione.value > 0) sezione.value -= 1; };
const formattaEuro = (value) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
</script>

<template>
  <AppDialog :open="open" title="Guida al Piano Smart" @close="emit('close')">
    <div class="guide" aria-label="Guida interattiva al Piano Smart">
      <div class="guide__progress" aria-label="Avanzamento guida">
        <span>Sezione {{ sezione + 1 }} di {{ GUIDA_PIANO_SMART.length }}</span>
        <div class="guide__dots" aria-hidden="true">
          <i v-for="(_, index) in GUIDA_PIANO_SMART" :key="index" :class="{ active: index === sezione }" />
        </div>
      </div>

      <header class="guide__intro">
        <p class="guide__eyebrow">Piano Smart</p>
        <h2>{{ contenuto.titolo }}</h2>
        <p>{{ contenuto.sottotitolo }}</p>
      </header>

      <div class="guide__content">
        <p v-for="paragraph in contenuto.paragraphs" :key="paragraph">{{ paragraph }}</p>

        <div v-if="contenuto.id === 'esempio'" class="example">
          <div class="example__total">
            <span>Somma da organizzare</span>
            <strong>{{ formattaEuro(GUIDA_ESEMPIO.totale) }}</strong>
          </div>
          <div v-for="item in GUIDA_PIANO_SMART[3].items" :key="item.id" class="example__row">
            <label :for="`guide-${item.id}`">{{ item.titolo }}</label>
            <div class="example__input">
              <span>€</span>
              <input :id="`guide-${item.id}`" v-model.number="allocazioni[item.id]" type="number" min="0" step="50" :aria-label="`Quota ${item.titolo}`">
            </div>
          </div>
          <p class="example__result" :class="{ invalid: differenza !== 0 }" aria-live="polite">
            <span>Distribuito: <strong>{{ formattaEuro(totaleDistribuito) }}</strong></span>
            <span v-if="differenza > 0">Mancano {{ formattaEuro(differenza) }}</span>
            <span v-else-if="differenza < 0">Hai superato il totale di {{ formattaEuro(Math.abs(differenza)) }}</span>
            <span v-else>Il totale torna: puoi salvare.</span>
          </p>
        </div>

        <ol v-if="contenuto.steps" class="guide__steps">
          <li v-for="step in contenuto.steps" :key="step[0]"><b>{{ step[0] }}</b><div><strong>{{ step[1] }}</strong><p>{{ step[2] }}</p></div></li>
        </ol>

        <div v-if="contenuto.items" class="guide__categories">
          <article v-for="item in contenuto.items" :key="item.id" :class="`category category--${item.id}`">
            <strong>{{ item.titolo }}</strong><p>{{ item.testo }}</p>
          </article>
        </div>

        <ul v-if="contenuto.limits" class="guide__limits"><li v-for="limit in contenuto.limits" :key="limit">{{ limit }}</li></ul>
      </div>

      <footer class="guide__footer">
        <button type="button" class="guide__back" :disabled="sezione === 0" @click="indietro">Indietro</button>
        <WButton v-if="!ultima" variant="primary" @click="avanti">Continua</WButton>
        <WButton v-else variant="primary" @click="emit('start'); emit('close')">Apri Piano Smart</WButton>
      </footer>
    </div>
  </AppDialog>
</template>

<style scoped>
.guide { display: flex; flex-direction: column; gap: 1.25rem; }
.guide__progress { display: flex; justify-content: space-between; align-items: center; color: var(--text-muted); font-size: var(--text-xs); }
.guide__dots { display: flex; gap: .3rem; }
.guide__dots i { width: .45rem; height: .45rem; border-radius: 50%; background: var(--border); }
.guide__dots i.active { background: var(--accent-green); transform: scale(1.25); }
.guide__eyebrow { margin: 0 0 .25rem; color: var(--accent-text); font-size: var(--text-xs); font-weight: 700; }
.guide h2 { margin: 0; color: var(--text-primary); font-size: 1.35rem; }
.guide__intro > p:last-child, .guide__content > p { color: var(--text-secondary); line-height: 1.6; font-size: var(--text-sm); }
.guide__intro > p:last-child { margin: .35rem 0 0; }
.guide__content > p { margin: 0 0 .8rem; }
.example { padding: 1rem; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-subtle); }
.example__total, .example__result { display: flex; justify-content: space-between; gap: 1rem; color: var(--text-secondary); font-size: var(--text-sm); }
.example__total { align-items: baseline; padding-bottom: .75rem; margin-bottom: .25rem; border-bottom: 1px solid var(--divider); }
.example__total strong { color: var(--text-primary); font-size: 1.35rem; }
.example__row { display: grid; grid-template-columns: 1fr 8rem; gap: .75rem; align-items: center; padding: .45rem 0; }
.example__row label { font-size: var(--text-sm); color: var(--text-primary); }
.example__input { display: flex; align-items: center; gap: .25rem; color: var(--text-muted); }
.example__input input { min-height: 40px; padding: .45rem; }
.example__result { flex-wrap: wrap; margin: .75rem 0 0; color: var(--accent-text); }
.example__result.invalid { color: var(--negative); }
.guide__steps { display: flex; flex-direction: column; gap: .8rem; margin: 0; padding: 0; list-style: none; }
.guide__steps li { display: grid; grid-template-columns: 2rem 1fr; gap: .7rem; align-items: start; }
.guide__steps b { display: grid; place-items: center; width: 1.8rem; height: 1.8rem; border-radius: 50%; background: var(--accent-green); color: var(--surface); font-size: var(--text-xs); }
.guide__steps strong, .guide__categories strong { color: var(--text-primary); font-size: var(--text-sm); }
.guide__steps p, .guide__categories p { margin: .2rem 0 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; }
.guide__categories { display: grid; gap: .55rem; }
.category { padding: .7rem .8rem; border-left: 3px solid var(--accent-green); background: var(--surface-subtle); }
.category--needs { border-color: #4C8DFF; }.category--safety { border-color: #00A884; }.category--goals { border-color: #C77DFF; }.category--future { border-color: #F2994A; }.category--freedom { border-color: #56CCF2; }
.guide__limits { margin: 0; padding-left: 1.2rem; color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.65; }
.guide__footer { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding-top: .5rem; border-top: 1px solid var(--divider); }
.guide__back { min-height: 44px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; font: inherit; }
.guide__back:disabled { opacity: .35; cursor: not-allowed; }
.guide__back:focus-visible, .example input:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 2px; }
@media (max-width: 520px) { .example__row { grid-template-columns: 1fr 7rem; } }
@media (prefers-reduced-motion: reduce) { .guide__dots i { transition: none; } }
</style>
