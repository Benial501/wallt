<script setup>
import { computed } from 'vue';
import { Plus } from 'lucide-vue-next';

const props = defineProps({
  modelValue: { type: Array, required: true },
  kind: { type: String, required: true },
  categories: { type: Array, required: true },
  accounts: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue']);
const isDebt = computed(() => props.kind === 'impegni');
const isIncome = computed(() => props.kind === 'entrate');
const categoryOptions = computed(() => props.categories.filter(item => item.tipo === (isIncome.value ? 'entrata' : 'uscita')));
const suggestions = {
  entrate: ['Stipendio', 'Pensione', 'Lavoro autonomo', 'Affitto ricevuto'],
  spese: ['Affitto', 'Mutuo', 'Bollette', 'Assicurazione', 'Trasporti'],
  abbonamenti: ['Streaming', 'Palestra', 'Telefono', 'Software'],
  impegni: ['Finanziamento', 'Prestito', 'Rata auto', 'Carta di credito'],
};
const field = (index, key, value) => {
  const copy = props.modelValue.map((item, position) => {
    if (position !== index) return item;
    const next = { ...item, [key]: value };
    if (key === 'saldo_residuo' && value === '') delete next.saldo_residuo;
    return next;
  });
  emit('update:modelValue', copy);
};
const add = (name = '') => emit('update:modelValue', [
  ...props.modelValue,
  {
    nome: name, ...(isDebt.value ? { rata: '' } : { importo: '' }), frequenza: 'mensile', giorno: 1, mese: 1,
    categoria: categoryOptions.value.find(c => !c.sistema)?.id || categoryOptions.value[0]?.id || '',
    conto_key: props.accounts[0]?.key || '',
  },
]);
const remove = index => emit('update:modelValue', props.modelValue.filter((_, position) => position !== index));
</script>

<template>
  <div class="recurring-editor">
    <div class="suggestions" aria-label="Esempi da aggiungere">
      <button v-for="name in suggestions[kind]" :key="name" type="button" class="chip" @click="add(name)"><Plus :size="14" aria-hidden="true" /> {{ name }}</button>
    </div>
    <div v-for="(item, index) in modelValue" :key="index" class="entry-card">
      <div class="entry-head">
        <strong>{{ isDebt ? 'Impegno' : isIncome ? 'Entrata' : 'Spesa' }} {{ index + 1 }}</strong>
        <button type="button" class="remove" :aria-label="`Rimuovi ${item.nome || 'voce'}`" @click="remove(index)">Rimuovi</button>
      </div>
      <div class="fields">
        <label>Nome <input :value="item.nome" maxlength="200" placeholder="Es. {{ suggestions[kind][0] }}" @input="field(index, 'nome', $event.target.value)"></label>
        <label>{{ isDebt ? 'Rata mensile (€) · facoltativa' : 'Importo (€)' }} <input :value="isDebt ? item.rata : item.importo" type="number" min="0.01" step="0.01" inputmode="decimal" @input="field(index, isDebt ? 'rata' : 'importo', $event.target.value)"></label>
        <template v-if="!isDebt || Number(item.rata) > 0">
          <label>Frequenza <select :value="item.frequenza" @change="field(index, 'frequenza', $event.target.value)"><option value="mensile">Mensile</option><option value="settimanale">Settimanale</option><option value="annuale">Annuale</option></select></label>
          <label>{{ item.frequenza === 'settimanale' ? 'Giorno della settimana (1–7)' : 'Giorno del mese' }} <input :value="item.giorno" type="number" min="1" :max="item.frequenza === 'settimanale' ? 7 : 31" @input="field(index, 'giorno', Number($event.target.value))"></label>
          <label v-if="item.frequenza === 'annuale'">Mese <input :value="item.mese" type="number" min="1" max="12" @input="field(index, 'mese', Number($event.target.value))"></label>
          <label>Categoria <select :value="item.categoria" @change="field(index, 'categoria', $event.target.value)"><option v-for="category in categoryOptions" :key="category.id" :value="category.id">{{ category.nome }}</option></select></label>
          <label v-if="accounts.length">Conto <select :value="item.conto_key" @change="field(index, 'conto_key', $event.target.value)"><option value="">Scegli un conto</option><option v-for="account in accounts" :key="account.key" :value="account.key">{{ account.nome }}</option></select></label>
        </template>
        <label v-if="isDebt">Debito residuo, se noto (€) <input :value="item.saldo_residuo" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Facoltativo" @input="field(index, 'saldo_residuo', $event.target.value)"></label>
      </div>
    </div>
    <button type="button" class="add" @click="add()"><Plus :size="16" aria-hidden="true" /> Aggiungi {{ isIncome ? 'un’entrata' : isDebt ? 'un impegno' : 'una spesa' }}</button>
  </div>
</template>

<style scoped>
.suggestions{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.2rem}.chip,.add{border:1px solid var(--border-strong);background:var(--glass-interactive-bg);color:var(--text-primary);border-radius:999px;padding:.55rem .85rem}.add{margin-top:1rem}.entry-card{padding:1rem;margin:1rem 0;border:1px solid var(--border);border-radius:1rem;background:var(--glass-secondary-bg)}.entry-head{display:flex;justify-content:space-between;gap:1rem}.remove{color:var(--negative);font-size:var(--text-xs)}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:1rem;margin-top:1rem}label{display:grid;gap:.4rem;font-size:var(--text-xs);color:var(--text-secondary)}input,select{width:100%;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--control-border);border-radius:.65rem;padding:.7rem}option{background:var(--bg-secondary)}
.chip,.add{display:inline-flex;align-items:center;gap:.4rem}
</style>
