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
import UserAvatar from '@/components/common/UserAvatar.vue';
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
        <UserAvatar :user="authStore.user" :size="40" />
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
        <button
          type="button"
          class="avatar-btn"
          aria-label="Impostazioni account"
          @click="router.push('/impostazioni')"
        >
          <UserAvatar :user="authStore.user" :size="36" />
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
/* Il fondo non viene ridipinto qui: lo sfondo ambientale vive su body e le
   superfici in vetro sopra devono avere qualcosa da rifrangere. */
.app-layout { min-height: 100vh; background: transparent; }

/* --- Sidebar: vetro "chrome" ------------------------------------------- */
.sidebar {
  position: fixed; left: 0; top: 0; bottom: 0; width: 260px;
  background: var(--glass-chrome-bg);
  backdrop-filter: blur(var(--blur-lg)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--blur-lg)) saturate(var(--glass-saturate));
  border-right: 1px solid var(--glass-chrome-border);
  flex-direction: column; padding: 0; z-index: 100;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .sidebar { background: var(--glass-chrome-solid); }
}
.sidebar__logo { padding: 24px 24px 20px; }
.sidebar__logo-link { display: inline-flex; text-decoration: none; border-radius: var(--radius-sm); }
.sidebar__user {
  display: flex; align-items: center; gap: 0.75rem;
  margin: 0 12px 16px; padding: 10px 12px;
  border-radius: var(--radius-lg);
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
}
.sidebar__name { font-size: 0.875rem; font-weight: 550; letter-spacing: var(--tracking-tight); color: var(--text-primary); }
.avatar-btn { display: flex; padding: 0; background: none; border: none; cursor: pointer; border-radius: 50%; }
.sidebar__nav { flex: 1; padding: 0 12px; display: flex; flex-direction: column; gap: 2px; }
.sidebar__link {
  position: relative;
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.6875rem 12px; border-radius: var(--radius-md);
  color: var(--text-secondary); text-decoration: none;
  font-size: 0.875rem; font-weight: 500; letter-spacing: var(--tracking-tight);
  border: none; background: none; cursor: pointer; width: 100%; text-align: left; min-height: 44px;
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
@media (hover: hover) {
  .sidebar__link:hover { color: var(--text-primary); background: var(--sidebar-hover-bg); }
}
.sidebar__link:active { transform: scale(0.99); }
/* La voce attiva non sposta piu' il testo: il segno e' una barretta
   posizionata in assoluto, non un bordo che ruba 3px al padding. */
.sidebar__link.active { background: var(--sidebar-active-bg); color: var(--accent-green); font-weight: 600; }
.sidebar__link.active::before {
  content: '';
  position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 3px; height: 18px; border-radius: var(--radius-pill);
  background: var(--accent-green);
}
.sidebar__link.active .sidebar__icon { color: var(--accent-green); }
.sidebar__icon { flex-shrink: 0; color: currentColor; stroke: currentColor; }
.sidebar__link--logout { color: var(--negative); margin-top: 0.25rem; }
@media (hover: hover) {
  .sidebar__link--logout:hover { color: var(--negative); background: color-mix(in srgb, var(--negative) 12%, transparent); }
}
.sidebar__footer { padding: 12px 12px 24px; border-top: 1px solid var(--divider); }

/* --- Header mobile: vetro "chrome" -------------------------------------- */
.mobile-header {
  position: fixed; top: 0; left: 0; right: 0; height: 60px;
  background: var(--glass-chrome-bg);
  backdrop-filter: blur(var(--blur-lg)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--blur-lg)) saturate(var(--glass-saturate));
  border-bottom: 1px solid var(--glass-chrome-border);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 1rem; z-index: 100;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .mobile-header { background: var(--glass-chrome-solid); }
}
.mobile-header__logo-link { display: inline-flex; border-radius: var(--radius-sm); }
.mobile-header__azioni { display: flex; align-items: center; gap: 0.25rem; }
.main-content { min-height: 100vh; padding: 76px 1rem calc(96px + env(safe-area-inset-bottom, 0px)); overflow-x: hidden; background: transparent; }
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

