<script setup>
import { onMounted, ref } from 'vue';
import { useMovimentiStore } from '@/stores/movimenti.store';
import { useToastStore } from '@/stores/toast.store';
import { useAuthStore } from '@/stores/auth.store';
import DataState from '@/components/common/DataState.vue';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import AppDialog from '@/components/common/AppDialog.vue';
import MovimentoForm from '@/components/movimenti/MovimentoForm.vue';
import RicorrenteItem from '@/components/ricorrenti/RicorrenteItem.vue';
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import { AlertTriangle, Repeat2 } from '@/utils/appIcons';

const movimentiStore = useMovimentiStore();
const toastStore = useToastStore();
const authStore = useAuthStore();
const movimentoInModifica = ref(null);
const movimentoDaEliminare = ref(null);
const eliminazioneInCorso = ref(false);

onMounted(() => movimentiStore.fetchRicorrenti());

const modifica = (movimento) => { movimentoInModifica.value = movimento; };
const chiudiModifica = () => { movimentoInModifica.value = null; };
const dopoModifica = async () => {
  chiudiModifica();
  await movimentiStore.fetchRicorrenti();
};

const chiediEliminazione = (movimento) => { movimentoDaEliminare.value = movimento; };
const chiudiEliminazione = () => {
  if (!eliminazioneInCorso.value) movimentoDaEliminare.value = null;
};
const confermaEliminazione = async () => {
  if (!movimentoDaEliminare.value) return;
  eliminazioneInCorso.value = true;
  try {
    await movimentiStore.deleteMovimento(movimentoDaEliminare.value.id);
    movimentoDaEliminare.value = null;
    toastStore.success('Movimento ricorrente eliminato');
    await movimentiStore.fetchRicorrenti();
  } catch {
    toastStore.error('Non è stato possibile eliminare il movimento ricorrente');
  } finally {
    eliminazioneInCorso.value = false;
  }
};
</script>

<template>
  <div class="ricorrenti-view animate-fade-in">
    <header class="ricorrenti-view__header">
      <div>
        <div class="ricorrenti-view__title-row">
          <h1>Ricorrenti</h1>
          <HelpTrigger topic="movimento-ricorrenza" />
        </div>
        <p>Entrate e uscite che WALLT registra automaticamente ogni mese.</p>
      </div>
    </header>

    <DataState
      :stato="movimentiStore.risorsaRicorrenti.stato"
      :last-updated="movimentiStore.risorsaRicorrenti.lastUpdated"
      messaggio-errore="Non è stato possibile caricare i movimenti ricorrenti."
      skeleton-type="card"
      :skeleton-lines="3"
      @riprova="movimentiStore.risorsaRicorrenti.riprova()"
    >
      <template #vuoto>
        <WCard class="ricorrenti-view__vuoto">
          <span class="ricorrenti-view__vuoto-icon"><Repeat2 :size="30" aria-hidden="true" /></span>
          <h2>Nessun movimento ricorrente</h2>
          <p>Quando rendi mensile un’entrata o un’uscita, la ritrovi qui.</p>
        </WCard>
      </template>

      <div class="ricorrenti-view__lista">
        <RicorrenteItem
          v-for="movimento in movimentiStore.ricorrenti"
          :key="movimento.id"
          :movimento="movimento"
          :valuta="authStore.user?.valuta || 'EUR'"
          @modifica="modifica"
          @elimina="chiediEliminazione"
        />
      </div>
    </DataState>

    <MovimentoForm
      :open="Boolean(movimentoInModifica)"
      :tipo="movimentoInModifica?.tipo || 'uscita'"
      :movimento="movimentoInModifica"
      @close="chiudiModifica"
      @saved="dopoModifica"
    />

    <AppDialog :open="Boolean(movimentoDaEliminare)" title="Elimina movimento ricorrente" @close="chiudiEliminazione">
      <div class="ricorrenti-view__dialog">
        <div class="ricorrenti-view__avviso">
          <AlertTriangle :size="20" aria-hidden="true" />
          <p>Elimini questa ricorrenza e il movimento che la contiene. L’operazione non è reversibile.</p>
        </div>
        <div class="ricorrenti-view__dialog-actions">
          <WButton variant="secondary" size="lg" :disabled="eliminazioneInCorso" @click="chiudiEliminazione">Annulla</WButton>
          <WButton variant="danger" size="lg" :loading="eliminazioneInCorso" @click="confermaEliminazione">Elimina</WButton>
        </div>
      </div>
    </AppDialog>
  </div>
</template>

<style scoped>
.ricorrenti-view { display: flex; flex-direction: column; gap: 1.25rem; }
.ricorrenti-view__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.ricorrenti-view__title-row { display: flex; align-items: center; gap: 0.5rem; }
.ricorrenti-view__title-row h1 { margin: 0; color: var(--text-primary); font-size: 1.5rem; font-weight: 700; }
.ricorrenti-view__header p { margin: 0.35rem 0 0; color: var(--text-muted); font-size: var(--text-xs); line-height: 1.5; }
.ricorrenti-view__lista { display: flex; flex-direction: column; gap: 0.875rem; }
.ricorrenti-view__vuoto { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 2.5rem 1.25rem !important; text-align: center; }
.ricorrenti-view__vuoto-icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; color: var(--accent-green); background: color-mix(in srgb, var(--accent-green) 10%, transparent); }
.ricorrenti-view__vuoto h2 { margin: 0.5rem 0 0; color: var(--text-primary); font-size: 1rem; }
.ricorrenti-view__vuoto p { margin: 0; color: var(--text-muted); font-size: var(--text-xs); }
.ricorrenti-view__dialog { display: flex; flex-direction: column; gap: 1rem; }
.ricorrenti-view__avviso { display: flex; align-items: flex-start; gap: 0.625rem; padding: 0.875rem 1rem; border: 1px solid color-mix(in srgb, var(--negative) 28%, transparent); border-radius: var(--radius-md); background: color-mix(in srgb, var(--negative) 10%, transparent); color: var(--text-primary); font-size: var(--text-xs); line-height: 1.5; }
.ricorrenti-view__avviso svg { flex-shrink: 0; color: var(--negative); }
.ricorrenti-view__avviso p { margin: 0; }
.ricorrenti-view__dialog-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }
@media (max-width: 420px) { .ricorrenti-view__dialog-actions { grid-template-columns: 1fr; } }
</style>
