<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-vue-next';
import { useRouter, useRoute } from 'vue-router';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { useAuthStore } from '@/stores/auth.store';
import LegacyOnboardingView from './LegacyOnboardingView.vue';
import RecurringEditor from '@/components/onboarding/RecurringEditor.vue';
import ImportReview from '@/components/onboarding/ImportReview.vue';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import defaults from '@/data/categorie.generated.json';
import { tracciaEvento } from '@/utils/monitoraggio';

const router = useRouter();
const route = useRoute();
const store = useOnboardingStore();
const auth = useAuthStore();
const legacy = ref(route.query.edit === 'true');
const ready = ref(false);
const step = ref(0);
const busy = ref(false);
const error = ref('');
const completed = ref(null);
const customName = ref('');
const customType = ref('uscita');
const steps = [
  { id: 'utilizzi', title: 'Configuriamo WALLT per te', subtitle: 'Come vuoi usare WALLT? Scegli ciò che ti interessa: potrai cambiare idea in seguito.' },
  { id: 'categorie', title: 'Dove spendi normalmente?', subtitle: 'Le categorie che scegli rendono utili analisi e importazione fin dal primo giorno.' },
  { id: 'entrate', title: 'Le tue entrate regolari', subtitle: 'Ci aiutano a mostrarti quanto denaro entra di solito. Puoi aggiungerle anche più tardi.' },
  { id: 'spese', title: 'Le spese fisse', subtitle: 'Affitto, bollette e altre uscite ricorrenti rendono più utile il tuo piano.' },
  { id: 'abbonamenti', title: 'I tuoi abbonamenti', subtitle: 'Tieni a vista i pagamenti che si ripetono. Puoi saltare questa fase.' },
  { id: 'impegni', title: 'Rate e impegni', subtitle: 'Registra le rate e, se lo conosci, il debito residuo. I due importi restano separati.' },
  { id: 'conti', title: 'I conti che utilizzi', subtitle: 'Il saldo che indichi è quello attuale. I movimenti passati importati non lo cambieranno.' },
  { id: 'import', title: 'Parti dai tuoi movimenti', subtitle: 'Un estratto conto ti permette di vedere subito le tue spese nelle categorie scelte.' },
  { id: 'obiettivi', title: 'Per cosa vuoi risparmiare?', subtitle: 'Dai un nome a un traguardo. WALLT terrà il progresso a vista.' },
  { id: 'preferenze', title: 'Scegli i promemoria', subtitle: 'Puoi cambiarli in Impostazioni quando vuoi. Le notifiche del browser richiedono un consenso separato.' },
  { id: 'riepilogo', title: 'Il tuo WALLT è pronto', subtitle: 'Controlla le scelte prima di creare i dati definitivi.' },
];
const form = computed(() => store.answers);
const current = computed(() => steps[step.value]);
const percentage = computed(() => Math.round((new Set(form.value.sezioni_completate || []).size / steps.length) * 100));
const selected = computed(() => form.value.categorie?.selected || []);
const custom = computed(() => form.value.categorie?.custom || []);
const categoryCatalog = computed(() => [
  ...defaults.filter(c => c.sistema || c.tipo === 'entrata' || selected.value.some(s => s.id === c.id && s.tipo === c.tipo)),
  ...custom.value,
]);
const groups = computed(() => [...new Set(defaults.filter(c => c.tipo === 'uscita' && !c.sistema).map(c => c.gruppo))]);
const income = computed(() => categoryCatalog.value.filter(c => c.tipo === 'entrata'));
const allRules = computed(() => [...form.value.entrate, ...form.value.spese, ...form.value.abbonamenti, ...form.value.impegni.filter(item => Number(item.rata) > 0)]);
const pendingImports = computed(() => store.imports.filter(batch => batch.status !== 'confirmed').length);
const purposes = [
  ['controllare_spese', 'Capire dove spendo'], ['budget', 'Gestire un budget'],
  ['risparmiare', 'Risparmiare per un obiettivo'], ['patrimonio', 'Vedere tutti i miei conti'],
  ['abbonamenti', 'Tenere d’occhio gli abbonamenti'], ['debiti', 'Seguire rate e debiti'],
];
const ages = [['under_18', 'Meno di 18 anni'], ['18_24', '18–24'], ['25_34', '25–34'], ['35_44', '35–44'], ['45_54', '45–54'], ['55_plus', '55+']];
const preferenceOptions = [
  ['alert_budget_attivi', 'Avvisi sui budget'], ['alert_ricorrenti_attivi', 'Promemoria spese programmate'],
  ['alert_obiettivi_attivi', 'Aggiornamenti sugli obiettivi'], ['riepilogo_settimanale_attivo', 'Riepilogo settimanale'],
  ['promemoria_giornaliero_attivo', 'Promemoria giornaliero'],
];
const fields = ['entrate', 'spese', 'abbonamenti', 'impegni'];
let timer;
let saveChain = Promise.resolve();

