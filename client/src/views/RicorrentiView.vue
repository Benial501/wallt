<script setup>
import { onMounted, ref, computed } from 'vue';
import { useMovimentiStore } from '@/stores/movimenti.store';
import { useToastStore } from '@/stores/toast.store';
import { useAuthStore } from '@/stores/auth.store';
import DataState from '@/components/common/DataState.vue';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import AppDialog from '@/components/common/AppDialog.vue';
import RicorrenteForm from '@/components/ricorrenti/RicorrenteForm.vue';
import RicorrenteItem from '@/components/ricorrenti/RicorrenteItem.vue';
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import { AlertTriangle, Repeat2 } from '@/utils/appIcons';
import api from '@/utils/axios';
import { useScheduledPaymentsStore } from '@/stores/scheduledPayments.store';
import { useContiStore } from '@/stores/conti.store';
import ScheduledPaymentItem from '@/components/programmate/ScheduledPaymentItem.vue';
import ScheduledPaymentForm from '@/components/programmate/ScheduledPaymentForm.vue';
import MovimentoForm from '@/components/movimenti/MovimentoForm.vue';

const movimentiStore = useMovimentiStore();
const toastStore = useToastStore();
const authStore = useAuthStore();
const scheduledStore = useScheduledPaymentsStore();
const contiStore = useContiStore();
const showNuovaProgrammata = ref(false);
const movimentoInModifica = ref(null);
const pagamentoInModifica = ref(null);
const movimentoDaEliminare = ref(null);
const eliminazioneInCorso = ref(false);
const statoInCorso = ref(false);
const pagamentoInCorso = ref(null);
const numeroElementi = computed(() => movimentiStore.ricorrenti.length + scheduledStore.payments.length);
const statoCombinato = computed(() => {
  const hasSuccessfulData = movimentiStore.risorsaRicorrenti.lastUpdated !== null || scheduledStore.lastUpdated !== null;
  const isLoading = movimentiStore.risorsaRicorrenti.loading || scheduledStore.loading;
  const hasError = Boolean(movimentiStore.risorsaRicorrenti.error || scheduledStore.error);
  if (isLoading && !hasSuccessfulData) return 'caricamento';
  if (hasError) return hasSuccessfulData ? 'errore-con-dati' : 'errore';
  if (isLoading) return 'caricamento';
  return numeroElementi.value ? 'pronto' : 'vuoto';
});
const pagamentoCaricamento = (payment) => pagamentoInCorso.value === payment.id
  || (payment.piano && pagamentoInCorso.value === `piano-${payment.piano.id}`);

const caricaPagina = async () => {
  await Promise.allSettled([movimentiStore.fetchRicorrenti(), scheduledStore.fetchPayments()]);
};
onMounted(caricaPagina);

const modifica = (movimento) => { movimentoInModifica.value = movimento; };
const chiudiForm = () => {
  movimentoInModifica.value = null;
};
const dopoSalvataggio = async () => {
  chiudiForm();
  await caricaPagina();
};
const dopoSalvataggioProgrammata = async () => {
  showNuovaProgrammata.value = false;
  await caricaPagina();
};

const modificaProgrammato = (payment) => { pagamentoInModifica.value = payment; };
const chiudiFormProgrammato = () => { pagamentoInModifica.value = null; };
const dopoModificaProgrammato = async () => {
  // La lista si è già aggiornata nello store; qui si riallineano i conti,
  // perché cambiare importo o conto di una scadenza sposta ciò che la home
  // mostra come saldo effettivo (gli impegni entro 30 giorni).
  await Promise.allSettled([caricaPagina(), contiStore.fetchPatrimonio()]);
};

const segnaPagata = async (payment) => {
  if (pagamentoInCorso.value) return;
  pagamentoInCorso.value = payment.id;
  try {
    await scheduledStore.confirmPayment(payment.id);
    const vistaAggiornata = await contiStore.refreshDopoScrittura(payment.conto?.tipo === 'scommesse');
    toastStore.success('Pagamento registrato');
    if (!vistaAggiornata) toastStore.warning('Il pagamento è stato registrato, ma il saldo visualizzato non si è aggiornato. Ricarica la pagina.');
  } catch (error) {
    toastStore.error(error.response?.data?.message || error.response?.data?.error || 'Non è stato possibile registrare il pagamento');
  } finally { pagamentoInCorso.value = null; }
};

