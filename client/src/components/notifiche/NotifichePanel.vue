<script setup>
import { computed, watch, ref, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useNotificheStore } from '@/stores/notifiche.store';
import { useToastStore } from '@/stores/toast.store';
import NotificaItem from './NotificaItem.vue';
import { Bell, CheckCircle2, Settings, X } from '@/utils/appIcons';

/**
 * Pannello del centro notifiche. Va montato una sola volta (AppLayout).
 *
 * Su desktop è un popover ancorato alla campanella, su mobile un foglio a
 * tutta larghezza. La chiusura con Escape e il click fuori sono gestiti qui.
 */

const notificheStore = useNotificheStore();
const { notifiche, nonLette, loading, panelOpen } = storeToRefs(notificheStore);
const toastStore = useToastStore();
const router = useRouter();

const panelRef = ref(null);

const vuoto = computed(() => !loading.value && notifiche.value.length === 0);
const promemoriaAperto = computed(() => notifiche.value.some(
  (n) => n.tipo === 'promemoria_giornaliero' && !n.letta,
));

const chiudi = () => notificheStore.chiudiPanel();

const apriNotifica = async (notifica) => {
  chiudi();
  if (!notifica.letta) await notificheStore.segnaLetta(notifica.id);
  if (notifica.link) router.push(notifica.link);
};

const segnaTutte = async () => {
  try {
    await notificheStore.segnaTutteLette();
    toastStore.success('Notifiche segnate come lette');
  } catch {
    toastStore.error('Non è stato possibile aggiornare le notifiche');
  }
};

const giornataControllata = async () => {
  try {
    await notificheStore.segnaGiornataControllata();
    await notificheStore.segnaTutteLette();
    toastStore.success('Giornata segnata come controllata');
    chiudi();
  } catch {
    toastStore.error('Non è stato possibile salvare');
  }
};

const vaiAImpostazioni = () => {
  chiudi();
  router.push({ name: 'impostazioni', hash: '#notifiche' });
};

const vaiATutte = () => {
  chiudi();
  router.push({ name: 'notifiche' });
};

const onKeydown = (event) => {
  if (event.key === 'Escape') chiudi();
};

// I listener globali esistono solo mentre il pannello è aperto.
watch(panelOpen, (aperto) => {
  if (aperto) {
    document.addEventListener('keydown', onKeydown);
  } else {
    document.removeEventListener('keydown', onKeydown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="notifiche-fade">
      <div v-if="panelOpen" class="notifiche-overlay" @click.self="chiudi">
        <div
          ref="panelRef"
          class="notifiche-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Centro notifiche"
        >
          <header class="notifiche-panel__header">
            <h2 class="notifiche-panel__titolo">
              <Bell :size="18" :stroke-width="1.75" />
              <span>Notifiche</span>
              <span v-if="nonLette > 0" class="notifiche-panel__conteggio">{{ nonLette }}</span>
            </h2>
            <div class="notifiche-panel__azioni-header">
              <button
                type="button"
                class="notifiche-panel__icon-btn"
                title="Impostazioni notifiche"
                aria-label="Impostazioni notifiche"
                @click="vaiAImpostazioni"
              >
                <Settings :size="16" :stroke-width="1.75" />
              </button>
              <button
                type="button"
                class="notifiche-panel__icon-btn"
                aria-label="Chiudi"
                @click="chiudi"
              >
                <X :size="16" :stroke-width="1.75" />
              </button>
            </div>
          </header>

          <div class="notifiche-panel__lista">
            <p v-if="loading" class="notifiche-panel__stato">Caricamento…</p>

            <div v-else-if="vuoto" class="notifiche-panel__vuoto">
              <Bell :size="26" :stroke-width="1.5" />
              <p class="notifiche-panel__vuoto-titolo">Nessuna notifica</p>
              <p class="notifiche-panel__vuoto-testo">
                Ti avvisiamo solo quando serve davvero: al massimo due volte al giorno.
              </p>
            </div>

            <NotificaItem
              v-for="notifica in notifiche"
              v-else
              :key="notifica.id"
              :notifica="notifica"
              @apri="apriNotifica"
            />
          </div>

          <footer class="notifiche-panel__footer">
            <button
              v-if="promemoriaAperto"
              type="button"
              class="notifiche-panel__azione"
              @click="giornataControllata"
            >
              <CheckCircle2 :size="15" :stroke-width="1.75" />
              <span>Ho già controllato oggi</span>
            </button>
            <button
              v-if="nonLette > 0"
              type="button"
              class="notifiche-panel__azione"
              @click="segnaTutte"
            >
              Segna tutte come lette
            </button>
            <button type="button" class="notifiche-panel__azione" @click="vaiATutte">
              Vedi tutte
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.notifiche-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050;
  background: var(--overlay);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.notifiche-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 85vh;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 24px 24px 0 0;
  overflow: hidden;
}

.notifiche-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

.notifiche-panel__titolo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.notifiche-panel__titolo svg { color: var(--accent-green); }

.notifiche-panel__conteggio {
  min-width: 20px;
  padding: 0 0.375rem;
  border-radius: 999px;
  background: var(--accent-green);
  color: #041210;
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
}

.notifiche-panel__azioni-header { display: flex; gap: 0.25rem; }

.notifiche-panel__icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.notifiche-panel__icon-btn:hover {
  background: var(--surface-subtle);
  color: var(--text-primary);
}

.notifiche-panel__lista {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.notifiche-panel__stato {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.notifiche-panel__vuoto {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 2.5rem 1.5rem;
  text-align: center;
  color: var(--text-muted);
}

.notifiche-panel__vuoto svg { color: var(--text-muted); opacity: 0.6; }

.notifiche-panel__vuoto-titolo {
  margin: 0.25rem 0 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.notifiche-panel__vuoto-testo {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.4;
  max-width: 260px;
}

.notifiche-panel__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
}

.notifiche-panel__azione {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  min-height: 36px;
}

.notifiche-panel__azione:hover {
  color: var(--text-primary);
  border-color: rgba(0, 168, 132, 0.35);
}

.notifiche-fade-enter-active,
.notifiche-fade-leave-active { transition: opacity 200ms ease-out; }
.notifiche-fade-enter-from,
.notifiche-fade-leave-to { opacity: 0; }

/* Su desktop il pannello è un popover ancorato alla campanella in sidebar. */
@media (min-width: 768px) {
  .notifiche-overlay {
    align-items: flex-start;
    justify-content: flex-start;
    background: transparent;
  }

  .notifiche-panel {
    position: absolute;
    left: 268px;
    bottom: 24px;
    width: 380px;
    max-height: min(560px, 80vh);
    border-radius: var(--radius-lg);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
  }
}
</style>
