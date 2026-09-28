import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/utils/axios';

export const useScheduledPaymentsStore = defineStore('scheduledPayments', () => {
  const payments = ref([]);
  const loading = ref(false);
  const error = ref(null);
  const lastUpdated = ref(null);
  let generation = 0;
  const fetchPayments = async () => {
    const requestGeneration = ++generation;
    loading.value = true;
    try {
      const { data } = await api.get('/movimenti/programmate');
      if (requestGeneration !== generation) return undefined;
      payments.value = data.payments || [];
      error.value = null;
      lastUpdated.value = Date.now();
      return payments.value;
    } catch (err) {
      if (requestGeneration === generation) error.value = err;
      throw err;
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  };
  const refreshQuietly = async () => { try { await fetchPayments(); } catch { /* la scrittura sul server è già riuscita */ } };
  const createPayment = async (payload) => {
    const { data } = await api.post('/movimenti/programmate', payload);
    await refreshQuietly();
    return data.payment;
  };
  const createInstallmentPlan = async (payload) => {
    const { data } = await api.post('/movimenti/installment-plans', payload);
    await refreshQuietly();
    return data;
  };
  const confirmPayment = async (id) => {
    const { data } = await api.post(`/movimenti/programmate/${id}/conferma`);
    await refreshQuietly();
    return data;
  };
  const markIncomeLate = async (id) => {
    const { data } = await api.patch(`/movimenti/programmate/${id}/ritardo`);
    await refreshQuietly();
    return data.payment;
  };
  const cancelPayment = async (id) => {
    const { data } = await api.patch(`/movimenti/programmate/${id}/annulla`);
    await refreshQuietly();
    return data.payment;
  };
  const cancelPlan = async (id) => {
    const { data } = await api.patch(`/movimenti/installment-plans/${id}/annulla`);
    await refreshQuietly();
    return data.plan;
  };
  const reset = () => { generation += 1; payments.value = []; loading.value = false; error.value = null; lastUpdated.value = null; };
  return {
    payments, loading, error, lastUpdated, fetchPayments, createPayment, createInstallmentPlan,
    confirmPayment, markIncomeLate, cancelPayment, cancelPlan, reset,
  };
});
