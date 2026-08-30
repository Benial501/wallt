import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/utils/axios';
import { useAuthStore } from '@/stores/auth.store';
import { isOnboardingComplete } from '@/utils/onboarding';
import { isMinor } from '@/utils/ageRestriction';
import { wantsScommesse, wantsInvestimenti } from '@/utils/featureAccess';

const applyProfiloToAuthUser = (profilo, { preferenze = null, enableOnCompletion = false } = {}) => {
  const authStore = useAuthStore();
  if (!authStore.user || !profilo) return;

  const userPatch = {
    profilo: {
      ...profilo,
      onboarding_completato: isOnboardingComplete(profilo),
    },
  };

  if (preferenze) {
    userPatch.mostra_scommesse = preferenze.mostra_scommesse;
    userPatch.mostra_investimenti = preferenze.mostra_investimenti;
  } else if (enableOnCompletion) {
    userPatch.mostra_scommesse = !isMinor(profilo) && wantsScommesse(profilo);
    userPatch.mostra_investimenti = !isMinor(profilo) && wantsInvestimenti(profilo);
  } else {
    if (isMinor(profilo) || !wantsScommesse(profilo)) {
      userPatch.mostra_scommesse = false;
    }
    if (isMinor(profilo) || !wantsInvestimenti(profilo)) {
      userPatch.mostra_investimenti = false;
    }
  }

  authStore.updateUser(userPatch);
};

export const useProfiloStore = defineStore('profilo', () => {
  const profilo = ref(null);
  const budgetSuggerito = ref(null);
  const loading = ref(false);
  const error = ref(null);

  const fetchProfilo = async () => {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/profilo');
      profilo.value = data.profilo;
      return data.profilo;
    } catch (err) {
      if (err.response?.status === 404) {
        profilo.value = null;
        return null;
      }
      error.value = err.response?.data?.message || 'Errore nel recupero del profilo';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const updateProfilo = async (dati) => {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put('/profilo', dati);
      profilo.value = data.profilo;

      applyProfiloToAuthUser(data.profilo, {
        preferenze: data.preferenze,
        enableOnCompletion: dati.onboarding_completato === true,
      });

      return data;
    } catch (err) {
      const dettagli = err.response?.data?.errori;
      if (Array.isArray(dettagli) && dettagli.length > 0) {
        error.value = dettagli.map((d) => d.messaggio).join('. ');
      } else {
        error.value = err.response?.data?.error
          || err.response?.data?.message
          || 'Errore nell\'aggiornamento del profilo';
      }
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const skipOnboarding = async () => {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post('/profilo/skip-onboarding');
      profilo.value = data.profilo;

      applyProfiloToAuthUser(data.profilo, { preferenze: data.preferenze });

      return data;
    } catch (err) {
      error.value = err.response?.data?.message || 'Errore nel salto onboarding';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchBudgetSuggerito = async () => {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/profilo/budget-suggerito');
      budgetSuggerito.value = data;
      return data;
    } catch (err) {
      error.value = err.response?.data?.message || 'Errore nel calcolo del budget';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    profilo,
    budgetSuggerito,
    loading,
    error,
    fetchProfilo,
    updateProfilo,
    skipOnboarding,
    fetchBudgetSuggerito,
  };
});
