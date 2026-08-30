import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { isOnboardingComplete } from '@/utils/onboarding';
import AppLayout from '@/components/layout/AppLayout.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior() {
    return { top: 0, left: 0 };
  },
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/auth/RegisterView.vue'),
      meta: { guest: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/auth/ForgotPassword.vue'),
      meta: { guest: true, publicAuth: true },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/auth/ResetPassword.vue'),
      meta: { guest: true, publicAuth: true },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('@/views/auth/AuthCallbackView.vue'),
      meta: { guest: true },
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('@/views/PrivacyPolicy.vue'),
    },
    {
      path: '/termini',
      name: 'termini',
      component: () => import('@/views/TermsView.vue'),
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('@/views/OnboardingView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true, requiresOnboarding: true },
      children: [
        {
          path: '',
          redirect: '/dashboard',
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'conti',
          name: 'conti',
          component: () => import('@/views/ContiView.vue'),
        },
        {
          path: 'movimenti',
          name: 'movimenti',
          component: () => import('@/views/MovimentiView.vue'),
        },
        {
          path: 'importa',
          name: 'importa',
          component: () => import('@/views/ImportaView.vue'),
        },
        {
          path: 'budget',
          name: 'budget',
          component: () => import('@/views/BudgetView.vue'),
        },
        {
          path: 'analisi',
          name: 'analisi',
          component: () => import('@/views/AnalisiView.vue'),
        },
        {
          path: 'scommesse',
          name: 'scommesse',
          component: () => import('@/views/ScommesseView.vue'),
          beforeEnter: () => {
            const authStore = useAuthStore();
            if (!authStore.canAccessScommesseFeature) return { name: 'dashboard' };
            return true;
          },
        },
        {
          path: 'investimenti',
          name: 'investimenti',
          component: () => import('@/views/InvestimentiView.vue'),
          beforeEnter: () => {
            const authStore = useAuthStore();
            if (!authStore.canAccessInvestimentiFeature) return { name: 'dashboard' };
            return true;
          },
        },
        {
          path: 'obiettivi',
          name: 'obiettivi',
          component: () => import('@/views/ObiettiviView.vue'),
        },
        {
          path: 'impostazioni',
          name: 'impostazioni',
          component: () => import('@/views/ImpostazioniView.vue'),
        },
      ],
    },
  ],
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
