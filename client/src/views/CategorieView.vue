<script setup>
import { ref, computed, onMounted } from 'vue';
import { CATEGORIE_ENTRATA, CATEGORIE_USCITA, CATEGORIE_ARCHIVIATE, loadCategorie } from '@/utils/categorie';
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
const confermaElimina = ref(false);
const icone = ref(['Tag']);
const iconLabels = { Tag: 'Etichetta', House: 'Casa', ShoppingBasket: 'Spesa', Car: 'Auto', ShoppingBag: 'Shopping', Heart: 'Cuore', Dumbbell: 'Sport', Music: 'Musica', Plane: 'Viaggi', Wallet: 'Portafoglio', BookOpen: 'Libri', Gift: 'Regalo', Briefcase: 'Lavoro', Coffee: 'Caffè', Gamepad2: 'Videogiochi', GraduationCap: 'Istruzione', PawPrint: 'Animali' };
const form = ref({});

// La selezione è per coppia id+tipo: lo stesso id può esistere su entrambi i versi.
const chiave = c => `${c.id}:${c.tipo}`;
const selezione = ref(new Set());
// Le categorie di sistema arrivano già marcate dall'API: nessun elenco duplicato qui.
const eliminabile = c => !c.sistema;

const filtra = cats => cats.filter(c => c.nome.toLocaleLowerCase('it').includes(ricerca.value.toLocaleLowerCase('it')));
const visibili = computed(() => filtra(tipo.value === 'entrata' ? CATEGORIE_ENTRATA : CATEGORIE_USCITA));
const groups = computed(() => visibili.value.reduce((groups, c) => { (groups[c.gruppo] ||= []).push(c); return groups; }, {}));
const archiviate = computed(() => filtra(CATEGORIE_ARCHIVIATE.filter(c => c.tipo === tipo.value)));

const selezionabili = computed(() => visibili.value.filter(eliminabile));
const selezionate = computed(() => visibili.value.filter(c => selezione.value.has(chiave(c))));
const tutteSelezionate = computed(() => !!selezionabili.value.length && selezionate.value.length === selezionabili.value.length);

function toggle(c) {
  const next = new Set(selezione.value);
  if (next.has(chiave(c))) next.delete(chiave(c));
  else next.add(chiave(c));
  selezione.value = next;
}
function toggleTutte() {
  if (tutteSelezionate.value) return void (selezione.value = new Set());
  selezione.value = new Set(selezionabili.value.map(chiave));
}
const azzeraSelezione = () => { selezione.value = new Set(); };

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

/**
 * Le predefinite si eliminano in blocco con una sola chiamata; le personali
 * hanno un endpoint per id. La selezione può contenerle entrambe.
 */
async function elimina() {
  busy.value = true; error.value = '';
  try {
    const scelte = selezionate.value;
    const predefinite = scelte.filter(c => c.isDefault).map(c => ({ id: c.id, tipo: c.tipo }));
    if (predefinite.length) await api.delete('/categorie/default', { data: { categorie: predefinite } });
    for (const c of scelte.filter(c => !c.isDefault)) await api.delete(`/categorie/${c.id}`);
    confermaElimina.value = false;
    azzeraSelezione();
    await refresh();
  } catch (e) { error.value = e.response?.data?.message || 'Impossibile eliminare le categorie'; }
  finally { busy.value = false; }
}

