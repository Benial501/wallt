<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import WModal from '@/components/common/WModal.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useContiStore } from '@/stores/conti.store';
import { useMovimentiStore } from '@/stores/movimenti.store';
import { useTheme } from '@/composables/useTheme';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import api from '@/utils/axios';
import { performLogout, resetPiniaStores } from '@/utils/session';
import { isMinor } from '@/utils/ageRestriction';
import { wantsScommesse, wantsInvestimenti } from '@/utils/featureAccess';
import {
  Shield, User, ClipboardList, Palette, Sun, Moon, Coins, Bell, Settings,
  Bot, Dices, LineChart, Lock, DownloadIcon, RefreshCw, Trash2, ChevronDown, ChevronRight,
  Wallet, CircleHelp,
} from '@/utils/appIcons';
import { useHelpStore } from '@/stores/help.store';

const authStore = useAuthStore();
const contiStore = useContiStore();
const movimentiStore = useMovimentiStore();
const helpStore = useHelpStore();
const { mostraScommesse, mostraInvestimenti, user } = storeToRefs(authStore);
const isMinorUser = computed(() => isMinor(user.value?.profilo));
const showScommesseToggle = computed(() => !isMinorUser.value && wantsScommesse(user.value?.profilo));
const showInvestimentiToggle = computed(() => !isMinorUser.value && wantsInvestimenti(user.value?.profilo));
const router = useRouter();
const toastStore = useToastStore();
const { formatValuta } = useValuta();
const { toggle, isDark } = useTheme();

const openSections = ref({
  account: true, profilo: true, conti: false, finanziario: false, importa: false, aiuto: false, aspetto: true, valuta: false,
  reminder: false, funzionalita: true, sicurezza: false, export: false, reset: false, delete: false,
});
const loading = ref(false);

const profiloForm = ref({ nome: '', email: '' });
const valuta = ref('EUR');
const reminder = ref(true);
const themeAnimating = ref(false);

const showPasswordModal = ref(false);
const showResetModal = ref(false);
const showDeleteModal = ref(false);
const showStepUpModal = ref(false);
const stepUpPassword = ref('');
const stepUpLoading = ref(false);
const pendingStepUpCallback = ref(null);
const passwordForm = ref({ attuale: '', nuova: '', conferma: '' });
const resetPassword = ref('');
const resetConfirmText = ref('');
const deletePassword = ref('');
const deleteConfirmText = ref('');

const isOAuthAccount = computed(() => {
  const provider = authStore.user?.auth_provider;
  return !!provider && provider !== 'local';
});

// Account Google: nessuna ri-autenticazione: lo step-up è richiesto ai soli
// account con password locale (vedi requireStepUpUnlessOAuth lato server e
// docs/DECISIONS.md, iterazione 4). Per gli account OAuth l'unica barriera
// sulle operazioni sensibili è la conferma testuale ELIMINA/RESETTA.
const useAiCategorization = computed(() => authStore.user?.use_ai_categorization === true);

const VALUTE = [
  { code: 'EUR', label: 'EUR €' },
  { code: 'USD', label: 'USD $' },
  { code: 'GBP', label: 'GBP £' },
  { code: 'CHF', label: 'CHF ₣' },
  { code: 'JPY', label: 'JPY ¥' },
];

const iniziali = computed(() => {
  const nome = authStore.user?.nome || '?';
  return nome.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
});

const profiloFinanziario = computed(() => {
  const p = authStore.user?.profilo;
  if (!p) return 'Profilo non configurato';
  return [
    p.situazione_lavorativa,
    p.situazione_abitativa,
    p.ha_auto ? 'Auto' : null,
    p.usa_mezzi_pubblici ? 'Mezzi pubblici' : null,
  ].filter(Boolean).join(' · ');
});

const contiVisibili = computed(() => {
  const showInv = authStore.mostraInvestimenti;
  return contiStore.contiAttivi.filter((c) => showInv || c.tipo !== 'investimento');
});

