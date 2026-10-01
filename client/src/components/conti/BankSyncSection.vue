<script setup>
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import 'dayjs/locale/it';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import AppDialog from '@/components/common/AppDialog.vue';
import DataState from '@/components/common/DataState.vue';
import PremiumBadge from '@/components/premium/PremiumBadge.vue';
import PremiumModal from '@/components/premium/PremiumModal.vue';
import {
  Landmark, RefreshCw, AlertTriangle, CheckCircle2, ChevronRight,
} from '@/utils/appIcons';
import { usePianoStore } from '@/stores/piano.store';
import { useBankSyncStore } from '@/stores/bankSync.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { STATO_SOSPESA_ENTITLEMENT } from '@/utils/entitlements';

dayjs.locale('it');

/**
 * La sezione Bank Sync dentro "I miei conti".
 *
 * ── Perché è qui e non in una pagina a parte ─────────────────────────────
 * Il brief chiede che Premium si presenti dove l'utente INCONTRA la funzione.
 * Collegare una banca è gestire i propri conti: non ha senso una seconda
 * gestione account da qualche altra parte, e non ha senso un banner su ogni
 * schermata.
 *
 * ── Tre stati, tre azioni diverse ────────────────────────────────────────
 *  • nessun conto collegato → invito (beta gratuita o Premium futuro);
 *  • conto collegato → saldo, ultimo aggiornamento, Sincronizza, Gestisci;
 *  • conto collegato con problema → il messaggio e l'azione corretti, da
 *    `utils/entitlements.js`: "Ricollega" quando il consenso è scaduto,
 *    "Riprova" quando la banca non risponde. Mai un errore generico.
 *
 * ── Se la banca è offline, l'interfaccia non si svuota ───────────────────
 * `DataState` mostra l'ultimo stato riuscito con un avviso. Il saldo a
 * schermo resta quello noto, con l'orario a cui si riferisce.
 */
const pianoStore = usePianoStore();
const bankSyncStore = useBankSyncStore();
const toastStore = useToastStore();
const { formatValuta } = useValuta();

const showPremium = ref(false);
const showGestisci = ref(false);
const showScollega = ref(false);
const showSostituisci = ref(false);
const scollegando = ref(false);

onMounted(() => {
  bankSyncStore.fetchStato();
  if (!pianoStore.risorsa.lastUpdated) pianoStore.fetchPiano();
});

const connessione = computed(() => bankSyncStore.connessione);
const haPermesso = computed(() => pianoStore.bankSyncAttiva);

const sospesa = computed(() => connessione.value?.stato === STATO_SOSPESA_ENTITLEMENT);

/** L'orario assoluto dell'ultimo aggiornamento riuscito. Non relativo:
 * "3 minuti fa" invecchierebbe in silenzio senza un timer (stessa scelta di
 * DataState). */
const ultimoAggiornamento = computed(() => {
  const quando = bankSyncStore.ultimaSincronizzazione;
  if (!quando) return null;
  const d = dayjs(quando);
  return d.isSame(dayjs(), 'day')
    ? `Oggi ${d.format('HH:mm')}`
    : `${d.format('D MMMM')} alle ${d.format('HH:mm')}`;
});

const consensoInScadenza = computed(() => {
  const scade = connessione.value?.consenso_scade_il;
  if (!scade) return null;
  const giorni = dayjs(scade).diff(dayjs(), 'day');
  // Avvisare 14 giorni prima: abbastanza perché l'utente ci pensi senza che
  // l'avviso diventi arredamento permanente.
  return giorni >= 0 && giorni <= 14 ? giorni : null;
});

const sincronizza = async () => {
  const esito = await bankSyncStore.sincronizza();
  if (esito.ok) {
    const { importati = 0, duplicati_evitati: duplicati = 0 } = esito.esito;
    if (importati > 0) {
      toastStore.success(
        importati === 1 ? '1 movimento importato' : `${importati} movimenti importati`,
      );
    } else {
      toastStore.success(
        duplicati > 0 ? 'Sei già aggiornato' : 'Nessun movimento nuovo dalla banca',
      );
    }
  } else {
    // Il titolo del codice d'errore, non un messaggio generico: è ciò che
    // distingue "ricollega" da "riprova".
    toastStore.error(esito.errore.titolo);
  }
};

