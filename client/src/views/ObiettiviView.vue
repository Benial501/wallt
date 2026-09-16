<script setup>
import { ref, computed, onMounted } from 'vue';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import WModal from '@/components/common/WModal.vue';
import WConfetti from '@/components/common/WConfetti.vue';
import DataState from '@/components/common/DataState.vue';
import { useObiettiviStore } from '@/stores/obiettivi.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { formatData } from '@/utils/formatters';
import { Target, Calendar, Trophy, LightbulbIcon } from '@/utils/appIcons';
import { OBIETTIVO_ICON_OPTIONS, resolveObiettivoIcon } from '@/utils/obiettivoIcons';
import dayjs from 'dayjs';
import HelpTrigger from '@/components/help/HelpTrigger.vue';

const obiettiviStore = useObiettiviStore();
const { formatValuta } = useValuta();
const toastStore = useToastStore();

const showCrea = ref(false);
const showDettaglio = ref(false);
const showContributo = ref(false);
const showConfetti = ref(false);
const confettiMsg = ref('');
const loading = ref(false);
const proiezione = ref(null);

const obiettivoSelezionato = ref(null);

const creaForm = ref({
  nome: '', importo_target: null, deadline: null, icona: 'target', importo_iniziale: 0, hasDeadline: false,
});

const contributoForm = ref({ importo: null, data: dayjs().format('YYYY-MM-DD'), nota: '' });

const percentuale = (obj) => {
  const target = parseFloat(obj.importo_target);
  const attuale = parseFloat(obj.importo_attuale);
  return target > 0 ? Math.min(100, Math.round((attuale / target) * 100)) : 0;
};

const apriDettaglio = async (obj) => {
  obiettivoSelezionato.value = obj;
  proiezione.value = await obiettiviStore.fetchProiezione(obj.id);
  showDettaglio.value = true;
};

const creaObiettivo = async () => {
  if (!creaForm.value.nome || !creaForm.value.importo_target) return;
  loading.value = true;
  try {
    await obiettiviStore.createObiettivo({
      nome: creaForm.value.nome,
      importo_target: creaForm.value.importo_target,
      deadline: creaForm.value.hasDeadline ? creaForm.value.deadline : null,
      icona: creaForm.value.icona,
      importo_iniziale: creaForm.value.importo_iniziale || 0,
    });
    toastStore.success('Obiettivo creato!');
    showCrea.value = false;
    creaForm.value = { nome: '', importo_target: null, deadline: null, icona: 'target', importo_iniziale: 0, hasDeadline: false };
  } catch {
    toastStore.error('Errore nella creazione');
  } finally {
    loading.value = false;
  }
};

const aggiungiContributo = async () => {
  if (!contributoForm.value.importo || !obiettivoSelezionato.value) return;
  loading.value = true;
  try {
    const result = await obiettiviStore.addContributo(obiettivoSelezionato.value.id, contributoForm.value);
    if (result.appena_completato) {
      confettiMsg.value = `${result.obiettivo.nome} completato!`;
      showConfetti.value = true;
      showContributo.value = false;
      showDettaglio.value = false;
    } else {
      toastStore.success('Contributo aggiunto!');
      obiettivoSelezionato.value = obiettiviStore.obiettivi.attivi.find((o) => o.id === obiettivoSelezionato.value.id)
        || obiettiviStore.obiettivi.completati.find((o) => o.id === obiettivoSelezionato.value.id);
      proiezione.value = await obiettiviStore.fetchProiezione(obiettivoSelezionato.value.id);
      showContributo.value = false;
    }
    contributoForm.value = { importo: null, data: dayjs().format('YYYY-MM-DD'), nota: '' };
  } catch {
    toastStore.error('Errore nell\'aggiunta');
  } finally {
    loading.value = false;
  }
};

const eliminaObiettivo = async () => {
  if (!obiettivoSelezionato.value || !confirm('Eliminare questo obiettivo?')) return;
  await obiettiviStore.deleteObiettivo(obiettivoSelezionato.value.id);
  showDettaglio.value = false;
  toastStore.success('Obiettivo eliminato');
};

onMounted(() => obiettiviStore.fetchObiettivi());
</script>

