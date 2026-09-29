<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useProfiloStore } from '@/stores/profilo.store';
import { useAuthStore } from '@/stores/auth.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { isOnboardingComplete } from '@/utils/onboarding';
import { isMinor } from '@/utils/ageRestriction';
import { tracciaEvento } from '@/utils/monitoraggio';
import {
  Sparkles, Briefcase, House, Car, Coins, CheckCircle2, User, Banknote,
  GraduationCap, Building2, Search, Package, Key, Users, Bike, Bus, Footprints, Smartphone,
  BarChart3, AlertTriangle, XCircle, TrendingUp, Sprout, Dices,
} from '@/utils/appIcons';

const router = useRouter();
const route = useRoute();
const profiloStore = useProfiloStore();
const authStore = useAuthStore();
const toastStore = useToastStore();
const { formatValuta } = useValuta();

/**
 * Tre schermate, non cinque piu' un riepilogo.
 *
 * I campi raccolti sono gli stessi di prima (il profilo finanziario alimenta
 * Piano Smart e non si tocca): cambia solo come sono raggruppati, per tema
 * anziche' uno per pagina. Il riepilogo non e' piu' una schermata a se': e'
 * la conferma in fondo all'ultimo passo, dove serve davvero.
 */
const TOTALE_STEP = 3;

const currentStep = ref(1);
const slideDirection = ref('forward');
const saving = ref(false);

const form = ref({
  fascia_eta: null,
  situazione_lavorativa: null,
  entrata_fissa: false,
  entrata_mensile: null,
  situazione_abitativa: null,
  costo_abitazione: null,
  paga_bollette: 'no',
  stima_bollette: null,
  ha_auto: false,
  ha_moto: false,
  usa_mezzi_pubblici: false,
  a_piedi: false,
  car_sharing: false,
  spesa_benzina: null,
  spesa_mezzi: null,
  ha_spese_extra: false,
  spese_fisse_extra: null,
  risparmia: null,
  ha_investimenti: null,
  fa_scommesse: null,
});

const FASCE_ETA = [
  { id: 'under_18', label: 'Under 18' },
  { id: '18_24', label: '18-24' },
  { id: '25_34', label: '25-34' },
  { id: '35_44', label: '35-44' },
  { id: '45_54', label: '45-54' },
  { id: '55_plus', label: '55+' },
];

const SITUAZIONI_LAVORO = [
  { id: 'studente', label: 'Studente', icon: GraduationCap },
  { id: 'studente_lavoratore', label: 'Studente lavoratore', icon: Briefcase },
  { id: 'lavoratore_dipendente', label: 'Lavoratore dipendente', icon: Briefcase },
  { id: 'autonomo', label: 'Autonomo / Partita IVA', icon: Building2 },
  { id: 'in_cerca', label: 'In cerca di lavoro', icon: Search },
  { id: 'altro', label: 'Altro', icon: Package },
];

const SITUAZIONI_ABITATIVE = [
  { id: 'proprieta_mutuo', label: 'Casa di proprietà con mutuo', icon: House },
  { id: 'proprieta_senza_mutuo', label: 'Casa di proprietà senza mutuo', icon: House },
  { id: 'affitto', label: 'In affitto', icon: Key },
  { id: 'vivo_con_genitori', label: 'Vivo con i genitori', icon: Users },
  { id: 'coinquilini', label: 'Con coinquilini', icon: Users },
  { id: 'altro', label: 'Altro', icon: Package },
];

const TRASPORTI = [
  { id: 'ha_auto', label: 'Ho un\'auto', icon: Car },
  { id: 'ha_moto', label: 'Ho una moto', icon: Bike },
  { id: 'usa_mezzi_pubblici', label: 'Mezzi pubblici', icon: Bus },
  { id: 'a_piedi', label: 'A piedi', icon: Footprints },
  { id: 'car_sharing', label: 'Car sharing', icon: Smartphone },
];

const OPZIONI_RISPARMIO = [
  { id: 'si_regolarmente', label: 'Sì regolarmente', icon: CheckCircle2 },
  { id: 'a_volte', label: 'A volte', icon: BarChart3 },
  { id: 'no_fine_mese', label: 'No, arrivo a fine mese', icon: AlertTriangle },
  { id: 'spendo_troppo', label: 'Spendo troppo', icon: XCircle },
];

