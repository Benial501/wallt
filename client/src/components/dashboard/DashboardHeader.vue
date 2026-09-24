<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { CircleHelp } from '@/utils/appIcons';
import WalltLogo from '@/components/common/WalltLogo.vue';
import NotificheBell from '@/components/notifiche/NotificheBell.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';

const authStore = useAuthStore();
const router = useRouter();

const primoNome = computed(() => authStore.user?.nome?.split(' ')[0] || 'Utente');
</script>

<template>
  <header class="dashboard-header">
    <div class="dashboard-header__brand">
      <WalltLogo mark-only :size="30" />
    </div>

    <div class="dashboard-header__greeting">
      <span class="dashboard-header__hello">Ciao, </span>
      <span class="dashboard-header__name">{{ primoNome }}</span>
    </div>

    <NotificheBell variante="compatta" />

    <button
      type="button"
      class="dashboard-header__avatar-wrap"
      aria-label="Impostazioni account"
      @click="router.push('/impostazioni')"
    >
      <UserAvatar :user="authStore.user" :size="36" tono="neutro" :iniziali-max="1" />
      <span class="dashboard-header__online" aria-hidden="true" />
    </button>
  </header>
</template>

<style scoped>
.dashboard-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 1rem;
}

@media (min-width: 768px) {
  .dashboard-header {
    display: none;
  }
}

.dashboard-header__brand {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.dashboard-header__greeting {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  text-align: right;
  font-size: 0.9375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dashboard-header__aiuto-link {
  color: var(--text-secondary);
  transition: color var(--dur-fast) var(--ease-out);
  display: flex;
  align-items: center;
}

.dashboard-header__aiuto-link:hover {
  color: var(--text-primary);
}

.dashboard-header__hello {
  color: var(--text-subtle);
  font-weight: 400;
}

.dashboard-header__name {
  color: var(--text-primary);
  font-weight: 700;
}

.dashboard-header__avatar-wrap {
  position: relative;
  display: flex;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.dashboard-header__avatar-wrap:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring-tight);
}

.dashboard-header__online {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--positive);
  border: 2px solid var(--bg-primary);
}
</style>
