<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import WToast from '@/components/common/WToast.vue';
import LegalFooter from '@/components/layout/LegalFooter.vue';
import { useTheme } from '@/composables/useTheme';

const route = useRoute();
const { init } = useTheme();

const showLegalFooter = computed(() => (
  route.meta.guest === true
  || route.path === '/privacy'
  || route.path === '/termini'
));

onMounted(() => {
  init();
});
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[var(--bg-primary)]">
    <main class="flex flex-1 flex-col">
      <RouterView />
    </main>
    <LegalFooter v-if="showLegalFooter" />
  </div>
  <WToast />
</template>