const OPZIONI_INVESTIMENTI = [
  { id: 'si_regolarmente', label: 'Sì regolarmente', icon: TrendingUp },
  { id: 'qualcosa', label: 'Qualcosa', icon: BarChart3 },
  { id: 'vorrei_iniziare', label: 'Vorrei iniziare', icon: Sprout },
  { id: 'no', label: 'No', icon: XCircle },
];

const OPZIONI_SCOMMESSE = [
  { id: 'si_regolarmente', label: 'Sì regolarmente', icon: Dices },
  { id: 'ogni_tanto', label: 'Ogni tanto', icon: Dices },
  { id: 'no', label: 'No', icon: XCircle },
];

const BOLLETTE = [
  { id: 'tutte', label: 'Tutte io' },
  { id: 'divise', label: 'Divise' },
  { id: 'no', label: 'Non le pago' },
];

const richiedeCostoAbitazione = computed(() =>
  ['affitto', 'proprieta_mutuo'].includes(form.value.situazione_abitativa)
);

const richiedeStimaBollette = computed(() =>
  ['tutte', 'divise'].includes(form.value.paga_bollette)
);

const richiedeBenzina = computed(() => form.value.ha_auto || form.value.ha_moto);
const richiedeMezzi = computed(() => form.value.usa_mezzi_pubblici);
const isMinorUser = computed(() => isMinor(form.value.fascia_eta));

const canProceed = computed(() => {
  switch (currentStep.value) {
    // 1 - Chi sei: eta' (obbligatoria, e' anche il gate per i minori),
    // lavoro, entrata.
    case 1:
      if (!form.value.fascia_eta) return false;
      if (!form.value.situazione_lavorativa) return false;
      if (form.value.entrata_fissa && !form.value.entrata_mensile) return false;
      return true;
    // 2 - Dove vivi: abitazione, con gli importi solo quando li chiede.
    case 2:
      if (!form.value.situazione_abitativa) return false;
      if (richiedeCostoAbitazione.value && !form.value.costo_abitazione) return false;
      if (richiedeStimaBollette.value && !form.value.stima_bollette) return false;
      return true;
    // 3 - Come gestisci: trasporti, spese extra e abitudini. Per un minore
    // investimenti e scommesse non vengono chiesti (sono forzati a 'no'
    // dal watch sulla fascia d'eta'), quindi non possono essere richiesti.
    case 3:
      if (richiedeBenzina.value && !form.value.spesa_benzina) return false;
      if (richiedeMezzi.value && !form.value.spesa_mezzi) return false;
      if (form.value.ha_spese_extra && !form.value.spese_fisse_extra) return false;
      if (!form.value.risparmia) return false;
      if (isMinorUser.value) return true;
      return !!(form.value.ha_investimenti && form.value.fa_scommesse);
    default:
      return true;
  }
});

const isUltimoStep = computed(() => currentStep.value === TOTALE_STEP);

const getLabel = (list, id) => list.find((i) => i.id === id)?.label || id;
const getIcon = (list, id) => list.find((i) => i.id === id)?.icon || Package;

const riepilogoItems = computed(() => [
  { icon: User, text: getLabel(FASCE_ETA, form.value.fascia_eta) },
  { icon: getIcon(SITUAZIONI_LAVORO, form.value.situazione_lavorativa), text: getLabel(SITUAZIONI_LAVORO, form.value.situazione_lavorativa) },
  { icon: getIcon(SITUAZIONI_ABITATIVE, form.value.situazione_abitativa), text: getLabel(SITUAZIONI_ABITATIVE, form.value.situazione_abitativa) },
  ...(form.value.entrata_mensile ? [{ icon: Banknote, text: `${formatValuta(form.value.entrata_mensile)}/mese` }] : []),
]);

const toggleTrasporto = (id) => {
  if (id === 'a_piedi' || id === 'car_sharing') {
    form.value[id] = !form.value[id];
  } else {
    form.value[id] = !form.value[id];
  }
};

