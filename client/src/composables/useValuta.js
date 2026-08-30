import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth.store';

export function useValuta() {
  const authStore = useAuthStore();

  const valuta = computed(() => authStore.user?.valuta || 'EUR');

  const simbolo = computed(() => {
    const simboli = {
      EUR: '€',
      USD: '$',
      GBP: '£',
      CHF: 'CHF',
      JPY: '¥',
    };
    return simboli[valuta.value] || '€';
  });

  const formatValuta = (importo) => {
    const currency = valuta.value;
    if (importo === null || importo === undefined) {
      return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency,
      }).format(0);
    }
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency,
    }).format(parseFloat(importo) || 0);
  };

  return { valuta, simbolo, formatValuta };
}