async function ripristina(c) {
  busy.value = true; error.value = '';
  try {
    if (c.isDefault) await api.post('/categorie/default/ripristina', { categorie: [{ id: c.id, tipo: c.tipo }] });
    else await api.post(`/categorie/${c.id}/ripristina`);
    await refresh();
  } catch (e) { error.value = e.response?.data?.message || 'Impossibile ripristinare la categoria'; }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="categories animate-fade-in">
    <RouterLink to="/impostazioni" class="back">← Impostazioni</RouterLink>
    <header><div><h1>Categorie</h1><p>Organizza le tue entrate e uscite, a modo tuo.</p></div><WButton @click="edit()">Nuova categoria</WButton></header>
    <p v-if="error && !editing && !confermaElimina" role="alert" class="error">{{ error }} <button @click="refresh">Riprova</button></p>
    <div class="filters"><div class="tabs"><button :class="{ selected: tipo === 'uscita' }" @click="tipo = 'uscita'; azzeraSelezione()">Uscite</button><button :class="{ selected: tipo === 'entrata' }" @click="tipo = 'entrata'; azzeraSelezione()">Entrate</button></div><input v-model="ricerca" class="form-input" type="search" placeholder="Cerca una categoria" aria-label="Cerca una categoria" /></div>
    <p class="hint">Le categorie personali sono visibili solo a te. Le correzioni ai movimenti aiutano WALLT a riconoscere le prossime operazioni simili.</p>

    <div v-if="selezionabili.length" class="bulk">
      <label class="bulk__all"><input type="checkbox" :checked="tutteSelezionate" @change="toggleTutte" /> Seleziona tutte le categorie mostrate ({{ selezionabili.length }})</label>
      <div v-if="selezionate.length" class="bulk__actions">
        <span>{{ selezionate.length }} selezionate</span>
        <button class="bulk__clear" @click="azzeraSelezione">Annulla selezione</button>
        <WButton :loading="busy" @click="error = ''; confermaElimina = true">Elimina selezionate</WButton>
      </div>
    </div>

    <p v-if="!Object.keys(groups).length">Nessuna categoria trovata.</p>
    <section v-for="(cats, gruppo) in groups" :key="gruppo"><h2>{{ gruppo }}</h2><div class="category-grid">
      <WCard v-for="cat in cats" :key="cat.id" class="category-row" :class="{ picked: selezione.has(chiave(cat)) }">
        <input v-if="eliminabile(cat)" type="checkbox" :checked="selezione.has(chiave(cat))" :aria-label="`Seleziona ${cat.nome}`" @change="toggle(cat)" />
        <span v-else class="checkbox-placeholder" aria-hidden="true"></span>
        <span class="mark" :style="{ color: cat.colore, background: cat.colore + '18' }"><CategoryIcon :categoria="cat.id" :tipo="tipo" /></span>
        <div class="category-name"><strong>{{ cat.nome }}</strong><small>{{ cat.sistema ? 'Di sistema' : cat.isDefault ? 'Predefinita' : 'Personale' }}</small></div>
        <div v-if="!cat.isDefault" class="actions"><button :aria-label="`Modifica ${cat.nome}`" @click="edit(cat)">Modifica</button></div>
      </WCard>
    </div></section>

    <section v-if="archiviate.length" class="archived">
      <h2>Eliminate</h2>
      <p class="hint">Non vengono più proposte per le nuove operazioni. I movimenti già registrati le mostrano ancora.</p>
      <div class="category-grid">
        <WCard v-for="cat in archiviate" :key="cat.id" class="category-row">
          <span class="checkbox-placeholder" aria-hidden="true"></span>
          <span class="mark" :style="{ color: cat.colore, background: cat.colore + '18' }"><CategoryIcon :categoria="cat.id" :tipo="tipo" /></span>
          <div class="category-name"><strong>{{ cat.nome }}</strong><small>{{ cat.isDefault ? 'Predefinita' : 'Personale' }}</small></div>
          <div class="actions"><button :disabled="busy" :aria-label="`Ripristina ${cat.nome}`" @click="ripristina(cat)">Ripristina</button></div>
        </WCard>
      </div>
    </section>

    <WModal :open="!!editing" :title="editing === 'new' ? 'Nuova categoria' : 'Modifica categoria'" @close="!busy && (editing = null)">
      <form class="category-form" @submit.prevent="save"><label>Nome<input v-model="form.nome" class="form-input" required maxlength="80" autofocus placeholder="Es. Spese Formula 1" /></label><label>Tipo<select v-model="form.tipo" class="form-select"><option value="uscita">Uscita</option><option value="entrata">Entrata</option></select></label><label>Icona<select v-model="form.icona" class="form-select"><option v-for="icon in icone" :key="icon" :value="icon">{{ iconLabels[icon] || icon }}</option></select></label><label>Colore<input v-model="form.colore" type="color" /></label><p v-if="error" role="alert" class="error">{{ error }}</p><WButton type="submit" :loading="busy">Salva categoria</WButton></form>
    </WModal>

    <WModal :open="confermaElimina" title="Elimina categorie" @close="!busy && (confermaElimina = false)">
      <p>Vuoi eliminare {{ selezionate.length }} {{ selezionate.length === 1 ? 'categoria' : 'categorie' }}?</p>
      <p class="hint">I movimenti già registrati le conservano, le nuove operazioni non le useranno più e WALLT smette di assegnarle in automatico. Puoi ripristinarle quando vuoi.</p>
      <ul class="preview"><li v-for="cat in selezionate.slice(0, 8)" :key="chiave(cat)">{{ cat.nome }}</li><li v-if="selezionate.length > 8">e altre {{ selezionate.length - 8 }}</li></ul>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <div class="delete-actions"><WButton variant="secondary" @click="confermaElimina = false">Annulla</WButton><WButton :loading="busy" @click="elimina">Elimina</WButton></div>
    </WModal>
  </div>
</template>
<style scoped>
.categories { max-width: 1080px; margin: auto; padding: 1rem; } header { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin:1.5rem 0; } h1 { font-size:1.8rem; font-weight:700; } p,.back,small { color:var(--text-secondary); } h2 { font-size:1rem; font-weight:600; margin:1.7rem 0 .7rem; } .filters { display:flex; gap:1rem; align-items:center; } .filters input { max-width:360px; } .tabs { display:flex; padding:4px; background:var(--bg-card); border-radius:12px; border:1px solid var(--border); } .tabs button { padding:.6rem 1.3rem; border-radius:8px; } .selected { background:var(--accent,#00D4AA); color:#122020; } .hint { margin-top:1rem; font-size:.85rem; } .category-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.6rem; } .category-row { display:flex; gap:.8rem; align-items:center; padding:1rem; } .category-row.picked { outline:2px solid var(--accent,#00D4AA); } .checkbox-placeholder { width:13px; } .mark { padding:.6rem; border-radius:10px; display:flex; } .category-name { flex:1; min-width:0; } strong,small { display:block; } strong { font-size:.9rem; } small { font-size:.7rem; margin-top:.15rem; } .actions { display:flex; gap:.7rem; font-size:.75rem; } .actions button:hover { text-decoration:underline; } .actions button:disabled { opacity:.5; } .bulk { display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin-top:1.2rem; padding:.8rem 1rem; background:var(--bg-card); border:1px solid var(--border); border-radius:12px; } .bulk__all { display:flex; align-items:center; gap:.5rem; font-size:.85rem; color:var(--text-secondary); } .bulk__actions { display:flex; align-items:center; gap:.9rem; font-size:.85rem; } .bulk__clear:hover { text-decoration:underline; } .archived { margin-top:2.5rem; } .archived .category-row { opacity:.75; } .preview { margin:.8rem 0 0; padding-left:1.1rem; font-size:.85rem; color:var(--text-secondary); list-style:disc; } .category-form { display:grid; gap:1rem; } .category-form label { display:grid; gap:.4rem; } .error { color:var(--danger,#e25757); } .delete-actions { display:flex; justify-content:flex-end; gap:.8rem; margin-top:1.5rem; } @media(max-width:700px) { .category-grid { grid-template-columns:1fr; } header,.filters { align-items:stretch; flex-direction:column; } .filters input { max-width:none; } }
</style>
