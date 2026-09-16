<script setup>
import {
  computed, onMounted, onBeforeUnmount, ref,
} from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS, Tooltip, CategoryScale, LinearScale,
  PointElement, LineElement, Filler,
} from 'chart.js';
import DataState from '@/components/common/DataState.vue';
import { TrendingUp, TrendingDown, Minus } from '@/utils/appIcons';
import { etichetta } from '@/content/glossario';
import { useValuta } from '@/composables/useValuta';
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

// Come il resto dell'app (15 file): la valuta è quella scelta dall'utente
// nel profilo, non l'EUR fisso di default di @/utils/formatters. Prima
// della sostituzione con questo componente, AnalisiView formattava queste
// stesse quattro statistiche con useValuta().
const { formatValuta } = useValuta();

/**
 * Il tema vive come classe su <html>, e i colori del canvas vanno riletti
 * quando cambia: `getComputedStyle` non è una lettura reattiva, quindi un
 * `computed` che la chiama non si ricalcolerebbe mai da solo — la griglia
 * resterebbe del colore del primo montaggio e la linea cambierebbe solo
 * per effetto collaterale dei dati, non del tema.
 *
 * Non si può leggere `isDark` da `useTheme()`: quella funzione crea uno
 * stato nuovo a ogni chiamata (non è un singleton di modulo), quindi non
 * saprebbe nulla del selettore premuto nella sidebar di `AppLayout.vue`,
 * che è persistente e non smonta questa vista. La classe su <html> è
 * l'unica sorgente condivisa.
 */
const temaCorrente = ref(typeof document === 'undefined' ? '' : document.documentElement.className);
let osservatoreTema;

onMounted(() => {
  carica();
  osservatoreTema = new MutationObserver(() => {
    temaCorrente.value = document.documentElement.className;
  });
  osservatoreTema.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
});

onBeforeUnmount(() => osservatoreTema?.disconnect());

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
 * Etichetta del periodo scelto ("7 giorni", "3 mesi", ...). In modalità
 * compatta non c'è il selettore a spiegare su cosa è calcolata la
 * variazione: la Dashboard mostrava già un'altra percentuale ("questo
 * mese", da `contiStore`) subito sopra questa, su una finestra diversa, e
 * senza l'etichetta un numero da solo si prestava allo stesso equivoco.
 */
const etichettaPeriodo = computed(() => (
  periodi.find((p) => p.id === periodo.value)?.label || ''
));

/**
 * Mai solo colore: la frase dice da sola cosa è successo, e resta l'unica
 * fonte per chi usa uno screen reader o non distingue verde e rosso.
 *
 * In modalità compatta il periodo prende il posto del generico "nel
 * periodo": nella vista intera basta perché il selettore è accanto, in
 * compatta il selettore non c'è, quindi lo dice la frase.
 */
const fraseVariazione = computed(() => {
  const { variazioneImporto, variazionePercentuale, mostraPercentuale } = statistiche.value;
  const verso = { su: 'in aumento di', giu: 'in calo di', fermo: 'invariato' }[direzione.value];
  const suffisso = props.compatta ? ` · ${etichettaPeriodo.value}` : ' nel periodo';
  if (direzione.value === 'fermo') return `Patrimonio invariato${suffisso}`;
  const importo = formatValuta(Math.abs(variazioneImporto));
  const percentuale = mostraPercentuale ? ` (${Math.abs(variazionePercentuale)}%)` : '';
  return `Patrimonio ${verso} ${importo}${percentuale}${suffisso}`;
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
 *
 * `tema` non è un parametro decorativo: letto per davvero (non un
 * riferimento finto solo per tracciare la dipendenza) sceglie il fallback
 * del tema giusto quando la custom property non è ancora risolvibile,
 * invece del singolo fallback scuro che c'era prima. Chi chiama questa
 * funzione da dentro un `computed` gli passa `temaCorrente.value`, ed è
 * quella lettura a far ricalcolare il colore quando la classe su <html>
 * cambia.
 */
const leggiVariabileCss = (nome, tema, fallbackScuro, fallbackChiaro) => {
  const fallback = tema.includes('light') ? fallbackChiaro : fallbackScuro;
  if (typeof document === 'undefined') return fallback;
  const valore = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return valore || fallback;
};

const coloreLinea = computed(() => {
  const tema = temaCorrente.value;
  return direzione.value === 'giu'
    ? leggiVariabileCss('--negative', tema, '#FF4757', '#C81E1E')
    : leggiVariabileCss('--positive', tema, '#00D4AA', '#047857');
});

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

const opzioniGrafico = computed(() => {
  const tema = temaCorrente.value;
  return {
    responsive: true,
    maintainAspectRatio: false,
    // Elenco esplicito degli eventi, touch compresi: il tooltip al tocco è
    // un requisito, e non deve dipendere dal default di Chart.js — anche se
    // in questa versione (4.5.1) coincide con esso — perché un default può
    // cambiare fra versioni senza che nessuno se ne accorga qui.
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
        x: {
          grid: { display: false },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            // Stesso token del testo secondario dell'app: senza, Chart.js
            // usa il suo grigio di default (#666), che nel tema scuro cade
            // sotto la soglia di contrasto AA per il testo (misurato 3.20:1).
            color: leggiVariabileCss('--text-secondary', tema, '#A8A8BC', '#475569'),
          },
        },
        y: {
          grid: {
            color: leggiVariabileCss('--divider', tema, 'rgba(255, 255, 255, 0.08)', 'rgba(15, 23, 42, 0.08)'),
          },
          ticks: {
            callback: (v) => formatValuta(v),
            color: leggiVariabileCss('--text-secondary', tema, '#A8A8BC', '#475569'),
          },
        },
      },
  };
});

/**
 * `carica` rilegge la risorsa mantenendo il periodo già scelto (lo stesso
 * che userebbe `cambiaPeriodo`, senza cambiarlo): serve al genitore per
 * aggiornare il grafico dopo un salvataggio altrove nella pagina, ad
 * esempio dalla Dashboard. Un `:key` che rimonta il componente otterrebbe
 * lo stesso refresh ma riporterebbe `periodo` al valore iniziale, perdendo
 * la scelta dell'utente — qui invece resta quella già in `periodo`.
 */
defineExpose({ carica });
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
          <!-- L'importo e la percentuale restano visibili a schermo: `aria-hidden`
               li toglie solo dall'albero di accessibilità. La frase sr-only
               accanto dice già la stessa cosa per esteso (direzione, importo,
               percentuale): senza questo attributo uno screen reader leggerebbe
               le stesse cifre due volte nello stesso paragrafo. -->
          <span class="tabular-nums" aria-hidden="true">
            {{ segno }}{{ formatValuta(Math.abs(statistiche.variazioneImporto)) }}
          </span>
          <span
            v-if="statistiche.mostraPercentuale"
            class="andamento__percentuale tabular-nums"
            aria-hidden="true"
          >
            {{ segno }}{{ Math.abs(statistiche.variazionePercentuale) }}%
          </span>
          <!-- Solo in compatta: senza il selettore di periodo, il numero da
               solo non direbbe su quale finestra è calcolato. `aria-hidden`
               per lo stesso motivo dei due span sopra: la frase sr-only
               accanto lo dice già per esteso. -->
          <span v-if="compatta" class="andamento__periodo-inline" aria-hidden="true">
            · {{ etichettaPeriodo }}
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

.andamento__periodo-inline { color: var(--text-muted); }

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
