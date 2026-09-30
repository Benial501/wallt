<script setup>
import { computed, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import WToast from '@/components/common/WToast.vue';
import LegalFooter from '@/components/layout/LegalFooter.vue';
import WalltSplash from '@/components/common/WalltSplash.vue';
import { useTheme } from '@/composables/useTheme';
import { getStartupSplashTiming, STARTUP_SPLASH_EXIT_MS } from '@/utils/startupSplash';

const route = useRoute();
const router = useRouter();
const { init } = useTheme();
const startupSplashVisible = ref(true);
const startupSplashLeaving = ref(false);
const startupNavigationReady = ref(false);
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const navigationStartedAt = window.performance.getEntriesByType('navigation')[0]?.startTime
  ?? window.performance.now();
const startupSplashTiming = getStartupSplashTiming(
  window.performance.now(),
  navigationStartedAt,
  prefersReducedMotion,
);

router.isReady().then(
  () => { startupNavigationReady.value = true; },
  () => {},
);

// Il tema viene applicato prima del primo render, così la splash non cambia
// colore dopo essere comparsa.
init();

// Il timer parte dal setup, senza aspettare il caricamento della route iniziale.
const ricaricaApp = () => window.location.reload();
let splashExitTimer;
const splashTimer = window.setTimeout(() => {
  if (prefersReducedMotion) {
    startupSplashVisible.value = false;
    return;
  }

  startupSplashLeaving.value = true;
  splashExitTimer = window.setTimeout(() => {
    startupSplashVisible.value = false;
  }, STARTUP_SPLASH_EXIT_MS);
}, startupSplashTiming.remainingMs);

const showLegalFooter = computed(() => (
  route.meta.guest === true
  || route.path === '/privacy'
  || route.path === '/termini'
  || route.path === '/contatto'
));

onUnmounted(() => {
  window.clearTimeout(splashTimer);
  window.clearTimeout(splashExitTimer);
});
</script>

<template>
  <WalltSplash
    v-if="startupSplashVisible"
    :leaving="startupSplashLeaving"
    :animation-elapsed-ms="startupSplashTiming.animationElapsedMs"
    :animate="startupSplashTiming.animate"
  />
  <div
    v-if="!startupSplashVisible && !startupNavigationReady"
    class="fixed inset-0 z-[10000] grid place-items-center overflow-hidden bg-[var(--bg-primary)] px-6"
  >
    <div class="flex flex-col items-center gap-4 text-center">
      <p class="text-sm text-[var(--text-secondary)]" role="status" aria-live="polite">
        WALLT sta ancora completando l’avvio.
      </p>
      <button
        type="button"
        class="min-h-11 rounded-lg border border-[var(--border-strong)] px-4 py-2 font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
        @click="ricaricaApp"
      >
        Ricarica
      </button>
    </div>
  </div>
  <div class="min-h-screen flex flex-col">
    <main class="flex flex-1 flex-col">
      <RouterView />
    </main>
    <LegalFooter v-if="showLegalFooter" />
  </div>
  <WToast />
</template>