const segnaEntrataInRitardo = async (payment) => {
  if (pagamentoInCorso.value) return;
  pagamentoInCorso.value = payment.id;
  try {
    await scheduledStore.markIncomeLate(payment.id);
    toastStore.info('Entrata segnata in ritardo');
    await scheduledStore.fetchPayments();
  } catch (error) {
    toastStore.error(error.response?.data?.message || error.response?.data?.error || 'Non è stato possibile aggiornare l’entrata');
  } finally { pagamentoInCorso.value = null; }
};

const annullaProgrammato = async (payment) => {
  if (pagamentoInCorso.value) return;
  pagamentoInCorso.value = payment.piano ? `piano-${payment.piano.id}` : payment.id;
  try {
    if (payment.piano) await scheduledStore.cancelPlan(payment.piano.id);
    else await scheduledStore.cancelPayment(payment.id);
    toastStore.success(payment.piano ? 'Piano di pagamento annullato' : 'Pagamento programmato annullato');
  } catch (error) {
    toastStore.error(error.response?.data?.message || error.response?.data?.error || 'Non è stato possibile annullare il pagamento');
  } finally { pagamentoInCorso.value = null; }
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
    toastStore.success('Programmazione eliminata');
    await movimentiStore.fetchRicorrenti();
  } catch {
    toastStore.error('Non è stato possibile eliminare la programmazione');
  } finally {
    eliminazioneInCorso.value = false;
  }
};

const cambiaStato = async (movimento, stato) => {
  if (statoInCorso.value) return;
  statoInCorso.value = true;
  try {
    await api.patch(`/movimenti/${movimento.id}/ricorrenza/stato`, { stato });
    toastStore.success(stato === 'sospesa' ? 'Programmazione sospesa' : stato === 'attiva' ? 'Programmazione riattivata' : 'Programmazione terminata');
    await movimentiStore.fetchRicorrenti();
  } catch {
    toastStore.error('Non è stato possibile cambiare lo stato della programmazione');
  } finally {
    statoInCorso.value = false;
  }
};
</script>

