import api from '@/utils/axios';

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

export const pianoSmartApi = {
  async getReadiness() { return unwrap(await api.get('/piano-smart/readiness')); },
  async createPreview(payload) { return unwrap(await api.post('/piano-smart/preview', payload)); },
  async createPlan(payload) { return unwrap(await api.post('/piano-smart', payload)); },
  async listPlans() { return unwrap(await api.get('/piano-smart')); },
  async getPlan(id) { return unwrap(await api.get(`/piano-smart/${id}`)); },
  async updatePlan(id, payload) { return unwrap(await api.patch(`/piano-smart/${id}`, payload)); },
};

export const pianoSmartError = (error) => {
  if (!error?.response) return { type: 'network', message: 'Non riesco a recuperare i dati. Riprova.' };
  if (error.response.status === 422 || error.response.status === 400) {
    return { type: 'missing-data', message: error.response.data?.message || 'Mancano alcune informazioni per creare un piano affidabile.' };
  }
  return { type: 'server', message: 'Non è stato possibile creare il piano. Riprova.' };
};