const buildPayload = (onboardingCompletato = true) => ({
  fascia_eta: form.value.fascia_eta,
  situazione_lavorativa: form.value.situazione_lavorativa,
  entrata_fissa: form.value.entrata_fissa,
  entrata_mensile: form.value.entrata_mensile || 0,
  situazione_abitativa: form.value.situazione_abitativa,
  costo_abitazione: form.value.costo_abitazione || 0,
  paga_bollette: form.value.paga_bollette,
  stima_bollette: form.value.stima_bollette || 0,
  ha_auto: form.value.ha_auto,
  ha_moto: form.value.ha_moto,
  usa_mezzi_pubblici: form.value.usa_mezzi_pubblici,
  spesa_benzina: form.value.spesa_benzina || 0,
  spesa_mezzi: form.value.spesa_mezzi || 0,
  spese_fisse_extra: form.value.ha_spese_extra ? (form.value.spese_fisse_extra || 0) : 0,
  risparmia: form.value.risparmia,
  ha_investimenti: isMinorUser.value ? 'no' : form.value.ha_investimenti,
  fa_scommesse: isMinorUser.value ? 'no' : form.value.fa_scommesse,
  onboarding_completato: onboardingCompletato,
});

const nextStep = async () => {
  if (!canProceed.value) return;
  if (isUltimoStep.value) {
    await completaOnboarding();
    return;
  }
  slideDirection.value = 'forward';
  currentStep.value++;
};

const completaOnboarding = async () => {
  saving.value = true;
  try {
    const result = await profiloStore.updateProfilo(buildPayload(true));
    const profilo = result?.profilo ?? authStore.user?.profilo;

    if (!isOnboardingComplete(profilo)) {
      throw new Error('Onboarding non salvato correttamente');
    }

    // Quanti arrivano in fondo ai tre passi: e' la meta' mancante del dato,
    // perche' le visite alla pagina si contano gia' da sole.
    tracciaEvento('onboarding_completato');

    await router.replace('/dashboard');
  } catch (err) {
    toastStore.error(err.response?.data?.message || err.message || profiloStore.error || 'Errore nel salvataggio del profilo');
  } finally {
    saving.value = false;
  }
};

const prevStep = () => {
  if (currentStep.value > 1) {
    slideDirection.value = 'back';
    currentStep.value--;
  }
};

const handleSkipOnboarding = async () => {
  if (!form.value.fascia_eta) {
    toastStore.error('Seleziona la fascia d\'età per continuare');
    return;
  }

  saving.value = true;
  try {
    await profiloStore.updateProfilo({
      fascia_eta: form.value.fascia_eta,
      ha_investimenti: isMinorUser.value ? 'no' : undefined,
      fa_scommesse: isMinorUser.value ? 'no' : undefined,
    });
    const { profilo } = await profiloStore.skipOnboarding();

    if (!isOnboardingComplete(profilo)) {
      throw new Error('Onboarding non salvato correttamente');
    }

    await router.replace('/dashboard');
  } catch (err) {
    toastStore.error(err.response?.data?.message || err.message || profiloStore.error || 'Errore nel salto onboarding');
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  if (isOnboardingComplete(authStore.user?.profilo) && !route.query.edit) {
    router.replace('/dashboard');
    return;
  }

  try {
    const p = await profiloStore.fetchProfilo();
    if (p) {
      Object.keys(form.value).forEach((key) => {
        if (p[key] !== undefined && p[key] !== null) {
          form.value[key] = p[key];
        }
      });
      form.value.ha_spese_extra = !!(p.spese_fisse_extra && parseFloat(p.spese_fisse_extra) > 0);
    }
  } catch {
    // profilo vuoto, ok
  }
});

watch(() => form.value.fascia_eta, (val) => {
  if (isMinor(val)) {
    form.value.ha_investimenti = 'no';
    form.value.fa_scommesse = 'no';
  }
});

watch(() => form.value.situazione_abitativa, (val) => {
  if (!['affitto', 'proprieta_mutuo'].includes(val)) {
    form.value.costo_abitazione = null;
  }
});

watch(() => form.value.paga_bollette, (val) => {
  if (val === 'no') form.value.stima_bollette = null;
});
</script>

