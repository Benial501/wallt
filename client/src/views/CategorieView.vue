<script setup>
import { ref, computed, onMounted } from 'vue';
import { CATEGORIE_ENTRATA, CATEGORIE_USCITA, loadCategorie } from '@/utils/categorie';
import api from '@/utils/axios';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import WModal from '@/components/common/WModal.vue';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
const tipo = ref('uscita');
const ricerca = ref('');
const busy = ref(false);
const error = ref('');
const editing = ref(null);
const deleting = ref(null);
const icone = ref(['Tag']);
const iconLabels = { Tag: 'Etichetta', House: 'Casa', ShoppingBasket: 'Spesa', Car: 'Auto', ShoppingBag: 'Shopping', Heart: 'Cuore', Dumbbell: 'Sport', Music: 'Musica', Plane: 'Viaggi', Wallet: 'Portafoglio', BookOpen: 'Libri', Gift: 'Regalo', Briefcase: 'Lavoro', Coffee: 'Caffè', Gamepad2: 'Videogiochi', GraduationCap: 'Istruzione', PawPrint: 'Animali' };
const form = ref({});
const groups = computed(() => {
  const cats = tipo.value === 'entrata' ? CATEGORIE_ENTRATA : CATEGORIE_USCITA;
  return cats.filter(c => c.nome.toLocaleLowerCase('it').includes(ricerca.value.toLocaleLowerCase('it')))
    .reduce((groups, c) => { (groups[c.gruppo] ||= []).push(c); return groups; }, {});
});
async function refresh() {
  try { const data = await loadCategorie(); if (data) icone.value = data.icone; }
  catch (e) { error.value = e.response?.data?.message || 'Impossibile caricare le categorie. Riprova.'; }
}
onMounted(refresh);
function edit(c = null) {
  error.value = '';
  form.value = c ? { nome: c.nome, tipo: c.tipo, icona: c.icona, colore: c.colore } : { nome: '', tipo: tipo.value, icona: 'Tag', colore: '#3498DB' };
  editing.value = c?.id || 'new';
}
async function save() {
  busy.value = true; error.value = '';
  try {
    if (editing.value === 'new') await api.post('/categorie', form.value);
    else await api.put(`/categorie/${editing.value}`, form.value);
    editing.value = null;
    await refresh();
  } catch (e) { error.value = e.response?.data?.message || 'Impossibile salvare la categoria'; }
  finally { busy.value = false; }
}
async function archive() {
  busy.value = true; error.value = '';
  try { await api.delete(`/categorie/${deleting.value.id}`); deleting.value = null; await refresh(); }
  catch (e) { error.value = e.response?.data?.message || 'Impossibile eliminare la categoria'; }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="categories animate-fade-in">
    <RouterLink to="/impostazioni" class="back">← Impostazioni</RouterLink>
    <header><div><h1>Categorie</h1><p>Organizza le tue entrate e uscite, a modo tuo.</p></div><WButton @click="edit()">Nuova categoria</WButton></header>
    <p v-if="error && !editing && !deleting" role="alert" class="error">{{ error }} <button @click="refresh">Riprova</button></p>
    <div class="filters"><div class="tabs"><button :class="{ selected: tipo === 'uscita' }" @click="tipo = 'uscita'">Uscite</button><button :class="{ selected: tipo === 'entrata' }" @click="tipo = 'entrata'">Entrate</button></div><input v-model="ricerca" class="form-input" type="search" placeholder="Cerca una categoria" aria-label="Cerca una categoria" /></div>
    <p class="hint">Le categorie personali sono visibili solo a te. Le correzioni ai movimenti aiutano WALLT a riconoscere le prossime operazioni simili.</p>
    <p v-if="!Object.keys(groups).length">Nessuna categoria trovata.</p>
    <section v-for="(cats, gruppo) in groups" :key="gruppo"><h2>{{ gruppo }}</h2><div class="category-grid"><WCard v-for="cat in cats" :key="cat.id" class="category-row"><span class="mark" :style="{ color: cat.colore, background: cat.colore + '18' }"><CategoryIcon :categoria="cat.id" :tipo="tipo" /></span><div class="category-name"><strong>{{ cat.nome }}</strong><small>{{ cat.isDefault ? 'Predefinita' : 'Personale' }}</small></div><div v-if="!cat.isDefault" class="actions"><button :aria-label="`Modifica ${cat.nome}`" @click="edit(cat)">Modifica</button><button :aria-label="`Elimina ${cat.nome}`" @click="deleting = cat; error = ''">Elimina</button></div></WCard></div></section>
    <WModal :open="!!editing" :title="editing === 'new' ? 'Nuova categoria' : 'Modifica categoria'" @close="!busy && (editing = null)">
      <form class="category-form" @submit.prevent="save"><label>Nome<input v-model="form.nome" class="form-input" required maxlength="80" autofocus placeholder="Es. Spese Formula 1" /></label><label>Tipo<select v-model="form.tipo" class="form-select"><option value="uscita">Uscita</option><option value="entrata">Entrata</option></select></label><label>Icona<select v-model="form.icona" class="form-select"><option v-for="icon in icone" :key="icon" :value="icon">{{ iconLabels[icon] || icon }}</option></select></label><label>Colore<input v-model="form.colore" type="color" /></label><p v-if="error" role="alert" class="error">{{ error }}</p><WButton type="submit" :loading="busy">Salva categoria</WButton></form>
    </WModal>
    <WModal :open="!!deleting" title="Elimina categoria" @close="!busy && (deleting = null)"><p>Vuoi eliminare “{{ deleting?.nome }}”? Sarà archiviata: i movimenti passati manterranno la categoria e le nuove operazioni non la useranno più.</p><p v-if="error" role="alert" class="error">{{ error }}</p><div class="delete-actions"><WButton variant="secondary" @click="deleting = null">Annulla</WButton><WButton :loading="busy" @click="archive">Archivia categoria</WButton></div></WModal>
  </div>
</template>
<style scoped>
.categories { max-width: 1080px; margin: auto; padding: 1rem; } header { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin:1.5rem 0; } h1 { font-size:1.8rem; font-weight:700; } p,.back,small { color:var(--text-secondary); } h2 { font-size:1rem; font-weight:600; margin:1.7rem 0 .7rem; } .filters { display:flex; gap:1rem; align-items:center; } .filters input { max-width:360px; } .tabs { display:flex; padding:4px; background:var(--bg-card); border-radius:12px; border:1px solid var(--border); } .tabs button { padding:.6rem 1.3rem; border-radius:8px; } .selected { background:var(--accent,#00D4AA); color:#122020; } .hint { margin-top:1rem; font-size:.85rem; } .category-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.6rem; } .category-row { display:flex; gap:.8rem; align-items:center; padding:1rem; } .mark { padding:.6rem; border-radius:10px; display:flex; } .category-name { flex:1; min-width:0; } strong,small { display:block; } strong { font-size:.9rem; } small { font-size:.7rem; margin-top:.15rem; } .actions { display:flex; gap:.7rem; font-size:.75rem; } .actions button:hover { text-decoration:underline; } .category-form { display:grid; gap:1rem; } .category-form label { display:grid; gap:.4rem; } .error { color:var(--danger,#e25757); } .delete-actions { display:flex; justify-content:flex-end; gap:.8rem; margin-top:1.5rem; } @media(max-width:700px) { .category-grid { grid-template-columns:1fr; } header,.filters { align-items:stretch; flex-direction:column; } .filters input { max-width:none; } }
</style>
