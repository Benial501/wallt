<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import WSkeleton from '@/components/common/WSkeleton.vue';
import ImportEstrattoHint from '@/components/common/ImportEstrattoHint.vue';
import { useValuta } from '@/composables/useValuta';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { getCategoriaEntrata, getCategoriaUscita } from '@/utils/categorie';
import dayjs from 'dayjs';

const props = defineProps({
  movimenti: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['select']);
const router = useRouter();
const { formatValuta } = useValuta();

const getCatInfo = (mov) => {
  if (mov.tipo === 'entrata') return getCategoriaEntrata(mov.categoria) || { nome: 'Entrata' };
  if (mov.tipo === 'uscita') return getCategoriaUscita(mov.categoria) || { nome: 'Uscita' };
  return { nome: 'Trasferimento' };
};

const formatData = (mov) => {
  if (mov.dataLabel) return mov.dataLabel;
  const d = dayjs(mov.data);
  const oggi = dayjs();
  if (d.isSame(oggi, 'day')) return 'Oggi';
  if (d.isSame(oggi.subtract(1, 'day'), 'day')) return 'Ieri';
  return d.format('D MMM');
};

const importoDisplay = (mov) => {
  const val = formatValuta(mov.importo);
  if (mov.tipo === 'entrata') return `+${val}`;
  if (mov.tipo === 'uscita') return `-${val}`;
  return val;
};

const importoClass = (tipo) => {
  if (tipo === 'entrata') return 'income';
  if (tipo === 'uscita') return 'expense';
  return 'neutral';
};

const hasMovimenti = computed(() => props.movimenti.length > 0);
</script>

<template>
  <section class="recent-tx">
    <div class="recent-tx__header">
      <h2 class="recent-tx__title">Transazioni recenti</h2>
      <button type="button" class="recent-tx__link" @click="router.push('/movimenti')">
        Vedi tutte
      </button>
    </div>

    <div v-if="loading" class="recent-tx__list">
      <WSkeleton v-for="i in 3" :key="i" type="card" class="recent-tx__skeleton" />
    </div>

    <div v-else-if="hasMovimenti" class="recent-tx__list">
      <button
        v-for="(mov, i) in movimenti"
        :key="mov.id"
        type="button"
        class="recent-tx__item stagger-item"
        :style="{ animationDelay: `${i * 50}ms` }"
        @click="emit('select', mov)"
      >
        <div class="recent-tx__avatar" :class="`recent-tx__avatar--${mov.tipo}`">
          <CategoryIcon :movimento="mov" :size="18" />
        </div>
        <div class="recent-tx__info">
          <p class="recent-tx__name">{{ mov.descrizione || getCatInfo(mov).nome }}</p>
          <p class="recent-tx__cat">{{ getCatInfo(mov).nome }}</p>
        </div>
        <div class="recent-tx__amount-wrap">
          <p class="recent-tx__amount tabular-nums" :class="importoClass(mov.tipo)">
            {{ importoDisplay(mov) }}
          </p>
          <p class="recent-tx__date">{{ formatData(mov) }}</p>
        </div>
      </button>
    </div>

    <div v-else class="recent-tx__empty">
      <p class="recent-tx__empty-title">Nessuna transazione</p>
      <p class="recent-tx__empty-hint">
        Importa l'estratto conto o aggiungi un movimento manualmente: qui compariranno le ultime transazioni registrate in WALLT.
      </p>
      <ImportEstrattoHint
        class="recent-tx__import-hint"
        message="CSV, Excel o PDF — Intesa, Revolut, Poste e altri formati"
      />
      <button type="button" class="recent-tx__manual-link" @click="router.push({ path: '/movimenti', query: { action: 'uscita' } })">
        Oppure aggiungi una transazione manualmente →
      </button>
    </div>
  </section>
</template>

<style scoped>
.recent-tx {
  margin-top: 1.5rem;
}

.recent-tx__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.875rem;
}

.recent-tx__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.recent-tx__link {
  background: none;
  border: none;
  color: var(--text-link);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
}

.recent-tx__list {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.recent-tx__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.875rem 1rem;
  border-radius: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  cursor: pointer;
  text-align: left;
  transition: background 300ms ease-out, transform 300ms ease-out;
  box-shadow: var(--shadow-sm);
}

.recent-tx__item:hover {
  background: var(--bg-card-hover);
}

.recent-tx__item:active {
  transform: scale(0.99);
}

.recent-tx__avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--surface-inset);
  color: var(--text-primary);
}

.recent-tx__avatar--entrata {
  background: rgba(5, 150, 105, 0.12);
  color: var(--positive);
}

.recent-tx__avatar--uscita {
  background: rgba(220, 38, 38, 0.1);
  color: var(--negative);
}

.recent-tx__info {
  flex: 1;
  min-width: 0;
}

.recent-tx__name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-tx__cat {
  font-size: 0.75rem;
  color: var(--text-subtle);
  margin-top: 0.125rem;
}

.recent-tx__amount-wrap {
  text-align: right;
  flex-shrink: 0;
}

.recent-tx__amount {
  font-size: 0.9375rem;
  font-weight: 700;
}

.recent-tx__amount.income { color: var(--positive); }
.recent-tx__amount.expense { color: var(--negative); }
.recent-tx__amount.neutral { color: var(--text-subtle); }

.recent-tx__date {
  font-size: 0.6875rem;
  color: var(--text-muted);
  margin-top: 0.125rem;
}

.recent-tx__empty {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem 0 0.5rem;
}

.recent-tx__empty-title {
  text-align: center;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.recent-tx__empty-hint {
  text-align: center;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-secondary);
  max-width: 320px;
  margin: 0 auto;
}

.recent-tx__import-hint {
  margin-top: 0.25rem;
}

.recent-tx__manual-link {
  align-self: center;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.25rem 0;
  font-family: inherit;
}

.recent-tx__manual-link:hover {
  color: var(--text-link);
}

.recent-tx__skeleton {
  height: 72px;
  border-radius: 16px;
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>