<template>
  <div class="onboarding-bg min-h-screen flex items-center justify-center px-4 py-8">
    <div class="w-full max-w-[520px]">
      <!-- Card -->
      <div class="wallt-card relative overflow-hidden" style="border-radius: 24px;">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 pt-6 pb-2">
          <div class="flex items-center gap-2">
            <img src="/brand/wallt-app-icon-96.png" alt="WALLT" class="w-8 h-8 rounded-lg" width="96" height="96">
            <span class="text-sm font-bold text-[var(--text-primary)]">
              WALL<span class="text-[var(--accent-green)]">T</span>
            </span>
          </div>
          <button
            @click="handleSkipOnboarding"
            class="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="saving || !form.fascia_eta"
            :title="!form.fascia_eta ? 'Seleziona prima la fascia d\'età' : 'Salta il questionario'"
          >
            Salta
          </button>
        </div>

        <!-- Progress -->
        <div class="flex items-center justify-center gap-2 px-6 py-4">
          <div
            v-for="step in TOTALE_STEP"
            :key="step"
            class="progress-dot"
            :class="{ active: step <= currentStep, current: step === currentStep }"
          />
        </div>

        <!-- Steps container -->
        <div class="step-container px-6 pb-6">
          <Transition :name="slideDirection === 'forward' ? 'slide-forward' : 'slide-back'" mode="out-in">
            <!-- STEP 1 - Chi sei: eta', lavoro, entrata -->
            <div v-if="currentStep === 1" key="step1" class="step-content">
              <h2 class="step-title">
                <Sparkles :size="20" :stroke-width="1.75" />
                Benvenuto su WALLT!
              </h2>
              <p class="text-sm text-[var(--text-secondary)] mb-6">Raccontaci di te</p>

              <p class="text-sm font-medium text-[var(--text-secondary)] mb-3">
                Fascia d'età <span class="text-red-400">*</span>
              </p>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="fascia in FASCE_ETA"
                  :key="fascia.id"
                  @click="form.fascia_eta = fascia.id"
                  class="pill-btn"
                  :class="{ selected: form.fascia_eta === fascia.id }"
                >
                  {{ fascia.label }}
                </button>
              </div>

              <div class="step-divider" />

              <p class="text-sm font-medium text-[var(--text-secondary)] mb-3">
                Come lavori? <span class="text-red-400">*</span>
              </p>
              <div class="space-y-2 mb-6">
                <button
                  v-for="lavoro in SITUAZIONI_LAVORO"
                  :key="lavoro.id"
                  @click="form.situazione_lavorativa = lavoro.id"
                  class="option-btn"
                  :class="{ selected: form.situazione_lavorativa === lavoro.id }"
                >
                  <component :is="lavoro.icon" class="option-icon" :size="18" :stroke-width="1.75" />
                  <span>{{ lavoro.label }}</span>
                </button>
              </div>

              <div class="border-t border-[var(--border)] pt-4">
                <p class="text-sm font-medium text-[var(--text-secondary)] mb-3">
                  Hai entrata fissa mensile?
                </p>
                <div class="flex gap-2 mb-4">
                  <button
                    @click="form.entrata_fissa = true"
                    class="pill-btn flex-1"
                    :class="{ selected: form.entrata_fissa }"
                  >Sì</button>
                  <button
                    @click="form.entrata_fissa = false; form.entrata_mensile = null"
                    class="pill-btn flex-1"
                    :class="{ selected: !form.entrata_fissa }"
                  >No</button>
                </div>
                <div v-if="form.entrata_fissa">
                  <label class="text-sm text-[var(--text-secondary)] mb-1.5 block">€ importo mensile</label>
                  <input
                    v-model.number="form.entrata_mensile"
                    type="number"
                    min="0"
                    placeholder="1500"
                    class="wallt-input !pl-4"
                  />
                </div>
              </div>
            </div>

            <!-- STEP 2 - Dove vivi: abitazione e bollette -->
            <div v-else-if="currentStep === 2" key="step2" class="step-content">
              <h2 class="step-title">
                <House :size="20" :stroke-width="1.75" />
                Dove vivi?
              </h2>
              <p class="text-sm text-[var(--text-secondary)] mb-6">Situazione abitativa e bollette</p>

              <p class="text-sm font-medium text-[var(--text-secondary)] mb-3">
                Dove abiti <span class="text-red-400">*</span>
              </p>
              <div class="space-y-2 mb-6">
                <button
                  v-for="abit in SITUAZIONI_ABITATIVE"
                  :key="abit.id"
                  @click="form.situazione_abitativa = abit.id"
                  class="option-btn"
                  :class="{ selected: form.situazione_abitativa === abit.id }"
                >
                  <component :is="abit.icon" class="option-icon" :size="18" :stroke-width="1.75" />
                  <span>{{ abit.label }}</span>
                </button>
              </div>

              <div v-if="richiedeCostoAbitazione" class="mb-4">
                <label class="text-sm text-[var(--text-secondary)] mb-1.5 block">€ importo mensile</label>
                <input
                  v-model.number="form.costo_abitazione"
                  type="number"
                  min="0"
                  placeholder="800"
                  class="wallt-input !pl-4"
                />
              </div>

              <p class="text-sm font-medium text-[var(--text-secondary)] mb-2">Bollette</p>
              <div class="flex gap-2 mb-4 flex-wrap">
                <button
                  v-for="b in BOLLETTE"
                  :key="b.id"
                  @click="form.paga_bollette = b.id"
                  class="pill-btn"
                  :class="{ selected: form.paga_bollette === b.id }"
                >
                  {{ b.label }}
                </button>
              </div>

              <div v-if="richiedeStimaBollette">
                <label class="text-sm text-[var(--text-secondary)] mb-1.5 block">€ stima mensile bollette</label>
                <input
                  v-model.number="form.stima_bollette"
                  type="number"
                  min="0"
                  placeholder="150"
                  class="wallt-input !pl-4"
                />
              </div>
            </div>

            <!-- STEP 3 - Come gestisci: trasporti, spese extra, abitudini.
                 Il riepilogo chiude questo passo invece di occuparne uno suo. -->
            <div v-else-if="currentStep === 3" key="step3" class="step-content">
              <h2 class="step-title">
                <Coins :size="20" :stroke-width="1.75" />
                Come gestisci i tuoi soldi
              </h2>
              <p class="text-sm text-[var(--text-secondary)] mb-6">
                Trasporti, spese fisse e abitudini
              </p>

              <p class="text-sm font-medium text-[var(--text-secondary)] mb-1">Come ti muovi?</p>
              <p class="text-xs text-[var(--text-muted)] mb-3">Puoi selezionare più opzioni</p>
              <div class="flex flex-wrap gap-2 mb-6">
                <button
                  v-for="t in TRASPORTI"
                  :key="t.id"
                  @click="toggleTrasporto(t.id)"
                  class="pill-btn"
                  :class="{ selected: form[t.id] }"
                >
                  <component :is="t.icon" class="option-icon" :size="16" :stroke-width="1.75" />
                  <span>{{ t.label }}</span>
                </button>
              </div>

              <div v-if="richiedeBenzina" class="mb-4">
                <label class="text-sm text-[var(--text-secondary)] mb-1.5 block">€ benzina mensile</label>
                <input
                  v-model.number="form.spesa_benzina"
                  type="number"
                  min="0"
                  placeholder="200"
                  class="wallt-input !pl-4"
                />
              </div>

              <div v-if="richiedeMezzi" class="mb-4">
                <label class="text-sm text-[var(--text-secondary)] mb-1.5 block">€ abbonamento mensile</label>
                <input
                  v-model.number="form.spesa_mezzi"
                  type="number"
                  min="0"
                  placeholder="50"
                  class="wallt-input !pl-4"
                />
              </div>

              <div class="border-t border-[var(--border)] pt-4">
                <p class="text-sm font-medium text-[var(--text-secondary)] mb-3">
                  Altre spese fisse mensili?
                </p>
                <div class="flex gap-2 mb-4">
                  <button
                    @click="form.ha_spese_extra = true"
                    class="pill-btn flex-1"
                    :class="{ selected: form.ha_spese_extra }"
                  >Sì</button>
                  <button
                    @click="form.ha_spese_extra = false; form.spese_fisse_extra = null"
                    class="pill-btn flex-1"
                    :class="{ selected: !form.ha_spese_extra }"
                  >No</button>
                </div>
                <div v-if="form.ha_spese_extra">
                  <label class="text-sm text-[var(--text-secondary)] mb-1.5 block">€ totale spese extra</label>
                  <input
                    v-model.number="form.spese_fisse_extra"
                    type="number"
                    min="0"
                    placeholder="100"
                    class="wallt-input !pl-4"
                  />
                </div>
              </div>

              <div class="step-divider" />

              <p class="text-sm font-medium text-[var(--text-secondary)] mb-3">
                {{ isMinorUser ? 'Come te la cavi con il risparmio?' : 'Le tue abitudini' }}
              </p>

              <div class="space-y-5">
                <div>
                  <p class="text-sm font-medium text-[var(--text-secondary)] mb-2">Risparmio</p>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      v-for="opt in OPZIONI_RISPARMIO"
                      :key="opt.id"
                      @click="form.risparmia = opt.id"
                      class="pill-btn text-left !justify-start"
                      :class="{ selected: form.risparmia === opt.id }"
                    >
                      <component :is="opt.icon" class="option-icon" :size="16" :stroke-width="1.75" />
                      <span>{{ opt.label }}</span>
                    </button>
                  </div>
                </div>

                <div v-if="!isMinorUser">
                  <p class="text-sm font-medium text-[var(--text-secondary)] mb-2">Investimenti</p>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      v-for="opt in OPZIONI_INVESTIMENTI"
                      :key="opt.id"
                      @click="form.ha_investimenti = opt.id"
                      class="pill-btn text-left !justify-start"
                      :class="{ selected: form.ha_investimenti === opt.id }"
                    >
                      <component :is="opt.icon" class="option-icon" :size="16" :stroke-width="1.75" />
                      <span>{{ opt.label }}</span>
                    </button>
                  </div>
                </div>

                <div v-if="!isMinorUser">
                  <p class="text-sm font-medium text-[var(--text-secondary)] mb-2">Scommesse</p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="opt in OPZIONI_SCOMMESSE"
                      :key="opt.id"
                      @click="form.fa_scommesse = opt.id"
                      class="pill-btn"
                      :class="{ selected: form.fa_scommesse === opt.id }"
                    >
                      <component :is="opt.icon" class="option-icon" :size="16" :stroke-width="1.75" />
                      <span>{{ opt.label }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Conferma: compare quando il profilo e' completo, cosi' l'ultima
                   cosa che si vede prima di entrare e' cosa WALLT ha capito. -->
              <Transition name="riepilogo">
                <div v-if="canProceed" class="riepilogo-box">
                  <p class="riepilogo-box__titolo">
                    <CheckCircle2 :size="16" :stroke-width="1.75" />
                    Ecco il tuo profilo
                  </p>
                  <div
                    v-for="(item, i) in riepilogoItems"
                    :key="i"
                    class="riepilogo-box__riga"
                  >
                    <component :is="item.icon" class="option-icon" :size="16" :stroke-width="1.75" />
                    <span>{{ item.text }}</span>
                  </div>
                </div>
              </Transition>
            </div>
          </Transition>

          <!-- Navigation (steps 1-5, non riepilogo) -->
          <div class="flex items-center justify-between mt-6 pt-4 border-t border-[var(--border)]">
            <button
              v-if="currentStep > 1"
              @click="prevStep"
              class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2 py-1"
            >
              ← Indietro
            </button>
            <span v-else class="w-16" />

            <button
              @click="nextStep"
              class="nav-btn-next"
              :disabled="!canProceed || profiloStore.loading || saving"
            >
              {{ isUltimoStep ? 'Il tuo WALLT è pronto →' : 'Avanti →' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Lo sfondo e' quello ambientale di tutta l'app (assets/styles/glass.css):
   prima qui c'era un gradiente scuro fisso, che ignorava il tema chiaro, e
   un'animazione infinita di 8 secondi sempre in esecuzione. */
.onboarding-bg {
  background: transparent;
}

/* Separatore fra due gruppi di domande nella stessa schermata: da quando i
   passi sono tre, ogni schermata contiene piu' di un tema e senza una riga
   di stacco sembrerebbero un unico elenco. */
.step-divider {
  height: 1px;
  margin: 1.5rem 0;
  background: var(--border);
}

/* Riepilogo in fondo all'ultimo passo. */
.riepilogo-box {
  margin-top: 1.5rem;
  padding: 0.875rem 1rem;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.riepilogo-box__titolo {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0 0 0.25rem;
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--text-secondary);
}

.riepilogo-box__titolo svg { stroke: var(--accent-green); flex-shrink: 0; }

.riepilogo-box__riga {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.riepilogo-enter-active,
.riepilogo-leave-active {
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}

.riepilogo-enter-from,
.riepilogo-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .riepilogo-enter-active,
  .riepilogo-leave-active { transition: none; }
}

.progress-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--border-strong);
  transition:
    width var(--dur-slow) var(--ease-out),
    background var(--dur-base) var(--ease-out);
}

.progress-dot.active {
  background: var(--accent-green);
}

.progress-dot.current {
  width: 24px;
}

/* Pastiglia di scelta: vetro interattivo, piena quando e' selezionata. */
.pill-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-height: 40px;
  padding: 0.625rem 1rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-interactive-border);
  background: var(--glass-interactive-bg);
  box-shadow: var(--glass-highlight);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 550;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

