import { resetCategorie } from '@/utils/categorie';
import { useAuthStore } from '@/stores/auth.store';
import { useImportazioniStore } from '@/stores/importazioni.store';
import { useProfiloStore } from '@/stores/profilo.store';
import { useContiStore } from '@/stores/conti.store';
import { useMovimentiStore } from '@/stores/movimenti.store';
import { useBudgetStore } from '@/stores/budget.store';
import { useObiettiviStore } from '@/stores/obiettivi.store';
import { useScommesseStore } from '@/stores/scommesse.store';
import { useInvestimentiStore } from '@/stores/investimenti.store';
import { useAnalisiStore } from '@/stores/analisi.store';
import { useUiStore } from '@/stores/ui.store';
import { useHelpStore } from '@/stores/help.store';
import { useNotificheStore } from '@/stores/notifiche.store';
import { usePianoSmartStore } from '@/stores/pianoSmart.store';
import { useFondoEmergenzaStore } from '@/stores/fondoEmergenza.store';

/**
 * Pulisce tutti gli store Pinia e i dati temporanei di sessione.
 * L'auth store va resettato separatamente tramite logout().
 */
export function resetPiniaStores() {
  resetCategorie();
  let savedProfilo = null;
  try {
    savedProfilo = useAuthStore().user?.profilo ?? null;
  } catch { /* ignore */ }

  try { useImportazioniStore().clear(); } catch { /* ignore */ }

  try {
    const profiloStore = useProfiloStore();
    profiloStore.profilo = savedProfilo;
    profiloStore.budgetSuggerito = null;
    profiloStore.error = null;
  } catch { /* ignore */ }

  // Ogni store migrato azzera le proprie risorse: elencare i campi a mano
  // era il motivo per cui `recentiHome` e i campi di scommesse restavano
  // popolati dopo il logout (difetto noto numero 9).
  [
    useContiStore,
    useMovimentiStore,
    useBudgetStore,
    useAnalisiStore,
    useObiettiviStore,
    useInvestimentiStore,
    useScommesseStore,
    // Un Piano Smart salvato contiene il riepilogo finanziario dell'utente
    // (medie di entrate e spese, copertura del fondo, pressione debitoria).
    // Senza questo reset quei dati restavano in memoria dopo il logout e il
    // login successivo sulla stessa scheda li avrebbe mostrati a un altro
    // utente: lo stesso difetto del numero 9, su dati più sensibili.
    usePianoSmartStore,
    // Il saldo del fondo di emergenza è un dato dell'utente come gli altri:
    // resta in memoria dopo il logout se nessuno lo azzera.
    useFondoEmergenzaStore,
  ].forEach((useStore) => {
    try { useStore().reset(); } catch { /* ignore */ }
  });

  try {
    useUiStore().chiudiForm();
  } catch { /* ignore */ }

  try {
    // Solo stato in memoria: le preferenze salvate degli account restano
    // in localStorage, ciascuna sotto la propria chiave `wallt:help:v1:<id>`.
    useHelpStore().resetState();
  } catch { /* ignore */ }

  try {
    // Ferma anche il polling del badge: un timer che sopravvive al logout
    // continuerebbe a chiamare /notifiche con il token del vecchio utente.
    useNotificheStore().resetState();
  } catch { /* ignore */ }

  try {
    sessionStorage.clear();
  } catch { /* ignore */ }
}

/**
 * Logout completo: JWT, store Pinia, redirect login.
 */
export async function performLogout(router) {
  const authStore = useAuthStore();
  authStore.logout();
  resetPiniaStores();

  if (router) {
    await router.push({ name: 'login' });
  } else if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
    window.location.href = '/login';
  }
}
