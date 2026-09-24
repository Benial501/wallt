import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { pianoSmartApi, pianoSmartError } from '@/api/pianoSmart.api';

const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clone = (value) => JSON.parse(JSON.stringify(value || []));

export const usePianoSmartStore = defineStore('pianoSmart', () => {
  const state = ref('idle');
  const input = ref({ amount: '', sourceType: '', recurring: null, mandatoryExpenses: 0, manualContextAnswers: {} });
  const readiness = ref(null);
  const preview = ref(null);
  const recommendedAllocations = ref([]);
  const finalAllocations = ref([]);
  const plans = ref([]);
  const selectedPlan = ref(null);
  const error = ref(null);

  const capitalToAllocate = computed(() => Math.max(n(input.value.amount) - n(input.value.mandatoryExpenses), 0));
  const finalTotal = computed(() => finalAllocations.value.reduce((sum, item) => sum + n(item.finalAmount ?? item.amount ?? item.recommendedAmount), 0));
  const allocationDifference = computed(() => Math.round((capitalToAllocate.value - finalTotal.value) * 100) / 100);
  const canSave = computed(() => Boolean(preview.value) && Math.abs(allocationDifference.value) < 0.005 && state.value !== 'saving');

  const setError = (err) => { error.value = pianoSmartError(err); state.value = 'error'; };
  async function loadReadiness() {
    state.value = 'contextLoading'; error.value = null;
    try { readiness.value = await pianoSmartApi.getReadiness(); state.value = readiness.value?.questions?.length ? 'needsInput' : 'idle'; return readiness.value; } catch (err) { setError(err); return null; }
  }
  async function generatePreview() {
    state.value = 'generating'; error.value = null;
    try {
      const result = await pianoSmartApi.createPreview({ ...input.value, amount: String(input.value.amount), mandatoryExpenses: String(input.value.mandatoryExpenses) });
      preview.value = result;
      recommendedAllocations.value = clone(result.allocations || []);
      finalAllocations.value = clone(result.allocations || []);
      state.value = 'previewReady'; return result;
    } catch (err) { setError(err); return null; }
  }
  async function savePlan() {
    if (!canSave.value) return null;
    state.value = 'saving'; error.value = null;
    try { const result = await pianoSmartApi.createPlan({ ...input.value, allocations: finalAllocations.value }); state.value = 'saved'; return result; } catch (err) { setError(err); return null; }
  }
  async function loadPlans() { try { plans.value = await pianoSmartApi.listPlans(); return plans.value; } catch (err) { setError(err); return []; } }
  async function loadPlan(id) { selectedPlan.value = await pianoSmartApi.getPlan(id); return selectedPlan.value; }
  async function updateStatus(id, status) { const result = await pianoSmartApi.updatePlan(id, { status }); await loadPlans(); return result; }
  function resetFinalAllocations() { finalAllocations.value = clone(recommendedAllocations.value); }
  function reset() { state.value = 'idle'; input.value = { amount: '', sourceType: '', recurring: null, mandatoryExpenses: 0, manualContextAnswers: {} }; readiness.value = null; preview.value = null; recommendedAllocations.value = []; finalAllocations.value = []; error.value = null; }
  return { state, input, readiness, preview, recommendedAllocations, finalAllocations, plans, selectedPlan, error, capitalToAllocate, allocationDifference, canSave, loadReadiness, generatePreview, savePlan, loadPlans, loadPlan, updateStatus, resetFinalAllocations, reset };
});
