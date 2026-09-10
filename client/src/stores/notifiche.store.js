import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/utils/axios';

/**
 * Centro notifiche.
 *
 * Il conteggio dei non letti viene aggiornato con un polling leggero mentre
 * la scheda è visibile: il sistema di notifiche è generato lato server (cron),
 * qui si legge soltanto. Nessun timer resta attivo a scheda nascosta.
 */

/** Intervallo del polling del badge, in millisecondi. */
const INTERVALLO_POLLING = 60_000;

const PREFERENZE_DEFAULT = {
  promemoria_giornaliero_attivo: true,
  alert_budget_attivi: true,
  alert_ricorrenti_attivi: true,
  alert_obiettivi_attivi: true,
  riepilogo_settimanale_attivo: false,
  push_attive: false,
  orario_promemoria: '20:00',
  timezone: 'Europe/Rome',
  quiet_hours_inizio: '22:00',
  quiet_hours_fine: '08:00',
  max_notifiche_giornaliere: 2,
  giornata_controllata_il: null,
  push_disponibile: false,
};

export const useNotificheStore = defineStore('notifiche', () => {
  const notifiche = ref([]);
  const nonLette = ref(0);
  const totale = ref(0);
  const loading = ref(false);
  const panelOpen = ref(false);
  const preferenze = ref({ ...PREFERENZE_DEFAULT });
  const chiavePubblicaPush = ref(null);
  const preferenzeCaricate = ref(false);

  let timerPolling = null;

  const haNonLette = computed(() => nonLette.value > 0);
  const badge = computed(() => (nonLette.value > 9 ? '9+' : String(nonLette.value)));

  const fetchNotifiche = async ({ soloNonLette = false, limit = 30 } = {}) => {
    loading.value = true;
    try {
      const { data } = await api.get('/notifiche', {
        params: { ...(soloNonLette ? { non_lette: 'true' } : {}), limit },
      });
      notifiche.value = data.notifiche || [];
      totale.value = data.totale || 0;
      nonLette.value = data.non_lette || 0;
      return data;
    } finally {
      loading.value = false;
    }
  };

  /** Chiamata dal polling: aggiorna solo il badge, senza toccare la lista. */
  const fetchConteggio = async () => {
    try {
      const { data } = await api.get('/notifiche/non-lette');
      nonLette.value = data.non_lette || 0;
    } catch {
      // Un badge non aggiornato non è un errore da mostrare all'utente.
    }
  };

  const segnaLetta = async (id) => {
    const notifica = notifiche.value.find((n) => n.id === id);
    if (notifica && !notifica.letta) {
      notifica.letta = true;
      nonLette.value = Math.max(0, nonLette.value - 1);
    }
    try {
      const { data } = await api.put(`/notifiche/${id}/letta`);
      nonLette.value = data.non_lette ?? nonLette.value;
    } catch {
      // Ripristina lo stato ottimistico se il server rifiuta.
      if (notifica) notifica.letta = false;
      await fetchConteggio();
    }
  };

  const segnaTutteLette = async () => {
    const { data } = await api.put('/notifiche/lette');
    notifiche.value = notifiche.value.map((n) => ({ ...n, letta: true }));
    nonLette.value = data.non_lette ?? 0;
    return data.aggiornate;
  };

  const fetchPreferenze = async () => {
    const { data } = await api.get('/notifiche/preferenze');
    preferenze.value = { ...PREFERENZE_DEFAULT, ...data.preferenze };
    chiavePubblicaPush.value = data.chiave_pubblica_push || null;
    preferenzeCaricate.value = true;
    return preferenze.value;
  };

  const updatePreferenze = async (valori) => {
    const { data } = await api.put('/notifiche/preferenze', valori);
    preferenze.value = { ...PREFERENZE_DEFAULT, ...data.preferenze };
    return preferenze.value;
  };

  const registraPush = async (subscription) => {
    const { data } = await api.post('/notifiche/push', { subscription });
    preferenze.value = { ...PREFERENZE_DEFAULT, ...data.preferenze };
    return preferenze.value;
  };

  const rimuoviPush = async (endpoint = null) => {
    const { data } = await api.delete('/notifiche/push', {
      data: endpoint ? { endpoint } : {},
    });
    preferenze.value = { ...PREFERENZE_DEFAULT, ...data.preferenze };
    return preferenze.value;
  };

  /** Notifica di prova: verifica la consegna senza aspettare il cron. */
  const inviaNotificaDiProva = async () => {
    const { data } = await api.post('/notifiche/prova');
    await fetchNotifiche();
    return data;
  };

  const segnaGiornataControllata = async () => {
    const { data } = await api.post('/notifiche/giornata-controllata');
    preferenze.value = { ...preferenze.value, giornata_controllata_il: data.giorno };
    return data.giorno;
  };

  const apriPanel = async () => {
    panelOpen.value = true;
    await fetchNotifiche();
  };

  const chiudiPanel = () => {
    panelOpen.value = false;
  };

  const gestisciVisibilita = () => {
    if (document.visibilityState === 'visible') fetchConteggio();
  };

  /** Avvia il polling del badge. Idempotente. */
  const avviaPolling = () => {
    if (timerPolling) return;
    fetchConteggio();
    timerPolling = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchConteggio();
    }, INTERVALLO_POLLING);
    document.addEventListener('visibilitychange', gestisciVisibilita);
  };

  const fermaPolling = () => {
    if (timerPolling) {
      window.clearInterval(timerPolling);
      timerPolling = null;
    }
    document.removeEventListener('visibilitychange', gestisciVisibilita);
  };

  /** Azzera lo stato al logout / cambio utente. */
  const resetState = () => {
    fermaPolling();
    notifiche.value = [];
    nonLette.value = 0;
    totale.value = 0;
    panelOpen.value = false;
    preferenze.value = { ...PREFERENZE_DEFAULT };
    chiavePubblicaPush.value = null;
    preferenzeCaricate.value = false;
  };

  return {
    notifiche,
    nonLette,
    totale,
    loading,
    panelOpen,
    preferenze,
    chiavePubblicaPush,
    preferenzeCaricate,
    haNonLette,
    badge,
    fetchNotifiche,
    fetchConteggio,
    segnaLetta,
    segnaTutteLette,
    fetchPreferenze,
    updatePreferenze,
    registraPush,
    rimuoviPush,
    inviaNotificaDiProva,
    segnaGiornataControllata,
    apriPanel,
    chiudiPanel,
    avviaPolling,
    fermaPolling,
    resetState,
  };
});
