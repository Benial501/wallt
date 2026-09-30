<script setup>
defineProps({
  leaving: { type: Boolean, default: false },
});
</script>

<template>
  <div
    class="wallt-splash"
    :class="{ 'wallt-splash--leaving': leaving }"
    aria-hidden="true"
  >
    <div class="wallt-splash__brand">
      <img
        class="wallt-splash__logo"
        src="/brand/wallt-logo-horizontal.svg"
        alt=""
        width="743"
        height="229"
        draggable="false"
      >
    </div>
  </div>
</template>

<style scoped>
.wallt-splash {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding-block: max(1.5rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-bottom));
  padding-inline: max(1.5rem, env(safe-area-inset-left)) max(1.5rem, env(safe-area-inset-right));
  background: var(--bg-primary);
  pointer-events: none;
  transition: opacity 180ms var(--ease-out);
}

.wallt-splash--leaving {
  opacity: 0;
}

.wallt-splash__brand {
  display: grid;
  place-items: center;
  padding: 0.875rem 1.125rem;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: var(--radius-lg);
  background: #fff;
  animation: wallt-splash-arrive 520ms var(--ease-out) both;
}

.wallt-splash__logo {
  display: block;
  width: clamp(9.5rem, 48vw, 12.5rem);
  height: auto;
  user-select: none;
}

@keyframes wallt-splash-arrive {
  from {
    opacity: 0;
    transform: translateY(3px) scale(0.975);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wallt-splash {
    transition: none !important;
    transition-duration: 0s !important;
  }

  .wallt-splash__brand {
    animation: none;
  }
}
</style>
