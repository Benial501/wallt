import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import { formatValuta as formatValutaBase } from '@/utils/formatters';

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

  /**
   * Delega a `utils/formatters`: qui si aggiunge solo la valuta dell'utente.
   * `null`/`undefined` diventano zero gia' dentro `formatValuta`, quindi il
   * ramo separato che c'era prima non serviva e poteva divergere da solo.
   */
  const formatValuta = (importo) => formatValutaBase(importo, valuta.value);

  return { valuta, simbolo, formatValuta };
}
