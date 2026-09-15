<script setup>
import { computed, onMounted } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS, Tooltip, CategoryScale, LinearScale,
  PointElement, LineElement, Filler,
} from 'chart.js';
import DataState from '@/components/common/DataState.vue';
import { TrendingUp, TrendingDown, Minus } from '@/utils/appIcons';
import { etichetta } from '@/content/glossario';
import { formatValuta } from '@/utils/formatters';
import { useAndamentoPatrimonio } from '@/composables/useAndamentoPatrimonio';

ChartJS.register(Tooltip, CategoryScale, LinearScale, PointElement, LineElement, Filler);

/**
 * Andamento del patrimonio. Unico per Dashboard e Analisi: prima la Dashboard
 * disegnava una sparkline SVG a mano e Analisi usava Chart.js, due strade per
 * la stessa serie che potevano divergere senza che nessuno se ne accorgesse.
 */
const props = defineProps({
  /** Dashboard: niente assi, niente selettore. Stessa linea, stessa variazione. */
  compatta: { type: Boolean, default: false },
  periodoIniziale: { type: String, default: 'mesi_3' },
});

const {
  stato, lastUpdated, loading, punti, statistiche, periodo, periodi,
  carica, cambiaPeriodo, riprova,
} = useAndamentoPatrimonio({ periodoIniziale: props.periodoIniziale });

onMounted(carica);

const direzione = computed(() => {
  const v = statistiche.value.variazioneImporto;
  if (v > 0) return 'su';
  if (v < 0) return 'giu';
  return 'fermo';
});

const iconaDirezione = computed(() => (
  { su: TrendingUp, giu: TrendingDown, fermo: Minus }[direzione.value]
));

/**
 * Mai solo colore: la frase dice da sola cosa è successo, e resta l'unica
 * fonte per chi usa uno screen reader o non distingue verde e rosso.
 */
const fraseVariazione = computed(() => {
  const { variazioneImporto, variazionePercentuale, mostraPercentuale } = statistiche.value;
  const verso = { su: 'in aumento di', giu: 'in calo di', fermo: 'invariato' }[direzione.value];
  if (direzione.value === 'fermo') return 'Patrimonio invariato nel periodo';
  const importo = formatValuta(Math.abs(variazioneImporto));
  const percentuale = mostraPercentuale ? ` (${Math.abs(variazionePercentuale)}%)` : '';
  return `Patrimonio ${verso} ${importo}${percentuale} nel periodo`;
});

const segno = computed(() => ({ su: '+', giu: '−', fermo: '' }[direzione.value]));

/**
 * Un <canvas> non fa parte dell'albero su cui il browser risolve una custom
 * property: passare a Chart.js la stringa 'var(--positive)' com'era scritta
 * nel brief non colora la linea, perché lo strokeStyle del 2D context non
 * ha un elemento a cui agganciare la cascata. È lo stesso motivo per cui
 * `useChartTheme.js` risolve i colori con `getComputedStyle` prima di darli
 * in pasto a un grafico, e per cui il grafico esistente in AnalisiView usa
 * un hex fisso invece di un token. Qui il colore dipende dalla direzione
 * della variazione, quindi va risolto qui invece che riusare quel composable.
 */
const leggiVariabileCss = (nome, fallback) => {
  if (typeof document === 'undefined') return fallback;
  const valore = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return valore || fallback;
};

const coloreLinea = computed(() => (
  direzione.value === 'giu'
    ? leggiVariabileCss('--negative', '#FF4757')
    : leggiVariabileCss('--positive', '#00D4AA')
));

const datiGrafico = computed(() => ({
  labels: punti.value.map((p) => p.label),
  datasets: [{
    data: punti.value.map((p) => Number(p.patrimonio) || 0),
    borderColor: coloreLinea.value,
    backgroundColor: 'transparent',
    borderWidth: 2,
    tension: 0.35,
    pointRadius: 0,
    // Il punto compare solo sotto il dito o il puntatore: su 30 punti
    // disegnarli tutti rende la linea illeggibile.
    pointHoverRadius: 5,
    pointHitRadius: 24,
    fill: false,
  }],
}));

const opzioniGrafico = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  // Il tooltip deve rispondere al tocco, non solo al puntatore. Senza
  // touchstart/touchmove su mobile il grafico è muto.
  events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      displayColors: false,
      callbacks: {
        title: (voci) => punti.value[voci[0].dataIndex]?.labelEsteso || '',
        label: (voce) => formatValuta(voce.parsed.y),
      },
    },
  },
  scales: props.compatta
    ? { x: { display: false }, y: { display: false } }
    : {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
      y: {
        grid: { color: leggiVariabileCss('--divider', 'rgba(255, 255, 255, 0.08)') },
        ticks: { callback: (v) => formatValuta(v) },
      },
    },
}));
</script>