<template>
  <div class="ricorrenti-view animate-fade-in">
    <header class="ricorrenti-view__header">
      <div>
        <div class="ricorrenti-view__title-row">
          <h1>Spese/entrate programmate</h1>
          <HelpTrigger topic="ricorrenti-gestione" />
        </div>
        <p>Gestisci pagamenti futuri, rate e movimenti che si ripetono.</p>
      </div>
      <WButton
        v-if="numeroElementi"
        class="ricorrenti-view__nuova"
        variant="primary"
        size="sm"
        aria-label="Crea una nuova programmazione"
        @click="showNuovaProgrammata = true"
      >+ Nuova</WButton>
    </header>

    <DataState
      :stato="statoCombinato"
      :last-updated="movimentiStore.risorsaRicorrenti.lastUpdated || scheduledStore.lastUpdated || null"
      messaggio-errore="Non è stato possibile caricare le spese e le entrate programmate."
      skeleton-type="card"
      :skeleton-lines="4"
      @riprova="caricaPagina"
    >
      <template #vuoto>
        <WCard class="ricorrenti-view__vuoto">
          <span class="ricorrenti-view__vuoto-icon"><Repeat2 :size="30" aria-hidden="true" /></span>
          <h2>Nessuna spesa o entrata programmata</h2>
          <p>Puoi aggiungere un pagamento futuro, un acquisto a rate o un movimento periodico.</p>
          <WButton variant="primary" size="md" @click="showNuovaProgrammata = true">+ Nuova programmazione</WButton>
        </WCard>
      </template>

      <div class="ricorrenti-view__lista">
        <section v-if="scheduledStore.payments.length" class="ricorrenti-view__gruppo">
          <h2>Scadenze da gestire</h2>
          <ScheduledPaymentItem
            v-for="payment in scheduledStore.payments"
            :key="`payment-${payment.id}`"
            :payment="payment"
            :valuta="authStore.user?.valuta || 'EUR'"
            :loading="pagamentoCaricamento(payment)"
            :busy="Boolean(pagamentoInCorso)"
            @confirm="segnaPagata"
            @late="segnaEntrataInRitardo"
            @cancel="annullaProgrammato"
            @edit="modificaProgrammato"
          />
        </section>
        <section v-if="movimentiStore.ricorrenti.length" class="ricorrenti-view__gruppo">
          <h2>Movimenti periodici</h2>
          <RicorrenteItem
            v-for="movimento in movimentiStore.ricorrenti"
            :key="movimento.id"
            :movimento="movimento"
            :valuta="authStore.user?.valuta || 'EUR'"
            @modifica="modifica"
            @elimina="chiediEliminazione"
            @cambia-stato="cambiaStato"
          />
        </section>
      </div>
    </DataState>

    <RicorrenteForm
      :open="Boolean(movimentoInModifica)"
      :movimento="movimentoInModifica"
      @close="chiudiForm"
      @saved="dopoSalvataggio"
    />

    <ScheduledPaymentForm
      :open="Boolean(pagamentoInModifica)"
      :payment="pagamentoInModifica"
      @close="chiudiFormProgrammato"
      @saved="dopoModificaProgrammato"
    />

    <MovimentoForm
      :open="showNuovaProgrammata"
      tipo="uscita"
      modalita-programmate
      @close="showNuovaProgrammata = false"
      @saved="dopoSalvataggioProgrammata"
    />

    <AppDialog :open="Boolean(movimentoDaEliminare)" title="Elimina programmazione" @close="chiudiEliminazione">
      <div class="ricorrenti-view__dialog">
        <div class="ricorrenti-view__avviso">
          <AlertTriangle :size="20" aria-hidden="true" />
          <p>Elimini questa programmazione e il movimento che la contiene. L’operazione non è reversibile.</p>
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
.ricorrenti-view__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.ricorrenti-view__nuova { white-space: nowrap; }
.ricorrenti-view__title-row { display: flex; align-items: center; gap: 0.5rem; }
.ricorrenti-view__title-row h1 { margin: 0; color: var(--text-primary); font-size: 1.5rem; font-weight: 700; }
.ricorrenti-view__header p { margin: 0.35rem 0 0; color: var(--text-muted); font-size: var(--text-xs); line-height: 1.5; }
.ricorrenti-view__lista { display: flex; flex-direction: column; gap: 0.875rem; }
.ricorrenti-view__azioni { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.ricorrenti-view__gruppo { display: flex; flex-direction: column; gap: 0.75rem; }
.ricorrenti-view__gruppo h2 { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); }
.ricorrenti-view__vuoto { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 2.5rem 1.25rem !important; text-align: center; }
.ricorrenti-view__vuoto-icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; color: var(--accent-green); background: color-mix(in srgb, var(--accent-green) 10%, transparent); }
.ricorrenti-view__vuoto h2 { margin: 0.5rem 0 0; color: var(--text-primary); font-size: 1rem; }
.ricorrenti-view__vuoto p { margin: 0 0 0.5rem; color: var(--text-muted); font-size: var(--text-xs); }
.ricorrenti-view__dialog { display: flex; flex-direction: column; gap: 1rem; }
.ricorrenti-view__avviso { display: flex; align-items: flex-start; gap: 0.625rem; padding: 0.875rem 1rem; border: 1px solid color-mix(in srgb, var(--negative) 28%, transparent); border-radius: var(--radius-md); background: color-mix(in srgb, var(--negative) 10%, transparent); color: var(--text-primary); font-size: var(--text-xs); line-height: 1.5; }
.ricorrenti-view__avviso svg { flex-shrink: 0; color: var(--negative); }
.ricorrenti-view__avviso p { margin: 0; }
.ricorrenti-view__dialog-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }
@media (max-width: 420px) { .ricorrenti-view__dialog-actions { grid-template-columns: 1fr; } }
</style>
