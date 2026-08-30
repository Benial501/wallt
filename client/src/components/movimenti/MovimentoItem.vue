<script setup>
import { ref } from 'vue';
import { useValuta } from '@/composables/useValuta';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { Repeat2, RefreshCw } from '@/utils/appIcons';

const props = defineProps({
  movimento: { type: Object, required: true },
  catInfo: { type: Object, default: () => ({ nome: '', colore: '#95A5A6' }) },
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
  <div class="mov-item-wrap stagger-item">
    <button class="mov-delete" @click.stop="handleDelete">Elimina</button>
    <div
      class="mov-item"
      :style="{ transform: `translateX(${offsetX}px)` }"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend="onTouchEnd"
      @click="handleClick"
    >
      <div class="mov-icon" :style="{ background: `${catInfo.colore}22`, color: catInfo.colore }">
        <CategoryIcon :movimento="movimento" :size="20" />
      </div>
      <div class="mov-info">
        <div class="mov-cat-row">
          <p class="mov-cat">{{ catInfo.nome }}</p>
          <span
            v-if="movimento.categoria_automatica && !movimento.categoria_modificata && movimento.categoria_confidenza !== null && movimento.categoria_confidenza < 60"
            class="badge badge--conf-low"
            title="Categoria assegnata automaticamente con bassa confidenza"
          >
            Conf. bassa
          </span>
        </div>
        <p v-if="movimento.descrizione" class="mov-desc">{{ movimento.descrizione }}</p>
        <p class="mov-conto">{{ movimento.conto?.nome }}</p>
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
  border-radius: var(--radius-md);
  margin-bottom: 0.375rem;
}

.mov-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem;
  min-height: 44px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: transform 0.2s ease;
  position: relative;
  z-index: 1;
}

.mov-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.125rem;
  flex-shrink: 0;
}

.mov-info { flex: 1; min-width: 0; }
.mov-cat { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); }
.mov-cat-row { display: flex; align-items: center; gap: 0.5rem; }
.mov-desc { font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mov-conto { font-size: 0.6875rem; color: var(--text-muted); }
.mov-right { display: flex; align-items: center; gap: 0.375rem; flex-shrink: 0; }
.mov-importo { font-size: 0.9375rem; font-weight: 600; }
.mov-importo.neutral { color: var(--text-secondary); }
.positive { color: var(--positive); }
.negative { color: var(--negative); }
.badge { font-size: 0.75rem; color: var(--text-muted); display: inline-flex; align-items: center; }
.badge--icon svg { stroke: currentColor; }
.badge--conf-low { color: #fff; background: rgba(255, 71, 87, 0.85); border: 1px solid rgba(255, 71, 87, 0.3); padding: 0.25rem 0.45rem; border-radius: 999px; }

.mov-delete {
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

@media (min-width: 768px) {
  .mov-item-wrap:hover .mov-item { transform: translateX(-80px); }
}
</style>