<template>
  <div class="obiettivi-view animate-fade-in">
    <header class="page-header">
      <div class="page-title-row">
        <h1 class="page-title">I miei obiettivi</h1>
        <HelpTrigger topic="obiettivi-contributi" />
      </div>
      <WButton variant="primary" size="sm" @click="showCrea = true">+ Nuovo</WButton>
    </header>

    <DataState
      :stato="obiettiviStore.risorsaObiettivi.stato"
      :last-updated="obiettiviStore.risorsaObiettivi.lastUpdated"
      messaggio-errore="Non è stato possibile caricare i tuoi obiettivi."
      skeleton-type="card"
      @riprova="obiettiviStore.risorsaObiettivi.riprova()"
    >
      <template #vuoto>
        <WCard class="empty">
          <Target class="empty-icon" :size="48" :stroke-width="1.5" />
          <p>Crea il tuo primo obiettivo</p>
          <WButton variant="primary" size="md" @click="showCrea = true">+ Nuovo obiettivo</WButton>
        </WCard>
      </template>

      <!-- In corso -->
      <section v-if="obiettiviStore.obiettivi.attivi.length" class="mb-6">
        <h2 class="section-title">In corso</h2>
        <div class="ob-grid">
          <WCard
            v-for="obj in obiettiviStore.obiettivi.attivi"
            :key="obj.id"
            hoverable
            class="obj-card stagger-item"
            @click="apriDettaglio(obj)"
          >
            <span class="obj-icon" aria-hidden="true">
              <component :is="resolveObiettivoIcon(obj.icona)" :size="26" :stroke-width="1.7" />
            </span>
            <h3 class="obj-nome"><button type="button" class="obj-nome-btn" @click.stop="apriDettaglio(obj)">{{ obj.nome }}</button></h3>
            <p class="obj-importi">{{ formatValuta(obj.importo_attuale) }} / {{ formatValuta(obj.importo_target) }}</p>
            <div class="obj-bar"><div class="obj-bar-fill" :style="{ width: percentuale(obj) + '%' }" /></div>
            <p class="obj-mancante">Mancano {{ formatValuta(parseFloat(obj.importo_target) - parseFloat(obj.importo_attuale)) }}</p>
            <p v-if="obj.deadline" class="obj-deadline">
              <Calendar :size="14" :stroke-width="1.75" />
              {{ formatData(obj.deadline) }}
            </p>
            <button class="obj-btn" @click.stop="obiettivoSelezionato = obj; showContributo = true">+ Aggiungi soldi</button>
          </WCard>
        </div>
      </section>

      <!-- Completati -->
      <section v-if="obiettiviStore.obiettivi.completati.length" class="mb-6">
        <h2 class="section-title"><Trophy :size="18" :stroke-width="1.75" /> Completati</h2>
        <div class="ob-grid">
          <WCard
            v-for="obj in obiettiviStore.obiettivi.completati"
            :key="obj.id"
            class="obj-card obj-card--done"
            @click="apriDettaglio(obj)"
          >
            <span class="obj-badge"><Trophy :size="14" /> Completato</span>
            <span class="obj-icon" aria-hidden="true">
              <component :is="resolveObiettivoIcon(obj.icona)" :size="26" :stroke-width="1.7" />
            </span>
            <h3 class="obj-nome"><button type="button" class="obj-nome-btn" @click.stop="apriDettaglio(obj)">{{ obj.nome }}</button></h3>
            <p class="obj-importi">{{ formatValuta(obj.importo_attuale) }} / {{ formatValuta(obj.importo_target) }}</p>
            <div class="obj-bar"><div class="obj-bar-fill obj-bar-fill--done" style="width:100%" /></div>
          </WCard>
        </div>
      </section>
    </DataState>

    <!-- Modal Crea -->
    <WModal :open="showCrea" title="Nuovo obiettivo" @close="showCrea = false">
      <div class="form-space">
        <div class="icon-grid" role="group" aria-label="Scegli un’icona per l’obiettivo">
          <button
            v-for="option in OBIETTIVO_ICON_OPTIONS"
            :key="option.id"
            type="button"
            class="icon-btn"
            :class="{ active: creaForm.icona === option.id }"
            :aria-label="option.label"
            :aria-pressed="creaForm.icona === option.id"
            :title="option.label"
            @click="creaForm.icona = option.id"
          >
            <component :is="option.icon" :size="21" :stroke-width="1.75" />
          </button>
        </div>
        <input v-model="creaForm.nome" class="form-input" placeholder="Nome obiettivo" />
        <input v-model.number="creaForm.importo_target" type="number" min="0" class="form-input" placeholder="Importo target €" />
        <label class="toggle"><input v-model="creaForm.hasDeadline" type="checkbox" /> Imposta deadline</label>
        <input v-if="creaForm.hasDeadline" v-model="creaForm.deadline" type="date" class="form-input" />
        <input v-model.number="creaForm.importo_iniziale" type="number" min="0" class="form-input" placeholder="Importo iniziale (opzionale)" />
        <WButton variant="primary" size="lg" :loading="loading" @click="creaObiettivo">Crea obiettivo</WButton>
      </div>
    </WModal>

    <!-- Modal Dettaglio -->
    <WModal :open="showDettaglio" :title="obiettivoSelezionato?.nome" @close="showDettaglio = false">
      <div v-if="obiettivoSelezionato" class="form-space">
        <div class="dettaglio-header">
          <span class="dettaglio-icon" aria-hidden="true">
            <component :is="resolveObiettivoIcon(obiettivoSelezionato.icona)" :size="34" :stroke-width="1.6" />
          </span>
          <div class="dettaglio-bar-lg"><div class="obj-bar-fill" :style="{ width: percentuale(obiettivoSelezionato) + '%' }" /></div>
          <p class="dettaglio-importi">{{ formatValuta(obiettivoSelezionato.importo_attuale) }} / {{ formatValuta(obiettivoSelezionato.importo_target) }} ({{ percentuale(obiettivoSelezionato) }}%)</p>
          <p class="obj-mancante">Mancano {{ formatValuta(parseFloat(obiettivoSelezionato.importo_target) - parseFloat(obiettivoSelezionato.importo_attuale)) }}</p>
          <p v-if="proiezione?.rata_mensile_suggerita" :class="proiezione.on_track ? 'proiezione-ok' : 'proiezione-ko'">
            <LightbulbIcon :size="16" :stroke-width="1.75" />
            Metti {{ formatValuta(proiezione.rata_mensile_suggerita) }}/mese per farcela
          </p>
        </div>
        <div v-if="obiettivoSelezionato.contributi?.length" class="contributi-list">
          <h4>Contributi</h4>
          <div v-for="c in obiettivoSelezionato.contributi" :key="c.id" class="contributo-row">
            <span>{{ formatData(c.data) }}</span>
            <span class="positive">+{{ formatValuta(c.importo) }}</span>
            <span class="contributo-nota">{{ c.nota }}</span>
          </div>
        </div>
        <WButton variant="primary" size="md" @click="showContributo = true">+ Aggiungi soldi</WButton>
        <div class="dettaglio-actions">
          <button class="link-btn danger" @click="eliminaObiettivo">Elimina</button>
        </div>
      </div>
    </WModal>

    <!-- Modal Contributo -->
    <WModal :open="showContributo" title="Aggiungi soldi" @close="showContributo = false">
      <div class="form-space">
        <input v-model.number="contributoForm.importo" type="number" min="0" class="form-input form-input--lg" placeholder="€" inputmode="decimal" />
        <input v-model="contributoForm.data" type="date" class="form-input" />
        <input v-model="contributoForm.nota" class="form-input" placeholder="Nota (opzionale)" />
        <WButton variant="primary" size="lg" :loading="loading" @click="aggiungiContributo">Aggiungi</WButton>
      </div>
    </WModal>

    <WConfetti :show="showConfetti" :message="confettiMsg" @close="showConfetti = false" />
  </div>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; gap: 0.75rem; flex-wrap: wrap; }
