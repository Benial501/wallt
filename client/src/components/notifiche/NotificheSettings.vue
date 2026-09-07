<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useNotificheStore } from '@/stores/notifiche.store';
import { useToastStore } from '@/stores/toast.store';
import {
  pushSupportate, statoPermesso, attivaPush, disattivaPush, MESSAGGI_PUSH,
} from '@/utils/pushNotifications';

/**
 * Sezione "Notifiche" delle impostazioni.
 *
 * Le push si attivano SOLO da qui, con un clic esplicito: il permesso del
 * browser non viene mai chiesto all'avvio dell'app.
 */

const notificheStore = useNotificheStore();
const { preferenze, chiavePubblicaPush, preferenzeCaricate } = storeToRefs(notificheStore);
const toastStore = useToastStore();

const salvataggioInCorso = ref(false);
const pushInCorso = ref(false);
const permesso = ref(statoPermesso());

/** Orari proposti per il promemoria: fuori dalle ore di silenzio di default. */
const ORARI_PROMEMORIA = [
  '08:00', '09:00', '12:00', '13:00', '17:00', '18:00', '19:00', '20:00', '21:00',
];

const ORARI_SILENZIO = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

const CATEGORIE = [
  {
    campo: 'promemoria_giornaliero_attivo',
    etichetta: 'Promemoria giornaliero',
    descrizione: 'Un promemoria se non hai registrato movimenti nella giornata.',
  },
  {
    campo: 'alert_budget_attivi',
    etichetta: 'Avvisi budget',
    descrizione: 'Quando una categoria arriva all\'80% o supera il budget.',
  },
  {
    campo: 'alert_ricorrenti_attivi',
    etichetta: 'Pagamenti ricorrenti',
    descrizione: 'Un avviso il giorno prima di una spesa ricorrente.',
  },
  {
    campo: 'alert_obiettivi_attivi',
    etichetta: 'Obiettivi di risparmio',
    descrizione: 'Quando raggiungi il 50%, il 75% o completi un obiettivo.',
  },
  {
    campo: 'riepilogo_settimanale_attivo',
    etichetta: 'Riepilogo settimanale',
    descrizione: 'Ogni lunedì, il quadro della settimana appena chiusa.',
  },
];

const pushDisponibileServer = computed(() => preferenze.value.push_disponibile === true);
const pushAttive = computed(() => preferenze.value.push_attive === true);
const permessoBloccato = computed(() => permesso.value === 'denied');
const browserSupportato = computed(() => pushSupportate());

const messaggioPush = computed(() => {
  if (!browserSupportato.value) return MESSAGGI_PUSH.non_supportato;
  if (permessoBloccato.value) return MESSAGGI_PUSH.permesso_negato;
  if (!pushDisponibileServer.value) return MESSAGGI_PUSH.chiave_mancante;
  if (pushAttive.value) return 'Riceverai un avviso anche quando WALLT è chiusa. Le notifiche del browser non mostrano mai importi o saldi.';
  return 'Attiva per ricevere gli avvisi anche a WALLT chiusa. Chiederemo il permesso al browser.';
});

onMounted(async () => {
  if (preferenzeCaricate.value) return;
  try {
    await notificheStore.fetchPreferenze();
  } catch {
    toastStore.error('Impossibile caricare le preferenze notifiche');
  }
});

/**
 * Salva e, in caso di errore, riporta il controllo al valore reale.
 *
 * `input` e `select` nativi cambiano da soli alla prima interazione: se la
 * richiesta fallisce, il valore nello store non cambia, Vue non ri-renderizza
 * e il controllo resterebbe a mostrare uno stato mai salvato. Va riallineato
 * a mano sull'elemento.
 */
const salva = async (valori, messaggio = 'Preferenze aggiornate', elemento = null, campo = null) => {
  salvataggioInCorso.value = true;
  try {
    await notificheStore.updatePreferenze(valori);
    toastStore.success(messaggio);
  } catch {
    toastStore.error('Errore nel salvataggio delle preferenze');
    // Rilegge lo stato reale dal server, poi riallinea il controllo.
    await notificheStore.fetchPreferenze().catch(() => {});
    if (elemento && campo) {
      const valoreReale = preferenze.value[campo];
      if (elemento.type === 'checkbox') elemento.checked = valoreReale;
      else elemento.value = valoreReale;
    }
  } finally {
    salvataggioInCorso.value = false;
  }
};

const toggleCategoria = (campo, event) => {
  salva({ [campo]: event.target.checked }, 'Preferenze aggiornate', event.target, campo);
};

const cambiaOrario = (event) => salva(
  { orario_promemoria: event.target.value },
  'Orario aggiornato',
  event.target,
  'orario_promemoria',
);

const cambiaSilenzio = (campo, event) => salva(
  { [campo]: event.target.value },
  'Ore di silenzio aggiornate',
  event.target,
  campo,
);

const attiva = async () => {
  pushInCorso.value = true;
  try {
    const esito = await attivaPush(chiavePubblicaPush.value);
    permesso.value = statoPermesso();

    if (!esito.ok) {
      toastStore.error(MESSAGGI_PUSH[esito.motivo] || MESSAGGI_PUSH.errore_sottoscrizione);
      return;
    }

    await notificheStore.registraPush(esito.subscription);
    toastStore.success('Notifiche push attivate');
  } catch {
    toastStore.error('Non è stato possibile attivare le notifiche push');
  } finally {
    pushInCorso.value = false;
  }
};

