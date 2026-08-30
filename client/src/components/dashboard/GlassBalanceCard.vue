<script setup>
import { ref, computed } from 'vue';
import WSkeleton from '@/components/common/WSkeleton.vue';
import { useNumberCounter } from '@/composables/useNumberCounter';
import { useValuta } from '@/composables/useValuta';

const props = defineProps({
  patrimonio: { type: Number, default: 0 },
  entrate: { type: Number, default: 0 },
  uscite: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
});

const { formatValuta, simbolo } = useValuta();
const nascosto = ref(false);

const patrimonioTarget = computed(() => props.patrimonio || 0);
const { displayValue: animatedPatrimonio, elRef } = useNumberCounter(patrimonioTarget, { duration: 900 });
</script>

<template>
  <div ref="elRef" class="glass-balance animate-slide-up">
    <template v-if="loading">
      <WSkeleton type="text" :lines="4" />
    </template>

    <template v-else>
      <div class="glass-balance__top">
        <span class="glass-balance__label">Patrimonio Totale</span>
        <button
          type="button"
          class="glass-balance__edit"
          :aria-label="nascosto ? 'Mostra importo' : 'Nascondi importo'"
          @click="nascosto = !nascosto"
        >
          <svg v-if="!nascosto" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </svg>
        </button>
      </div>

      <p class="glass-balance__amount tabular-nums">
        {{ nascosto ? `${simbolo} ••••••` : formatValuta(animatedPatrimonio) }}
      </p>

      <div class="glass-balance__cols">
        <div class="glass-balance__col">
          <span class="glass-balance__col-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            Entrate
          </span>
          <span class="glass-balance__col-val tabular-nums income">{{ formatValuta(entrate) }}</span>
        </div>
        <div class="glass-balance__divider" />
        <div class="glass-balance__col">
          <span class="glass-balance__col-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            Uscite
          </span>
          <span class="glass-balance__col-val tabular-nums expense">{{ formatValuta(uscite) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.glass-balance {
  width: 100%;
  padding: 1.5rem;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.glass-balance__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.glass-balance__label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #94A3B8;
  letter-spacing: 0.02em;
}

.glass-balance__edit {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #94A3B8;
  cursor: pointer;
  transition: color 300ms ease-out, background 300ms ease-out;
}

.glass-balance__edit:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.glass-balance__amount {
  font-size: clamp(2rem, 8vw, 2.75rem);
  font-weight: 800;
  color: #fff;
  line-height: 1.1;
  margin-bottom: 1.25rem;
  letter-spacing: -0.02em;
}

.glass-balance__cols {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1rem;
  align-items: center;
}

.glass-balance__divider {
  width: 1px;
  height: 40px;
  background: rgba(255, 255, 255, 0.08);
}

.glass-balance__col-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: #94A3B8;
  margin-bottom: 0.25rem;
}

.glass-balance__col-val {
  display: block;
  font-size: 1.0625rem;
  font-weight: 700;
}

.glass-balance__col-val.income { color: #10B981; }
.glass-balance__col-val.expense { color: #EF4444; }

.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>
