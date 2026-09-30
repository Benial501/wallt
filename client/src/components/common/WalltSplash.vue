<script setup>
defineProps({
  leaving: { type: Boolean, default: false },
  animationElapsedMs: { type: Number, default: 0 },
  animate: { type: Boolean, default: true },
});
</script>

<template>
  <div
    class="wallt-splash"
    :class="{
      'wallt-splash--leaving': leaving,
      'wallt-splash--reduced': !animate,
    }"
    :style="{ '--wallt-splash-delay': `-${animationElapsedMs}ms` }"
    aria-hidden="true"
  >
    <div class="wallt-splash__ambient" />
    <div class="wallt-splash__art">
      <img
        class="wallt-splash__logo"
        src="/brand/wallt-app-icon.png"
        alt=""
        width="512"
        height="512"
        draggable="false"
      >
      <span class="wallt-splash__sheen" />
      <span class="wallt-splash__flare" />
    </div>
  </div>
</template>
