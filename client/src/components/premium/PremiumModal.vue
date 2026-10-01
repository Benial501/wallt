<script setup>
import { computed, ref } from 'vue';
import AppDialog from '@/components/common/AppDialog.vue';
import WButton from '@/components/common/WButton.vue';
import RichiestaPremium from '@/components/premium/RichiestaPremium.vue';
import { CheckCircle2, Sparkles, Lock } from '@/utils/appIcons';
import { usePianoStore } from '@/stores/piano.store';
import { useBankSyncStore } from '@/stores/bankSync.store';
import { useToastStore } from '@/stores/toast.store';

/**
 * Le due schermate di Premium per la sincronizzazione bancaria.
 *
 * Quale compare NON lo decide questo componente: lo decide il server, con
 * `beta.rivendicabile` e `beta.disponibili` in `GET /api/piano`. Il frontend
 * non conta i posti e non sa quanti ne restano se non perché gli è stato
 * detto; fra questa lettura e il click un altro utente può prendere
 * l'ultimo, e in quel caso `attivaBeta` riceve un 409 che viene mostrato
 * così com'è. È il server a decidere.
 *
 * ── Nessun pagamento finto ───────────────────────────────────────────────
 * Quando i posti sono esauriti compare la schermata Premium futura. Finché
 * `pagamenti_disponibili` è false non esiste nessuna CTA che renda Premium
 * chi la clicca: al suo posto c'è «Richiedi accesso», che registra
 * l'interesse e non concede niente. Il giorno in cui i pagamenti esistono,
 * l'unica modifica è sostituire quel ramo con l'avvio del checkout.
 */
const props = defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'attivato']);

const pianoStore = usePianoStore();
const bankSyncStore = useBankSyncStore();
const toastStore = useToastStore();

const attivando = ref(false);

const VANTAGGI = [
  'Sincronizzazione del tuo conto bancario',
  'Movimenti importati automaticamente',
  'Categorizzazione automatica delle spese',
  'Un conto bancario sincronizzato',
];

/** 'beta' = posto gratuito disponibile; 'premium' = posti esauriti. */
const schermata = computed(() => (pianoStore.puoAttivareBeta ? 'beta' : 'premium'));

const postiRimasti = computed(() => pianoStore.beta?.disponibili ?? null);

const attiva = async () => {
  attivando.value = true;
  try {
    const esito = await bankSyncStore.attivaBeta();
    toastStore.success(esito.message || 'WALLT Premium Beta attivato!');
    emit('attivato', esito);
    emit('close');
  } catch (err) {
    // Il caso dell'ultimo posto preso da un altro mentre questo modale era
    // aperto: il messaggio del server è già quello giusto, e porta l'utente
    // alla schermata Premium.
    const messaggio = err?.response?.data?.message
      || 'Non è stato possibile attivare la funzione. Riprova fra poco.';
    toastStore.error(messaggio);
    // Rilegge il piano: se i posti sono finiti, al prossimo apri vedrà la
    // schermata corretta invece di riprovare a vuoto.
    pianoStore.fetchPiano();
  } finally {
    attivando.value = false;
  }
};
</script>

<template>
  <AppDialog
    :open="props.open"
    :title="schermata === 'beta' ? 'WALLT Premium Beta' : 'WALLT Premium'"
    @close="emit('close')"
  >
    <div class="premium-modal">
      <div class="premium-modal__hero">
        <span class="premium-modal__icon">
          <component
            :is="schermata === 'beta' ? Sparkles : Lock"
            :size="26"
            :stroke-width="1.6"
            aria-hidden="true"
          />
        </span>
        <p v-if="schermata === 'beta'" class="premium-modal__claim">
          Sei tra i primi utenti di WALLT. Puoi attivare gratuitamente
          Premium Beta e collegare il tuo conto bancario.
        </p>
        <p v-else class="premium-modal__claim">
          La sincronizzazione bancaria è una funzione Premium: WALLT legge
          saldo e movimenti dalla tua banca, senza che tu debba inserirli.
        </p>
      </div>

      <ul class="premium-modal__vantaggi">
        <li v-for="vantaggio in VANTAGGI" :key="vantaggio">
          <CheckCircle2 :size="17" :stroke-width="1.75" aria-hidden="true" />
          <span>{{ vantaggio }}</span>
        </li>
      </ul>

      <p class="premium-modal__privacy">
        WALLT non chiede mai le credenziali della tua banca: autorizzi il
        collegamento sul sito della banca stessa, e puoi revocarlo quando vuoi.
      </p>

      <template v-if="schermata === 'beta'">
        <p v-if="postiRimasti !== null" class="premium-modal__posti">
          {{ postiRimasti === 1 ? 'Resta 1 posto gratuito' : `Restano ${postiRimasti} posti gratuiti` }}
        </p>
        <WButton variant="primary" size="lg" :loading="attivando" @click="attiva">
          Attiva gratuitamente
        </WButton>
        <p class="premium-modal__nota">
          Gratis, nessun metodo di pagamento richiesto.
        </p>
      </template>

      <template v-else>
        <!-- Finché i pagamenti non esistono NON c'è nessuna CTA che possa
             far credere a un acquisto. Quando esisteranno, qui si sostituisce
             questo ramo con l'avvio del checkout: il resto della schermata
             non cambia. -->
        <WButton
          v-if="pianoStore.pagamentiDisponibili"
          variant="primary"
          size="lg"
          @click="emit('close')"
        >
          Passa a Premium
        </WButton>
        <template v-else>
          <!-- Prima qui c'era un pulsante disabilitato "Disponibile
               prossimamente": diceva la verità ma non raccoglieva niente, e
               a chi voleva la funzione non lasciava nessun modo di farsi
               avanti. Adesso la richiesta esiste, viene registrata e lo
               staff la vede — senza che nulla venga concesso in automatico. -->
          <p class="premium-modal__nota">
            I posti della beta gratuita sono esauriti. Stiamo preparando
            WALLT Premium: lasciaci il tuo interesse e ti avviseremo appena
            potrai accedere.
          </p>
          <RichiestaPremium />
        </template>
      </template>
    </div>
  </AppDialog>
</template>

<style scoped>
.premium-modal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.premium-modal__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;
}

.premium-modal__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-pill);
  color: var(--text-primary);
  background: var(--glass-interactive-bg);
  border: 1px solid var(--glass-interactive-border);
}

.premium-modal__claim {
  margin: 0;
  max-width: 30rem;
  font-size: 0.9375rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.premium-modal__vantaggi {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0.875rem 1rem;
  list-style: none;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-lg);
}

.premium-modal__vantaggi li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-primary);
}

.premium-modal__vantaggi svg {
  flex-shrink: 0;
  margin-top: 0.0625rem;
  color: var(--positive);
}

.premium-modal__privacy,
.premium-modal__nota {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
  text-align: center;
}

.premium-modal__posti {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
}
</style>
