import api from '@/utils/axios';

/**
 * Trasporto verso `/api/piano-smart`. Nessuna logica di dominio: il piano lo
 * decide il backend.
 *
 * `unwrap` scarta l'involucro `{ data, total }` che usa SOLO l'elenco dei
 * piani: nessun'altra risposta del namespace ha una chiave `data` di primo
 * livello, quindi la stessa funzione va bene per tutte
 * (vedi docs/piano-smart-api-contract.md).
 */
const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

export const pianoSmartApi = {
  async getReadiness() { return unwrap(await api.get('/piano-smart/readiness')); },
  async createPreview(payload) { return unwrap(await api.post('/piano-smart/preview', payload)); },
  async createPlan(payload) { return unwrap(await api.post('/piano-smart', payload)); },
  async listPlans() { return unwrap(await api.get('/piano-smart')); },
  async getPlan(id) { return unwrap(await api.get(`/piano-smart/${id}`)); },
  async updatePlan(id, payload) { return unwrap(await api.patch(`/piano-smart/${id}`, payload)); },
  async createV2Preview(payload) { return unwrap(await api.post('/piano-smart/v2/preview', payload)); },
  async createV2Plan(payload) { return unwrap(await api.post('/piano-smart/v2', payload)); },
  async listV2Actions(id) { return unwrap(await api.get(`/piano-smart/v2/${id}/actions`)); },
  async updateV2Action(id, actionId, status) { return unwrap(await api.patch(`/piano-smart/v2/${id}/actions/${actionId}`, { status })); },
};

/**
 * Classifica un errore per la UI e ne estrae il messaggio REALE del backend.
 *
 * WALLT risponde `{ error: "..." }`, e i validator aggiungono `errori[]`: non
 * esiste un campo `message`. Leggerlo (com'era prima dell'integrazione)
 * significava mostrare sempre il testo generico del client anche quando il
 * backend aveva già spiegato con precisione cosa non tornava — per esempio che
 * la somma delle allocazioni non coincide col capitale.
 *
 * `errori` arriva in due forme: oggetti `{ campo, messaggio }` dai validator,
 * stringhe dagli errori di allocazione.
 */
const dettagli = (data) => {
  if (!Array.isArray(data?.errori)) return [];
  return data.errori
    .map((voce) => (typeof voce === 'string' ? voce : voce?.messaggio))
    .filter(Boolean);
};

export const pianoSmartError = (error) => {
  if (!error?.response) {
    return { type: 'network', message: 'Non riesco a recuperare i dati. Riprova.', details: [] };
  }
  const { status, data } = error.response;
  const details = dettagli(data);
  const backendMessage = data?.error || data?.message;

  if (status === 400 || status === 422) {
    return {
      type: 'missing-data',
      message: details[0] || backendMessage || 'Mancano alcune informazioni per creare un piano affidabile.',
      details,
    };
  }
  if (status === 404) {
    return { type: 'not-found', message: 'Questo piano non esiste più.', details };
  }
  if (status === 429) {
    return {
      type: 'rate-limit',
      message: backendMessage || 'Troppe richieste di seguito. Riprova tra qualche minuto.',
      details,
    };
  }
  return { type: 'server', message: 'Non è stato possibile creare il piano. Riprova.', details };
};
