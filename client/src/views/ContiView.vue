<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import AppDialog from '@/components/common/AppDialog.vue';
import MovimentoForm from '@/components/movimenti/MovimentoForm.vue';
import { useContiStore } from '@/stores/conti.store';
import { useToastStore } from '@/stores/toast.store';
import { useAuthStore } from '@/stores/auth.store';
import { useValuta } from '@/composables/useValuta';
import { formatData } from '@/utils/formatters';
import { CONTO_TIPO_ICON_MAP, CreditCard, Repeat2, AlertTriangle } from '@/utils/appIcons';
import { DEFAULT_EMOJI_BY_TIPO } from '@/utils/contoEmoji';
import ImportEstrattoHint from '@/components/common/ImportEstrattoHint.vue';
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import HelpNote from '@/components/help/HelpNote.vue';

const contiStore = useContiStore();
const toastStore = useToastStore();
const authStore = useAuthStore();
const { formatValuta } = useValuta();

const contiVisibili = computed(() => {
  const showInv = authStore.mostraInvestimenti;
  return contiStore.contiAttivi.filter((c) => showInv || c.tipo !== 'investimento');
});

const showNuovoConto = ref(false);
const showModifica = ref(false);
const showElimina = ref(false);
const showTrasferimento = ref(false);
const loading = ref(false);
const deleteLoading = ref(false);
const contoEdit = ref(null);
const contoDaEliminare = ref(null);

const TIPI_BASE = [
  { id: 'banca', label: 'Banca', icon: CONTO_TIPO_ICON_MAP.banca },
  { id: 'app_pagamento', label: 'App pagamento', icon: CONTO_TIPO_ICON_MAP.app_pagamento },
  { id: 'contanti', label: 'Contanti', icon: CONTO_TIPO_ICON_MAP.contanti },
  { id: 'investimento', label: 'Investimento', icon: CONTO_TIPO_ICON_MAP.investimento },
  { id: 'scommesse', label: 'Scommesse', icon: CONTO_TIPO_ICON_MAP.scommesse },
  { id: 'wallet', label: 'Wallet digitale', icon: CONTO_TIPO_ICON_MAP.wallet },
  { id: 'risparmio', label: 'Risparmio', icon: CONTO_TIPO_ICON_MAP.risparmio },
];

const tipiDisponibili = computed(() => {
  const showInv = authStore.mostraInvestimenti;
  return TIPI_BASE.filter((t) => showInv || t.id !== 'investimento');
});

const COLORI = ['#00D4AA', '#6C5CE7', '#74B9FF', '#FECA57', '#FF4757', '#FF9F43', '#A29BFE', '#FD79A8'];

const nuovoForm = ref({
  nome: '', tipo: 'banca', saldo_iniziale: 0, icona: '🏦', colore: '#00D4AA',
});

const editForm = ref({ nome: '', icona: '', colore: '' });


watch(() => nuovoForm.value.tipo, (tipo) => {
  if (DEFAULT_EMOJI_BY_TIPO[tipo]) {
    nuovoForm.value.icona = DEFAULT_EMOJI_BY_TIPO[tipo];
  }
});

const tipoLabel = (id) => TIPI_BASE.find((t) => t.id === id)?.label || id;

onMounted(() => {
  contiStore.fetchConti();
  contiStore.fetchPatrimonio();
});

const extractApiError = (err, fallback = 'Errore') => {
  const data = err?.response?.data;
  if (data?.errori?.length) {
    return data.errori.map((e) => e.messaggio).join('. ');
  }
  return data?.message || data?.error || data?.messaggio || fallback;
};

const creaConto = async () => {
  if (!nuovoForm.value.nome?.trim()) {
    toastStore.error('Inserisci un nome per il conto');
    return;
  }
  loading.value = true;
  try {
    const result = await contiStore.createConto({
      nome: nuovoForm.value.nome.trim(),
      tipo: nuovoForm.value.tipo,
      saldo_iniziale: Number(nuovoForm.value.saldo_iniziale) || 0,
      icona: nuovoForm.value.icona,
      colore: nuovoForm.value.colore,
    });
    toastStore.success(
      result?.reactivated
        ? 'Conto ripristinato!'
        : nuovoForm.value.tipo === 'scommesse'
          ? 'Conto creato e aggiunto alle piattaforme scommesse'
          : 'Conto creato!',
    );
    showNuovoConto.value = false;
    nuovoForm.value = { nome: '', tipo: 'banca', saldo_iniziale: 0, icona: '🏦', colore: '#00D4AA' };
  } catch (err) {
    toastStore.error(extractApiError(err, 'Errore nella creazione del conto'));
  } finally {
    loading.value = false;
  }
};

