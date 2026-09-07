<script setup>
import { loadCategorie, resetCategorie } from '@/utils/categorie';
import { ref, computed, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { useHelpStore } from '@/stores/help.store';
import { useNotificheStore } from '@/stores/notifiche.store';
import { useTheme } from '@/composables/useTheme';
import {
  NAV_ICON_MAP,
  resolveAppIcon,
  Home,
  ArrowLeftRight,
  TrendingUp,
  LayoutGrid,
  Settings,
  SunMoon,
  LogOut,
  ArrowDownCircle,
  ArrowUpCircle,
  Repeat2,
  CircleHelp,
} from '@/utils/appIcons';
import MovimentoForm from '@/components/movimenti/MovimentoForm.vue';
import HelpPanel from '@/components/help/HelpPanel.vue';
import NotificheBell from '@/components/notifiche/NotificheBell.vue';
import NotifichePanel from '@/components/notifiche/NotifichePanel.vue';
import WalltLogo from '@/components/common/WalltLogo.vue';
import BottomSheet from './BottomSheet.vue';
import { performLogout } from '@/utils/session';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
watch(() => authStore.token, async token => {
  resetCategorie();
  if (token) { try { await loadCategorie(); } catch { /* La pagina categorie permette di riprovare. */ } }
}, { immediate: true });
const uiStore = useUiStore();
const helpStore = useHelpStore();
const notificheStore = useNotificheStore();
const { mostraFormMovimento, tipoFormMovimento } = storeToRefs(uiStore);
const { mostraScommesse, mostraInvestimenti, canAccessScommesseFeature, canAccessInvestimentiFeature } = storeToRefs(authStore);
const { toggle: toggleTheme } = useTheme();

onUnmounted(() => {
  notificheStore.fermaPolling();
});

const actionSheetOpen = ref(false);
const funzionalitaSheetOpen = ref(false);

// Le preferenze della guida si leggono solo quando l'identità è nota,
// e vengono ricaricate al cambio utente.
watch(
  () => authStore.user?.id,
  (id) => helpStore.initForUser(id),
  { immediate: true },
);

// Il badge delle notifiche si aggiorna solo con un utente autenticato: il
// polling parte qui e viene fermato dal logout (utils/session.js).
watch(
  () => authStore.user?.id,
  (id) => {
    if (id) notificheStore.avviaPolling();
    else notificheStore.fermaPolling();
  },
  { immediate: true },
);

// Nessun pannello o sheet deve restare aperto sopra la pagina successiva.
watch(
  () => route.fullPath,
  () => {
    actionSheetOpen.value = false;
    funzionalitaSheetOpen.value = false;
    helpStore.closePanel();
    notificheStore.chiudiPanel();
  },
);

const iniziali = computed(() => {
  const nome = authStore.user?.nome || '?';
  return nome.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
});

const primoNome = computed(() => authStore.user?.nome?.split(' ')[0] || 'Utente');

const isActive = (path) => route.path === path || route.path.startsWith(path + '/');

const navItems = computed(() => {
  const items = [
    { path: '/dashboard', icon: NAV_ICON_MAP.dashboard, label: 'Dashboard' },
    { path: '/conti', icon: NAV_ICON_MAP.conti, label: 'I miei conti' },
    { path: '/movimenti', icon: NAV_ICON_MAP.movimenti, label: 'Movimenti' },
    { path: '/budget', icon: NAV_ICON_MAP.budget, label: 'Budget' },
  ];
  if (mostraScommesse.value) {
    items.push({ path: '/scommesse', icon: NAV_ICON_MAP.scommesse, label: 'Scommesse' });
  }
  if (mostraInvestimenti.value) {
    items.push({ path: '/investimenti', icon: NAV_ICON_MAP.investimenti, label: 'Investimenti' });
  }
  items.push(
    { path: '/obiettivi', icon: NAV_ICON_MAP.obiettivi, label: 'Obiettivi' },
    { path: '/analisi', icon: NAV_ICON_MAP.analisi, label: 'Analisi' },
  );
  return items;
});

const funzionalitaItems = computed(() => {
  const items = [
    { path: '/obiettivi', icon: NAV_ICON_MAP.obiettivi, label: 'Obiettivi', desc: 'Risparmi e traguardi' },
    { path: '/budget', icon: NAV_ICON_MAP.budget, label: 'Budget', desc: 'Pianifica le spese' },
  ];
  if (canAccessScommesseFeature.value) {
    items.push({ path: '/scommesse', icon: NAV_ICON_MAP.scommesse, label: 'Scommesse', desc: 'Piattaforme e movimenti' });
  }
  if (canAccessInvestimentiFeature.value) {
    items.push({ path: '/investimenti', icon: NAV_ICON_MAP.investimenti, label: 'Investimenti', desc: 'Portafoglio e rendimenti' });
  }
  items.push({ path: '/aiuto', icon: CircleHelp, label: 'Aiuto', desc: 'Guida e primi passi' });
  return items;
});

const isFunzionalitaActive = computed(() =>
  funzionalitaItems.value.some((item) => isActive(item.path)),
);

const isDashboard = computed(() => route.path === '/dashboard');

const mobileNav = [
  { path: '/dashboard', icon: Home, label: 'Home' },
  { path: '/movimenti', icon: ArrowLeftRight, label: 'Transazioni' },
  { path: '/analisi', icon: TrendingUp, label: 'Analisi' },
  { path: 'altro', icon: LayoutGrid, label: 'Funzionalità' },
  { path: '/impostazioni', icon: Settings, label: 'Impostazioni' },
];

const handleMobileNav = (item) => {
  if (item.path === 'altro') {
    funzionalitaSheetOpen.value = true;
  } else {
    router.push(item.path);
  }
};

const handleFunzionalitaNav = (path) => {
  funzionalitaSheetOpen.value = false;
  router.push(path);
};

const ACTION_SHEET_CLOSE_MS = 280;

const handleAction = (tipo) => {
  actionSheetOpen.value = false;
  window.setTimeout(() => {
    if (tipo === 'entrata') {
      uiStore.apriFormEntrata();
    } else if (tipo === 'uscita') {
      uiStore.apriFormUscita();
    } else if (tipo === 'trasferimento') {
      uiStore.apriFormTrasferimento();
    }
  }, ACTION_SHEET_CLOSE_MS);
};

const handleToggleTheme = () => toggleTheme();

const handleLogout = async () => {
  funzionalitaSheetOpen.value = false;
  await performLogout(router);
};
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar hidden md:flex">
      <div class="sidebar__logo">
        <router-link to="/dashboard" class="sidebar__logo-link">
          <WalltLogo :size="26" />
        </router-link>
      </div>

      <div class="sidebar__user">
        <div class="avatar">{{ iniziali }}</div>
        <span class="sidebar__name">Ciao, {{ primoNome }}</span>
      </div>

      <nav class="sidebar__nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="sidebar__link"
          :class="{ active: isActive(item.path) }"
        >
          <component :is="resolveAppIcon(item.icon)" class="sidebar__icon" :size="18" :stroke-width="1.75" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="sidebar__footer">
        <NotificheBell variante="sidebar" />
        <router-link to="/aiuto" class="sidebar__link" :class="{ active: isActive('/aiuto') }">
          <CircleHelp class="sidebar__icon" :size="18" :stroke-width="1.75" />
          <span>Aiuto</span>
        </router-link>
        <button class="sidebar__link" @click="handleToggleTheme">
          <SunMoon class="sidebar__icon" :size="18" :stroke-width="1.75" />
          <span>Tema</span>
        </button>
        <router-link to="/impostazioni" class="sidebar__link" :class="{ active: isActive('/impostazioni') }">
          <Settings class="sidebar__icon" :size="18" :stroke-width="1.75" />
          <span>Impostazioni</span>
        </router-link>
        <button class="sidebar__link sidebar__link--logout" @click="handleLogout">
          <LogOut class="sidebar__icon" :size="18" :stroke-width="1.75" />
          <span>Esci</span>
        </button>
      </div>
    </aside>

    <header v-if="!isDashboard" class="mobile-header">
      <router-link to="/dashboard" class="mobile-header__logo-link" aria-label="Vai alla Dashboard">
        <WalltLogo mark-only :size="30" />
      </router-link>
      <div class="mobile-header__azioni">
        <NotificheBell variante="compatta" />
        <button class="avatar avatar--sm" @click="router.push('/impostazioni')">
          {{ iniziali }}
        </button>
      </div>
    </header>

    <main class="main-content" :class="{ 'main-content--dashboard': isDashboard }">
      <router-view v-slot="{ Component, route: childRoute }">
        <component :is="Component" :key="childRoute.path" class="route-view" />
      </router-view>
    </main>

    <nav class="bottom-nav">
      <button
        v-for="item in mobileNav"
        :key="item.path"
        class="bottom-nav__item"
        :class="{
          active: item.path === 'altro' ? isFunzionalitaActive : isActive(item.path),
          'bottom-nav__item--funzioni': item.path === 'altro',
        }"
        @click="handleMobileNav(item)"
      >
        <span class="bottom-nav__icon-wrap">
          <component :is="resolveAppIcon(item.icon)" class="bottom-nav__icon-svg" :stroke-width="1.75" />
          <span v-if="item.path === 'altro'" class="bottom-nav__badge" />
        </span>
        <span v-if="item.label" class="bottom-nav__label">{{ item.label }}</span>
      </button>
    </nav>

    <BottomSheet :open="funzionalitaSheetOpen" title="Funzionalità" @close="funzionalitaSheetOpen = false">
      <div class="funz-grid">
        <button
          v-for="item in funzionalitaItems"
          :key="item.path"
          type="button"
          class="funz-grid__item"
          :class="{ 'funz-grid__item--active': isActive(item.path) }"
          @click="handleFunzionalitaNav(item.path)"
        >
          <component :is="resolveAppIcon(item.icon)" class="funz-grid__icon" :size="22" :stroke-width="1.75" />
          <span class="funz-grid__label">{{ item.label }}</span>
          <span class="funz-grid__desc">{{ item.desc }}</span>
        </button>
      </div>
    </BottomSheet>

    <BottomSheet :open="actionSheetOpen" title="Nuova operazione" @close="actionSheetOpen = false">
      <div class="action-grid">
        <button class="action-btn" @click="handleAction('entrata')">
          <ArrowDownCircle :size="20" :stroke-width="1.75" />
          <span>Entrata</span>
        </button>
        <button class="action-btn" @click="handleAction('uscita')">
          <ArrowUpCircle :size="20" :stroke-width="1.75" />
          <span>Uscita</span>
        </button>
        <button class="action-btn" @click="handleAction('trasferimento')">
          <Repeat2 :size="20" :stroke-width="1.75" />
          <span>Sposta</span>
        </button>
      </div>
    </BottomSheet>

    <MovimentoForm
      :open="mostraFormMovimento"
      :tipo="tipoFormMovimento"
      @close="uiStore.chiudiForm"
      @saved="uiStore.chiudiForm"
    />

    <!-- Istanza unica del pannello di aiuto contestuale per tutta l'app. -->
    <HelpPanel />

    <!-- Idem per il centro notifiche: una sola istanza, aperta dalla campanella. -->
    <NotifichePanel />
  </div>
