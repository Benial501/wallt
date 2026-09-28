<script setup>
import BottomSheet from '@/components/layout/BottomSheet.vue';
import { ArrowDownCircle, ArrowUpCircle, Repeat2 } from '@/utils/appIcons';

defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'select']);

const opzioni = [
  { tipo: 'entrata', etichetta: 'Entrata', descrizione: 'Denaro ricevuto', icona: ArrowDownCircle },
  { tipo: 'uscita', etichetta: 'Uscita', descrizione: 'Spesa o pagamento', icona: ArrowUpCircle },
  { tipo: 'trasferimento', etichetta: 'Trasferimento', descrizione: 'Tra i tuoi conti', icona: Repeat2 },
];
</script>

<template>
  <BottomSheet :open="open" title="Nuovo movimento" @close="emit('close')">
    <div class="scelta-tipo">
      <button
        v-for="opzione in opzioni"
        :key="opzione.tipo"
        type="button"
        class="scelta-tipo__opzione"
        @click="emit('select', opzione.tipo)"
      >
        <component :is="opzione.icona" class="scelta-tipo__icona" :size="22" :stroke-width="1.75" aria-hidden="true" />
        <span class="scelta-tipo__testi">
          <span class="scelta-tipo__etichetta">{{ opzione.etichetta }}</span>
          <span class="scelta-tipo__descrizione">{{ opzione.descrizione }}</span>
        </span>
      </button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.scelta-tipo {
  display: grid;
  gap: 0.625rem;
}

.scelta-tipo__opzione {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  width: 100%;
  min-height: 3.5rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-md);
  background: var(--glass-interactive-bg);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}

.scelta-tipo__opzione:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-strong);
}

.scelta-tipo__opzione:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.scelta-tipo__icona {
  flex: 0 0 auto;
  color: var(--accent-text);
}

.scelta-tipo__testi {
  display: grid;
  gap: 0.125rem;
}

.scelta-tipo__etichetta {
  font-size: var(--text-base);
  font-weight: 650;
}

.scelta-tipo__descrizione {
  color: var(--text-secondary);
  font-size: var(--text-xs);
}
</style>
