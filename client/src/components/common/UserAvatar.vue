<script setup>
import { computed, ref, watch } from 'vue';
import { avatarSorgente, inizialiNome } from '@/utils/avatar';

/**
 * Tondo dell'utente: mostra l'immagine profilo se c'è, altrimenti le
 * iniziali del nome. Unico punto in cui vive questa scelta, così sidebar,
 * header e impostazioni non possono divergere.
 */
const props = defineProps({
  user: { type: Object, default: null },
  size: { type: Number, default: 40 },
  // 'accent' = pastiglia verde (sidebar, impostazioni),
  // 'neutro' = superficie con bordo (header dashboard).
  tono: { type: String, default: 'accent' },
  inizialiMax: { type: Number, default: 2 },
});

const immagineFallita = ref(false);

const sorgente = computed(() => avatarSorgente(props.user));
const iniziali = computed(() => inizialiNome(props.user?.nome, props.inizialiMax));
const mostraImmagine = computed(() => !!sorgente.value && !immagineFallita.value);

// Una nuova foto merita un nuovo tentativo, anche se la precedente non caricava.
watch(sorgente, () => { immagineFallita.value = false; });

const stile = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size * 0.35)}px`,
}));
</script>

<template>
  <span class="user-avatar" :class="`user-avatar--${tono}`" :style="stile">
    <img
      v-if="mostraImmagine"
      class="user-avatar__img"
      :src="sorgente"
      alt=""
      @error="immagineFallita = true"
    />
    <template v-else>{{ iniziali }}</template>
  </span>
</template>

<style scoped>
.user-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  font-weight: 700;
  line-height: 1;
  user-select: none;
}

.user-avatar--accent {
  background: var(--accent-light);
  color: var(--accent-green);
}

.user-avatar--neutro {
  background: var(--surface-inset);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.user-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
