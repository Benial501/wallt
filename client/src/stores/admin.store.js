import { defineStore } from 'pinia';
import { computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';
import { refreshAfterWrite } from '@/utils/afterWrite';

/**
 * Area di amministrazione.
 *
 * Il server è l'unica autorità: a chi non è amministratore ogni rotta
 * risponde 404. Questo store non "sblocca" niente — serve solo a leggere e a
 * presentare. Se qualcuno forzasse la rotta `/admin` nel browser, vedrebbe
 * una pagina che non riesce a caricare nulla.
 *
 * Tutte le letture passano da `creaRisorsa` (Coding Rule 17): un errore non
 * azzera i dati già ottenuti, quindi un timeout non fa sembrare che la beta
 * abbia zero utenti.
 */
export const useAdminStore = defineStore('admin', () => {
  const risorsaRiepilogo = creaRisorsa(
    async () => {
      const { data } = await api.get('/admin/riepilogo');
      return data;
    },
    { iniziale: null },
  );

  const risorsaUtenti = creaRisorsa(
    async (filtri = {}) => {
      const { data } = await api.get('/admin/utenti', { params: filtri });
      return data.utenti;
    },
    { iniziale: [], vuotoSe: (d) => !d || d.length === 0 },
  );

  const risorsaConfig = creaRisorsa(
    async () => {
      const { data } = await api.get('/admin/config');
      return data.configurazione;
    },
    { iniziale: [], vuotoSe: (d) => !d || d.length === 0 },
  );

  const risorsaAudit = creaRisorsa(
    async (filtri = {}) => {
      const { data } = await api.get('/admin/audit', { params: filtri });
      return data.eventi;
    },
    { iniziale: [], vuotoSe: (d) => !d || d.length === 0 },
  );

  /**
   * Le richieste di accesso a Premium.
   *
   * Risorsa separata dagli utenti perché risponde a una domanda diversa:
   * l'elenco utenti dice chi HA l'accesso, questa dice chi lo VUOLE. Un
   * filtro sulla prima non potrebbe mai mostrare chi ha chiesto e aspetta.
   */
  const risorsaRichieste = creaRisorsa(
    async (filtri = {}) => {
      const { data } = await api.get('/admin/richieste-premium', { params: filtri });
      return data;
    },
    { iniziale: null },
  );

  /**
   * I dati, come getter calcolati.
   *
   * Dentro lo store `risorsa.data` e' un ref vero, quindi `.value` e'
   * corretto; attraverso il proxy Pinia, invece, `reactive()` scompatta i ref
   * a qualunque profondita' e `adminStore.risorsaUtenti.data.value` sarebbe
   * `undefined`. Esporre i getter da qui elimina la trappola per chi scrive
   * le viste (lo specchio di Coding Rule 20).
   */
  const riepilogo = computed(() => risorsaRiepilogo.data.value);
  const utenti = computed(() => risorsaUtenti.data.value ?? []);
  const configurazione = computed(() => risorsaConfig.data.value ?? []);
  const audit = computed(() => risorsaAudit.data.value ?? []);
  const richieste = computed(() => risorsaRichieste.data.value?.richieste ?? []);
  const contatoriRichieste = computed(() => risorsaRichieste.data.value?.contatori ?? null);

  /** Dopo un'azione amministrativa si rileggono riepilogo e lista: le due
   * cose cambiano insieme, e mostrarne una sola aggiornata sarebbe peggio di
   * non aggiornarne nessuna. */
  const ricarica = (filtriUtenti = {}, filtriRichieste = {}) => refreshAfterWrite(
    () => risorsaRiepilogo.carica(),
    () => risorsaUtenti.carica(filtriUtenti),
    () => risorsaRichieste.carica(filtriRichieste),
    () => risorsaAudit.carica({ limite: 30 }),
  );

  const concedi = async ({ userId, featureKey, nota = null }) => {
    const { data } = await api.post('/admin/entitlements/grant', {
      user_id: userId, feature_key: featureKey, ...(nota ? { nota } : {}),
    });
    await ricarica();
    return data;
  };

  const revoca = async ({ userId, featureKey, nota = null }) => {
    const { data } = await api.post('/admin/entitlements/revoke', {
      user_id: userId, feature_key: featureKey, ...(nota ? { nota } : {}),
    });
    await ricarica();
    return data;
  };

  const scollegaBanca = async (userId) => {
    const { data } = await api.post(`/admin/utenti/${userId}/scollega-banca`);
    await ricarica();
    return data;
  };

  /**
   * Approvare concede l'entitlement con `source: 'admin'`, deciso dal
   * server: questa chiamata non manda né l'origine né l'utente, solo l'id
   * della richiesta e un motivo facoltativo. Non consuma posti beta.
   */
  const approvaRichiesta = async ({ id, motivo = null }) => {
    const { data } = await api.post(`/admin/richieste-premium/${id}/approva`, {
      ...(motivo ? { motivo } : {}),
    });
    await ricarica();
    return data;
  };

  /** Rifiutare non tocca nessun entitlement: è un'altra cosa dalla revoca. */
  const rifiutaRichiesta = async ({ id, motivo = null }) => {
    const { data } = await api.post(`/admin/richieste-premium/${id}/rifiuta`, {
      ...(motivo ? { motivo } : {}),
    });
    await ricarica();
    return data;
  };

  const salvaConfig = async (chiave, valore) => {
    const { data } = await api.put('/admin/config', { chiave, valore });
    await refreshAfterWrite(
      () => risorsaConfig.carica(),
      () => risorsaRiepilogo.carica(),
    );
    return data;
  };

  const reset = () => {
    risorsaRiepilogo.reset();
    risorsaUtenti.reset();
    risorsaConfig.reset();
    risorsaAudit.reset();
    risorsaRichieste.reset();
  };

  return {
    risorsaRiepilogo,
    risorsaUtenti,
    risorsaConfig,
    risorsaAudit,
    risorsaRichieste,
    riepilogo,
    utenti,
    configurazione,
    audit,
    richieste,
    contatoriRichieste,
    approvaRichiesta,
    rifiutaRichiesta,
    concedi,
    revoca,
    scollegaBanca,
    salvaConfig,
    ricarica,
    reset,
  };
});
