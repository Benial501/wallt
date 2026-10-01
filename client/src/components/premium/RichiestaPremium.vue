<script setup>
import { computed, onMounted, ref } from 'vue';
import WButton from '@/components/common/WButton.vue';
import { CheckCircle2, AlertTriangle, Sparkles } from '@/utils/appIcons';
import { usePianoStore } from '@/stores/piano.store';
import { useToastStore } from '@/stores/toast.store';
import {
  RICHIESTA_PENDING, RICHIESTA_REJECTED, RICHIESTA_CANCELLED,
} from '@/utils/entitlements';

/**
 * «Richiedi accesso a WALLT Premium» e lo stato della richiesta.
 *
 * Sostituisce il pulsante disabilitato "Disponibile prossimamente" quando i
 * posti della beta gratuita sono finiti: dire soltanto "prossimamente" a chi
 * vuole la funzione non raccoglie niente e non dà a quella persona nessun
 * modo di farsi avanti.
 *
 * ── Nessuna promessa di pagamento ────────────────────────────────────────
 * Richiedere non apre un checkout, non chiede un metodo di pagamento e non
 * attiva niente: crea una riga che lo staff vede nel pannello di
 * amministrazione. Il testo lo dice esplicitamente, perché un pulsante che
 * sembri un acquisto sarebbe peggio del pulsante disabilitato che sostituisce.
 *
 * ── Chi decide cosa si vede ──────────────────────────────────────────────
 * Il server. `puoRichiedere` riflette la risposta di `GET /premium/richieste`:
 * se il client sbagliasse, la POST riceverebbe comunque lo stesso stato e il
 * messaggio resterebbe corretto.
 */
const pianoStore = usePianoStore();
const toastStore = useToastStore();

const inCorso = ref(false);

onMounted(() => {
  if (!pianoStore.risorsaRichiesta.lastUpdated) pianoStore.fetchRichiesta();
});

const richiesta = computed(() => pianoStore.richiesta);
const messaggio = computed(() => pianoStore.messaggioRichiesta);

/** Lo stato annullato non è una notizia: per l'utente equivale a non avere
 * nessuna richiesta, e mostrargli "Richiesta annullata" sopra il pulsante
 * per richiedere sarebbe rumore. */
const mostraStato = computed(() => (
  !!richiesta.value && richiesta.value.status !== RICHIESTA_CANCELLED
));

const inAttesa = computed(() => richiesta.value?.status === RICHIESTA_PENDING);
const rifiutata = computed(() => richiesta.value?.status === RICHIESTA_REJECTED);

const richiedi = async () => {
  inCorso.value = true;
  try {
    const esito = await pianoStore.richiediAccesso();
    toastStore.success(esito.message || 'Richiesta inviata.');
  } catch (err) {
    toastStore.error(
      err?.response?.data?.message || 'Non è stato possibile inviare la richiesta. Riprova fra poco.',
    );
  } finally {
    inCorso.value = false;
  }
};

const annulla = async () => {
  if (!richiesta.value) return;
  inCorso.value = true;
  try {
    const esito = await pianoStore.annullaRichiesta(richiesta.value.id);
    toastStore.success(esito.message || 'Richiesta annullata.');
  } catch (err) {
    toastStore.error(
      err?.response?.data?.message || 'Non è stato possibile annullare la richiesta.',
    );
  } finally {
    inCorso.value = false;
  }
};
</script>

<template>
  <div class="richiesta">
    <div v-if="mostraStato && messaggio" class="richiesta__stato">
      <component
        :is="rifiutata ? AlertTriangle : CheckCircle2"
        :size="18"
        :stroke-width="1.75"
        :class="rifiutata ? 'richiesta__icona--attesa' : 'richiesta__icona--ok'"
        aria-hidden="true"
      />
      <div>
        <p class="richiesta__titolo">{{ messaggio.titolo }}</p>
        <p class="richiesta__testo">{{ messaggio.testo }}</p>
      </div>
    </div>

    <template v-if="pianoStore.puoRichiedere">
      <WButton variant="primary" size="lg" :loading="inCorso" @click="richiedi">
        <Sparkles :size="17" :stroke-width="1.75" aria-hidden="true" />
        Richiedi accesso a WALLT Premium
      </WButton>
      <p class="richiesta__nota">
        Non è un acquisto e non ti verrà chiesto nessun metodo di pagamento:
        ci fai sapere che ti interessa, e ti avvisiamo quando puoi entrare.
      </p>
    </template>

    <button
      v-else-if="inAttesa"
      type="button"
      class="richiesta__annulla"
      :disabled="inCorso"
      @click="annulla"
    >
      Annulla la richiesta
    </button>
  </div>
</template>

<style scoped>
.richiesta {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.richiesta__stato {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem 0.875rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-lg);
}

.richiesta__stato svg { flex-shrink: 0; margin-top: 0.0625rem; }
.richiesta__icona--ok { color: var(--positive); }
.richiesta__icona--attesa { color: var(--warning); }

.richiesta__titolo {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.richiesta__testo {
  margin: 0.125rem 0 0;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.richiesta__nota {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
  text-align: center;
}

.richiesta__annulla {
  align-self: center;
  min-height: 44px;
  padding: 0 0.5rem;
  font-family: inherit;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
}

.richiesta__annulla:hover:not(:disabled) { color: var(--text-secondary); }
.richiesta__annulla:disabled { opacity: 0.6; cursor: default; }

.richiesta__annulla:focus-visible {
  outline: none;
  border-radius: var(--radius-sm);
  box-shadow: var(--focus-ring);
}
</style>
