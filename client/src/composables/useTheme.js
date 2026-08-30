import { ref, computed } from 'vue';
import api from '@/utils/axios';
import { useAuthStore } from '@/stores/auth.store';

const STORAGE_KEY = 'wallt_theme';

export function useTheme() {
  const authStore = useAuthStore();
  const theme = ref(localStorage.getItem(STORAGE_KEY) || authStore.user?.tema || 'dark');
  const isDark = computed(() => theme.value === 'dark');

  const applyTheme = (t) => {
    theme.value = t;
    const html = document.documentElement;
    html.classList.remove('dark', 'light');
    html.classList.add(t);
    html.setAttribute('data-theme', t);
    localStorage.setItem(STORAGE_KEY, t);

    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
      || document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.content = t === 'light' ? '#F1F5F9' : '#000000';
    }
  };

  const init = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const userTheme = authStore.user?.tema;
    applyTheme(saved || userTheme || 'dark');
  };

  const toggle = async () => {
    const next = theme.value === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      await api.put('/impostazioni/preferenze', { tema: next });
      if (authStore.user) {
        authStore.user.tema = next;
        localStorage.setItem('wallt_user', JSON.stringify(authStore.user));
      }
    } catch {
      // tema applicato localmente comunque
    }
  };

  const setTheme = (t) => applyTheme(t);

  return { theme, isDark, init, toggle, setTheme };
}