const riepilogoConti = computed(() => {
  const n = contiVisibili.value.length;
  if (!n) return 'Nessun conto configurato';
  const label = n === 1 ? '1 conto' : `${n} conti`;
  return `${label} · Patrimonio ${formatValuta(contiStore.patrimonioTotale)}`;
});

onMounted(() => {
  profiloForm.value = { nome: authStore.user?.nome || '', email: authStore.user?.email || '' };
  valuta.value = authStore.user?.valuta || 'EUR';
  reminder.value = authStore.user?.reminder ?? true;
  contiStore.fetchConti();
  contiStore.fetchPatrimonio();
});

const toggleScommesse = async (event) => {
  const nuovoValore = event.target.checked;
  try {
    await authStore.updatePreferenze({ mostra_scommesse: nuovoValore });
    toastStore.success(nuovoValore ? 'Scommesse attivate' : 'Scommesse disattivate');
  } catch {
    event.target.checked = mostraScommesse.value;
    toastStore.error('Errore nel salvataggio');
  }
};

const toggleInvestimenti = async (event) => {
  const nuovoValore = event.target.checked;
  try {
    await authStore.updatePreferenze({ mostra_investimenti: nuovoValore });
    toastStore.success(nuovoValore ? 'Investimenti attivati' : 'Investimenti disattivati');
  } catch {
    event.target.checked = mostraInvestimenti.value;
    toastStore.error('Errore nel salvataggio');
  }
};

const toggleAiCategorization = async (event) => {
  const nuovoValore = event.target.checked;
  try {
    await authStore.updatePreferenze({ use_ai_categorization: nuovoValore });
    toastStore.success(
      nuovoValore
        ? 'Categorizzazione AI attivata'
        : 'Categorizzazione AI disattivata',
    );
  } catch {
    event.target.checked = useAiCategorization.value;
    toastStore.error('Errore nel salvataggio');
  }
};

const toggleSection = (key) => { openSections.value[key] = !openSections.value[key]; };

const salvaProfilo = async () => {
  loading.value = true;
  try {
    const { data } = await api.put('/impostazioni/profilo', profiloForm.value);
    authStore.updateUser(data.user);
    toastStore.success('Profilo salvato!');
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Errore');
  } finally {
    loading.value = false;
  }
};

const salvaPreferenze = async (extra = {}, toastMsg = null) => {
  try {
    await authStore.updatePreferenze({
      valuta: valuta.value,
      reminder: reminder.value,
      mostra_scommesse: mostraScommesse.value,
      mostra_investimenti: mostraInvestimenti.value,
      ...extra,
    });
    if (toastMsg) toastStore.success(toastMsg);
  } catch {
    toastStore.error('Errore nel salvataggio preferenze');
  }
};

const salvaValuta = async () => {
  await salvaPreferenze({}, 'Valuta aggiornata!');
};

const handleToggleTheme = async () => {
  themeAnimating.value = true;
  await toggle();
  setTimeout(() => { themeAnimating.value = false; }, 400);
};

const cambiaPassword = async () => {
  if (passwordForm.value.nuova !== passwordForm.value.conferma) {
    toastStore.error('Le password non coincidono');
    return;
  }
  if (passwordForm.value.nuova.length < 8) {
    toastStore.error('Minimo 8 caratteri');
    return;
  }
  loading.value = true;
  try {
    await api.put('/impostazioni/password', {
      password_attuale: passwordForm.value.attuale,
      nuova_password: passwordForm.value.nuova,
    });
    toastStore.success('Password aggiornata!');
    showPasswordModal.value = false;
    passwordForm.value = { attuale: '', nuova: '', conferma: '' };
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Errore');
  } finally {
    loading.value = false;
  }
};