/* --- Bottom nav: isola in vetro sospesa --------------------------------- */
.bottom-nav {
  position: fixed;
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  left: 12px;
  right: 12px;
  height: auto;
  padding: 8px 6px 10px;
  background: var(--glass-elevated-bg);
  backdrop-filter: blur(var(--blur-xl)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--blur-xl)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-elevated-border);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-lg), var(--glass-highlight);
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  z-index: 100;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .bottom-nav { background: var(--glass-elevated-solid); }
}
.bottom-nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: none;
  border: none;
  color: var(--nav-item);
  cursor: pointer;
  padding: 4px 8px;
  min-width: 56px;
  min-height: 48px;
  font-size: 0.625rem;
  font-weight: 550;
  letter-spacing: var(--tracking-normal);
  transition: color var(--dur-base) var(--ease-out);
}
.bottom-nav__item.active {
  color: var(--accent-green);
}
/* La pastiglia dietro l'icona attiva e' l'unico elemento colorato della
   barra: niente alone diffuso, solo un fondo tinto e un bordo appena visibile. */
.bottom-nav__item.active .bottom-nav__icon-wrap {
  background: var(--nav-active-bg);
  border-color: color-mix(in srgb, var(--accent-green) 22%, transparent);
  border-radius: var(--radius-md);
}
.bottom-nav__icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  transition:
    background var(--dur-base) var(--ease-out),
    border-color var(--dur-base) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
.bottom-nav__item:active .bottom-nav__icon-wrap { transform: scale(0.92); }
.bottom-nav__icon-svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
}
.bottom-nav__label { line-height: 1.2; letter-spacing: 0.01em; }
.bottom-nav__badge {
  position: absolute;
  top: 1px;
  right: 7px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-green);
}

/* --- Sheet: griglie di azioni e funzionalita' --------------------------- */
.action-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.625rem; }
.action-btn {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem;
  padding: 1.125rem 0.5rem; border-radius: var(--radius-lg);
  background: var(--glass-interactive-bg); border: 1px solid var(--glass-interactive-border);
  box-shadow: var(--glass-highlight);
  color: var(--text-primary); font-size: 0.875rem; font-weight: 550; cursor: pointer; min-height: 44px;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
@media (hover: hover) {
  .action-btn:hover { background: var(--glass-interactive-bg-hover); border-color: color-mix(in srgb, var(--accent-green) 35%, transparent); }
}
.action-btn:active { transform: scale(0.97); }
.action-btn svg { color: var(--accent-green); stroke: currentColor; }
.funz-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.625rem;
}
.funz-grid__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.875rem 1rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-interactive-border);
  background: var(--glass-interactive-bg);
  box-shadow: var(--glass-highlight);
  cursor: pointer;
  text-align: left;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
  min-height: 88px;
}
@media (hover: hover) {
  .funz-grid__item:hover {
    background: var(--glass-interactive-bg-hover);
    border-color: color-mix(in srgb, var(--accent-green) 30%, transparent);
  }
}
.funz-grid__item:active { transform: scale(0.98); }
.funz-grid__item--active {
  border-color: color-mix(in srgb, var(--accent-green) 38%, transparent);
  background: var(--sidebar-active-bg);
}
.funz-grid__icon { color: var(--text-secondary); stroke: currentColor; margin-bottom: 0.125rem; }
.funz-grid__item--active .funz-grid__icon { color: var(--accent-green); }
.funz-grid__label { font-size: 0.9375rem; font-weight: 600; letter-spacing: var(--tracking-tight); color: var(--text-primary); }
.funz-grid__desc { font-size: 0.6875rem; color: var(--text-muted); line-height: 1.35; }
</style>