const avviaCollegamento = async ({ sostituisci = false } = {}) => {
  try {
    // Un solo istituto non è una scelta che il client possa fare per
    // l'utente: in questa prima versione si parte dall'elenco del provider.
    await bankSyncStore.fetchIstituti();
    const istituti = bankSyncStore.istituti;
    if (istituti.length === 0) {
      toastStore.error('Nessuna banca disponibile al momento. Riprova più tardi.');
      return;
    }
    const esito = await bankSyncStore.avviaCollegamento({
      institutionId: istituti[0].id,
      sostituisci,
    });
    // La navigazione verso la banca è un effetto sul browser e sta qui, non
    // nello store.
    window.location.assign(esito.url_autorizzazione);
  } catch (err) {
    toastStore.error(
      err?.response?.data?.message
      || 'Non è stato possibile avviare il collegamento. Riprova fra poco.',
    );
  }
};

const ricollega = async () => {
  try {
    const esito = await bankSyncStore.ricollega();
    window.location.assign(esito.url_autorizzazione);
  } catch (err) {
    toastStore.error(
      err?.response?.data?.message || 'Non è stato possibile ricollegare il conto.',
    );
  }
};

const scollega = async () => {
  scollegando.value = true;
  try {
    await bankSyncStore.scollega();
    toastStore.success('Conto scollegato. I movimenti già importati restano disponibili.');
    showScollega.value = false;
    showGestisci.value = false;
  } catch (err) {
    toastStore.error(err?.response?.data?.message || 'Non è stato possibile scollegare il conto.');
  } finally {
    scollegando.value = false;
  }
};

const confermaSostituzione = async () => {
  showSostituisci.value = false;
  showGestisci.value = false;
  await avviaCollegamento({ sostituisci: true });
};
</script>