@media (hover: hover) {
  .pill-btn:hover:not(.selected) {
    background: var(--glass-interactive-bg-hover);
    border-color: color-mix(in srgb, var(--accent-green) 40%, transparent);
    color: var(--text-primary);
  }
}

.pill-btn:active { transform: scale(0.97); }
.pill-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

.pill-btn.selected {
  background: var(--accent-green);
  color: var(--accent-on);
  border-color: transparent;
  font-weight: 600;
  box-shadow: var(--shadow-xs), inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.step-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.375rem;
  font-weight: 700;
  letter-spacing: var(--tracking-title);
  color: var(--text-primary);
  margin-bottom: 0.375rem;
}

.step-title svg, .option-icon {
  stroke: currentColor;
  flex-shrink: 0;
  color: var(--accent-text);
}

.pill-btn.selected .option-icon {
  color: var(--accent-on);
}

/* Riga di scelta a tutta larghezza: stessa grammatica della pastiglia, in
   formato lista. */
.option-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 52px;
  padding: 0.875rem 1rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-interactive-border);
  background: var(--glass-interactive-bg);
  box-shadow: var(--glass-highlight);
  color: var(--text-secondary);
  font-size: 0.9375rem;
  cursor: pointer;
  text-align: left;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

@media (hover: hover) {
  .option-btn:hover:not(.selected) {
    background: var(--glass-interactive-bg-hover);
    border-color: color-mix(in srgb, var(--accent-green) 35%, transparent);
    color: var(--text-primary);
  }
}

