<script setup>
import { useRouter } from 'vue-router';
import { Download } from '@/utils/appIcons';

defineProps({
  message: {
    type: String,
    default: 'Carica il CSV o l\'Excel dalla tua banca',
  },
});

const router = useRouter();

const goToImport = () => router.push('/importa');
</script>

<template>
  <button type="button" class="import-hint" @click="goToImport">
    <span class="import-hint__icon" aria-hidden="true">
      <Download :size="16" :stroke-width="1.75" />
    </span>
    <span class="import-hint__text">
      <span class="import-hint__title">Importa estratto conto</span>
      <span class="import-hint__desc">{{ message }}</span>
    </span>
    <span class="import-hint__arrow" aria-hidden="true">→</span>
  </button>
</template>

<style scoped>
.import-hint {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  border-radius: var(--radius-md);
  border: 1px dashed var(--border);
  background: var(--surface-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.import-hint:hover {
  background: var(--accent-light);
  border-color: rgba(0, 168, 132, 0.25);
  color: var(--text-primary);
}

.import-hint__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent-light);
  color: var(--accent-green);
}

.import-hint__icon svg {
  stroke: currentColor;
}

.import-hint__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.import-hint__title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.import-hint__desc {
  font-size: 0.6875rem;
  color: var(--text-muted);
  line-height: 1.3;
}

.import-hint:hover .import-hint__desc {
  color: var(--text-secondary);
}

.import-hint__arrow {
  flex-shrink: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
  transition: transform 0.2s ease, color 0.2s ease;
}

.import-hint:hover .import-hint__arrow {
  color: var(--accent-green);
  transform: translateX(2px);
}
</style>
