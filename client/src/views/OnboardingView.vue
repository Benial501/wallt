<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useProfiloStore } from '@/stores/profilo.store';
import { useAuthStore } from '@/stores/auth.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { isOnboardingComplete } from '@/utils/onboarding';
import { isMinor } from '@/utils/ageRestriction';
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

const currentStep = ref(1);
const showRiepilogo = ref(false);
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
    case 1:
      return !!form.value.fascia_eta;
    case 2:
      if (!form.value.situazione_lavorativa) return false;
      if (form.value.entrata_fissa && !form.value.entrata_mensile) return false;
      return true;
    case 3:
      if (!form.value.situazione_abitativa) return false;
      if (richiedeCostoAbitazione.value && !form.value.costo_abitazione) return false;
      if (richiedeStimaBollette.value && !form.value.stima_bollette) return false;
      return true;
    case 4:
      if (richiedeBenzina.value && !form.value.spesa_benzina) return false;
      if (richiedeMezzi.value && !form.value.spesa_mezzi) return false;
      if (form.value.ha_spese_extra && !form.value.spese_fisse_extra) return false;
      return true;
    case 5:
      if (isMinorUser.value) {
        return !!form.value.risparmia;
      }
      return !!(form.value.risparmia && form.value.ha_investimenti && form.value.fa_scommesse);
    default:
      return true;
  }
});

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
  if (currentStep.value === 5 && !showRiepilogo.value) {
    showRiepilogo.value = true;
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

    await router.replace('/dashboard');
  } catch (err) {
    toastStore.error(err.response?.data?.message || err.message || profiloStore.error || 'Errore nel salvataggio del profilo');
  } finally {
    saving.value = false;
  }
};

const prevStep = () => {
  if (showRiepilogo.value) {
    showRiepilogo.value = false;
    return;
  }
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
            v-if="currentStep < 5 || !showRiepilogo"
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
            v-for="step in 5"
            :key="step"
            class="progress-dot"
            :class="{ active: step <= currentStep, current: step === currentStep }"
          />
        </div>

        <!-- Steps container -->
        <div class="step-container px-6 pb-6">
          <Transition :name="slideDirection === 'forward' ? 'slide-forward' : 'slide-back'" mode="out-in">
            <!-- STEP 1 -->
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
            </div>

            <!-- STEP 2 -->
            <div v-else-if="currentStep === 2" key="step2" class="step-content">
              <h2 class="step-title">
                <Briefcase :size="20" :stroke-width="1.75" />
                La tua situazione
              </h2>
              <p class="text-sm text-[var(--text-secondary)] mb-6">Come lavori?</p>

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

            <!-- STEP 3 -->
            <div v-else-if="currentStep === 3" key="step3" class="step-content">
              <h2 class="step-title">
                <House :size="20" :stroke-width="1.75" />
                Dove vivi?
              </h2>
              <p class="text-sm text-[var(--text-secondary)] mb-6">Situazione abitativa</p>

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

            <!-- STEP 4 -->
            <div v-else-if="currentStep === 4" key="step4" class="step-content">
              <h2 class="step-title">
                <Car :size="20" :stroke-width="1.75" />
                Come ti muovi?
              </h2>
              <p class="text-sm text-[var(--text-secondary)] mb-6">Puoi selezionare più opzioni</p>

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
            </div>

            <!-- STEP 5 -->
            <div v-else-if="currentStep === 5 && !showRiepilogo" key="step5" class="step-content">
              <h2 class="step-title">
                <Coins :size="20" :stroke-width="1.75" />
                Le tue abitudini
              </h2>
              <p class="text-sm text-[var(--text-secondary)] mb-6">
                {{ isMinorUser ? 'Ultima domanda sul risparmio' : 'Aiutaci a capire meglio' }}
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
            </div>

            <!-- Riepilogo finale -->
            <div v-else-if="currentStep === 5 && showRiepilogo" key="step5-riepilogo" class="step-content">
              <h2 class="step-title">
                <CheckCircle2 :size="20" :stroke-width="1.75" />
                Perfetto! Ecco il tuo profilo
              </h2>
              <p class="text-sm text-[var(--text-secondary)] mb-4">Riepilogo delle tue scelte</p>

              <div class="bg-[var(--bg-input)] rounded-xl p-4 mb-6 space-y-2">
                <div
                  v-for="(item, i) in riepilogoItems"
                  :key="i"
                  class="flex items-center gap-2 text-sm text-[var(--text-primary)]"
                >
                  <component :is="item.icon" class="option-icon" :size="16" :stroke-width="1.75" />
                  <span>{{ item.text }}</span>
                </div>
              </div>

              <button
                @click="completaOnboarding"
                class="wallt-btn-primary"
                :disabled="saving"
              >
                Inizia a usare WALLT →
              </button>
            </div>
          </Transition>

          <!-- Navigation (steps 1-5, non riepilogo) -->
          <div v-if="currentStep <= 5 && !showRiepilogo" class="flex items-center justify-between mt-6 pt-4 border-t border-[var(--border)]">
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
              :disabled="!canProceed || profiloStore.loading"
            >
              Avanti →
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.onboarding-bg {
  background: linear-gradient(135deg, #0A0A0F 0%, #1A1A2E 50%, #0A0A0F 100%);
  background-size: 200% 200%;
  animation: gradientShift 8s ease infinite;
}

@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.progress-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border);
  transition: all 0.3s ease;
}

.progress-dot.active {
  background: var(--accent-green);
}

.progress-dot.current {
  width: 24px;
  border-radius: 5px;
  box-shadow: 0 0 8px var(--accent-green-glow);
}

.pill-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.625rem 1rem;
  border-radius: 9999px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pill-btn:hover {
  border-color: var(--accent-green);
  color: var(--text-primary);
}

.pill-btn.selected {
  background: var(--accent-green);
  color: #0A0A0F;
  border-color: var(--accent-green);
  font-weight: 600;
}

.step-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.step-title svg, .option-icon {
  stroke: currentColor;
  flex-shrink: 0;
  color: var(--accent-green);
}

.pill-btn.selected .option-icon {
  color: #0A0A0F;
}

.option-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.875rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.option-btn:hover {
  border-color: var(--accent-green);
  color: var(--text-primary);
}

.option-btn.selected {
  background: var(--accent-light);
  border-color: var(--accent-green);
  color: var(--text-primary);
}

.nav-btn-next {
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-md);
  background: var(--accent-green);
  color: #0A0A0F;
  font-size: 0.875rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-btn-next:hover:not(:disabled) {
  box-shadow: var(--shadow-glow);
  transform: translateY(-1px);
}

.nav-btn-next:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.wallt-btn-secondary {
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.wallt-btn-secondary:hover:not(:disabled) {
  border-color: var(--accent-green);
}

.wallt-btn-ghost {
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.875rem;
  cursor: pointer;
  transition: color 0.2s ease;
}

.wallt-btn-ghost:hover:not(:disabled) {
  color: var(--text-secondary);
}

.step-container {
  min-height: 380px;
}

.slide-forward-enter-active,
.slide-forward-leave-active,
.slide-back-enter-active,
.slide-back-leave-active {
  transition: all 0.3s ease;
}

.slide-forward-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.slide-forward-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.slide-back-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}

.slide-back-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