.page-title-row { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.section-title { font-size: 1rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.75rem; }
.ob-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 640px) { .ob-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .ob-grid { grid-template-columns: repeat(3, 1fr); } }
.obj-card { text-align: center; cursor: pointer; position: relative; }
.obj-card--done { background: rgba(0, 212, 170, 0.08); border-color: var(--positive); }
/* Il badge resta a --text-xs e --positive-on: sono due correzioni di questo
   branch che il ramo delle icone non conosceva. `--accent-on` su --positive
   dava 3.00:1, e 0.6875rem sta sotto il pavimento tipografico. */
.obj-badge { position: absolute; top: 0.75rem; right: 0.75rem; font-size: var(--text-xs); background: var(--positive); color: var(--positive-on); padding: 0.125rem 0.5rem; border-radius: 999px; font-weight: 600; }
.obj-icon {
  width: 3rem;
  height: 3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.625rem;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-input));
  color: var(--accent-text);
}
.obj-icon svg { stroke: currentColor; }
.obj-nome { font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem; }
/* Il titolo è il bersaglio da tastiera della card: un bottone nativo che
   eredita la tipografia dall'h3 che lo contiene. La card resta cliccabile
   col mouse, ma non è più un role="button" — lo era, e rendeva il bottone
   "+ Aggiungi soldi" una fermata irraggiungibile con lo swipe di VoiceOver. */