const apriModifica = (conto) => {
  contoEdit.value = conto;
  editForm.value = { nome: conto.nome, icona: conto.icona, colore: conto.colore };
  showModifica.value = true;
};

const salvaModifica = async () => {
  loading.value = true;
  try {
    await contiStore.updateConto(contoEdit.value.id, editForm.value, { tipo: contoEdit.value.tipo });
    toastStore.success('Conto aggiornato!');
    showModifica.value = false;
  } catch {
    toastStore.error('Errore nell\'aggiornamento');
  } finally {
    loading.value = false;
  }
};

const eliminaConto = async (conto) => {
  contoDaEliminare.value = conto;
  showElimina.value = true;
};

const chiudiElimina = () => {
  showElimina.value = false;
  contoDaEliminare.value = null;
};

const confermaElimina = async () => {
  if (!contoDaEliminare.value) return;
  deleteLoading.value = true;
  try {
    await contiStore.deleteConto(contoDaEliminare.value.id, { tipo: contoDaEliminare.value.tipo });
    toastStore.success('Conto eliminato');
    chiudiElimina();
  } catch {
    toastStore.error('Errore nell\'eliminazione');
  } finally {
    deleteLoading.value = false;
  }
};
</script>

<template>
  <div class="conti-view animate-fade-in">
    <header class="page-header">
      <div>
        <div class="page-title-row">
          <h1 class="page-title">I miei conti</h1>
          <HelpTrigger topic="conti-cosa-sono" />
        </div>
        <p class="page-sub">Patrimonio totale: {{ formatValuta(contiStore.patrimonioTotale) }}</p>
      </div>
      <WButton variant="primary" size="sm" @click="showNuovoConto = true">+ Nuovo conto</WButton>
    </header>

    <ImportEstrattoHint
      class="conti-import-hint"
      message="Allinea i saldi importando movimenti dal tuo home banking"
    />

    <div v-if="contiStore.loading" class="grid-conti">
      <WCard v-for="n in 2" :key="n"><div style="height:120px" /></WCard>
    </div>

    <div v-else-if="contiVisibili.length" class="grid-conti">
      <WCard v-for="conto in contiVisibili" :key="conto.id" hoverable class="conto-card" :style="{ '--account-accent': conto.colore || 'var(--accent-green)' }">
        <div class="conto-card__header">
          <span class="conto-card__icon"><component :is="CONTO_TIPO_ICON_MAP[conto.tipo] || CreditCard" :size="23" :stroke-width="1.65" /></span>
          <span class="badge">{{ tipoLabel(conto.tipo) }}</span>
        </div>
        <div class="conto-card__body">
          <div class="conto-card__top">
            <h3>{{ conto.nome }}</h3>
          </div>
          <p class="conto-card__balance-label">Saldo disponibile</p>
          <p class="conto-card__saldo">{{ formatValuta(conto.saldo) }}</p>
          <div class="conto-card__actions">
            <button @click="apriModifica(conto)">Modifica</button>
            <button class="danger" @click="eliminaConto(conto)">Elimina</button>
          </div>
        </div>
      </WCard>
    </div>

    <WCard v-else class="empty-state">
      <CreditCard class="empty-icon" :size="48" :stroke-width="1.5" />
      <p>Aggiungi il tuo primo conto</p>
      <p class="empty-state__hint">
        Un conto è dove registri i tuoi soldi: banca, carta, contanti.
        WALLT non si collega automaticamente alla tua banca.
      </p>
      <WButton variant="primary" size="md" @click="showNuovoConto = true">+ Nuovo conto</WButton>
    </WCard>

    <div class="mt-4 trasferimento-block">
      <div class="trasferimento-block__actions">
        <WButton
          variant="secondary"
          size="md"
          :disabled="contiStore.contiAttivi.length < 2"
          @click="showTrasferimento = true"
        >
          <Repeat2 :size="16" :stroke-width="1.75" />
          Trasferimento
        </WButton>
        <HelpTrigger topic="trasferimenti" label="Che cos'è?" />
      </div>
      <p v-if="contiStore.contiAttivi.length < 2" class="trasferimento-block__hint">
        Serve almeno un secondo conto: un trasferimento sposta soldi fra due tuoi conti.
      </p>
    </div>

    <!-- Modal Nuovo Conto -->
    <AppDialog :open="showNuovoConto" title="Nuovo conto" @close="showNuovoConto = false">
      <div class="form-space">
        <div class="field">
          <label>Nome</label>
          <input v-model="nuovoForm.nome" class="form-input" placeholder="Es. Conto principale" />
        </div>
        <div class="field">
          <label>Tipo</label>
          <div class="tipo-grid">
            <button
              v-for="t in tipiDisponibili" :key="t.id"
              class="tipo-chip" :class="{ active: nuovoForm.tipo === t.id }"
              @click="nuovoForm.tipo = t.id"
            >
              <component :is="t.icon" :size="16" :stroke-width="1.75" />
              <span>{{ t.label }}</span>
            </button>
          </div>
        </div>
        <div class="field">
          <label>Saldo iniziale (€)</label>
          <input v-model.number="nuovoForm.saldo_iniziale" type="number" min="0" class="form-input" />
          <HelpNote topic="conti-saldo-iniziale" label="A cosa serve il saldo iniziale" />
        </div>
        <div class="field">
          <label>Colore</label>
          <div class="color-grid">
            <button
              v-for="c in COLORI" :key="c"
              class="color-dot" :style="{ background: c }"
              :class="{ active: nuovoForm.colore === c }"
              @click="nuovoForm.colore = c"
            />
          </div>
        </div>
        <WButton variant="primary" size="lg" :loading="loading" @click="creaConto">Crea conto</WButton>
      </div>
    </AppDialog>

    <!-- Modal Modifica -->
    <AppDialog :open="showModifica" title="Modifica conto" @close="showModifica = false">
      <div class="form-space">
        <div class="edit-preview" :style="{ background: `${editForm.colore}33` }">
          <component :is="CONTO_TIPO_ICON_MAP[contoEdit?.tipo] || CreditCard" :size="26" :stroke-width="1.65" />
        </div>
        <div class="field"><label>Nome</label><input v-model="editForm.nome" class="form-input" /></div>
        <div class="field">
          <label>Colore</label>
          <div class="color-grid">
            <button v-for="c in COLORI" :key="c" class="color-dot" :style="{ background: c }" :class="{ active: editForm.colore === c }" @click="editForm.colore = c" />
          </div>
        </div>
        <WButton variant="primary" size="lg" :loading="loading" @click="salvaModifica">Salva</WButton>
      </div>
    </AppDialog>

    <AppDialog :open="showElimina" title="Elimina conto" @close="chiudiElimina">
      <div v-if="contoDaEliminare" class="delete-modal">
        <div class="delete-modal__hero" :style="{ background: `${contoDaEliminare.colore}33` }">
          <component :is="CONTO_TIPO_ICON_MAP[contoDaEliminare.tipo] || CreditCard" :size="26" :stroke-width="1.65" />
        </div>

        <div class="delete-modal__alert">
          <AlertTriangle :size="18" :stroke-width="1.75" />
          <p>Stai per eliminare <strong>{{ contoDaEliminare.nome }}</strong>.</p>
        </div>

        <div class="delete-modal__meta">
          <span class="badge">{{ tipoLabel(contoDaEliminare.tipo) }}</span>
          <span class="delete-modal__saldo">{{ formatValuta(contoDaEliminare.saldo) }}</span>
        </div>

        <p class="delete-modal__hint">
          Il conto non comparirà più nell'app. I movimenti collegati resteranno nello storico.
          <template v-if="contoDaEliminare.tipo === 'scommesse'">
            Verrà rimossa anche la piattaforma scommesse collegata.
          </template>
        </p>

        <div class="delete-modal__actions">
          <WButton variant="secondary" size="lg" :disabled="deleteLoading" @click="chiudiElimina">
            Annulla
          </WButton>
          <WButton variant="danger" size="lg" :loading="deleteLoading" @click="confermaElimina">
            Elimina conto
          </WButton>
        </div>
      </div>
    </AppDialog>

    <MovimentoForm :open="showTrasferimento" tipo="trasferimento" @close="showTrasferimento = false" @saved="contiStore.fetchConti()" />
  </div>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap; }