const eseguiExport = async (stepUpToken) => {
  try {
    const response = await api.post('/impostazioni/esporta', null, {
      responseType: 'blob',
      ...(stepUpToken ? { headers: { 'X-Step-Up-Token': stepUpToken } } : {}),
    });
    const url = URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `wallt-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toastStore.success('Dati esportati!');
  } catch {
    toastStore.error('Errore esportazione');
  }
};

// Gli account OAuth non hanno password da riverificare: l'export parte subito.
const esportaDati = () => {
  if (isOAuthAccount.value) {
    eseguiExport(null);
    return;
  }
  openStepUpModal(eseguiExport);
};

// Usato solo dal ramo locale (password) del modale di step-up generico
// (esporta dati): per gli account OAuth il modale non viene mai aperto.
const requestStepUpToken = async (password) => {
  const { data } = await api.post('/auth/verify-password', { password });
  return data.step_up_token;
};

const openStepUpModal = (callback) => {
  stepUpPassword.value = '';
  pendingStepUpCallback.value = callback;
  showStepUpModal.value = true;
};

const closeStepUpModal = () => {
  showStepUpModal.value = false;
  stepUpPassword.value = '';
  pendingStepUpCallback.value = null;
};

const confirmStepUp = async () => {
  if (!stepUpPassword.value || isOAuthAccount.value) return;

  stepUpLoading.value = true;
  try {
    const stepUpToken = await requestStepUpToken(stepUpPassword.value);
    const callback = pendingStepUpCallback.value;
    closeStepUpModal();
    if (callback) {
      await callback(stepUpToken);
    }
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Verifica non riuscita');
  } finally {
    stepUpLoading.value = false;
  }
};

const performResetAccount = async (stepUpToken, payload) => {
  loading.value = true;
  try {
    const { data } = await api.post('/impostazioni/reset-account', payload, {
      ...(stepUpToken ? { headers: { 'X-Step-Up-Token': stepUpToken } } : {}),
    });

    if (data.user) {
      authStore.updateUser(data.user);
    }

    movimentiStore.movimentiPerData = [];
    movimentiStore.bilancioMese = {};
    movimentiStore.pagination = { page: 1, total: 0, pages: 0 };
    await contiStore.fetchConti();
    await contiStore.fetchPatrimonio();
    await movimentiStore.fetchMovimenti();

    showResetModal.value = false;
    resetPassword.value = '';
    resetConfirmText.value = '';

    toastStore.success('Transazioni eliminate. I tuoi conti sono stati conservati.');
    router.replace('/dashboard');
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Errore reset transazioni');
  } finally {
    loading.value = false;
  }
};

// Ramo utenti locali: verifica password → step-up → reset.
const resetAccount = async () => {
  if (isOAuthAccount.value) return;

  loading.value = true;
  try {
    const stepUpToken = await requestStepUpToken(resetPassword.value);
    await performResetAccount(stepUpToken, { password: resetPassword.value });
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Errore reset transazioni');
    loading.value = false;
  }
};

// Ramo account OAuth: nessuno step-up, la conferma testuale "RESETTA" è
// l'unica barriera (validata anche lato server da resetAccount).
const resetAccountOAuth = async () => {
  if (!isOAuthAccount.value || resetConfirmText.value !== 'RESETTA') return;
  await performResetAccount(null, { conferma: 'RESETTA' });
};

const handleLogout = async () => {
  await performLogout(router);
};

const performDeleteAccount = async (stepUpToken, payload) => {
  loading.value = true;
  try {
    await api.delete('/impostazioni/account', {
      data: payload,
      ...(stepUpToken ? { headers: { 'X-Step-Up-Token': stepUpToken } } : {}),
    });
    showDeleteModal.value = false;
    deletePassword.value = '';
    deleteConfirmText.value = '';
    await performLogout(router);
    toastStore.success('Account eliminato');
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Errore eliminazione');
  } finally {
    loading.value = false;
  }
};

// Ramo utenti locali: verifica password → step-up → eliminazione account.
const eliminaAccount = async () => {
  if (isOAuthAccount.value) return;

  loading.value = true;
  try {
    const stepUpToken = await requestStepUpToken(deletePassword.value);
    await performDeleteAccount(stepUpToken, { password: deletePassword.value });
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Errore eliminazione');
    loading.value = false;
  }
};

// Ramo account OAuth: nessuno step-up, la conferma testuale "ELIMINA" è
// l'unica barriera (validata anche lato server da deleteAccount).
const eliminaAccountOAuth = async () => {
  if (!isOAuthAccount.value || deleteConfirmText.value !== 'ELIMINA') return;
  await performDeleteAccount(null, { conferma: 'ELIMINA' });
};
</script>

<template>
  <div class="impostazioni-view animate-fade-in">
    <div class="profile-header">
      <div class="avatar-lg">{{ iniziali }}</div>
      <h2>{{ authStore.user?.nome }}</h2>
      <p>{{ authStore.user?.email }}</p>
    </div>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('account')">
        <Shield :size="18" :stroke-width="1.75" />
        <span>Account</span>
        <component :is="openSections.account ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.account" class="section-body">
        <p class="hint hint--inline">Disconnetti il tuo account da questo dispositivo.</p>
        <WButton variant="secondary" size="md" @click="handleLogout">Esci dall'account</WButton>
      </div>
    </WCard>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('profilo')">
        <User :size="18" :stroke-width="1.75" />
        <span>Profilo</span>
        <component :is="openSections.profilo ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.profilo" class="section-body">
        <input v-model="profiloForm.nome" class="form-input" placeholder="Nome" />
        <input v-model="profiloForm.email" type="email" inputmode="email" class="form-input" placeholder="Email" />
        <WButton variant="primary" size="md" :loading="loading" @click="salvaProfilo">Salva modifiche</WButton>
      </div>
    </WCard>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('finanziario')">
        <ClipboardList :size="18" :stroke-width="1.75" />
        <span>Profilo finanziario</span>
        <component :is="openSections.finanziario ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.finanziario" class="section-body">
        <p class="profilo-summary">{{ profiloFinanziario }}</p>
        <WButton variant="secondary" size="md" @click="router.push('/onboarding?edit=true')">Modifica profilo finanziario</WButton>
      </div>
    </WCard>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('conti')">
        <Wallet :size="18" :stroke-width="1.75" />
        <span>I miei conti</span>
        <component :is="openSections.conti ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.conti" class="section-body">
        <p class="profilo-summary">{{ riepilogoConti }}</p>
        <ul v-if="contiVisibili.length" class="conti-mini-list">
          <li v-for="conto in contiVisibili" :key="conto.id">
            <span class="conti-mini-list__emoji">{{ conto.icona || '💳' }}</span>
            <span class="conti-mini-list__nome">{{ conto.nome }}</span>
            <span class="conti-mini-list__saldo">{{ formatValuta(conto.saldo) }}</span>
          </li>
        </ul>
        <p class="hint hint--inline">
          Aggiungi banche, app di pagamento, contanti e altri conti. Necessari per importare estratti e registrare movimenti.
        </p>
        <WButton variant="primary" size="md" @click="router.push('/conti')">
          Gestisci i miei conti
        </WButton>
      </div>
    </WCard>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('importa')">
        <DownloadIcon :size="18" :stroke-width="1.75" />
        <span>Importa estratto conto</span>
        <component :is="openSections.importa ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.importa" class="section-body">
        <p class="hint">
          Carica il file CSV o Excel del tuo estratto conto. WALLT riconosce i formati delle principali banche italiane.
        </p>
        <WButton variant="primary" size="md" @click="router.push('/importa')">
          Vai all'importazione
        </WButton>
      </div>
    </WCard>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('aiuto')">
        <CircleHelp :size="18" :stroke-width="1.75" />
        <span>Aiuto e guida</span>
        <component :is="openSections.aiuto ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.aiuto" class="section-body">
        <p class="hint">
          Come funzionano conti, movimenti, trasferimenti, importazione, budget e obiettivi.
        </p>
        <WButton variant="primary" size="md" @click="router.push('/aiuto')">
          Apri la guida
        </WButton>
        <p class="hint hint--inline">
          <template v-if="helpStore.gettingStartedHidden">
            Il riquadro «Primi passi» in Home è nascosto.
          </template>
          <template v-else>
            Il riquadro «Primi passi» è mostrato in Home.
          </template>
          La preferenza vale solo per questo browser.
        </p>
        <WButton
          v-if="helpStore.gettingStartedHidden"
          variant="secondary"
          size="md"
          @click="helpStore.showGettingStarted()"
        >
          Mostra di nuovo Primi passi
        </WButton>
      </div>
    </WCard>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('aspetto')">
        <Palette :size="18" :stroke-width="1.75" />
        <span>Aspetto</span>
        <component :is="openSections.aspetto ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.aspetto" class="section-body">
        <div class="theme-toggle">
          <span class="theme-toggle__label">
            <component :is="isDark ? Moon : Sun" :size="18" :stroke-width="1.75" />
            {{ isDark ? 'Modalità scura' : 'Modalità chiara' }}
          </span>
          <button class="theme-switch" :class="{ animating: themeAnimating }" @click="handleToggleTheme">
            <component :is="isDark ? Moon : Sun" class="theme-icon-svg" :size="18" :stroke-width="1.75" />
          </button>
        </div>
      </div>
    </WCard>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('valuta')">
        <Coins :size="18" :stroke-width="1.75" />
        <span>Valuta</span>
        <component :is="openSections.valuta ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.valuta" class="section-body">
        <select v-model="valuta" class="form-input" @change="salvaValuta">
          <option v-for="v in VALUTE" :key="v.code" :value="v.code">{{ v.label }}</option>
        </select>
      </div>
    </WCard>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('reminder')">
        <Bell :size="18" :stroke-width="1.75" />
        <span>Reminder</span>
        <component :is="openSections.reminder ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.reminder" class="section-body">
        <label class="toggle-row">
          <input v-model="reminder" type="checkbox" @change="salvaPreferenze({}, 'Impostazioni salvate')" />
          <span>Attiva reminder per aggiornare le spese</span>
        </label>
        <p class="hint">Ti ricordiamo di aggiornare le spese con un banner nell'app</p>
      </div>
    </WCard>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('funzionalita')">
        <Settings :size="18" :stroke-width="1.75" />
        <span>Funzionalità</span>
        <component :is="openSections.funzionalita ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.funzionalita" class="section-body">
        <div class="funzione-block">
          <label class="toggle-row">
            <input
              :checked="useAiCategorization"
              type="checkbox"
              @change="toggleAiCategorization"
            />
            <Bot :size="16" :stroke-width="1.75" />
            <span>Usa AI per categorizzazione automatica</span>
          </label>
          <p class="hint">
            I dati delle transazioni verranno elaborati da OpenAI. Puoi disattivare in qualsiasi momento.
          </p>
        </div>
        <div v-if="showScommesseToggle" class="funzione-block">
          <label class="toggle-row">
            <input :checked="mostraScommesse" type="checkbox" @change="toggleScommesse" />
            <Dices :size="16" :stroke-width="1.75" />
            <span>Sezione Scommesse</span>
          </label>
          <p class="hint">Tieni traccia di depositi, prelievi, vincite e perdite sulle piattaforme</p>
        </div>
        <div v-if="showInvestimentiToggle" class="funzione-block">
          <label class="toggle-row">
            <input :checked="mostraInvestimenti" type="checkbox" @change="toggleInvestimenti" />
            <LineChart :size="16" :stroke-width="1.75" />
            <span>Sezione Investimenti</span>
          </label>
          <p class="hint">Monitora i tuoi investimenti nel tempo</p>
        </div>
        <p v-if="isMinorUser" class="hint text-[var(--text-muted)]">
          Scommesse e investimenti non sono disponibili per utenti under 18.
        </p>
      </div>
    </WCard>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('sicurezza')">
        <Lock :size="18" :stroke-width="1.75" />
        <span>Sicurezza</span>
        <component :is="openSections.sicurezza ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.sicurezza" class="section-body">
        <WButton variant="secondary" size="md" @click="showPasswordModal = true">Cambia password</WButton>
      </div>
    </WCard>

    <WCard class="section-card">
      <button class="section-toggle" @click="toggleSection('export')">
        <DownloadIcon :size="18" :stroke-width="1.75" />
        <span>Esporta dati</span>
        <component :is="openSections.export ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.export" class="section-body">
        <WButton variant="secondary" size="md" @click="esportaDati">Scarica tutti i dati (JSON)</WButton>
      </div>
    </WCard>

    <WCard class="section-card section-danger">
      <button class="section-toggle" @click="toggleSection('reset')">
        <RefreshCw :size="18" :stroke-width="1.75" />
        <span>Reset transazioni</span>
        <component :is="openSections.reset ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.reset" class="section-body">
        <p class="danger-text">
          Elimina tutte le transazioni (entrate, uscite e trasferimenti) e azzera i saldi dei conti.
          I conti restano sul profilo: nome, icona e colore non vengono toccati.
          Budget, obiettivi, scommesse e investimenti non vengono eliminati.
        </p>
        <WButton variant="danger" size="md" @click="showResetModal = true">Resetta transazioni</WButton>
      </div>
    </WCard>

    <WCard class="section-card section-danger">
      <button class="section-toggle" @click="toggleSection('delete')">
        <Trash2 :size="18" :stroke-width="1.75" />
        <span>Elimina account</span>
        <component :is="openSections.delete ? ChevronDown : ChevronRight" :size="16" />
      </button>
      <div v-if="openSections.delete" class="section-body">
        <WButton variant="danger" size="md" @click="showDeleteModal = true">Elimina account</WButton>
      </div>
    </WCard>

    <WModal :open="showPasswordModal" title="Cambia password" @close="showPasswordModal = false">
      <div class="form-space">
        <input v-model="passwordForm.attuale" type="password" class="form-input" placeholder="Password attuale" />
        <input v-model="passwordForm.nuova" type="password" class="form-input" placeholder="Nuova password (min 8)" />
        <input v-model="passwordForm.conferma" type="password" class="form-input" placeholder="Conferma password" />
        <WButton variant="primary" size="lg" :loading="loading" @click="cambiaPassword">Aggiorna password</WButton>
      </div>
    </WModal>

    <WModal :open="showResetModal" title="Reset transazioni" @close="showResetModal = false">
      <div class="form-space">
        <p class="danger-text">
          Stai per eliminare <b>tutte le transazioni</b>.
          I tuoi conti resteranno attivi con saldo a zero.
        </p>
        <ul class="reset-list">
          <li>Tutte le entrate, uscite e trasferimenti</li>
          <li>Saldo dei conti (riportato a €0)</li>
        </ul>
        <p class="hint hint--inline">Conti, budget, obiettivi, scommesse e profilo <b>non</b> vengono eliminati.</p>
        <template v-if="isOAuthAccount">
          <input
            v-model="resetConfirmText"
            class="form-input"
            placeholder='Digita RESETTA per confermare'
            autocomplete="off"
          />
          <WButton
            variant="danger"
            size="lg"
            :loading="loading"
            :disabled="resetConfirmText !== 'RESETTA'"
            @click="resetAccountOAuth"
          >
            Sì, elimina transazioni
          </WButton>
        </template>
        <template v-else>
          <input v-model="resetPassword" type="password" class="form-input" placeholder="Password per confermare" />
          <WButton
            variant="danger"
            size="lg"
            :loading="loading"
            :disabled="!resetPassword"
            @click="resetAccount"
          >
            Sì, elimina transazioni
          </WButton>
        </template>
      </div>
    </WModal>

    <WModal :open="showDeleteModal" title="Elimina account" @close="showDeleteModal = false">
      <div class="form-space">
        <p class="danger-text">Questa azione è IRREVERSIBILE. Tutti i tuoi dati verranno eliminati.</p>
        <p class="hint hint--inline">Per sicurezza, conferma la tua identità.</p>
        <template v-if="isOAuthAccount">
          <input
            v-model="deleteConfirmText"
            type="text"
            class="form-input"
            placeholder="Digita ELIMINA per confermare"
            autocapitalize="characters"
          />
          <WButton
            variant="danger"
            size="lg"
            :loading="loading"
            :disabled="deleteConfirmText !== 'ELIMINA'"
            @click="eliminaAccountOAuth"
          >
            Sì, elimina tutto
          </WButton>
        </template>
        <template v-else>
          <input v-model="deletePassword" type="password" class="form-input" placeholder="Password per confermare" />
          <WButton
            variant="danger"
            size="lg"
            :loading="loading"
            :disabled="!deletePassword"
            @click="eliminaAccount"
          >
            Sì, elimina tutto
          </WButton>
        </template>
      </div>
    </WModal>

    <WModal :open="showStepUpModal" title="Verifica identità" @close="closeStepUpModal">
      <div class="form-space">
        <p class="hint hint--inline">Per sicurezza, reinserisci la tua password.</p>
        <input
          v-model="stepUpPassword"
          type="password"
          class="form-input"
          placeholder="Password attuale"
          @keyup.enter="confirmStepUp"
        />
        <WButton
          variant="primary"
          size="lg"
          :loading="stepUpLoading"
          :disabled="!stepUpPassword"
          @click="confirmStepUp"
        >
          Conferma
        </WButton>
      </div>
    </WModal>
  </div>
</template>

<style scoped>
.profile-header { text-align: center; margin-bottom: 2rem; }
.avatar-lg { width: 80px; height: 80px; border-radius: 50%; background: var(--accent-light); color: var(--accent-green); display: flex; align-items: center; justify-content: center; font-size: 1.75rem; font-weight: 700; margin: 0 auto 0.75rem; }
.profile-header h2 { font-size: 1.25rem; color: var(--text-primary); }
.profile-header p { color: var(--text-secondary); font-size: 0.875rem; }
.section-card { margin-bottom: 0.75rem; padding: 0 !important; overflow: hidden; }
.section-toggle { width: 100%; padding: 1rem 1.25rem; background: none; border: none; text-align: left; font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); cursor: pointer; min-height: 44px; display: flex; align-items: center; gap: 0.625rem; }
.section-toggle svg { flex-shrink: 0; stroke: currentColor; }
.section-toggle span { flex: 1; }
.theme-toggle__label { display: inline-flex; align-items: center; gap: 0.5rem; }
.theme-icon-svg { stroke: currentColor; color: var(--accent-green); }
.toggle-row { display: flex; align-items: center; gap: 0.5rem; }
.section-body { padding: 0 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
.form-input { width: 100%; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.75rem 1rem; color: var(--text-primary); font-size: 16px; min-height: 44px; }
.profilo-summary { font-size: 0.875rem; color: var(--text-secondary); }
.conti-mini-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.conti-mini-list li { display: flex; align-items: center; gap: 0.625rem; padding: 0.625rem 0.75rem; border-radius: var(--radius-md); background: var(--bg-input); font-size: 0.875rem; }
.conti-mini-list__emoji { font-size: 1.25rem; line-height: 1; flex-shrink: 0; }
.conti-mini-list__nome { flex: 1; color: var(--text-primary); font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conti-mini-list__saldo { color: var(--text-secondary); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.theme-toggle { display: flex; justify-content: space-between; align-items: center; }
.theme-switch { width: 56px; height: 32px; border-radius: 16px; border: 1px solid var(--border); background: var(--bg-input); cursor: pointer; display: flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px; }
.theme-switch.animating .theme-icon { animation: spin 0.4s ease; }
@keyframes spin { to { transform: rotate(360deg); } }
.toggle-row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.875rem; color: var(--text-secondary); cursor: pointer; min-height: 44px; }
.hint { font-size: 0.8125rem; color: var(--text-muted); margin-left: 1.75rem; }
.hint--inline { margin-left: 0; margin-bottom: 0.25rem; }
.funzione-block { display: flex; flex-direction: column; gap: 0.25rem; }
.section-danger .section-toggle { color: var(--negative); }
.danger-text { color: var(--negative); font-size: 0.875rem; }
.reset-list { margin: 0.25rem 0 0.5rem 1.25rem; color: var(--text-secondary); font-size: 0.8125rem; }
.reset-list li { margin-bottom: 0.25rem; }
.form-space { display: flex; flex-direction: column; gap: 0.75rem; }
</style>