<template>
  <section class="bank-sync">
    <div class="bank-sync__divisore" aria-hidden="true" />

    <DataState
      :stato="bankSyncStore.risorsaStato.stato"
      :last-updated="bankSyncStore.risorsaStato.lastUpdated"
      messaggio-errore="Non è stato possibile leggere lo stato del collegamento bancario."
      skeleton-type="card"
      :skeleton-lines="2"
      @riprova="bankSyncStore.risorsaStato.riprova()"
    >
      <!-- ── Nessun conto collegato ─────────────────────────────────── -->
      <WCard v-if="!connessione" class="bank-sync__card">
        <div class="bank-sync__intestazione">
          <span class="bank-sync__icona">
            <Landmark :size="22" :stroke-width="1.65" aria-hidden="true" />
          </span>
          <div class="bank-sync__titolo-riga">
            <h2 class="bank-sync__titolo">Collega la tua banca</h2>
            <PremiumBadge v-if="!haPermesso" />
          </div>
        </div>

        <p class="bank-sync__testo">
          Sincronizza automaticamente saldo e movimenti, senza inserirli a mano.
          WALLT non chiede mai le credenziali della tua banca.
        </p>

        <WButton
          v-if="haPermesso"
          variant="primary"
          size="md"
          :loading="bankSyncStore.collegando"
          @click="avviaCollegamento()"
        >
          Collega conto bancario
        </WButton>
        <WButton
          v-else
          variant="secondary"
          size="md"
          @click="showPremium = true"
        >
          Scopri come attivarlo
          <ChevronRight :size="16" :stroke-width="1.75" aria-hidden="true" />
        </WButton>
      </WCard>

      <!-- ── Conto collegato ─────────────────────────────────────────── -->
      <WCard v-else class="bank-sync__card">
        <div class="bank-sync__intestazione">
          <span class="bank-sync__icona">
            <Landmark :size="22" :stroke-width="1.65" aria-hidden="true" />
          </span>
          <div class="bank-sync__titolo-riga">
            <h2 class="bank-sync__titolo">
              {{ connessione.istituto.nome || connessione.conto_nome || 'Conto bancario' }}
            </h2>
            <span
              class="bank-sync__stato"
              :class="{
                'bank-sync__stato--ok': connessione.stato === 'attiva',
                'bank-sync__stato--problema': connessione.richiede_riconnessione || connessione.stato === 'errore',
              }"
            >
              <component
                :is="connessione.stato === 'attiva' ? CheckCircle2 : AlertTriangle"
                :size="14"
                :stroke-width="1.9"
                aria-hidden="true"
              />
              {{ connessione.stato === 'attiva' ? 'Connesso' : 'Da sistemare' }}
            </span>
          </div>
        </div>

        <!-- Un problema di sincronizzazione NON svuota la card: il saldo noto
             resta, con l'orario a cui si riferisce. -->
        <div
          v-if="bankSyncStore.erroreConnessione"
          class="bank-sync__avviso"
          role="status"
        >
          <AlertTriangle :size="16" :stroke-width="1.75" aria-hidden="true" />
          <div>
            <p class="bank-sync__avviso-titolo">{{ bankSyncStore.erroreConnessione.titolo }}</p>
            <p class="bank-sync__avviso-testo">{{ bankSyncStore.erroreConnessione.testo }}</p>
            <p v-if="ultimoAggiornamento" class="bank-sync__avviso-orario">
              Ultimo aggiornamento riuscito: {{ ultimoAggiornamento }}
            </p>
          </div>
        </div>

        <div v-else-if="sospesa" class="bank-sync__avviso" role="status">
          <AlertTriangle :size="16" :stroke-width="1.75" aria-hidden="true" />
          <div>
            <p class="bank-sync__avviso-titolo">Sincronizzazione sospesa</p>
            <p class="bank-sync__avviso-testo">
              Il tuo accesso alla sincronizzazione bancaria non è attivo.
              I movimenti già importati restano disponibili.
            </p>
          </div>
        </div>

        <p
          v-else-if="consensoInScadenza !== null"
          class="bank-sync__avviso bank-sync__avviso--leggero"
          role="status"
        >
          <AlertTriangle :size="16" :stroke-width="1.75" aria-hidden="true" />
          <span>
            L'autorizzazione della banca va rinnovata
            {{ consensoInScadenza === 0 ? 'oggi' : `fra ${consensoInScadenza} giorni` }}.
          </span>
        </p>

        <dl class="bank-sync__dati">
          <div>
            <dt>Saldo</dt>
            <dd class="bank-sync__saldo">{{ formatValuta(connessione.saldo ?? 0) }}</dd>
          </div>
          <div>
            <dt>Ultimo aggiornamento</dt>
            <dd>{{ ultimoAggiornamento || 'Mai' }}</dd>
          </div>
          <div v-if="connessione.iban_mascherato">
            <dt>Conto</dt>
            <dd>{{ connessione.iban_mascherato }}</dd>
          </div>
        </dl>

        <div class="bank-sync__azioni">
          <WButton
            v-if="connessione.richiede_riconnessione"
            variant="primary"
            size="md"
            :loading="bankSyncStore.collegando"
            @click="ricollega"
          >
            Ricollega banca
          </WButton>
          <WButton
            v-else-if="connessione.sincronizzabile"
            variant="primary"
            size="md"
            :loading="bankSyncStore.sincronizzando"
            @click="sincronizza"
          >
            <RefreshCw :size="16" :stroke-width="1.75" aria-hidden="true" />
            Sincronizza
          </WButton>

          <!-- Con un conto già collegato NON si offre "aggiungi un altro":
               il limite è di un conto sincronizzato per utente, e il server
               lo rifiuterebbe. -->
          <WButton variant="secondary" size="md" @click="showGestisci = true">
            Gestisci conto
          </WButton>
        </div>
      </WCard>
    </DataState>

    <PremiumModal
      :open="showPremium"
      @close="showPremium = false"
      @attivato="bankSyncStore.fetchStato()"
    />

    <!-- ── Gestisci conto ──────────────────────────────────────────────── -->
    <AppDialog :open="showGestisci" title="Gestisci conto bancario" @close="showGestisci = false">
      <div class="bank-sync__gestisci">
        <button
          v-if="connessione?.sincronizzabile"
          type="button"
          class="bank-sync__voce"
          :disabled="bankSyncStore.sincronizzando"
          @click="sincronizza"
        >
          <span>Sincronizza ora</span>
          <small>Scarica i movimenti più recenti dalla banca</small>
        </button>

        <button type="button" class="bank-sync__voce" @click="ricollega">
          <span>Ricollega autorizzazione</span>
          <small>Rinnova il consenso senza perdere i movimenti già importati</small>
        </button>

        <button type="button" class="bank-sync__voce" @click="showSostituisci = true">
          <span>Sostituisci conto</span>
          <small>Collega una banca diversa. I movimenti attuali restano.</small>
        </button>

        <button
          type="button"
          class="bank-sync__voce bank-sync__voce--pericolo"
          @click="showScollega = true"
        >
          <span>Scollega conto</span>
          <small>Interrompe la sincronizzazione. I movimenti restano.</small>
        </button>

        <p class="bank-sync__gestisci-nota">
          Per eliminare anche i movimenti importati dalla banca vai in
          Impostazioni → Piano e abbonamento: è un'operazione separata e
          irreversibile.
        </p>
      </div>
    </AppDialog>

    <!-- ── Conferma sostituzione ───────────────────────────────────────── -->
    <AppDialog :open="showSostituisci" title="Sostituire il conto?" @close="showSostituisci = false">
      <div class="bank-sync__conferma">
        <p>
          Il collegamento con
          <strong>{{ connessione?.istituto?.nome || 'la banca attuale' }}</strong>
          verrà revocato e potrai collegarne un altro.
        </p>
        <p class="bank-sync__conferma-rassicura">
          <CheckCircle2 :size="16" :stroke-width="1.75" aria-hidden="true" />
          I movimenti già importati NON vengono cancellati.
        </p>
        <div class="bank-sync__conferma-azioni">
          <WButton variant="secondary" size="md" @click="showSostituisci = false">Annulla</WButton>
          <WButton variant="primary" size="md" @click="confermaSostituzione">
            Sostituisci conto
          </WButton>
        </div>
      </div>
    </AppDialog>

    <!-- ── Conferma scollegamento ──────────────────────────────────────── -->
    <AppDialog :open="showScollega" title="Scollegare il conto?" @close="showScollega = false">
      <div class="bank-sync__conferma">
        <p>
          WALLT non leggerà più saldo e movimenti dalla tua banca, e
          l'autorizzazione verrà revocata presso la banca stessa.
        </p>
        <p class="bank-sync__conferma-rassicura">
          <CheckCircle2 :size="16" :stroke-width="1.75" aria-hidden="true" />
          Il conto e i movimenti già importati restano in WALLT: potrai
          continuare a usarli e ad aggiungerne a mano.
        </p>
        <div class="bank-sync__conferma-azioni">
          <WButton variant="secondary" size="md" @click="showScollega = false">Annulla</WButton>
          <WButton variant="danger" size="md" :loading="scollegando" @click="scollega">
            Scollega conto
          </WButton>
        </div>
      </div>
    </AppDialog>
  </section>
