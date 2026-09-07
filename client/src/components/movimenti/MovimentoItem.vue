<script setup>
import { ref } from 'vue';
import { useValuta } from '@/composables/useValuta';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { Repeat2, RefreshCw } from '@/utils/appIcons';
import { Trash2 } from 'lucide-vue-next';

const props = defineProps({
  movimento: { type: Object, required: true },
  catInfo: { type: Object, default: () => ({ nome: '', colore: '#95A5A6' }) },
  selected: { type: Boolean, default: false },
});

const emit = defineEmits(['click', 'delete']);
const { formatValuta } = useValuta();

const offsetX = ref(0);
const startX = ref(0);
const swiping = ref(false);
const DELETE_THRESHOLD = -120;
const REVEAL_THRESHOLD = -60;

const importoClass = (tipo) => {
  if (tipo === 'entrata') return 'positive';
  if (tipo === 'uscita') return 'negative';
  return 'neutral';
};

const importoPrefix = (tipo) => {
  if (tipo === 'entrata') return '+';
  if (tipo === 'uscita') return '-';
  return '';
};

const onTouchStart = (e) => {
  startX.value = e.touches[0].clientX;
  swiping.value = true;
};

const onTouchMove = (e) => {
  if (!swiping.value) return;
  const delta = e.touches[0].clientX - startX.value;
  if (delta < -10 || offsetX.value < 0) {
    offsetX.value = Math.max(delta, -140);
  }
};

const onTouchEnd = () => {
  swiping.value = false;
  if (offsetX.value <= DELETE_THRESHOLD) {
    if (confirm('Eliminare questo movimento?')) {
      emit('delete', props.movimento);
    }
    offsetX.value = 0;
  } else if (offsetX.value <= REVEAL_THRESHOLD) {
    offsetX.value = -80;
  } else {
    offsetX.value = 0;
  }
};

const handleDelete = () => {
  if (confirm('Eliminare questo movimento?')) {
    emit('delete', props.movimento);
  }
  offsetX.value = 0;
};

const handleClick = () => {
  if (offsetX.value < -10) {
    offsetX.value = 0;
    return;
  }
  emit('click', props.movimento);
};
</script>

<template>
  <div class="mov-item-wrap" :class="{ 'is-selected': selected }">
    <button class="mov-delete" :aria-label="`Elimina ${movimento.descrizione || catInfo.nome}`" @click.stop="handleDelete"><Trash2 :size="16" :stroke-width="1.75" aria-hidden="true" /><span>Elimina</span></button>
    <div
      class="mov-item"
      role="button"
      :tabindex="movimento.tipo === 'trasferimento' ? -1 : 0"
      :aria-disabled="movimento.tipo === 'trasferimento'"
      :aria-expanded="selected"
      :style="{ transform: `translateX(${offsetX}px)` }"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend="onTouchEnd"
      @click="handleClick"
      @keydown.enter.prevent="handleClick"
      @keydown.space.prevent="handleClick"
    >
      <div class="mov-icon">
        <CategoryIcon :movimento="movimento" :size="20" />
      </div>
      <div class="mov-info">
        <div class="mov-cat-row">
          <p class="mov-cat">{{ movimento.descrizione || catInfo.nome }}</p>
          <span
            v-if="movimento.categoria_automatica && !movimento.categoria_modificata && movimento.categoria_confidenza !== null && movimento.categoria_confidenza < 60"
            class="badge badge--conf-low"
            title="Categoria assegnata automaticamente con bassa confidenza"
          >
            Conf. bassa
          </span>
        </div>
        <p class="mov-desc">{{ catInfo.nome }}<span v-if="movimento.conto?.nome"> · {{ movimento.conto.nome }}</span></p>
      </div>
      <div class="mov-right">
        <span v-if="movimento.ricorrente" class="badge badge--icon" title="Ricorrente"><RefreshCw :size="14" :stroke-width="2" /></span>
        <span v-if="movimento.tipo === 'trasferimento'" class="badge badge--icon" title="Trasferimento"><Repeat2 :size="14" :stroke-width="2" /></span>
        <span class="mov-importo" :class="importoClass(movimento.tipo)">
          {{ importoPrefix(movimento.tipo) }}{{ formatValuta(movimento.importo) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mov-item-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  margin-bottom: 0.5rem;
}

.mov-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  min-height: 44px;
  background: var(--bg-card);
  background: color-mix(in srgb, var(--bg-card) 90%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border);
  border-radius: 18px;
  cursor: pointer;
  transition: transform 0.2s ease, background-color 0.15s ease, border-color 0.15s ease;
  position: relative;
  z-index: 1;
}

.mov-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(145deg, var(--bg-input), transparent);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.125rem;
  flex-shrink: 0;
}

.mov-info { flex: 1; min-width: 0; }
.mov-cat { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mov-cat-row { display: flex; align-items: center; gap: 0.5rem; }
.mov-desc { font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mov-right { display: flex; align-items: center; gap: 0.375rem; flex-shrink: 0; }
.mov-importo { font-size: 0.9375rem; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; letter-spacing: -.025em; }
.mov-importo.neutral { color: var(--text-secondary); }
.positive { color: color-mix(in srgb, var(--positive) 65%, var(--text-primary)); }
.negative { color: color-mix(in srgb, var(--negative) 50%, var(--text-primary)); }
.badge { font-size: 0.75rem; color: var(--text-muted); display: inline-flex; align-items: center; }
.badge--icon svg { stroke: currentColor; }
.badge--conf-low { color: #fff; background: rgba(255, 71, 87, 0.85); border: 1px solid rgba(255, 71, 87, 0.3); padding: 0.25rem 0.45rem; border-radius: 999px; }

.mov-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 4px;
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 80px;
  min-height: 44px;
  background: var(--negative);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
  z-index: 0;
}

.mov-item:hover { background-color: var(--bg-card-hover); }
.mov-item:active { background-color: var(--bg-input); }
.mov-item:focus-visible { outline: 2px solid var(--accent-green); outline-offset: -3px; }
.is-selected .mov-item { border-color: var(--accent-green); background-color: var(--bg-input); }
/* Su desktop lo spazio del cestino e' riservato in permanenza: l'azione
   compare in dissolvenza al passaggio del mouse senza spostare la riga.
   Prima l'hover traslava l'intera riga di 80px, ed e' esattamente il
   movimento che si notava andando a cliccare una transazione. */
@media (hover: hover) and (pointer: fine) {
  .mov-item { margin-right: 44px; }
  .mov-delete {
    width: 44px;
    background: transparent;
    color: var(--text-muted);
    opacity: 0;
    transition: opacity 150ms ease, color 150ms ease;
  }
  .mov-delete span { display: none; }
  .mov-item-wrap:hover .mov-delete,
  .mov-item-wrap:focus-within .mov-delete { opacity: 1; }
  .mov-delete:hover { color: var(--negative); }
  .mov-delete:focus-visible { opacity: 1; outline: 2px solid var(--accent-green); outline-offset: -3px; }
}
@media (max-width: 380px) { .mov-item { padding: .75rem; gap: .5rem; } .mov-icon { width: 32px; height: 32px; } .mov-importo { font-size: .8125rem; } }
</style>
