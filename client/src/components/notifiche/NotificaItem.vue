<script setup>
import { computed } from 'vue';
import { NOTIFICA_ICON_MAP, resolveAppIcon, Bell } from '@/utils/appIcons';

/**
 * Riga singola del centro notifiche. Distingue visivamente letta/non letta e
 * apre la pagina collegata al clic.
 */
const props = defineProps({
  notifica: { type: Object, required: true },
});

const emit = defineEmits(['apri']);

const icona = computed(() => resolveAppIcon(NOTIFICA_ICON_MAP[props.notifica.tipo] || Bell));
const urgente = computed(() => props.notifica.priorita === 'urgente');

const MINUTO = 60_000;
const ORA = 60 * MINUTO;
const GIORNO = 24 * ORA;

/** Data relativa leggibile, senza dipendere da dayjs in questo componente. */
const quando = computed(() => {
  const data = new Date(props.notifica.programmata_per || props.notifica.createdAt);
  const diff = Date.now() - data.getTime();

  if (diff < MINUTO) return 'Adesso';
  if (diff < ORA) return `${Math.floor(diff / MINUTO)} min fa`;
  if (diff < GIORNO) return `${Math.floor(diff / ORA)} h fa`;
  if (diff < 2 * GIORNO) return 'Ieri';
  if (diff < 7 * GIORNO) return `${Math.floor(diff / GIORNO)} giorni fa`;

  return data.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
});
</script>

<template>
  <button
    type="button"
    class="notifica"
    :class="{ 'notifica--non-letta': !notifica.letta }"
    @click="emit('apri', notifica)"
  >
    <span class="notifica__icona" :class="{ 'notifica__icona--urgente': urgente }">
      <component :is="icona" :size="18" :stroke-width="1.75" />
    </span>

    <span class="notifica__corpo">
      <span class="notifica__titolo">{{ notifica.titolo }}</span>
      <span class="notifica__messaggio">{{ notifica.messaggio }}</span>
      <span class="notifica__meta">{{ quando }}</span>
    </span>

    <span v-if="!notifica.letta" class="notifica__punto" aria-label="Non letta" />
  </button>
</template>

<style scoped>
.notifica {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  padding: 0.875rem;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 200ms ease-out;
  min-height: 44px;
}

.notifica:hover {
  background: var(--surface-hover, var(--bg-card-hover));
}

.notifica--non-letta {
  background: var(--surface-subtle);
}

.notifica__icona {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--accent-light, var(--surface-subtle));
  color: var(--accent-green);
}

.notifica__icona--urgente {
  background: rgba(255, 71, 87, 0.12);
  color: var(--negative);
}

.notifica__corpo {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  flex: 1;
}

.notifica__titolo {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.notifica--non-letta .notifica__titolo {
  font-weight: 700;
}

.notifica__messaggio {
  font-size: 0.8125rem;
  line-height: 1.35;
  color: var(--text-secondary);
}

.notifica__meta {
  font-size: 0.6875rem;
  color: var(--text-muted);
  margin-top: 0.125rem;
}

.notifica__punto {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 0.5rem;
  border-radius: 50%;
  background: var(--accent-green);
}
</style>
