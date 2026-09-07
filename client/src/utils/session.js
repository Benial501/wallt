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

  try {
    const contiStore = useContiStore();
    contiStore.conti = [];
    contiStore.patrimonioTotale = 0;
    contiStore.variazioneImporto = 0;
    contiStore.variazionePercentuale = 0;
  } catch { /* ignore */ }

  try {
    const movimentiStore = useMovimentiStore();
    movimentiStore.movimentiPerData = [];
    movimentiStore.bilancioMese = {};
    movimentiStore.pagination = { page: 1, total: 0, pages: 0 };
  } catch { /* ignore */ }

  try {
    const budgetStore = useBudgetStore();
    budgetStore.budgetCorrente = null;
    budgetStore.statoBudget = [];
    budgetStore.budgetSuggerito = null;
    budgetStore.esiste = false;
  } catch { /* ignore */ }

  try {
    const obiettiviStore = useObiettiviStore();
    obiettiviStore.obiettivi = { attivi: [], completati: [] };
  } catch { /* ignore */ }

  try {
    const scommesseStore = useScommesseStore();
    scommesseStore.piattaforme = [];
    scommesseStore.movimenti = [];
  } catch { /* ignore */ }

  try {
    const investimentiStore = useInvestimentiStore();
    investimentiStore.investimenti = [];
    investimentiStore.movimenti = [];
  } catch { /* ignore */ }

  try {
    const analisiStore = useAnalisiStore();
    analisiStore.distribuzioneSpese = [];
    analisiStore.totaleSpese = 0;
    analisiStore.confrontoMesi = [];
    analisiStore.andamentoPatrimonio = {};
    analisiStore.suggerimenti = [];
  } catch { /* ignore */ }

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