.obj-nome-btn {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  text-align: inherit;
  cursor: pointer;
}

.obj-nome-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring-tight);
  border-radius: var(--radius-xs);
}
.obj-importi { font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.75rem; }
.obj-bar { height: 8px; background: var(--bg-input); border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem; }
.obj-bar-fill { height: 100%; background: var(--accent-green); border-radius: 4px; transition: width 0.6s ease; }
.obj-bar-fill--done { background: var(--positive); }
.obj-mancante { font-size: var(--text-xs); color: var(--text-muted); }
.obj-deadline { font-size: var(--text-xs); color: var(--text-secondary); margin-top: 0.25rem; }
.obj-btn { margin-top: 0.75rem; padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--accent-green); background: transparent; color: var(--accent-text); cursor: pointer; font-size: var(--text-xs); width: 100%; }
.obj-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.empty { text-align: center; padding: 3rem; }
.empty-icon { display: block; margin: 0 auto 1rem; color: var(--text-muted); stroke: currentColor; }
.section-title { display: inline-flex; align-items: center; gap: 0.5rem; }
.section-title svg, .obj-deadline svg, .obj-badge svg { stroke: currentColor; flex-shrink: 0; }
.obj-deadline, .obj-badge { display: inline-flex; align-items: center; gap: 0.375rem; }
.proiezione-tip { display: flex; align-items: center; gap: 0.5rem; }
.form-space { display: flex; flex-direction: column; gap: 0.75rem; }
/* .form-input: aspetto condiviso in assets/styles/main.css */
.form-input--lg { font-size: 2rem; font-weight: 800; text-align: center; }
.icon-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 0.5rem; }
.icon-btn {
  min-width: 0;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-interactive-border);
  background: var(--glass-interactive-bg);
  box-shadow: var(--glass-highlight);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.icon-btn svg { stroke: currentColor; }
@media (hover: hover) {
  .icon-btn:hover:not(.active) { background: var(--glass-interactive-bg-hover); color: var(--text-primary); }
}
.icon-btn:active { transform: scale(0.94); }
.icon-btn:focus-visible { outline: none; box-shadow: var(--focus-ring), var(--glass-highlight); }
.icon-btn.active {
  border-color: var(--accent-green);
  background: color-mix(in srgb, var(--accent-green) 12%, var(--bg-input));
  color: var(--accent-text);
}
@media (max-width: 479px) { .icon-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.toggle { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--text-secondary); cursor: pointer; }
.dettaglio-header { text-align: center; }
.dettaglio-icon {
  width: 4rem;
  height: 4rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.875rem;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-input));
  color: var(--accent-text);
}
.dettaglio-icon svg { stroke: currentColor; }
.dettaglio-bar-lg { height: 16px; background: var(--bg-input); border-radius: 8px; overflow: hidden; margin-bottom: 0.75rem; }
.dettaglio-importi { font-size: 1.125rem; font-weight: 700; color: var(--text-primary); }
.proiezione-ok { color: var(--positive); font-size: 0.875rem; margin-top: 0.5rem; }
.proiezione-ko { color: var(--negative); font-size: 0.875rem; margin-top: 0.5rem; }
.contributi-list { max-height: 200px; overflow-y: auto; }
.contributi-list h4 { font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 0.5rem; }
.contributo-row { display: flex; gap: 0.75rem; padding: 0.375rem 0; border-bottom: 1px solid var(--border); font-size: var(--text-xs); }
.contributo-nota { color: var(--text-muted); flex: 1; }
.positive { color: var(--positive); }
.dettaglio-actions { text-align: center; margin-top: 0.5rem; }
.link-btn { background: none; border: none; cursor: pointer; font-size: var(--text-xs); color: var(--text-muted); }
.link-btn.danger { color: var(--negative); }
.link-btn:focus-visible { outline: none; box-shadow: var(--focus-ring-tight); }
.mb-6 { margin-bottom: 1.5rem; }
</style>
