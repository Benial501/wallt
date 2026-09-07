<script setup>
import { storeToRefs } from 'pinia';
import { useNotificheStore } from '@/stores/notifiche.store';
import { Bell } from '@/utils/appIcons';

/**
 * Campanella con badge dei non letti.
 * `variante` adatta l'aspetto al contenitore: voce di sidebar o icona
 * compatta nell'header mobile.
 */
defineProps({
  variante: {
    type: String,
    default: 'sidebar',
    validator: (v) => ['sidebar', 'compatta'].includes(v),
  },
});

const notificheStore = useNotificheStore();
const { nonLette, badge, haNonLette, panelOpen } = storeToRefs(notificheStore);

const toggle = () => {
  if (panelOpen.value) notificheStore.chiudiPanel();
  else notificheStore.apriPanel();
};

const etichetta = () => (nonLette.value > 0
  ? `Notifiche, ${nonLette.value} non lette`
  : 'Notifiche');
</script>

<template>
  <button
    type="button"
    class="campanella"
    :class="[`campanella--${variante}`, { 'campanella--attiva': panelOpen }]"
    :aria-label="etichetta()"
    :aria-expanded="panelOpen"
    @click="toggle"
  >
    <span class="campanella__icona">
      <Bell :size="variante === 'sidebar' ? 18 : 20" :stroke-width="1.75" />
      <span v-if="haNonLette" class="campanella__badge">{{ badge }}</span>
    </span>
    <span v-if="variante === 'sidebar'" class="campanella__label">Notifiche</span>
  </button>
</template>

<style scoped>
.campanella {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 200ms ease-out, background 200ms ease-out;
}

.campanella--sidebar {
  width: 100%;
  padding: 0.75rem 12px;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  text-align: left;
  min-height: 44px;
}

.campanella--sidebar:hover,
.campanella--sidebar.campanella--attiva {
  color: var(--text-primary);
  background: var(--sidebar-hover-bg);
}

.campanella--compatta {
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
}

.campanella--compatta:hover,
.campanella--compatta.campanella--attiva {
  background: var(--surface-subtle);
  color: var(--text-primary);
}

.campanella__icona {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.campanella__icona svg { stroke: currentColor; }

.campanella__badge {
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--negative);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.campanella__label { flex: 1; }
</style>
