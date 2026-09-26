import { useAuthStore } from '@/stores/auth.store';
import AppLayout from '@/components/layout/AppLayout.vue';

export const routes = [
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
    // Pubblica come le pagine legali: serve proprio a chi non riesce
    // ad accedere e quindi non potrebbe usare il modulo in Aiuto.
    path: '/contatto',
    name: 'contatto',
    component: () => import('@/views/ContattoView.vue'),
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
      { path: '', redirect: '/dashboard' },
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
        path: 'fondo-emergenza',
        name: 'fondo-emergenza',
        component: () => import('@/views/FondoEmergenzaView.vue'),
      },
      {
        path: 'ricorrenti',
        name: 'ricorrenti',
        component: () => import('@/views/RicorrentiView.vue'),
      },
      {
        path: 'notifiche',
        name: 'notifiche',
        component: () => import('@/views/NotificheView.vue'),
      },
      {
        path: 'impostazioni/categorie',
        name: 'categorie',
        component: () => import('@/views/CategorieView.vue'),
      },
      {
        path: 'impostazioni',
        name: 'impostazioni',
        component: () => import('@/views/ImpostazioniView.vue'),
      },
      {
        path: 'aiuto',
        name: 'aiuto',
        component: () => import('@/views/AiutoView.vue'),
      },
      {
        path: 'funzionalita/piano-smart',
        name: 'piano-smart',
        component: () => import('@/views/PianoSmartView.vue'),
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
];
