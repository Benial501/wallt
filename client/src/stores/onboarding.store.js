import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '@/utils/axios';
import { useAuthStore } from './auth.store';

const initial = () => ({
  utilizzi: [], fascia_eta: '', categorie: null, entrate: [], spese: [],
  abbonamenti: [], impegni: [], conti: [], obiettivi: [], preferenze: {},
  sezioni_completate: [],
});

export const useOnboardingStore = defineStore('onboarding', () => {
  const session = ref(null);
  const answers = ref(initial());
  const imports = ref([]);
  const status = ref('caricamento');
  const error = ref('');
  const localDraft = ref(false);
  const resumeStep = ref(null);
  const auth = useAuthStore();
  const cacheKey = computed(() => `wallt_onboarding_draft_${auth.user?.id}`);

  function readLocal() {
    try {
      const value = JSON.parse(localStorage.getItem(cacheKey.value) || 'null');
      if (!value) return null;
      return value.answers ? value : { answers: value, current_step: null, session: null };
    } catch { return null; }
  }

  function remember(step = session.value?.current_step) {
    try {
      localStorage.setItem(cacheKey.value, JSON.stringify({
        answers: answers.value,
        current_step: step,
        session: session.value,
      }));
    } catch { /* Memoria locale non disponibile. */ }
  }

  async function load() {
    status.value = 'caricamento';
    error.value = '';
    try {
      const { data } = await api.get('/onboarding');
      session.value = data.session;
      answers.value = { ...initial(), ...(data.session.answers || {}) };
      const local = readLocal();
      if (local && data.session.status !== 'completed') {
        const localAnswers = local.answers || {};
        const hasUnsavedChanges = JSON.stringify(localAnswers) !== JSON.stringify(data.session.answers || {});
        answers.value = { ...answers.value, ...localAnswers };
        localDraft.value = hasUnsavedChanges;
        resumeStep.value = hasUnsavedChanges && local.current_step ? local.current_step : data.session.current_step;
      }
      if (data.session.status !== 'completed') {
        const response = await api.get('/onboarding/imports');
        imports.value = response.data.imports;
      }
      status.value = localDraft.value ? 'errore' : 'salvato';
      if (localDraft.value) error.value = 'Abbiamo recuperato modifiche salvate su questo dispositivo. Stiamo provando a sincronizzarle.';
      return session.value;
    } catch (cause) {
      const local = readLocal();
      if (local) {
        answers.value = { ...initial(), ...(local.answers || {}) };
        session.value = local.session || null;
        resumeStep.value = local.current_step || 'utilizzi';
        localDraft.value = true;
        status.value = 'errore';
        error.value = 'Connessione assente. Puoi continuare sul dispositivo; sincronizzeremo le modifiche quando tornerai online.';
        return null;
      }
      status.value = 'errore';
      error.value = cause.response?.data?.message || 'Impossibile caricare la configurazione';
      throw cause;
    }
  }

  async function save(step) {
    if (session.value?.status === 'completed') return;
    status.value = 'salvataggio';
    remember(step);
    if (!session.value) {
      status.value = 'errore';
      error.value = 'Le modifiche sono salvate su questo dispositivo. Riprova quando la connessione torna disponibile.';
      throw new Error(error.value);
    }
    try {
      const { data } = await api.put('/onboarding', {
        current_step: step,
        revision: session.value.revision,
        answers: answers.value,
      });
      session.value = data.session;
      status.value = 'salvato';
      localDraft.value = false;
      resumeStep.value = data.session.current_step;
      localStorage.removeItem(cacheKey.value);
    } catch (cause) {
      status.value = 'errore';
      error.value = cause.response?.data?.message || 'Salvataggio non riuscito. Riprova.';
      throw cause;
    }
  }

  async function upload(file, accountKey) {
    const form = new FormData();
    form.append('file', file);
    form.append('account_key', accountKey);
    const { data } = await api.post('/onboarding/imports', form);
    imports.value.push({ import_id: data.import_id, account_key: accountKey, status: 'preview', items: data.items, confermati: 0 });
    return data;
  }

  async function confirm(importId, rows) {
    const { data } = await api.put(`/onboarding/imports/${importId}`, { rows });
    const batch = imports.value.find(item => item.import_id === importId);
    if (batch) { batch.status = 'confirmed'; batch.confermati = data.confermati; }
    return data;
  }

  async function finalize() {
    await save('riepilogo');
    status.value = 'salvataggio';
    try {
      const { data } = await api.post('/onboarding/finalize');
      session.value = { ...session.value, status: 'completed' };
      localStorage.removeItem(cacheKey.value);
      await auth.fetchMe();
      status.value = 'salvato';
      return data;
    } catch (cause) {
      status.value = 'errore';
      error.value = cause.response?.data?.message || 'Non siamo riusciti a completare la configurazione. I dati sono conservati.';
      throw cause;
    }
  }

  return { session, answers, imports, status, error, localDraft, resumeStep, load, save, upload, confirm, finalize, remember };
});
