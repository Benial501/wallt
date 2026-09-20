import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { isOnboardingComplete } from '@/utils/onboarding';
import { routes } from './routes';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // Con un hash (es. /impostazioni#notifiche) la pagina si porta sulla
  // sezione richiesta invece di tornare in cima. La sezione può montarsi
  // subito dopo la conferma della navigazione: la piccola attesa evita di
  // cercare un elemento che non è ancora nel DOM.
  async scrollBehavior(to) {
    if (to.hash) {
      await new Promise((resolve) => { setTimeout(resolve, 120); });
      const target = document.querySelector(to.hash);
      if (target) return { el: target, top: 16, behavior: 'smooth' };
    }
    return { top: 0, left: 0 };
  },
  routes,
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  // Non bloccare la navigazione: usa subito i dati in cache e aggiorna in background.
  if (authStore.token && !authStore.user) {
    try {
      await Promise.race([
        authStore.fetchMe(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('auth_timeout')), 8000);
        }),
      ]);
    } catch {
      if (!authStore.user) {
        authStore.logout();
      }
    }
  } else if (authStore.token && authStore.user) {
    // Evita un /me a ogni click di navigazione (consumava il rate limit API).
    const lastFetch = authStore._lastFetchMeAt || 0;
    if (Date.now() - lastFetch > 60_000) {
      authStore._lastFetchMeAt = Date.now();
      authStore.fetchMe();
    }
  }

  if (to.meta.guest && authStore.token && !authStore.user) {
    return true;
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login' };
  }

  const onboardingDone = isOnboardingComplete(authStore.user?.profilo);

  if (to.meta.guest && authStore.isAuthenticated && !to.meta.publicAuth) {
    return { name: onboardingDone ? 'dashboard' : 'onboarding' };
  }

  if (to.name === 'onboarding' && onboardingDone && !to.query.edit) {
    return { name: 'dashboard' };
  }

  if (to.meta.requiresOnboarding && authStore.isAuthenticated && !onboardingDone) {
    return { name: 'onboarding' };
  }

  if (to.name === 'scommesse' && !authStore.canAccessScommesseFeature) {
    return { name: 'dashboard' };
  }

  if (to.name === 'investimenti' && !authStore.canAccessInvestimentiFeature) {
    return { name: 'dashboard' };
  }

  return true;
});

export default router;