</template>

<style scoped>
.bank-sync { margin-top: 1.5rem; }

.bank-sync__divisore {
  height: 1px;
  margin-bottom: 1.5rem;
  background: var(--glass-primary-border);
}

.bank-sync__card {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.bank-sync__intestazione {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.bank-sync__icona {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  background: var(--glass-interactive-bg);
  border: 1px solid var(--glass-interactive-border);
}

.bank-sync__titolo-riga {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  min-width: 0;
}

.bank-sync__titolo {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.bank-sync__stato {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
}

/* L'icona accompagna sempre il colore: il significato non deve dipendere
   dal solo colore. */
.bank-sync__stato--ok { color: var(--positive); }
.bank-sync__stato--problema { color: var(--warning); }

.bank-sync__testo {
  margin: 0;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.bank-sync__avviso {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-left: 3px solid var(--warning);
  border-radius: var(--radius-md);
}

.bank-sync__avviso svg {
  flex-shrink: 0;
  margin-top: 0.0625rem;
  color: var(--warning);
}

.bank-sync__avviso--leggero {
  margin: 0;
  align-items: center;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.bank-sync__avviso-titolo {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}

.bank-sync__avviso-testo {
  margin: 0.125rem 0 0;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.bank-sync__avviso-orario {
  margin: 0.25rem 0 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.bank-sync__dati {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin: 0;
}

.bank-sync__dati dt {
  margin: 0 0 0.125rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.bank-sync__dati dd {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.bank-sync__saldo {
  font-size: 1.25rem !important;
  font-variant-numeric: tabular-nums;
}

.bank-sync__azioni {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* --- Gestisci ------------------------------------------------------------ */
.bank-sync__gestisci {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.bank-sync__voce {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  /* 44px di area toccabile su mobile. */
  min-height: 44px;
  padding: 0.75rem 0.875rem;
  text-align: left;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--dur-fast) var(--ease-out);
}

.bank-sync__voce:hover:not(:disabled) { background: var(--glass-interactive-bg-hover); }
.bank-sync__voce:disabled { opacity: 0.6; cursor: default; }

.bank-sync__voce:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.bank-sync__voce span {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.bank-sync__voce small {
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
}

.bank-sync__voce--pericolo span { color: var(--negative); }

.bank-sync__gestisci-nota {
  margin: 0.25rem 0 0;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
}

/* --- Conferme ----------------------------------------------------------- */
.bank-sync__conferma {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.bank-sync__conferma p {
  margin: 0;
  font-size: 0.9375rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.bank-sync__conferma-rassicura {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-md);
  color: var(--text-primary) !important;
}

.bank-sync__conferma-rassicura svg {
  flex-shrink: 0;
  margin-top: 0.125rem;
  color: var(--positive);
}

.bank-sync__conferma-azioni {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

@media (max-width: 480px) {
  .bank-sync__azioni,
  .bank-sync__conferma-azioni { flex-direction: column; }
  .bank-sync__azioni :deep(.w-btn),
  .bank-sync__conferma-azioni :deep(.w-btn) { width: 100%; }
}
</style>
