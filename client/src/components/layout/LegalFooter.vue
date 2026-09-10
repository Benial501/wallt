<script setup>
import { useAuthStore } from '@/stores/auth.store';
const auth = useAuthStore();
const contactEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'support@pec.wallt.it';
const year = new Date().getFullYear();

const linkClass = 'text-xs sm:text-sm text-[var(--text-muted)] hover:text-[var(--accent-green)] transition-colors';
</script>

<template>
  <footer
    class="w-full shrink-0 border-t border-[var(--border)] bg-[var(--bg-primary)] px-4 py-4 sm:py-5"
    aria-label="Link legali"
  >
    <div class="mx-auto flex max-w-3xl flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-0">
      <nav
        class="flex flex-col items-center gap-2 sm:flex-row sm:gap-0"
        aria-label="Documenti legali e contatti"
      >
        <RouterLink
          to="/privacy"
          class="px-0 sm:px-3"
          :class="linkClass"
        >
          Privacy Policy
        </RouterLink>

        <span
          class="hidden sm:inline text-[var(--text-muted)]"
          aria-hidden="true"
        >·</span>

        <RouterLink
          to="/termini"
          class="px-0 sm:px-3"
          :class="linkClass"
        >
          Termini e Condizioni
        </RouterLink>

        <span
          class="hidden sm:inline text-[var(--text-muted)]"
          aria-hidden="true"
        >·</span>

        <RouterLink
          v-if="auth.user"
          to="/aiuto#supporto"
          class="px-0 sm:px-3"
          :class="linkClass"
        >Contatta il supporto</RouterLink>
        <a
          v-else
          :href="`mailto:${contactEmail}`"
          class="px-0 sm:px-3"
          :class="linkClass"
        >
          Contatto
        </a>
      </nav>
    </div>

    <p class="mt-3 text-center text-[10px] sm:text-xs text-[var(--text-muted)]">
      © {{ year }} WALLT
    </p>
  </footer>
</template>
