<script setup>
import { onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import 'dayjs/locale/it';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import AppDialog from '@/components/common/AppDialog.vue';
import DataState from '@/components/common/DataState.vue';
import PremiumModal from '@/components/premium/PremiumModal.vue';
import RichiestaPremium from '@/components/premium/RichiestaPremium.vue';
import {
  Sparkles, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Trash2,
} from '@/utils/appIcons';
import { usePianoStore } from '@/stores/piano.store';
import { useBankSyncStore } from '@/stores/bankSync.store';
import { useToastStore } from '@/stores/toast.store';

dayjs.locale('it');

/**
 * Impostazioni → Piano e abbonamento.
 *
 * Mostra il piano reale e, separatamente, da dove viene il permesso: un
 * utente a cui lo staff ha attivato Bank Sync legge "WALLT Free" con
 * "Sincronizzazione bancaria: attiva — attivato dallo staff WALLT". Dirgli
 * "Premium Beta" sarebbe comodo e falso, e renderebbe impossibile sapere
 * quanti dei posti beta sono davvero occupati.
 *
 * ── Nessuna fatturazione finta ───────────────────────────────────────────
 * Finché `pagamenti_disponibili` è false non c'è prezzo, non c'è data di
 * rinnovo, non c'è "Gestisci abbonamento". Per gli utenti beta il prezzo è
 * "Gratis", che è vero. I campi dell'abbonamento compaiono solo quando un
 * abbonamento esiste davvero.
 *
 * ── La cancellazione dei dati importati vive qui ─────────────────────────
 * È separata dallo scollegamento (che sta nella pagina Conti, dove si
 * gestisce la banca) proprio perché non succeda per sbaglio: è distruttiva,
 * irreversibile, e richiede la riverifica d'identità come il reset e
 * l'eliminazione dell'account.
 */
/**
 * Aperta di default.
 *
 * È la sezione che risponde a «cosa ho?» e «come ottengo la
 * sincronizzazione bancaria?»: tenerla chiusa costringe a un click per
 * leggere l'unica informazione che la pagina dà sul piano, e nasconde
 * l'unico punto da cui si può chiedere l'accesso a Premium.
 */
const aperto = ref(true);

const pianoStore = usePianoStore();
const bankSyncStore = useBankSyncStore();
const toastStore = useToastStore();

const showPremium = ref(false);
const showElimina = ref(false);
const confermaTesto = ref('');
const eliminando = ref(false);

onMounted(() => {
  if (!pianoStore.risorsa.lastUpdated) pianoStore.fetchPiano();
  if (!bankSyncStore.risorsaStato.lastUpdated) bankSyncStore.fetchStato();
});

const scadenza = computed(() => {
  const fine = pianoStore.abbonamento?.periodo_fine;
  return fine ? dayjs(fine).format('D MMMM YYYY') : null;
});

const haDatiImportati = computed(() => {
  const metriche = bankSyncStore.connessione?.metriche;
  return !!metriche && metriche.movimenti_importati > 0;
});

const apriElimina = () => {
  confermaTesto.value = '';
  showElimina.value = true;
};

const confermaEliminazione = async () => {
  if (confermaTesto.value !== 'ELIMINA') return;
  eliminando.value = true;
  try {
    const esito = await bankSyncStore.eliminaDatiImportati(confermaTesto.value);
    toastStore.success(esito.message || 'Movimenti importati eliminati.');
    showElimina.value = false;
  } catch (err) {
    toastStore.error(
      err?.response?.data?.message || 'Non è stato possibile eliminare i movimenti importati.',
    );
  } finally {
    eliminando.value = false;
  }
};
</script>

<template>
  <WCard id="piano" class="section-card">
    <button class="section-toggle" @click="aperto = !aperto">
      <Sparkles :size="18" :stroke-width="1.75" aria-hidden="true" />
      <span>Piano e abbonamento</span>
      <component :is="aperto ? ChevronDown : ChevronRight" :size="16" aria-hidden="true" />
    </button>

    <div v-if="aperto" class="section-body">
      <DataState
        :stato="pianoStore.risorsa.stato"
        :last-updated="pianoStore.risorsa.lastUpdated"
        messaggio-errore="Non è stato possibile leggere il tuo piano."
        :skeleton-lines="3"
        @riprova="pianoStore.risorsa.riprova()"
      >
        <dl class="piano__dati">
          <div>
            <dt>Piano attuale</dt>
            <dd>{{ pianoStore.pianoEtichetta }}</dd>
          </div>
          <div v-if="pianoStore.gratuito">
            <dt>Prezzo</dt>
            <dd>Gratis</dd>
          </div>
          <div v-if="pianoStore.abbonamento">
            <dt>Stato abbonamento</dt>
            <dd>{{ pianoStore.abbonamento.stato }}</dd>
          </div>
          <div v-if="scadenza">
            <dt>{{ pianoStore.abbonamento?.disdetta_a_fine_periodo ? 'Attivo fino al' : 'Rinnovo' }}</dt>
            <dd>{{ scadenza }}</dd>
          </div>
        </dl>

        <!-- Il PERMESSO, dichiarato separatamente dal piano. -->
        <div class="piano__feature">
          <p class="piano__feature-riga">
            <component
              :is="pianoStore.bankSyncAttiva ? CheckCircle2 : AlertTriangle"
              :size="16"
              :stroke-width="1.8"
              :class="pianoStore.bankSyncAttiva ? 'piano__ok' : 'piano__off'"
              aria-hidden="true"
            />
            <span>
              Sincronizzazione bancaria:
              <strong>{{ pianoStore.bankSyncAttiva ? 'attiva' : 'non attiva' }}</strong>
            </span>
          </p>
          <p v-if="pianoStore.bankSyncOrigine" class="piano__origine">
            {{ pianoStore.bankSyncOrigine }}
          </p>
        </div>

        <!-- Nessun pulsante di pagamento finché i pagamenti non esistono. -->
        <WButton
          v-if="!pianoStore.bankSyncAttiva"
          variant="secondary"
          size="md"
          @click="showPremium = true"
        >
          {{ pianoStore.puoAttivareBeta ? 'Attiva WALLT Premium Beta' : 'Scopri WALLT Premium' }}
        </WButton>

        <!-- Posti finiti: invece di comunicare soltanto un'attesa, si
             raccoglie l'interesse. Richiedere non concede niente — lo stato
             della richiesta è separato dallo stato del permesso, che resta
             poco sopra. -->
        <template v-if="pianoStore.betaNonAttivabile">
          <p class="hint hint--inline">
            {{ pianoStore.betaEsaurita
              ? 'I posti della beta gratuita sono esauriti.'
              : 'Le attivazioni gratuite sono momentaneamente chiuse.' }}
            Puoi chiedere di accedere a WALLT Premium: ti avviseremo appena
            sarà possibile.
          </p>
          <RichiestaPremium />
        </template>

        <!-- Azione distruttiva, visibile solo se c'è davvero qualcosa da
             eliminare: proporla a vuoto sarebbe un invito senza oggetto. -->
        <div v-if="haDatiImportati" class="piano__pericolo">
          <p class="piano__pericolo-titolo">Movimenti importati dalla banca</p>
          <p class="piano__pericolo-testo">
            Hai {{ bankSyncStore.connessione.metriche.movimenti_importati }} movimenti
            arrivati dalla sincronizzazione bancaria. Scollegare la banca non li
            cancella: questa è un'operazione separata e irreversibile.
          </p>
          <WButton variant="danger" size="md" @click="apriElimina">
            <Trash2 :size="16" :stroke-width="1.75" aria-hidden="true" />
            Elimina i movimenti importati
          </WButton>
        </div>
      </DataState>
    </div>

    <PremiumModal :open="showPremium" @close="showPremium = false" />

    <AppDialog
      :open="showElimina"
      title="Eliminare i movimenti importati?"
      @close="showElimina = false"
    >
      <div class="piano__conferma">
        <p class="piano__conferma-avviso">
          <AlertTriangle :size="16" :stroke-width="1.75" aria-hidden="true" />
          <span>
            Verranno eliminati definitivamente tutti i movimenti arrivati dalla
            banca. I movimenti che hai inserito a mano NON vengono toccati, e il
            saldo del conto verrà ricalcolato su quelli che restano.
          </span>
        </p>

        <div class="field">
          <label for="piano-conferma">Digita ELIMINA per confermare</label>
          <input
            id="piano-conferma"
            v-model="confermaTesto"
            class="form-input"
            autocomplete="off"
            placeholder="ELIMINA"
          />
        </div>

        <WButton
          variant="danger"
          size="lg"
          :loading="eliminando"
          :disabled="confermaTesto !== 'ELIMINA'"
          @click="confermaEliminazione"
        >
          Elimina definitivamente
        </WButton>
      </div>
    </AppDialog>
  </WCard>
</template>

<style scoped>
/**
 * ── Perché queste regole sono ripetute qui ───────────────────────────────
 * `.section-toggle`, `.section-body` e `.hint` sono definite in
 * `ImpostazioniView.vue` dentro un blocco `<style scoped>`: Vue le compila
 * con l'attributo di scope di QUELLA vista, che arriva soltanto sul nodo
 * radice di questo componente (per questo `.section-card` funziona) e non
 * sui suoi discendenti. Il risultato era una sezione senza padding,
 * appiccicata al bordo della scheda, con l'intestazione fuori scala e il
 * testo di nota grande come il corpo: visibilmente diversa da tutte le
 * altre voci della pagina.
 *
 * Non è una duplicazione da ripulire: ogni componente che usa `.hint` in
 * questo progetto se la definisce (NotificheSettings, CategorieView,
 * InvestimentiView, PianoSmartView, ScommesseView). Chi spostasse queste
 * regole in un foglio globale deve anche verificare `.section-card`, che in
 * `ImportaView.vue` vale `padding: 1.25rem` e qui `padding: 0`.
 *
 * I valori devono restare allineati a `ImpostazioniView.vue`.
 */
.section-toggle {
  width: 100%;
  padding: 1rem 1.25rem;
  background: none;
  border: none;
  text-align: left;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.section-toggle svg { flex-shrink: 0; stroke: currentColor; }
.section-toggle span { flex: 1; }

.section-body {
  padding: 0 1.25rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.hint {
  margin-left: 1.75rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.hint--inline {
  margin-left: 0;
  margin-bottom: 0.25rem;
}

/**
 * Una riga per voce, etichetta a sinistra e valore a destra.
 *
 * Prima era una fila orizzontale di coppie: con due voci corte accanto
 * ("Piano attuale  Prezzo" sopra, "WALLT Free  Gratis" sotto) si leggeva
 * come l'intestazione e la riga di una tabella, e capire quale valore
 * appartenesse a quale etichetta richiedeva un secondo sguardo. In colonna
 * l'abbinamento è immediato, e la forma è la stessa delle altre righe
 * della pagina impostazioni (etichetta a sinistra, stato a destra).
 */
.piano__dati {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
}

.piano__dati > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.piano__dati dt {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.piano__dati dd {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  text-align: right;
}

.piano__feature {
  padding: 0.625rem 0.75rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-md);
}

.piano__feature-riga {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.piano__feature-riga svg { flex-shrink: 0; margin-top: 0.125rem; }
.piano__ok { color: var(--positive); }
.piano__off { color: var(--text-muted); }

.piano__origine {
  margin: 0.25rem 0 0 1.5rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.piano__pericolo {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-left: 3px solid var(--negative);
  border-radius: var(--radius-md);
}

.piano__pericolo-titolo {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
}

.piano__pericolo-testo {
  margin: 0;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.piano__conferma {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.piano__conferma-avviso {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  padding: 0.625rem 0.75rem;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-primary);
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-left: 3px solid var(--negative);
  border-radius: var(--radius-md);
}

.piano__conferma-avviso svg { flex-shrink: 0; margin-top: 0.125rem; color: var(--negative); }

.piano__google { display: flex; justify-content: center; min-height: 44px; }

.piano__errore {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--negative);
}
</style>