const disattiva = async () => {
  pushInCorso.value = true;
  try {
    const endpoint = await disattivaPush();
    await notificheStore.rimuoviPush(endpoint);
    toastStore.success('Notifiche push disattivate');
  } catch {
    toastStore.error('Non è stato possibile disattivare le notifiche push');
  } finally {
    pushInCorso.value = false;
  }
};
</script>

<template>
  <div class="notifiche-settings">
    <p class="notifiche-settings__intro">
      WALLT ti scrive al massimo due volte al giorno, e la seconda solo per un
      avviso importante. Gli avvisi restano sempre nel centro notifiche dell'app.
    </p>

    <div v-for="categoria in CATEGORIE" :key="categoria.campo" class="notifiche-settings__blocco">
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="preferenze[categoria.campo]"
          :disabled="salvataggioInCorso"
          @change="toggleCategoria(categoria.campo, $event)"
        />
        <span>{{ categoria.etichetta }}</span>
      </label>
      <p class="hint">{{ categoria.descrizione }}</p>
    </div>

    <div v-if="preferenze.promemoria_giornaliero_attivo" class="notifiche-settings__campo">
      <label class="notifiche-settings__label" for="orario-promemoria">Orario del promemoria</label>
      <select
        id="orario-promemoria"
        class="form-input"
        :value="preferenze.orario_promemoria"
        :disabled="salvataggioInCorso"
        @change="cambiaOrario"
      >
        <option v-for="orario in ORARI_PROMEMORIA" :key="orario" :value="orario">{{ orario }}</option>
      </select>
      <p class="hint hint--inline">
        Il promemoria parte solo dopo quest'ora, e mai se hai già registrato un movimento.
      </p>
    </div>

    <div class="notifiche-settings__campo">
      <span class="notifiche-settings__label">Ore di silenzio</span>
      <div class="notifiche-settings__orari">
        <select
          class="form-input"
          aria-label="Inizio ore di silenzio"
          :value="preferenze.quiet_hours_inizio"
          :disabled="salvataggioInCorso"
          @change="cambiaSilenzio('quiet_hours_inizio', $event)"
        >
          <option v-for="orario in ORARI_SILENZIO" :key="`i-${orario}`" :value="orario">{{ orario }}</option>
        </select>
        <span class="notifiche-settings__separatore">→</span>
        <select
          class="form-input"
          aria-label="Fine ore di silenzio"
          :value="preferenze.quiet_hours_fine"
          :disabled="salvataggioInCorso"
          @change="cambiaSilenzio('quiet_hours_fine', $event)"
        >
          <option v-for="orario in ORARI_SILENZIO" :key="`f-${orario}`" :value="orario">{{ orario }}</option>
        </select>
      </div>
      <p class="hint hint--inline">
        In questa fascia non ricevi nulla: gli avvisi vengono rimandati al primo orario utile.
      </p>
    </div>

    <div class="notifiche-settings__push">
      <div class="notifiche-settings__push-testa">
        <span class="notifiche-settings__label">Notifiche push del browser</span>
        <span
          class="notifiche-settings__stato"
          :class="{ 'notifiche-settings__stato--attivo': pushAttive }"
        >
          {{ pushAttive ? 'Attive' : 'Non attive' }}
        </span>
      </div>

      <p class="hint hint--inline">{{ messaggioPush }}</p>

      <button
        v-if="!pushAttive"
        type="button"
        class="notifiche-settings__btn"
        :disabled="pushInCorso || permessoBloccato || !browserSupportato || !pushDisponibileServer"
        @click="attiva"
      >
        {{ pushInCorso ? 'Attivazione…' : 'Attiva notifiche push' }}
      </button>
      <button
        v-else
        type="button"
        class="notifiche-settings__btn notifiche-settings__btn--secondario"
        :disabled="pushInCorso"
        @click="disattiva"
      >
        {{ pushInCorso ? 'Disattivazione…' : 'Disattiva notifiche push' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.notifiche-settings { display: flex; flex-direction: column; gap: 0.75rem; }

.notifiche-settings__intro {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-muted);
}

.notifiche-settings__blocco { display: flex; flex-direction: column; gap: 0.125rem; }

.toggle-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  cursor: pointer;
  min-height: 44px;
}

.hint { font-size: 0.8125rem; color: var(--text-muted); margin: 0 0 0 1.75rem; }
.hint--inline { margin-left: 0; }

.notifiche-settings__campo {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.notifiche-settings__label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.notifiche-settings__orari {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.notifiche-settings__separatore { color: var(--text-muted); }

.form-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.75rem 1rem;
  color: var(--text-primary);
  font-size: 16px;
  min-height: 44px;
}

.notifiche-settings__push {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.notifiche-settings__push-testa {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.notifiche-settings__stato {
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--text-muted);
  font-size: 0.6875rem;
  font-weight: 600;
}

.notifiche-settings__stato--attivo {
  background: rgba(0, 212, 170, 0.12);
  color: var(--accent-green);
}

.notifiche-settings__btn {
  align-self: flex-start;
  padding: 0.625rem 1rem;
  border: 1px solid var(--accent-green);
  border-radius: var(--radius-md);
  background: var(--accent-green);
  color: #041210;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
}

.notifiche-settings__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.notifiche-settings__btn--secondario {
  background: transparent;
  border-color: var(--border);
  color: var(--text-secondary);
}
</style>
