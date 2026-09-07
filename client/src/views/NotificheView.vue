<script setup>
import { onMounted, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import WCard from '@/components/common/WCard.vue';
import NotificaItem from '@/components/notifiche/NotificaItem.vue';
import { useNotificheStore } from '@/stores/notifiche.store';
import { useToastStore } from '@/stores/toast.store';
import { Bell, Settings } from '@/utils/appIcons';

/** Elenco completo delle notifiche (versione a pagina intera del pannello). */
const notificheStore = useNotificheStore();
const { notifiche, nonLette, loading } = storeToRefs(notificheStore);
const toastStore = useToastStore();
const router = useRouter();

const vuoto = computed(() => !loading.value && notifiche.value.length === 0);

onMounted(() => {
  notificheStore.fetchNotifiche({ limit: 100 });
});

const apriNotifica = async (notifica) => {
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
</script>

<template>
  <div class="notifiche-view">
    <header class="notifiche-view__header">
      <div>
        <h1 class="notifiche-view__titolo">Notifiche</h1>
        <p class="notifiche-view__sottotitolo">
          {{ nonLette > 0 ? `${nonLette} da leggere` : 'Sei in pari' }}
        </p>
      </div>
      <div class="notifiche-view__azioni">
        <button
          v-if="nonLette > 0"
          type="button"
          class="notifiche-view__btn"
          @click="segnaTutte"
        >
          Segna tutte come lette
        </button>
        <button
          type="button"
          class="notifiche-view__btn"
          @click="router.push({ name: 'impostazioni', hash: '#notifiche' })"
        >
          <Settings :size="15" :stroke-width="1.75" />
          <span>Impostazioni</span>
        </button>
      </div>
    </header>

    <WCard>
      <p v-if="loading" class="notifiche-view__stato">Caricamento…</p>

      <div v-else-if="vuoto" class="notifiche-view__vuoto">
        <Bell :size="28" :stroke-width="1.5" />
        <p class="notifiche-view__vuoto-titolo">Nessuna notifica</p>
        <p class="notifiche-view__vuoto-testo">
          WALLT ti avvisa solo quando serve: promemoria, budget vicino al limite,
          pagamenti in arrivo e traguardi raggiunti. Mai più di due volte al giorno.
        </p>
      </div>

      <div v-else class="notifiche-view__lista">
        <NotificaItem
          v-for="notifica in notifiche"
          :key="notifica.id"
          :notifica="notifica"
          @apri="apriNotifica"
        />
      </div>
    </WCard>
  </div>
</template>

<style scoped>
.notifiche-view { display: flex; flex-direction: column; gap: 1rem; }

.notifiche-view__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.notifiche-view__titolo {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.notifiche-view__sottotitolo {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.notifiche-view__azioni { display: flex; gap: 0.5rem; flex-wrap: wrap; }

.notifiche-view__btn {
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
  min-height: 40px;
}

.notifiche-view__btn:hover {
  color: var(--text-primary);
  border-color: rgba(0, 168, 132, 0.35);
}

.notifiche-view__lista { display: flex; flex-direction: column; gap: 0.25rem; }

.notifiche-view__stato {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-muted);
}

.notifiche-view__vuoto {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--text-muted);
}

.notifiche-view__vuoto svg { color: var(--text-muted); opacity: 0.6; }

.notifiche-view__vuoto-titolo {
  margin: 0.25rem 0 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.notifiche-view__vuoto-testo {
  margin: 0;
  max-width: 420px;
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>
