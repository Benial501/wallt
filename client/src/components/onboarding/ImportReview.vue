<script setup>
import { computed, ref, watch } from 'vue';
import { useOnboardingStore } from '@/stores/onboarding.store';

const props = defineProps({ categories: { type: Array, required: true }, accounts: { type: Array, required: true } });
const store = useOnboardingStore();
const file = ref(null);
const accountKey = ref('');
const busy = ref(false);
const error = ref('');
const decisions = ref({});
const active = ref(null);
const categoryOptions = tipo => props.categories.filter(category => category.tipo === tipo);
const current = computed(() => store.imports.find(batch => batch.import_id === active.value));

watch(current, batch => {
  if (!batch) return;
  decisions.value = Object.fromEntries(batch.items.map(row => [row.clientTxId, {
    clientTxId: row.clientTxId,
    includi: !row.isDuplicate && !row.richiede_trasferimento,
    categoria_finale: row.categoria_suggerita || 'da_verificare',
    descrizione: row.descrizione,
  }]));
});

async function upload() {
  if (!file.value || !accountKey.value) { error.value = 'Scegli un file e il conto corrispondente.'; return; }
  busy.value = true; error.value = '';
  try {
    const result = await store.upload(file.value, accountKey.value);
    active.value = result.import_id;
    file.value = null;
  } catch (cause) { error.value = cause.response?.data?.message || 'Impossibile leggere il file.'; }
  finally { busy.value = false; }
}

async function confirm() {
  if (!current.value) return;
  busy.value = true; error.value = '';
  try {
    await store.confirm(current.value.import_id, Object.values(decisions.value));
    active.value = null;
  } catch (cause) { error.value = cause.response?.data?.message || 'Impossibile confermare le righe.'; }
  finally { busy.value = false; }
}
</script>

<template>
  <div>
    <p class="hint">Importa CSV o Excel (massimo 5 MB). Controlla le categorie prima di confermare. I movimenti storici non cambiano il saldo attuale che hai indicato.</p>
    <div v-if="!accounts.length" class="hint">Aggiungi prima un conto nella fase precedente.</div>
    <div v-else class="upload-row">
      <label>Conto dell’estratto <select v-model="accountKey"><option value="">Scegli il conto</option><option v-for="account in accounts" :key="account.key" :value="account.key">{{ account.nome }}</option></select></label>
      <label>Estratto conto <input type="file" accept=".csv,.xls,.xlsx" @change="file = $event.target.files?.[0] || null"></label>
      <button type="button" :disabled="busy" @click="upload">{{ busy ? 'Analisi…' : 'Analizza file' }}</button>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div v-for="batch in store.imports" :key="batch.import_id" class="batch">
      <div class="batch-head"><strong>Estratto · {{ accounts.find(account => account.key === batch.account_key)?.nome }}</strong><span>{{ batch.status === 'confirmed' ? `${batch.confermati} movimenti pronti` : `${batch.items.length} righe da rivedere` }}</span></div>
      <button v-if="batch.status !== 'confirmed' && active !== batch.import_id" type="button" @click="active = batch.import_id">Rivedi le righe</button>
      <div v-if="active === batch.import_id && batch.status !== 'confirmed'" class="review">
        <div v-for="row in batch.items" :key="row.clientTxId" class="review-row">
          <label class="include"><input v-model="decisions[row.clientTxId].includi" type="checkbox" :disabled="row.isDuplicate || row.richiede_trasferimento"> Includi</label>
          <div><strong>{{ row.descrizione }}</strong><small>{{ row.data }} · {{ row.tipo }} · {{ row.importo }} €</small><small v-if="row.isDuplicate || row.richiede_trasferimento">{{ row.isDuplicate ? 'Possibile duplicato' : 'Trasferimento da gestire dopo la configurazione' }}</small></div>
          <label>Categoria <select v-model="decisions[row.clientTxId].categoria_finale" :disabled="!decisions[row.clientTxId].includi"><option v-for="category in categoryOptions(row.tipo)" :key="category.id" :value="category.id">{{ category.nome }}</option></select></label>
        </div>
        <button type="button" :disabled="busy" @click="confirm">Conferma movimenti selezionati</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hint{color:var(--text-secondary);line-height:1.55}.upload-row{display:flex;flex-wrap:wrap;align-items:end;gap:1rem;margin:1.4rem 0}.upload-row label{display:grid;gap:.45rem;min-width:190px;flex:1}.upload-row input,.upload-row select,.review select{background:var(--bg-input);color:var(--text-primary);border:1px solid var(--control-border);border-radius:.65rem;padding:.65rem;max-width:100%}option{background:var(--bg-secondary)}button{background:var(--accent-green);color:var(--accent-on);border-radius:.7rem;padding:.7rem 1rem;font-weight:700}button:disabled{opacity:.55}.batch{border:1px solid var(--border);border-radius:1rem;padding:1rem;margin-top:1rem}.batch-head{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:.7rem}.batch-head span,small{color:var(--text-secondary)}.review{max-height:440px;overflow:auto}.review-row{display:grid;grid-template-columns:auto minmax(120px,1fr) minmax(160px,220px);gap:1rem;align-items:center;padding:.75rem 0;border-top:1px solid var(--border)}.review-row small{display:block;margin-top:.2rem}.include{white-space:nowrap}.error{color:var(--negative)}@media(max-width:480px){.review-row{grid-template-columns:1fr}.include{order:3}}
</style>
