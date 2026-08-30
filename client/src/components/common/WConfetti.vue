<script setup>
import { ref, onMounted, watch } from 'vue';
import { PartyPopper, Sparkles } from '@/utils/appIcons';

const props = defineProps({
  show: { type: Boolean, default: false },
  message: { type: String, default: 'Obiettivo raggiunto!' },
});

const emit = defineEmits(['close']);

const particles = ref([]);

const COLORS = ['#00D4AA', '#6C5CE7', '#74B9FF', '#FECA57', '#FF4757', '#FD79A8'];

onMounted(() => {
  if (props.show) spawnConfetti();
});

watch(() => props.show, (val) => {
  if (val) spawnConfetti();
});

const spawnConfetti = () => {
  particles.value = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
  }));

  setTimeout(() => emit('close'), 3000);
};
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="confetti-overlay">
      <div
        v-for="p in particles"
        :key="p.id"
        class="confetti-particle"
        :style="{
          left: p.left + '%',
          backgroundColor: p.color,
          width: p.size + 'px',
          height: p.size + 'px',
          animationDelay: p.delay + 's',
          animationDuration: p.duration + 's',
          transform: `rotate(${p.rotation}deg)`,
        }"
      />
      <div class="confetti-message animate-success-pop">
        <p class="confetti-title">
          <PartyPopper :size="22" :stroke-width="1.75" />
          {{ message }}
        </p>
        <button class="confetti-btn" @click="$emit('close')">
          <Sparkles :size="16" :stroke-width="1.75" />
          Fantastico!
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confetti-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  pointer-events: auto;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.confetti-particle {
  position: absolute;
  top: -20px;
  border-radius: 2px;
  animation: confettiFall linear forwards;
}

@keyframes confettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}

.confetti-message {
  background: var(--bg-card);
  border: 1px solid var(--accent-green);
  border-radius: var(--radius-xl);
  padding: 2rem;
  text-align: center;
  box-shadow: var(--shadow-glow);
  z-index: 1;
}

.confetti-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 1.25rem;
}
.confetti-title svg, .confetti-btn svg { stroke: currentColor; flex-shrink: 0; }
.confetti-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 2rem;
  border-radius: var(--radius-md);
  background: var(--accent-green);
  color: var(--accent-on);
  border: none;
  font-weight: 600;
  cursor: pointer;
  font-size: 1rem;
}
</style>