<template>
  <section class="andamento" :class="{ 'andamento--compatta': compatta }">
    <header v-if="!compatta" class="andamento__testa">
      <h2 class="andamento__titolo">{{ etichetta('patrimonio_totale') }}</h2>

      <div class="andamento__periodi" role="group" aria-label="Periodo del grafico">
        <button
          v-for="p in periodi"
          :key="p.id"
          type="button"
          class="andamento__periodo"
          :class="{ 'andamento__periodo--attivo': p.id === periodo }"
          :aria-pressed="p.id === periodo"
          @click="cambiaPeriodo(p.id)"
        >
          {{ p.label }}
        </button>
      </div>
    </header>

    <DataState
      :stato="stato"
      :last-updated="lastUpdated"
      messaggio-errore="Non è stato possibile caricare l'andamento del patrimonio."
      skeleton-type="text"
      :skeleton-lines="4"
      @riprova="riprova"
    >
      <template #vuoto>
        <p class="andamento__vuoto">
          Il grafico compare quando avrai registrato dei movimenti.
          Ne bastano due in giorni diversi per vedere la prima linea.
        </p>
      </template>

      <div class="andamento__corpo">
        <!-- Cambiando periodo `stato` resta `pronto`, perché `lastUpdated` non
             è più nullo: senza questo, il grafico vecchio resterebbe a schermo
             in silenzio mentre arriva il nuovo. È lo stesso caso della lista
             dei movimenti, e si risolve allo stesso modo. -->
        <p v-if="loading && !compatta" class="andamento__in-corso" role="status">
          Aggiornamento del grafico…
        </p>

        <div class="andamento__tela" :class="{ 'andamento__tela--in-corso': loading }">
          <Line :data="datiGrafico" :options="opzioniGrafico" />
        </div>

        <!-- Un <canvas> è opaco a uno screen reader, ed esce dallo schermo a
             zoom 200%. La tabella è l'unico modo perché la serie resti
             leggibile in entrambi i casi. -->
        <table class="sr-only">
          <caption>{{ etichetta('patrimonio_totale') }} per periodo</caption>
          <thead>
            <tr><th scope="col">Periodo</th><th scope="col">Valore</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in punti" :key="p.chiave || p.data">
              <th scope="row">{{ p.labelEsteso || p.label }}</th>
              <td>{{ formatValuta(p.patrimonio) }}</td>
            </tr>
          </tbody>
        </table>

        <p class="andamento__variazione" :class="`andamento__variazione--${direzione}`">
          <component :is="iconaDirezione" :size="16" :stroke-width="1.75" aria-hidden="true" />
          <span class="tabular-nums">
            {{ segno }}{{ formatValuta(Math.abs(statistiche.variazioneImporto)) }}
          </span>
          <span v-if="statistiche.mostraPercentuale" class="andamento__percentuale tabular-nums">
            {{ segno }}{{ Math.abs(statistiche.variazionePercentuale) }}%
          </span>
          <span class="sr-only">{{ fraseVariazione }}</span>
        </p>

        <dl v-if="!compatta" class="andamento__statistiche">
          <div><dt>Inizio</dt><dd class="tabular-nums">{{ formatValuta(statistiche.inizio) }}</dd></div>
          <div><dt>Attuale</dt><dd class="tabular-nums">{{ formatValuta(statistiche.fine) }}</dd></div>
          <div><dt>Minimo</dt><dd class="tabular-nums">{{ formatValuta(statistiche.min) }}</dd></div>
          <div><dt>Massimo</dt><dd class="tabular-nums">{{ formatValuta(statistiche.max) }}</dd></div>
        </dl>
      </div>
    </DataState>
  </section>
</template>

<style scoped>
.andamento__testa {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.andamento__titolo {
  font-size: var(--text-lg);
  letter-spacing: var(--tracking-title);
  margin: 0;
}

.andamento__periodi { display: flex; gap: var(--space-1); }

.andamento__periodo {
  /* 44×44 è il minimo tattile: la stessa regola già applicata ai "Riprova". */
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-pill);
  background: var(--glass-interactive-bg);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.andamento__periodo:hover { background: var(--glass-interactive-bg-hover); }

.andamento__periodo:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.andamento__periodo--attivo {
  background: var(--accent-light);
  border-color: var(--border-focus);
  color: var(--text-primary);
}

.andamento__tela {
  height: 220px;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.andamento--compatta .andamento__tela { height: 72px; }

/* Il grafico precedente resta leggibile mentre arriva il nuovo: smorzarlo
   dice che è vecchio senza toglierlo, che è la stessa regola di DataState
   per `errore-con-dati`. */
.andamento__tela--in-corso { opacity: 0.55; }

.andamento__in-corso {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.andamento__variazione {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
  font-size: var(--text-sm);
}

.andamento__variazione--su { color: var(--positive); }
.andamento__variazione--giu { color: var(--negative); }
.andamento__variazione--fermo { color: var(--text-secondary); }

.andamento__percentuale { color: var(--text-secondary); }

.andamento__statistiche {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-3);
  margin: var(--space-4) 0 0;
}

.andamento__statistiche dt {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.andamento__statistiche dd {
  margin: var(--space-1) 0 0;
  font-size: var(--text-base);
  color: var(--text-primary);
}

.andamento__vuoto {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin: 0;
}
</style>
