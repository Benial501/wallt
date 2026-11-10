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

/* Impaginazione della configurazione guidata. Dal commit b86dd0f la vista
   usava queste classi senza definirle e la pagina usciva come testo grezzo.
   Stessi token di vetro di RecurringEditor e ImportReview, cosi' le schede
   delle voci e il resto della pagina sembrano un solo prodotto. */
.onboarding-shell { box-sizing: border-box; width: 100%; min-height: 100vh; max-width: 1240px; margin: 0 auto; padding: var(--space-6) var(--space-5) var(--space-10); color: var(--text-primary); }
.topbar { display: flex; align-items: center; gap: 0.875rem; margin-bottom: var(--space-6); }
.topbar img { border-radius: var(--radius-md); flex-shrink: 0; }
.topbar div { display: grid; gap: 0.125rem; }
.topbar strong { font-size: var(--text-base); font-weight: 650; letter-spacing: var(--tracking-tight); }
.topbar span { font-size: var(--text-xs); color: var(--text-secondary); }

.layout { display: grid; grid-template-columns: 240px minmax(0, 1fr) 220px; gap: var(--space-6); align-items: start; }
.main-column { display: grid; gap: var(--space-4); min-width: 0; }

.eyebrow { margin: 0 0 0.5rem; font-size: var(--text-micro); font-weight: 700; letter-spacing: var(--tracking-wide); color: var(--text-muted); }

.rail, .preview { position: sticky; top: var(--space-6); display: grid; gap: 0.25rem; padding: var(--space-4); background: var(--glass-secondary-bg); border: 1px solid var(--glass-secondary-border); border-radius: var(--radius-lg); }
.rail-item { display: flex; align-items: center; gap: 0.625rem; min-height: 40px; padding: 0.5rem 0.625rem; text-align: left; font-size: var(--text-sm); line-height: 1.3; color: var(--text-secondary); border-radius: var(--radius-sm); }
.rail-item > span, .rail-item > svg { flex-shrink: 0; width: 1.5rem; font-size: var(--text-xs); font-variant-numeric: tabular-nums; color: var(--text-muted); }
.rail-item > svg { width: 15px; color: var(--accent-text); }
.rail-item.active { background: var(--glass-interactive-bg-active); color: var(--text-primary); font-weight: 600; }
.rail-item.active > span { color: var(--accent-text); }

.progress { display: grid; gap: 0.5rem; }
.progress-label { display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.progress-track { height: 6px; overflow: hidden; background: var(--glass-interactive-bg); border-radius: var(--radius-pill); }
.progress-track > div { height: 100%; background: var(--accent-green); border-radius: inherit; transition: width var(--dur-base) var(--ease-out); }

.panel { padding: var(--space-8); background: var(--glass-primary-bg); border: 1px solid var(--glass-primary-border); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm), var(--glass-highlight); }
.panel h1 { margin: 0; font-size: 1.75rem; font-weight: 700; letter-spacing: var(--tracking-title); line-height: var(--leading-snug); }
.subtitle { max-width: 60ch; margin: 0.5rem 0 var(--space-6); color: var(--text-secondary); line-height: 1.6; }

.choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.625rem; }
.choice, .age-option { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; min-height: 52px; padding: 0.75rem 1rem; text-align: left; font-weight: 500; background: var(--glass-interactive-bg); border: 1px solid var(--glass-interactive-border); border-radius: var(--radius-md); cursor: pointer; }
.choice > span { display: grid; place-items: center; flex-shrink: 0; color: var(--text-muted); }
.choice.chosen, .age-option.chosen { border-color: var(--accent-text); background: var(--glass-interactive-bg-active); }
.choice.chosen > span { color: var(--accent-text); }
.age { margin: var(--space-6) 0 0; padding: 0; border: 0; }
.age legend { margin-bottom: 0.75rem; font-weight: 600; }
.age legend span { font-weight: 400; font-size: var(--text-xs); color: var(--text-secondary); }
.age-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.age-option { min-height: 44px; padding: 0.5rem 1rem; justify-content: center; font-variant-numeric: tabular-nums; }
.age-option input { position: absolute; opacity: 0; pointer-events: none; }
.age-option:has(input:focus-visible) { outline: 2px solid var(--border-focus); outline-offset: 2px; }

