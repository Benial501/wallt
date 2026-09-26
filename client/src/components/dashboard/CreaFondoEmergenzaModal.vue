<script setup>
import { ref, watch } from 'vue';
import WButton from '@/components/common/WButton.vue';
import WModal from '@/components/common/WModal.vue';
import { MESI_TARGET_AMMESSI, MESI_TARGET_DEFAULT } from '@/utils/fondoEmergenza';

const props = defineProps({
  open: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'crea']);
const mesiScelti = ref(MESI_TARGET_DEFAULT);

watch(() => props.open, (open) => {
  if (open) mesiScelti.value = MESI_TARGET_DEFAULT;
});
</script>

<template>
  <WModal :open="open" title="Creare il conto di emergenza?" @close="emit('close')">
    <p class="fondo-conferma__testo">
      Creo un conto separato, vuoto. I soldi che metterai dentro:
    </p>
    <ul class="fondo-conferma__elenco">
      <li>restano nel tuo patrimonio totale;</li>
      <li>non compaiono fra i soldi spendibili in home;</li>
      <li>si spostano solo con un trasferimento fra i tuoi conti, mai con una spesa.</li>
    </ul>

    <fieldset class="fondo-conferma__mesi">
      <legend>Quanti mesi di spese essenziali vuoi coprire?</legend>
      <div class="fondo-conferma__scelte">
        <label
          v-for="mesi in MESI_TARGET_AMMESSI"
          :key="mesi"
          class="fondo-conferma__scelta"
          :class="{ 'fondo-conferma__scelta--attiva': mesiScelti === mesi }"
        >
          <input v-model="mesiScelti" type="radio" name="mesi-target" :value="mesi">
          <span>{{ mesi }} mesi</span>
        </label>
      </div>
      <p class="fondo-conferma__nota">Puoi cambiare questa soglia quando vuoi.</p>
    </fieldset>

    <div class="fondo-conferma__azioni">
      <WButton variant="ghost" @click="emit('close')">Annulla</WButton>
      <WButton variant="primary" :loading="loading" @click="emit('crea', mesiScelti)">
        Crea il conto
      </WButton>
    </div>
  </WModal>
</template>

<style scoped>
.fondo-conferma__testo {
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.fondo-conferma__elenco {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0 0 1rem 1rem;
  padding: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.fondo-conferma__mesi {
  margin: 0 0 1rem;
  padding: 0;
  border: none;
}

.fondo-conferma__mesi legend {
  margin-bottom: 0.5rem;
  color: var(--text-primary);
  font-size: var(--text-sm);
  font-weight: 600;
}

.fondo-conferma__scelte { display: flex; gap: 0.5rem; }

.fondo-conferma__scelta {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
}

.fondo-conferma__scelta input { position: absolute; opacity: 0; pointer-events: none; }
.fondo-conferma__scelta--attiva { border-color: var(--accent-green); color: var(--text-primary); font-weight: 600; }
.fondo-conferma__scelta:focus-within { box-shadow: var(--focus-ring-tight); }
.fondo-conferma__nota { margin-top: 0.5rem; color: var(--text-muted); font-size: var(--text-xs); }
.fondo-conferma__azioni { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