.page-title-row { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.page-sub { color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.25rem; }
.conti-import-hint { margin-bottom: 1rem; }
.grid-conti { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 768px) { .grid-conti { grid-template-columns: repeat(2, 1fr); } }
.conto-card { overflow: hidden; padding: 0 !important; border-radius: 24px;
  background: var(--bg-card);
  background: radial-gradient(ellipse at top right, color-mix(in srgb, var(--account-accent) 12%, transparent), transparent 65%), linear-gradient(145deg, color-mix(in srgb, var(--bg-card) 88%, transparent), color-mix(in srgb, var(--bg-card) 96%, transparent));
  backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);
  border: 1px solid color-mix(in srgb, var(--border) 80%, white 20%);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 9%), 0 8px 28px rgb(0 0 0 / 5%);
}
.conto-card__header { padding: 1.25rem 1.25rem 0; display: flex; align-items: center; justify-content: space-between; }
.conto-card__icon { width: 46px; height: 46px; border-radius: 15px; display: grid; place-items: center; color: var(--text-primary); background: color-mix(in srgb, var(--account-accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--account-accent) 18%, var(--border)); box-shadow: inset 0 1px 0 rgb(255 255 255 / 12%); }
.conto-card__body { padding: 1rem 1.25rem 1.25rem; }
.conto-card__balance-label { margin-top: 1rem; margin-bottom: .15rem; color: var(--text-muted); font-size: .75rem; }
.conto-card__top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.conto-card__top h3 { font-size: 1.0625rem; font-weight: 600; color: var(--text-primary); overflow-wrap: anywhere; }
.badge { font-size: 0.6875rem; padding: 0.25rem 0.5rem; border-radius: 999px; background: var(--bg-input); color: var(--text-muted); }
.conto-card__saldo { font-size: clamp(1.5rem, 4vw, 2rem); font-weight: 650; letter-spacing: -.045em; font-variant-numeric: tabular-nums; color: var(--text-primary); margin-bottom: 1.25rem; overflow-wrap: anywhere; }
.conto-card__actions { display: flex; gap: 0.5rem; }
.conto-card__actions button { flex: 1; min-height: 44px; padding: 0.5rem; border-radius: 12px; border: 1px solid var(--border); background: color-mix(in srgb, var(--bg-input) 60%, transparent); color: var(--text-secondary); cursor: pointer; font-size: 0.8125rem; transition: background-color 150ms ease; }
.conto-card__actions button:hover { background: var(--bg-card-hover); }
.conto-card__actions button:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 2px; }
.conto-card__actions button.danger { color: var(--negative); border-color: rgba(255,71,87,0.3); }
.empty-state { text-align: center; padding: 3rem 1.5rem; }
.empty-state__hint { margin: 0.5rem auto 1rem; max-width: 30rem; font-size: 0.8125rem; line-height: 1.55; color: var(--text-muted); }
.trasferimento-block__actions { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.trasferimento-block__hint { margin-top: 0.5rem; font-size: 0.75rem; line-height: 1.5; color: var(--text-muted); }
.empty-icon { display: block; margin: 0 auto 1rem; color: var(--text-muted); stroke: currentColor; }
.tipo-chip { display: inline-flex; align-items: center; gap: 0.375rem; }
.form-space { display: flex; flex-direction: column; gap: 1rem; }
.field label { display: block; font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.375rem; }
/* .form-input: aspetto condiviso in assets/styles/main.css */
.tipo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.tipo-chip { padding: 0.625rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-input); color: var(--text-secondary); font-size: 0.75rem; cursor: pointer; text-align: left; }
.tipo-chip.active { border-color: var(--accent-green); color: var(--accent-green); }
.color-grid { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.color-dot { width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.color-dot.active { border-color: var(--text-primary); transform: scale(1.1); }
.edit-preview { padding: 1rem; border-radius: var(--radius-md); text-align: center; margin-bottom: 0.25rem; }
.edit-preview svg, .delete-modal__hero svg { margin: auto; }
.delete-modal { display: flex; flex-direction: column; gap: 1rem; }
.delete-modal__hero { padding: 1.25rem; border-radius: var(--radius-md); text-align: center; }
.delete-modal__alert {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.875rem 1rem;
  border-radius: var(--radius-md);
  background: rgba(255, 71, 87, 0.1);
  border: 1px solid rgba(255, 71, 87, 0.25);
  color: var(--text-primary);
  font-size: 0.875rem;
}
.delete-modal__alert svg { flex-shrink: 0; stroke: var(--negative); margin-top: 0.125rem; }
.delete-modal__alert strong { color: var(--text-primary); }
.delete-modal__meta { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.delete-modal__saldo { font-size: 1.125rem; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.delete-modal__hint { font-size: 0.8125rem; color: var(--text-muted); line-height: 1.5; margin: 0; }
.delete-modal__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; margin-top: 0.25rem; }
@media (max-width: 420px) {
  .delete-modal__actions { grid-template-columns: 1fr; }
}
.mt-4 { margin-top: 1rem; }
</style>
