<script setup>
import { computed } from 'vue';
import WCard from '@/components/common/WCard.vue';
import OrizzonteSelector from '@/components/piano-smart/OrizzonteSelector.vue';
import { GLOSSARIO } from '@/content/glossario';
import { formattaEuro, importoInCentesimi, centesimiInImporto } from '@/utils/pianoSmart';

/**
 * L'hero della situazione: UN numero in cima, tre di supporto, tutto il resto
 * dietro una porta sola.
 *
 * Non calcola niente. Il budget, i giorni, la data raggiungibile e lo stato
 * arrivano da `horizon` (GET /piano-smart-v2/current-situation): questo
 * componente scrive solo le frasi.
 */
const props = defineProps({
  situazione: { type: Object, required: true },
  salvataggioInCorso: { type: Boolean, default: false },
});
defineEmits(['cambiaOrizzonte']);

const h = computed(() => props.situazione.horizon ?? {});
const corrente = computed(() => props.situazione.current ?? {});

const dataLunga = (iso) => (iso
  ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`))
  : null);

const contesto = computed(() => (h.value.tipo === 'data'
  ? `per arrivare al ${dataLunga(h.value.dataFine)} · ${h.value.giorni} giorni`
  : `fino al ${dataLunga(h.value.dataFine)} · ${h.value.giorni} giorni`));

// Non ricalcoliamo budget − ritmo: il server lo espone già in
// `current.dailyMargin` (positivo quando si è sotto il budget), gestendo da
// sé il caso "non stimabile" con un `null` esplicito. `Number(null) === 0`
// renderebbe falsa una guardia scritta sul valore convertito: il controllo
// va fatto sul dato grezzo, prima della conversione.
const margine = computed(() => {
  const raw = corrente.value.dailyMargin;
  if (raw === null || raw === undefined) return null;
  const valore = Number(raw);
  return Number.isFinite(valore) ? valore : null;
});

// La divisione onesta per il pannello "Come è calcolato": capitale libero ÷
// giorni, SENZA il tetto della spesa media. Prima qui si mostrava
// `h.budgetGiornaliero` (già con il tetto applicato) accanto a "÷ N giorni",
// una divisione che il numero non verificava — 4.000 ÷ 19 non fa 29,56
// quando il tetto è quello a decidere il numero finale (difetto 6 della
// review finale). Il tetto, quando si applica, ha ora una riga propria.
const divisioneCapitaleGiorni = computed(() => {
  const capitale = importoInCentesimi(h.value.capitaleLibero);
  const giorni = Number(h.value.giorni);
  if (capitale === null || !Number.isInteger(giorni) || giorni <= 0) return null;
  return centesimiInImporto(Math.floor(Math.max(capitale, 0) / giorni));
});
</script>

<template>
  <WCard class="situation-hero">
    <p class="hero-kicker">{{ GLOSSARIO.budget_giornaliero.etichetta }}</p>
    <strong class="hero-amount">{{ formattaEuro(h.budgetGiornaliero) }}</strong>
    <p class="hero-context">{{ contesto }}</p>

    <!-- Una sola catena per lo stato: prima era divisa in due catene
         `v-if` indipendenti (una sul confronto date lato client, una sullo
         stato del server) che potevano risultare vere insieme — l'avviso
         "arrivi prima" e l'etichetta verde "in rotta" comparivano
         contemporaneamente (difetto 3 della review finale). Lo stato è
         uno solo, deciso dal server (`horizon.stato`, vocabolario di
         `orizzonte.service.js`). -->
    <p v-if="h.stato === 'scaduto'" class="shortfall" role="status">
      La data che hai scelto è passata: scegline una nuova.
    </p>
    <p v-else-if="h.stato === 'scoperto'" class="shortfall" role="status">
      Gli impegni fino al {{ dataLunga(h.dataFine) }} superano il capitale di
      {{ formattaEuro(h.mancanti) }}.
    </p>
    <p v-else-if="h.stato === 'in_ritardo'" class="situation-status situation-status--sopra_il_ritmo" role="status">
      Al ritmo attuale arrivi al {{ dataLunga(h.dataRaggiungibile) }}.
    </p>
    <p v-else-if="h.stato === 'in_rotta'" class="situation-status situation-status--sotto_controllo">
      {{ h.dataRaggiungibile ? `In rotta: il capitale arriva al ${dataLunga(h.dataRaggiungibile)}.` : 'In rotta.' }}
    </p>
    <p v-else class="muted">
      Serve ancora qualche registrazione per calcolare il budget.
    </p>

    <!-- Sola lettura e additiva, non un'alternativa allo stato sopra: il
         fondo non è compreso nel capitale, lo diciamo solo a chi non arriva
         alla data scelta. -->
    <p v-if="(h.stato === 'scoperto' || h.stato === 'in_ritardo') && h.fondoGiorniAggiuntivi" class="hint">
      Il fondo di emergenza coprirebbe altri {{ h.fondoGiorniAggiuntivi }} giorni
      ({{ formattaEuro(h.fondoDisponibile) }}), ma non è compreso nel budget.
    </p>

    <OrizzonteSelector
      :tipo="h.tipo" :data-fine="h.dataFine"
      :mesi-riserva="corrente.reserveMonths ?? 1"
      :income-mode="corrente.incomeMode ?? 'ricorrente'"
      :suggerisci-data="corrente.incomeMode === 'irregolare' && h.tipo === 'mensile'"
      :salvataggio-in-corso="salvataggioInCorso"
      @cambia="$emit('cambiaOrizzonte', $event)"
    />

    <div class="situation-grid">
      <div>
        <span>{{ GLOSSARIO.capitale_libero.etichetta }}</span>
        <strong>{{ formattaEuro(h.capitaleLibero) }}</strong>
      </div>
      <div>
        <!-- Etichetta dal glossario (Coding Rule 18), la data concreta accanto. -->
        <span>{{ GLOSSARIO.impegni_orizzonte.etichetta }}</span>
        <strong>{{ formattaEuro(h.impegniFinoA) }}</strong>
        <small>entro il {{ dataLunga(h.dataFine) }}</small>
      </div>
      <div>
        <span>{{ GLOSSARIO.ritmo_attuale.etichetta }}</span>
        <strong>{{ formattaEuro(corrente.actualDailySpend) }}/giorno</strong>
        <small v-if="margine !== null">
          {{ margine >= 0 ? `${formattaEuro(margine)} sotto il budget` : `${formattaEuro(Math.abs(margine))} sopra il budget` }}
        </small>
      </div>
    </div>

    <details class="explanation">
      <summary>Come è calcolato</summary>
      <dl class="hero-breakdown">
        <dt>Liquidità dei conti</dt><dd>{{ formattaEuro(corrente.liquidity) }}</dd>
        <dt>− obiettivi accantonati</dt><dd>{{ formattaEuro(corrente.allocatedToGoals) }}</dd>
        <dt>− {{ GLOSSARIO.impegni_orizzonte.etichetta.toLowerCase() }} ({{ dataLunga(h.dataFine) }})</dt><dd>{{ formattaEuro(h.impegniFinoA) }}</dd>
        <template v-if="h.riservaFinoA !== null && h.riservaFinoA !== undefined">
          <dt>− {{ GLOSSARIO.riserva_orizzonte.etichetta.toLowerCase() }}</dt><dd>{{ formattaEuro(h.riservaFinoA) }}</dd>
        </template>
        <dt>= capitale libero</dt><dd>{{ formattaEuro(h.capitaleLibero) }}</dd>
        <dt>÷ {{ h.giorni }} giorni</dt><dd>{{ formattaEuro(divisioneCapitaleGiorni) }}/giorno</dd>
      </dl>
      <p>{{ GLOSSARIO.capitale_libero.descrizione }}</p>
      <!-- Il risultato della divisione sopra non è sempre il numero in cima:
           con entrate irregolari il limite non supera mai il ritmo medio
           storico, e quando questo tetto lega è lui a decidere, non la
           divisione. -->
      <p v-if="corrente.dailyLimitBasis === 'spesa_media'">
        In realtà limitato dal ritmo medio osservato: {{ formattaEuro(h.budgetGiornaliero) }}/giorno.
      </p>
      <p v-if="h.tipo === 'data'">
        Il fondo di emergenza non è compreso nel capitale: resta da parte.
      </p>
    </details>
  </WCard>
</template>

<style scoped>
.situation-hero { display: flex; flex-direction: column; align-items: center; gap: .45rem; margin-bottom: 1rem; text-align: center; }
.hero-kicker { margin: 0 0 .35rem; color: var(--text-secondary); font-size: var(--text-xs); font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.hero-amount { color: var(--text-primary); font-size: 2.9rem; line-height: 1.05; }
.hero-context { margin: -.2rem 0 .25rem; color: var(--text-secondary); font-size: var(--text-sm); }

.shortfall { margin: 0; color: var(--negative); font-weight: 600; }
.situation-status { margin: 0; padding: .35rem .65rem; border-radius: 999px; font-size: var(--text-xs); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.situation-status--sopra_il_ritmo { background: color-mix(in srgb, #f0a35b 16%, transparent); color: #f0a35b; }
.hint { margin: 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; }
.muted { margin: 0; color: var(--text-secondary); line-height: 1.55; font-size: var(--text-sm); }

.situation-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; width: 100%; margin-top: .5rem; }
.situation-grid > div { display: flex; flex-direction: column; gap: .25rem; padding: .75rem; border: 1px solid var(--divider); border-radius: var(--radius-md); text-align: left; }
.situation-grid span { color: var(--text-secondary); font-size: var(--text-xs); }
.situation-grid strong { color: var(--text-primary); }
.situation-grid small { color: var(--text-secondary); font-size: var(--text-xs); }

.explanation { width: 100%; border-top: 1px solid var(--divider); padding-top: .7rem; color: var(--text-secondary); font-size: var(--text-xs); text-align: left; }
.explanation summary { color: var(--accent-text); cursor: pointer; font-weight: 600; }
.explanation p { margin: .6rem 0 0; line-height: 1.55; }
.hero-breakdown { display: grid; grid-template-columns: 1fr auto; gap: .3rem .75rem; margin: .6rem 0 0; }
.hero-breakdown dt { margin: 0; color: var(--text-secondary); }
.hero-breakdown dd { margin: 0; color: var(--text-primary); font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }

@media (max-width: 560px) {
  .situation-grid { grid-template-columns: 1fr; }
}
</style>
