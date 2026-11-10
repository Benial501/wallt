<script setup>
import { ref, watch } from 'vue';
import { X } from '@/utils/appIcons';

/**
 * Video dimostrativo in una modale. Nato per «La tua situazione» (si apre da
 * sé alla prima visita e resta rivedibile dal pulsante «Guarda il video»
 * nell'intestazione); la registrazione lo riusa con titolo e file propri.
 * Senza altri parametri resta il video della situazione.
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  titolo: { type: String, default: 'Come funziona La tua situazione' },
  sottotitolo: { type: String, default: 'Un giro di tre minuti su cosa mostra WALLT e come leggerlo.' },
  src: { type: String, default: '/video/situazione-guida.mp4' },
  poster: { type: String, default: '/video/situazione-guida-poster.jpg' },
});
const emit = defineEmits(['close']);

const video = ref(null);

// Chiudendo la modale il video si ferma: non deve continuare a suonare in sottofondo.
watch(() => props.open, (aperta) => {
  if (!aperta) video.value?.pause();
});

const chiudi = () => emit('close');
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open" class="guida-overlay" role="dialog" aria-modal="true"
      :aria-label="`Video: ${titolo}`"
      @click.self="chiudi" @keydown.esc="chiudi"
    >
      <div class="guida">
        <div class="guida__header">
          <div>
            <h3 class="guida__title">{{ titolo }}</h3>
            <p class="guida__sub">{{ sottotitolo }}</p>
          </div>
          <button type="button" class="guida__close" aria-label="Chiudi" @click="chiudi">
            <X :size="18" :stroke-width="1.75" />
          </button>
        </div>
        <video
          ref="video" class="guida__video" controls playsinline preload="metadata"
          :poster="poster"
        >
          <source :src="src" type="video/mp4">
        </video>
        <div class="guida__footer">
          <button type="button" class="guida__cta" @click="chiudi">Ho capito, iniziamo</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.guida-overlay {
  position: fixed; inset: 0; z-index: 1000; padding: 1rem;
  display: flex; align-items: center; justify-content: center;
  background: var(--overlay);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
}
.guida {
  width: 100%; max-width: 880px; max-height: min(92vh, 92dvh); overflow-y: auto;
  background: var(--glass-elevated-solid);
  border: 1px solid var(--glass-elevated-border);
  border-radius: var(--radius-2xl);
  box-shadow: var(--glass-shadow-elevated);
}
.guida__header { display: flex; justify-content: space-between; gap: 1rem; padding: 1.125rem 1.25rem; }
.guida__title { font-size: 1.0625rem; font-weight: 650; color: var(--text-primary); }
.guida__sub { font-size: var(--text-sm); color: var(--text-secondary); margin-top: .25rem; }
.guida__close {
  flex: 0 0 auto; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: 999px; background: var(--surface-subtle); color: var(--text-secondary); cursor: pointer;
}
.guida__video { display: block; width: 100%; aspect-ratio: 16 / 9; background: #000; }
.guida__footer { display: flex; justify-content: flex-end; padding: 1rem 1.25rem; }
.guida__cta {
  min-height: 44px; padding: .625rem 1.25rem; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--accent-green); color: var(--accent-on); font: inherit; font-weight: 650;
}
</style>