.entry-card { margin: 0 0 1rem; padding: 1rem; background: var(--glass-secondary-bg); border: 1px solid var(--border); border-radius: 1rem; }
.entry-head { display: flex; justify-content: space-between; gap: 1rem; }
.remove { color: var(--negative); font-size: var(--text-xs); }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; margin-top: 1rem; }
.fields label, .link-row { display: grid; gap: 0.4rem; font-size: var(--text-xs); color: var(--text-secondary); }
.fields input, .fields select, .link-row select { width: 100%; padding: 0.7rem; color: var(--text-primary); background: var(--bg-input); border: 1px solid var(--control-border); border-radius: 0.65rem; }
.fields option, .link-row option { background: var(--bg-secondary); }
.secondary { min-height: 44px; padding: 0.55rem 0.95rem; color: var(--text-primary); background: var(--glass-interactive-bg); border: 1px solid var(--border-strong); border-radius: var(--radius-pill); }

.link-box { display: grid; gap: 0.75rem; margin-top: var(--space-6); padding-top: var(--space-5); border-top: 1px solid var(--glass-interactive-border); }
.link-box h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.link-box p { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); }
.link-row { grid-template-columns: minmax(0, 1fr) minmax(0, 240px); align-items: center; padding: 0.5rem 0; font-size: var(--text-sm); color: var(--text-primary); }
.link-row small { color: var(--text-muted); }

.toggle { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 56px; padding: 0.75rem 1rem; margin-bottom: 0.5rem; background: var(--glass-interactive-bg); border: 1px solid var(--glass-interactive-border); border-radius: var(--radius-md); cursor: pointer; }
.toggle input { width: 20px; height: 20px; flex-shrink: 0; accent-color: var(--accent-green); }

.summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin-top: var(--space-5); }
.summary-grid > div { display: grid; gap: 0.25rem; padding: 1rem; background: var(--glass-secondary-bg); border: 1px solid var(--glass-secondary-border); border-radius: var(--radius-md); }
.summary-grid strong { font-size: 1.75rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent-text); }
.summary-grid span { font-size: var(--text-sm); color: var(--text-secondary); }
.final-note { margin: var(--space-5) 0 0; color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.6; }

.error { margin: var(--space-4) 0 0; color: var(--negative); font-size: var(--text-sm); }
.actions { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: var(--space-8); padding-top: var(--space-5); border-top: 1px solid var(--glass-interactive-border); }
.actions > div { display: flex; align-items: center; gap: 1rem; }
.save-state { font-size: var(--text-xs); color: var(--text-muted); }
.back { min-height: 44px; padding: 0.5rem 0.75rem; color: var(--text-secondary); border-radius: var(--radius-md); }
.primary { min-height: 44px; padding: 0.75rem 1.4rem; color: var(--accent-on); font-weight: 600; letter-spacing: var(--tracking-tight); background: linear-gradient(180deg, color-mix(in srgb, var(--accent-green) 92%, white), var(--accent-green)); border: none; border-radius: var(--radius-md); box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.22); }
.primary:disabled, .back:disabled { opacity: 0.6; cursor: wait; }

.preview > div { display: flex; align-items: baseline; gap: 0.625rem; padding: 0.375rem 0; }
.preview strong { min-width: 1.75rem; font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent-text); }
.preview span { font-size: var(--text-sm); color: var(--text-secondary); }
.preview > p:last-child { margin: 0.5rem 0 0; font-size: var(--text-xs); color: var(--text-muted); line-height: 1.5; }

.complete { max-width: 640px; margin: var(--space-10) auto 0; text-align: center; }
.complete img { margin: 0 auto var(--space-4); border-radius: var(--radius-lg); }
.complete > p:not(.eyebrow) { color: var(--text-secondary); line-height: 1.6; }
.complete .summary-grid { text-align: left; margin-bottom: var(--space-6); }

.rail-item:focus-visible, .choice:focus-visible, .toggle:focus-within, .back:focus-visible, .primary:focus-visible, .secondary:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
@media (hover: hover) {
  .choice:hover, .age-option:hover, .toggle:hover, .secondary:hover { background: var(--glass-interactive-bg-hover); }
  .rail-item:not(.active):hover { color: var(--text-primary); }
}
/* Sotto i 1024px l'anteprima scende sotto il pannello; sotto i 768px il
   percorso laterale lascia il posto alla sola barra di avanzamento. */
@media (max-width: 1023px) {
  .layout { grid-template-columns: 220px minmax(0, 1fr); }
  .preview { grid-column: 2; position: static; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .preview .eyebrow, .preview > p:last-child { grid-column: 1 / -1; }
}
@media (max-width: 767px) {
  .onboarding-shell { padding: var(--space-4) var(--space-4) var(--space-8); }
  .layout { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
  .rail { display: none; }
  .preview { grid-column: auto; }
  .panel { padding: var(--space-5); }
  .panel h1 { font-size: 1.375rem; }
  .choice-grid, .summary-grid { grid-template-columns: minmax(0, 1fr); }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .link-row { grid-template-columns: minmax(0, 1fr); }
  .actions { flex-wrap: wrap; }
}
</style>