</template>

<style scoped>
.app-layout { min-height: 100vh; background: var(--bg-primary); }
.sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 260px; background: var(--bg-secondary); border-right: 1px solid var(--border); flex-direction: column; padding: 0; z-index: 100; }
.sidebar__logo { padding: 24px; }
.sidebar__logo-link { display: inline-flex; text-decoration: none; }
.sidebar__user { display: flex; align-items: center; gap: 0.75rem; padding: 0 24px 24px; }
.sidebar__name { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); }
.avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--accent-light); color: var(--accent-green); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.875rem; border: none; cursor: pointer; }
.avatar--sm { width: 36px; height: 36px; font-size: 0.75rem; }
.sidebar__nav { flex: 1; padding: 0 12px; display: flex; flex-direction: column; gap: 2px; }
.sidebar__link { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 12px; border-radius: var(--radius-md); color: var(--text-secondary); text-decoration: none; font-size: 0.875rem; transition: all 0.2s; border: none; background: none; cursor: pointer; width: 100%; text-align: left; min-height: 44px; }
.sidebar__link:hover { color: var(--text-primary); background: var(--sidebar-hover-bg); }
.sidebar__link.active { background: var(--sidebar-active-bg); border-left: 3px solid var(--accent-green); color: var(--accent-green); }
.sidebar__link.active .sidebar__icon { color: var(--accent-green); }
.sidebar__icon { flex-shrink: 0; color: currentColor; stroke: currentColor; }
.sidebar__link--logout { color: var(--negative); margin-top: 0.25rem; }
.sidebar__link--logout:hover { color: var(--negative); background: rgba(255, 71, 87, 0.1); }
.sidebar__footer { padding: 16px 12px 24px; border-top: 1px solid var(--border); }
.mobile-header { position: fixed; top: 0; left: 0; right: 0; height: 60px; background: var(--bg-secondary); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 1rem; z-index: 100; }
.mobile-header__logo-link { display: inline-flex; }
.mobile-header__azioni { display: flex; align-items: center; gap: 0.25rem; }
.main-content { min-height: 100vh; padding: 76px 1rem calc(96px + env(safe-area-inset-bottom, 0px)); overflow-x: hidden; background: var(--bg-primary); }
.main-content--dashboard { padding-top: 1rem; }
.route-view { min-height: 1px; width: 100%; }
@media (min-width: 768px) {
  .mobile-header,
  .bottom-nav {
    display: none !important;
  }

  .main-content {
    margin-left: 260px;
    padding: 32px;
    padding-bottom: 32px;
    max-width: calc(260px + 1200px);
  }

  .main-content--dashboard {
    padding-top: 32px;
  }
}
.bottom-nav {
  position: fixed;
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  left: 12px;
  right: 12px;
  height: auto;
  padding: 8px 6px 10px;
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: 24px;
  box-shadow: var(--glass-shadow);
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  z-index: 100;
}
.bottom-nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--nav-item);
  cursor: pointer;
  padding: 6px 10px;
  min-width: 56px;
  min-height: 48px;
  font-size: 0.625rem;
  font-weight: 500;
  transition: color 300ms ease-out;
}
.bottom-nav__item.active {
  color: var(--accent-green);
}
.bottom-nav__item.active .bottom-nav__icon-wrap {
  background: var(--nav-active-bg);
  border-radius: 14px;
  box-shadow: 0 0 14px var(--nav-active-glow);
}
.bottom-nav__item.active .bottom-nav__icon-svg {
  filter: drop-shadow(0 0 6px rgba(0, 212, 170, 0.45));
}
.bottom-nav__icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 34px;
  transition: background 300ms ease-out, box-shadow 300ms ease-out;
}
.bottom-nav__icon-svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
}
.bottom-nav__label { line-height: 1.2; letter-spacing: 0.01em; }
.bottom-nav__badge {
  position: absolute;
  top: 2px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-green);
  box-shadow: 0 0 6px rgba(0, 212, 170, 0.6);
}
.action-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
.action-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 1.25rem 0.5rem; border-radius: var(--radius-md); background: var(--bg-input); border: 1px solid var(--border); color: var(--text-primary); font-size: 0.875rem; cursor: pointer; min-height: 44px; }
.action-btn svg { color: var(--accent-green); stroke: currentColor; }
.funz-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
.funz-grid__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid var(--border);
  background: var(--surface-subtle);
  cursor: pointer;
  text-align: left;
  transition: background 300ms ease-out, border-color 300ms ease-out;
  min-height: 88px;
}
.funz-grid__item:hover {
  background: var(--surface-hover);
  border-color: rgba(0, 168, 132, 0.25);
}
.funz-grid__item--active {
  border-color: rgba(0, 168, 132, 0.35);
  background: var(--sidebar-active-bg);
}
.funz-grid__icon { color: var(--text-secondary); stroke: currentColor; }
.funz-grid__item--active .funz-grid__icon { color: var(--accent-green); filter: drop-shadow(0 0 6px rgba(0, 212, 170, 0.35)); }
.funz-grid__label { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); }
.funz-grid__desc { font-size: 0.6875rem; color: var(--text-muted); line-height: 1.3; }
</style>