function ensureCategories() {
  if (!form.value.categorie) {
    const recommended = new Set(['cibo_spesa', 'affitto', 'bollette', 'trasporti', 'ristoranti', 'salute', 'shopping', 'intrattenimento']);
    form.value.categorie = { selected: defaults.filter(c => c.tipo === 'uscita' && recommended.has(c.id)).map(({ id, tipo }) => ({ id, tipo })), custom: [] };
  }
}
function togglePurpose(id) {
  const list = form.value.utilizzi || [];
  form.value.utilizzi = list.includes(id) ? list.filter(item => item !== id) : [...list, id];
}
function toggleCategory(category) {
  ensureCategories();
  const list = form.value.categorie.selected;
  const has = list.some(item => item.id === category.id && item.tipo === category.tipo);
  form.value.categorie.selected = has ? list.filter(item => !(item.id === category.id && item.tipo === category.tipo)) : [...list, { id: category.id, tipo: category.tipo }];
}
function addCustom() {
  ensureCategories();
  const nome = customName.value.trim();
  if (!nome || nome.length > 80) { error.value = 'Scrivi un nome per la categoria (massimo 80 caratteri).'; return; }
  if ([...defaults, ...custom.value].some(c => c.tipo === customType.value && c.nome.toLocaleLowerCase('it') === nome.toLocaleLowerCase('it'))) { error.value = 'Questa categoria esiste già.'; return; }
  form.value.categorie.custom.push({ id: `custom_${crypto.randomUUID()}`, nome, tipo: customType.value, icona: 'Tag', colore: '#3498DB' });
  customName.value = ''; error.value = '';
}
function removeCustom(id) {
  form.value.categorie.custom = custom.value.filter(c => c.id !== id);
  for (const kind of fields) form.value[kind] = form.value[kind].map(item => item.categoria === id ? { ...item, categoria: '' } : item);
}
function addAccount() {
  const key = crypto.randomUUID();
  form.value.conti.push({ key, nome: '', tipo: 'banca', saldo: 0 });
}
function removeAccount(key) {
  form.value.conti = form.value.conti.filter(account => account.key !== key);
  for (const kind of fields) form.value[kind] = form.value[kind].map(item => item.conto_key === key ? { ...item, conto_key: '' } : item);
}
function addGoal() { form.value.obiettivi.push({ nome: '', importo_target: '', importo_attuale: 0, deadline: '' }); }
function mark() {
  if (!form.value.sezioni_completate.includes(current.value.id)) form.value.sezioni_completate.push(current.value.id);
}
function validateStep() {
  if (current.value.id === 'utilizzi' && !form.value.fascia_eta) return 'Seleziona la fascia d’età per continuare.';
  if (fields.includes(current.value.id)) {
    for (const item of form.value[current.value.id]) {
      if (current.value.id === 'impegni') {
        const hasRate = Number(item.rata) > 0;
        const hasResidual = item.saldo_residuo !== undefined && item.saldo_residuo !== '' && Number(item.saldo_residuo) >= 0;
        if (!item.nome?.trim() || (!hasRate && !hasResidual)) return 'Per ogni impegno inserisci il nome e almeno la rata o il debito residuo, oppure rimuovilo.';
        if (hasRate && (!item.categoria || !item.giorno)) return 'Completa giorno e categoria della rata, oppure rimuovi la voce.';
      } else if (!item.nome?.trim() || !Number(item.importo) || !item.categoria || !item.giorno) {
        return 'Completa nome, importo, giorno e categoria di ogni voce, oppure rimuovila.';
      }
    }
  }
  if (current.value.id === 'conti') {
    for (const account of form.value.conti) if (!account.nome?.trim() || account.saldo === '') return 'Completa nome e saldo di ogni conto, oppure rimuovilo.';
    if (allRules.value.length && !form.value.conti.length) return 'Aggiungi un conto per collegare le entrate e le spese.';
    if (allRules.value.some(item => !form.value.conti.some(account => account.key === item.conto_key))) return 'Collega ogni entrata, spesa, abbonamento e rata a un conto.';
  }
  if (current.value.id === 'obiettivi' && form.value.obiettivi.some(goal => !goal.nome?.trim() || !Number(goal.importo_target))) return 'Completa nome e importo di ogni obiettivo, oppure rimuovilo.';
  if (current.value.id === 'import' && pendingImports.value) return 'Conferma o escludi le righe degli estratti prima di proseguire.';
  return '';
}
function queueSave(target = current.value.id) {
  clearTimeout(timer);
  store.remember();
  saveChain = saveChain.catch(() => {}).then(() => store.save(target));
  return saveChain;
}
async function move(delta) {
  error.value = '';
  if (delta > 0) {
    error.value = validateStep();
    if (error.value) return;
    mark();
    tracciaEvento('onboarding_fase_completata', { fase: current.value.id });
  }
  if (step.value + delta < 0 || step.value + delta >= steps.length) return;
  busy.value = true;
  try {
    await queueSave(steps[step.value + delta].id);
    step.value += delta;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch { error.value = store.error; }
  finally { busy.value = false; }
}
async function finish() {
  if (pendingImports.value) { error.value = 'Conferma gli estratti ancora in revisione.'; return; }
  error.value = ''; busy.value = true;
  mark();
  try {
    await queueSave('riepilogo');
    completed.value = await store.finalize();
    tracciaEvento('onboarding_guidato_completato');
  } catch { error.value = store.error; }
  finally { busy.value = false; }
}
async function retrySync() {
  busy.value = true;
  error.value = '';
  try {
    const session = await store.load();
    if (session) {
      const found = steps.findIndex(item => item.id === (store.resumeStep || session.current_step));
      step.value = found < 0 ? 0 : found;
      ensureCategories();
      ready.value = true;
      if (store.localDraft) await queueSave(store.resumeStep || session.current_step);
      error.value = '';
    }
  } catch { error.value = store.error; }
  finally { busy.value = false; }
}
function goHome() { router.replace({ name: 'dashboard' }); }

watch(() => store.answers, () => {
  if (!ready.value || legacy.value || completed.value) return;
  store.remember();
  clearTimeout(timer);
  timer = setTimeout(() => { queueSave().catch(() => { error.value = store.error; }); }, 1100);
}, { deep: true });
onMounted(async () => {
  if (legacy.value) return;
  try {
    const session = await store.load();
    if (!session) {
      const localIndex = steps.findIndex(item => item.id === store.resumeStep);
      step.value = localIndex < 0 ? 0 : localIndex;
      ready.value = true;
      error.value = store.error;
      return;
    }
    if (session.status === 'completed') { await auth.fetchMe(); goHome(); return; }
    ensureCategories();
    const found = steps.findIndex(item => item.id === (store.resumeStep || session.current_step));
    step.value = found < 0 ? 0 : found;
    tracciaEvento(session.revision ? 'onboarding_guidato_ripreso' : 'onboarding_guidato_iniziato');
    ready.value = true;
    if (store.localDraft) queueSave(store.resumeStep || session.current_step).catch(() => { error.value = store.error; });
  } catch (cause) {
    if (cause.response?.status === 404) legacy.value = true;
    else error.value = store.error;
  }
});
onBeforeUnmount(() => { clearTimeout(timer); });
</script>

<template>
  <LegacyOnboardingView v-if="legacy" />
  <main v-else class="onboarding-shell">
    <div v-if="!ready && !completed" class="panel" role="status">Caricamento della tua configurazione… <button v-if="error" type="button" @click="store.load().then(session => { ready = true; if (session) { const found = steps.findIndex(item => item.id === (store.resumeStep || session.current_step)); step = found < 0 ? 0 : found; ensureCategories(); } }).catch(() => {})">Riprova</button></div>
    <div v-else-if="completed" class="panel complete">
      <img src="/brand/wallt-app-icon-96.png" alt="" width="72" height="72">
      <p class="eyebrow">CONFIGURAZIONE COMPLETATA</p>
      <h1>Il tuo WALLT è pronto</h1>
      <p>Abbiamo salvato le tue scelte. Puoi modificarle in qualsiasi momento dalle sezioni dell’app.</p>
      <div class="summary-grid"><div v-for="(value, label) in completed.riepilogo" :key="label"><strong>{{ value }}</strong><span>{{ label.replaceAll('_', ' ') }}</span></div></div>
      <button type="button" class="primary" @click="goHome">Vai alla tua Home</button>
    </div>
    <template v-else>
      <header class="topbar"><img src="/brand/wallt-app-icon-96.png" alt="WALLT" width="42" height="42"><div><strong>Il tuo spazio finanziario</strong><span>Circa 8–10 minuti · Puoi interrompere quando vuoi</span></div></header>
      <div class="layout">
        <nav class="rail" aria-label="Fasi della configurazione"><p class="eyebrow">IL TUO PERCORSO</p><button v-for="(item, index) in steps" :key="item.id" type="button" :class="['rail-item', { active: index === step, done: form.sezioni_completate.includes(item.id) }]" :aria-current="index === step ? 'step' : undefined" @click="index < step && move(index - step)"><Check v-if="form.sezioni_completate.includes(item.id)" :size="15" aria-hidden="true" /><span v-else>{{ String(index + 1).padStart(2, '0') }}</span>{{ item.title }}</button></nav>
        <div class="main-column">
          <div class="progress"><div class="progress-label"><span>Fase {{ step + 1 }} di {{ steps.length }}</span><span>{{ percentage }}% configurato</span></div><div class="progress-track"><div :style="{ width: `${percentage}%` }"></div></div></div>
          <section class="panel" :aria-labelledby="'step-title'">
            <div v-if="!store.session || store.localDraft || store.status === 'errore'" class="offline-banner" role="status"><span>{{ store.error || 'Ci sono modifiche non ancora sincronizzate.' }}</span><button type="button" :disabled="busy" @click="retrySync">{{ busy ? 'Verifica…' : 'Riprova sincronizzazione' }}</button></div>
            <p class="eyebrow">{{ current.id === 'riepilogo' ? 'UN ULTIMO SGUARDO' : 'PARTIAMO DA TE' }}</p>
            <h1 id="step-title">{{ current.title }}</h1><p class="subtitle">{{ current.subtitle }}</p>
            <template v-if="current.id === 'utilizzi'">
              <div class="choice-grid"><button v-for="[id, label] in purposes" :key="id" type="button" :class="['choice', { chosen: form.utilizzi.includes(id) }]" :aria-pressed="form.utilizzi.includes(id)" @click="togglePurpose(id)">{{ label }} <span><Check v-if="form.utilizzi.includes(id)" :size="16" aria-hidden="true" /><Plus v-else :size="16" aria-hidden="true" /></span></button></div>
              <fieldset class="age"><legend>La tua fascia d’età <span>· necessaria per applicare le protezioni previste</span></legend><div class="age-row"><label v-for="[id, label] in ages" :key="id" :class="['age-option', { chosen: form.fascia_eta === id }]"><input v-model="form.fascia_eta" type="radio" name="fascia-eta" :value="id">{{ label }}</label></div></fieldset>
            </template>
            <template v-else-if="current.id === 'categorie'">
              <div v-for="group in groups" :key="group" class="category-group"><h2>{{ group }}</h2><div class="choice-grid"><button v-for="category in defaults.filter(c => c.gruppo === group && c.tipo === 'uscita' && !c.sistema)" :key="category.id" type="button" :class="['choice', { chosen: selected.some(s => s.id === category.id && s.tipo === category.tipo) }]" :aria-pressed="selected.some(s => s.id === category.id && s.tipo === category.tipo)" @click="toggleCategory(category)"><CategoryIcon :categoria="category.id" :tipo="category.tipo" :size="18" class="choice-category-icon" />{{ category.nome }}<span><Check v-if="selected.some(s => s.id === category.id && s.tipo === category.tipo)" :size="16" aria-hidden="true" /><Plus v-else :size="16" aria-hidden="true" /></span></button></div></div>
              <div class="custom-box"><h2>Una categoria tutta tua</h2><div class="inline-fields"><input v-model="customName" maxlength="80" placeholder="Es. Animali domestici" aria-label="Nome categoria personale"><select v-model="customType" aria-label="Tipo categoria"><option value="uscita">Spesa</option><option value="entrata">Entrata</option></select><button type="button" @click="addCustom"><Plus :size="16" aria-hidden="true" /> Aggiungi</button></div><div class="chips"><span v-for="category in custom" :key="category.id" class="chip">{{ category.nome }} <button type="button" :aria-label="`Rimuovi ${category.nome}`" @click="removeCustom(category.id)"><X :size="14" aria-hidden="true" /></button></span></div></div>
            </template>
            <RecurringEditor v-else-if="fields.includes(current.id)" :key="current.id" v-model="form[current.id]" :kind="current.id" :categories="categoryCatalog" :accounts="[]" />
            <template v-else-if="current.id === 'conti'">
              <div v-for="(account, index) in form.conti" :key="account.key" class="entry-card"><div class="entry-head"><strong>Conto {{ index + 1 }}</strong><button type="button" class="remove" @click="removeAccount(account.key)">Rimuovi</button></div><div class="fields"><label>Nome del conto<input v-model="account.nome" maxlength="100" placeholder="Es. Conto principale"></label><label>Tipo<select v-model="account.tipo"><option value="banca">Conto bancario</option><option value="app_pagamento">App di pagamento</option><option value="contanti">Contanti</option><option value="carta_credito">Carta di credito</option><option value="risparmio">Risparmio</option><option value="investimento" v-if="form.fascia_eta !== 'under_18'">Investimento</option><option value="wallet">Wallet</option></select></label><label>Saldo attuale (€)<input v-model="account.saldo" type="number" min="0" step="0.01" inputmode="decimal"></label></div></div>
              <button type="button" class="secondary" @click="addAccount"><Plus :size="16" aria-hidden="true" /> Aggiungi un conto</button>
              <div v-if="allRules.length" class="link-box"><h2>Collega entrate e spese ai conti</h2><p>Ogni voce programmata ha bisogno di un conto. Scegli dove ricevi o paghi normalmente.</p><div v-for="kind in fields" :key="kind"><label v-for="(item, index) in form[kind].filter(row => kind !== 'impegni' || Number(row.rata) > 0)" :key="index" class="link-row"><span>{{ item.nome }} <small>· {{ kind }}</small></span><select v-model="item.conto_key"><option value="">Scegli un conto</option><option v-for="account in form.conti" :key="account.key" :value="account.key">{{ account.nome || 'Conto senza nome' }}</option></select></label></div></div>
            </template>
            <ImportReview v-else-if="current.id === 'import'" :categories="categoryCatalog" :accounts="form.conti" />
            <template v-else-if="current.id === 'obiettivi'"><div v-for="(goal, index) in form.obiettivi" :key="index" class="entry-card"><div class="entry-head"><strong>Obiettivo {{ index + 1 }}</strong><button type="button" class="remove" @click="form.obiettivi.splice(index, 1)">Rimuovi</button></div><div class="fields"><label>Nome<input v-model="goal.nome" maxlength="100" placeholder="Es. Viaggio"></label><label>Quanto vuoi raggiungere (€)<input v-model="goal.importo_target" type="number" min="0.01" step="0.01"></label><label>Già risparmiato (€)<input v-model="goal.importo_attuale" type="number" min="0" step="0.01"></label><label>Entro quando? (facoltativo)<input v-model="goal.deadline" type="date"></label></div></div><button type="button" class="secondary" @click="addGoal"><Plus :size="16" aria-hidden="true" /> Aggiungi un obiettivo</button></template>
            <template v-else-if="current.id === 'preferenze'"><label v-for="[key, label] in preferenceOptions" :key="key" class="toggle"><span>{{ label }}</span><input v-model="form.preferenze[key]" type="checkbox"></label></template>
            <template v-else-if="current.id === 'riepilogo'"><div class="summary-grid"><div><strong>{{ selected.length + custom.length }}</strong><span>categorie scelte</span></div><div><strong>{{ form.conti.length }}</strong><span>conti</span></div><div><strong>{{ form.entrate.length }}</strong><span>entrate regolari</span></div><div><strong>{{ form.spese.length + form.abbonamenti.length + form.impegni.length }}</strong><span>spese programmate</span></div><div><strong>{{ store.imports.reduce((n, batch) => n + (batch.confermati || 0), 0) }}</strong><span>movimenti da importare</span></div><div><strong>{{ form.obiettivi.length }}</strong><span>obiettivi</span></div></div><p class="final-note">I saldi dei conti sono quelli che hai dichiarato oggi. Le entrate e le spese programmate non saranno considerate movimenti già avvenuti.</p></template>
            <p v-if="error || store.status === 'errore'" role="alert" class="error">{{ error || store.error }}</p>
            <footer class="actions"><button v-if="step > 0" type="button" class="back" :disabled="busy" @click="move(-1)"><ChevronLeft :size="16" aria-hidden="true" /> Indietro</button><span v-else></span><div><span class="save-state" role="status">{{ store.status === 'salvataggio' ? 'Salvataggio…' : store.status === 'errore' ? 'Da salvare' : 'Salvato' }}</span><button v-if="current.id === 'riepilogo'" type="button" class="primary" :disabled="busy" @click="finish">{{ busy ? 'Configurazione…' : 'Configura il mio WALLT' }}</button><button v-else type="button" class="primary" :disabled="busy" @click="move(1)">{{ busy ? 'Salvataggio…' : 'Continua' }} <ChevronRight :size="16" aria-hidden="true" /></button></div></footer>
          </section>
        </div>
        <aside class="preview"><p class="eyebrow">IL TUO WALLT FINORA</p><div><strong>{{ selected.length + custom.length }}</strong><span>Categorie</span></div><div><strong>{{ form.conti.length }}</strong><span>Conti</span></div><div><strong>{{ allRules.length }}</strong><span>Voci programmate</span></div><div><strong>{{ form.obiettivi.length }}</strong><span>Obiettivi</span></div><p>Ogni scelta può essere modificata più avanti.</p></aside>
      </div>
    </template>
  </main>
</template>

<style scoped>
.offline-banner{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.8rem 1rem;border:1px solid var(--warning);border-radius:.8rem;color:var(--text-secondary);margin-bottom:1rem;font-size:var(--text-xs)}.offline-banner button{color:var(--accent-text);font-weight:700;white-space:nowrap}
.choice-category-icon{color:var(--accent-text)}.secondary,.back,.primary,.inline-fields button{display:inline-flex;align-items:center;justify-content:center;gap:.45rem}.rail-item.done{color:var(--accent-text)}
</style>
