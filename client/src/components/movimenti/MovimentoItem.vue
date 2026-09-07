<script>
import { ref } from 'vue';

// Vive a livello di modulo, non di istanza: e' cio' che rende esclusiva
// l'apertura. Dentro <script setup> ogni riga avrebbe avuto la propria copia.
export const rigaAperta = ref(null);
</script>

<script setup>
import { watch } from 'vue';
import { useValuta } from '@/composables/useValuta';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { Repeat2, RefreshCw } from '@/utils/appIcons';
import { Trash2 } from 'lucide-vue-next';
import { decidiAsse, calcolaOffset, assestaOffset } from './swipeGesture';

const props = defineProps({
  movimento: { type: Object, required: true },
  catInfo: { type: Object, default: () => ({ nome: '', colore: '#95A5A6' }) },
  selected: { type: Boolean, default: false },
});

const emit = defineEmits(['click', 'delete']);
const { formatValuta } = useValuta();

// Una sola riga aperta alla volta in tutta la lista: aprendone un'altra la
// precedente si richiude da sola, come nelle liste native iOS.

const offsetX = ref(0);
const dragging = ref(false);
let startX = 0;
let startY = 0;
let startOffset = 0;
let asse = null; // null = da decidere, 'x' = trascinamento, 'y' = scroll

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

const chiudi = () => {
  offsetX.value = 0;
  if (rigaAperta.value === props.movimento.id) rigaAperta.value = null;
};

// Se viene aperta un'altra riga, questa si richiude.
watch(rigaAperta, (id) => {
  if (id !== props.movimento.id && offsetX.value !== 0) offsetX.value = 0;
});

const onTouchStart = (e) => {
  const t = e.touches[0];
  startX = t.clientX;
  startY = t.clientY;
  startOffset = offsetX.value;
  asse = null;
  dragging.value = false;
};

const onTouchMove = (e) => {
  const t = e.touches[0];
  const dx = t.clientX - startX;
  const dy = t.clientY - startY;

  if (asse === null) {
    // Decisione presa una volta sola per gesto: senza questo, una deriva
    // orizzontale del pollice durante lo scroll faceva scivolare le righe.
    asse = decidiAsse(dx, dy);
    if (asse === null) return;
    if (asse === 'x') dragging.value = true;
  }

  if (asse !== 'x') return;
  offsetX.value = calcolaOffset(startOffset, dx);
};

const onTouchEnd = () => {
  if (asse === 'x') {
    const { offset, aperta } = assestaOffset(offsetX.value);
    offsetX.value = offset;
    rigaAperta.value = aperta ? props.movimento.id : null;
  }
  asse = null;
  dragging.value = false;
};

const onTouchCancel = () => {
  // Chiamata in arrivo o gesture di sistema: senza questo la riga restava
  // a meta' corsa e il gesto successivo ripartiva da uno stato sporco.
  offsetX.value = startOffset;
  asse = null;
  dragging.value = false;
};

const handleDelete = () => {
  if (confirm('Eliminare questo movimento?')) {
    emit('delete', props.movimento);
  }
  chiudi();
};

const handleClick = () => {
  // Riga aperta o gesto appena concluso: il tocco richiude, non apre il
  // dettaglio. Evita l'apertura involontaria a fine trascinamento.
  if (offsetX.value !== 0) {
    chiudi();
    return;
  }
  // Aprendo il dettaglio si richiude una eventuale riga rimasta scoperta
  // altrove nella lista, che resterebbe aperta sotto al dialog.
  rigaAperta.value = null;
  emit('click', props.movimento);
};
</script>

<template>
  <div class="mov-item-wrap" :class="{ 'is-selected': selected }">
    <button class="mov-delete" :aria-label="`Elimina ${movimento.descrizione || catInfo.nome}`" @click.stop="handleDelete"><Trash2 :size="16" :stroke-width="1.75" aria-hidden="true" /><span>Elimina</span></button>
    <div
      class="mov-item"
      :class="{ 'is-dragging': dragging }"
      role="button"
      :tabindex="movimento.tipo === 'trasferimento' ? -1 : 0"
      :aria-disabled="movimento.tipo === 'trasferimento'"
      :aria-expanded="selected"
      :style="{ transform: `translateX(${offsetX}px)` }"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchCancel"
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
  /* Il trascinamento non deve propagarsi allo scroll della pagina. */
  overscroll-behavior-x: contain;
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
  /* Il browser gestisce da solo lo scorrimento verticale; solo il gesto
     orizzontale arriva a noi. Senza questo, scorrendo la lista il pollice
     trascinava anche le righe. */
  touch-action: pan-y;
  -webkit-user-select: none;
  user-select: none;
}

/* Durante il trascinamento la riga deve seguire il dito: con la transizione
   attiva inseguiva con 200ms di ritardo, dando la sensazione di elastico. */
.mov-item.is-dragging { transition: none; }

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
