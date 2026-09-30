<script setup>
defineProps({
  leaving: { type: Boolean, default: false },
  animationElapsedMs: { type: Number, default: 0 },
  animate: { type: Boolean, default: true },
});

const markPath = 'M15 35H28L39 64L50 35H63L72 60L82 32L75 27L96 8L98 37L89 31L76 69H65L56 47L47 69H34L15 35Z';
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
    <svg class="wallt-splash__current" viewBox="0 0 360 160" preserveAspectRatio="none">
      <defs>
        <linearGradient id="wallt-splash-current" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#74B9FF" stop-opacity="0" />
          <stop offset="0.48" stop-color="#00D4AA" stop-opacity="0.72" />
          <stop offset="1" stop-color="#74B9FF" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path
        class="wallt-splash__current-line"
        d="M-24 119C33 118 36 43 102 41C158 39 193 118 251 113C304 109 307 63 384 47"
        pathLength="1"
      />
    </svg>

    <div class="wallt-splash__lockup">
      <svg class="wallt-splash__mark" viewBox="0 0 100 100" fill="none">
        <defs>
          <linearGradient id="wallt-splash-mark" x1="18" y1="78" x2="86" y2="10" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#2499EE" />
            <stop offset="0.55" stop-color="#27C7D5" />
            <stop offset="1" stop-color="#26DB87" />
          </linearGradient>
        </defs>
        <path class="wallt-splash__mark-fill" :d="markPath" fill="url(#wallt-splash-mark)" />
        <path
          class="wallt-splash__mark-trace"
          d="M11 35H28L39 64L50 35H63L72 60L82 32M75 27L96 8L98 37L89 31L76 69H65L56 47L47 69H34L15 35"
          pathLength="1"
        />
      </svg>
      <span class="wallt-splash__word" aria-hidden="true">
        <span style="--wallt-splash-letter-delay: 820ms">W</span>
        <span style="--wallt-splash-letter-delay: 960ms">A</span>
        <span style="--wallt-splash-letter-delay: 1100ms">L</span>
        <span style="--wallt-splash-letter-delay: 1240ms">L</span>
        <span style="--wallt-splash-letter-delay: 1380ms">T</span>
      </span>
    </div>
  </div>
</template>