.option-btn:active { transform: scale(0.99); }
.option-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

.option-btn.selected {
  background: var(--accent-light);
  border-color: color-mix(in srgb, var(--accent-green) 55%, transparent);
  color: var(--text-primary);
  font-weight: 550;
}

.nav-btn-next {
  min-height: 44px;
  padding: 0.625rem 1.5rem;
  border-radius: var(--radius-md);
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--accent-green) 92%, white),
    var(--accent-green));
  color: var(--accent-on);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
  border: none;
  cursor: pointer;
  box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.22);
  transition:
    box-shadow var(--dur-base) var(--ease-out),
    transform var(--dur-fast) var(--ease-out),
    filter var(--dur-fast) var(--ease-out);
}

@media (hover: hover) {
  .nav-btn-next:hover:not(:disabled) {
    box-shadow: var(--shadow-glow), inset 0 1px 0 rgba(255, 255, 255, 0.28);
    transform: translateY(-1px);
    filter: brightness(1.04);
  }
}

.nav-btn-next:active:not(:disabled) { transform: scale(0.985); }
.nav-btn-next:focus-visible { outline: none; box-shadow: var(--focus-ring); }

.nav-btn-next:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* .wallt-btn-secondary: aspetto condiviso in assets/styles/documents.css */

.wallt-btn-ghost {
  min-height: 44px;
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}

@media (hover: hover) {
  .wallt-btn-ghost:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--surface-hover);
  }
}

.step-container {
  min-height: 380px;
}

.slide-forward-enter-active,
.slide-forward-leave-active,
.slide-back-enter-active,
.slide-back-leave-active {
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}

.slide-forward-enter-from {
  opacity: 0;
  transform: translateX(24px);
}

.slide-forward-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}

.slide-back-enter-from {
  opacity: 0;
  transform: translateX(-24px);
}

.slide-back-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

@media (prefers-reduced-motion: reduce) {
  .slide-forward-enter-from,
  .slide-forward-leave-to,
  .slide-back-enter-from,
  .slide-back-leave-to { transform: none; }
}
</style>
