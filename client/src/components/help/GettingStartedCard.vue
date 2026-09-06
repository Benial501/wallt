<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { CheckCircle2, CircleHelp, X } from '@/utils/appIcons';

/**
 * Riquadro "Primi passi" in Home.
 *
 * Non esegue richieste proprie: riceve dal genitore lo stato dei traguardi,
 * già derivato dai dati che la dashboard carica comunque. Ogni stato può
 * valere 'fatto', 'da-fare' oppure 'sconosciuto' (caricamento fallito).
 * Nessuna azione qui crea, importa, elimina o azzera dati.
 */
const props = defineProps({
  contiState: { type: String, default: 'sconosciuto' },
  movimentiState: { type: String, default: 'sconosciuto' },
  budgetState: { type: String, default: 'sconosciuto' },
});

const emit = defineEmits(['add-movimento', 'hide']);

const router = useRouter();

const steps = computed(() => [
  {
    id: 'conto',
    stato: props.contiState,
    titolo: 'Aggiungi il tuo primo conto',
    testo: 'Un conto è il posto dove registri i soldi: banca, carta, contanti. WALLT non si collega alla tua banca.',
    azioni: [{ label: 'Vai a I miei conti', onClick: () => router.push('/conti') }],
  },
  {
    id: 'movimento',
    stato: props.movimentiState,
    titolo: 'Registra un movimento oppure importa un estratto',
    testo: 'Due strade alternative: inserisci una spesa a mano, oppure carica il file dell\'estratto conto della banca.',
    azioni: [
      { label: 'Registra un movimento', onClick: () => emit('add-movimento') },
      { label: 'Importa un estratto', onClick: () => router.push('/importa'), secondaria: true },
    ],
  },
  {
    id: 'budget',
    stato: props.budgetState,
    titolo: 'Scopri il budget',
    facoltativo: true,
    testo: 'Facoltativo: imposta un tetto di spesa mensile e tieni d\'occhio quanto resta.',
    azioni: [{ label: 'Vai al budget', onClick: () => router.push('/budget'), secondaria: true }],
  },
]);

const numeroStep = (index) => index + 1;
</script>

<template>
  <section class="getting-started" aria-labelledby="getting-started-title">
    <header class="getting-started__header">
      <div class="getting-started__heading">
        <h2 id="getting-started-title" class="getting-started__title">Parti da qui</h2>
        <p class="getting-started__sub">
          Aggiungi un conto, poi registra una spesa oppure importa un estratto conto.
        </p>
      </div>
      <button
        type="button"
        class="getting-started__hide"
        aria-label="Nascondi il riquadro Primi passi"
        @click="emit('hide')"
      >
        <X :size="16" :stroke-width="1.75" aria-hidden="true" />
      </button>
    </header>

    <ol class="getting-started__steps">
      <li
        v-for="(step, index) in steps"
        :key="step.id"
        class="step"
        :class="{ 'step--done': step.stato === 'fatto' }"
      >
        <span class="step__marker" aria-hidden="true">
          <CheckCircle2 v-if="step.stato === 'fatto'" :size="18" :stroke-width="2" />
          <CircleHelp v-else-if="step.stato === 'sconosciuto'" :size="16" :stroke-width="1.75" />
          <template v-else>{{ numeroStep(index) }}</template>
        </span>

        <div class="step__body">
          <p class="step__title">
            {{ step.titolo }}
            <span v-if="step.facoltativo" class="step__tag">facoltativo</span>
            <span v-if="step.stato === 'fatto'" class="step__tag step__tag--done">fatto</span>
          </p>
          <p class="step__text">{{ step.testo }}</p>
          <p v-if="step.stato === 'sconosciuto'" class="step__unknown">
            Non è stato possibile verificare questo passaggio adesso.
          </p>

          <div class="step__actions">
            <button
              v-for="azione in step.azioni"
              :key="azione.label"
              type="button"
              class="step__action"
              :class="{ 'step__action--secondary': azione.secondaria }"
              @click="azione.onClick()"
            >
              {{ azione.label }}
            </button>
          </div>
        </div>
      </li>
    </ol>

    <footer class="getting-started__footer">
      <button type="button" class="getting-started__link" @click="router.push('/aiuto')">
        Apri la guida
      </button>
      <button type="button" class="getting-started__link" @click="emit('hide')">
        Nascondi
      </button>
    </footer>
  </section>
</template>

<style scoped>
.getting-started {
  padding: 1rem 1.125rem 0.875rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.getting-started__header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.875rem;
}

.getting-started__heading { flex: 1; min-width: 0; }

.getting-started__title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.getting-started__sub {
  margin-top: 0.1875rem;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

.getting-started__hide {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface-subtle);
  color: var(--text-muted);
  cursor: pointer;
}
.getting-started__hide svg { stroke: currentColor; }
.getting-started__hide:hover { color: var(--text-primary); }
.getting-started__hide:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

.getting-started__steps {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.step__marker {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface-inset);
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
}
.step__marker svg { stroke: currentColor; }

.step--done .step__marker {
  border-color: rgba(0, 168, 132, 0.4);
  background: var(--accent-light);
  color: var(--accent-green);
}

.step__body { flex: 1; min-width: 0; }

.step__title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.35;
}

.step--done .step__title { color: var(--text-secondary); }

.step__tag {
  display: inline-block;
  margin-left: 0.375rem;
  padding: 0.0625rem 0.4375rem;
  border-radius: 999px;
  background: var(--surface-inset);
  color: var(--text-muted);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  vertical-align: middle;
}

.step__tag--done {
  background: var(--accent-light);
  color: var(--accent-green);
}

.step__text {
  margin-top: 0.1875rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.step__unknown {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--warning);
}

.step__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.step__action {
  min-height: 36px;
  padding: 0.5rem 0.875rem;
  border-radius: 999px;
  border: 1px solid transparent;
  background: linear-gradient(135deg, var(--accent-green), var(--accent-hover));
  color: #0A0A0F;
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.step__action:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

.step__action--secondary {
  background: var(--bg-input);
  border-color: var(--border);
  color: var(--text-primary);
  font-weight: 600;
}
.step__action--secondary:hover { border-color: var(--accent-green); }

.step--done .step__action {
  background: var(--bg-input);
  border-color: var(--border);
  color: var(--text-secondary);
  font-weight: 600;
}

.getting-started__footer {
  display: flex;
  gap: 1rem;
  margin-top: 0.875rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--divider);
}

.getting-started__link {
  background: none;
  border: none;
  padding: 0.375rem 0;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  min-height: 32px;
}
.getting-started__link:hover { color: var(--accent-green); }
.getting-started__link:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; border-radius: 4px; }
</style>
