import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const mostraFormMovimento = ref(false);
  const tipoFormMovimento = ref('uscita');

  function apriFormEntrata() {
    tipoFormMovimento.value = 'entrata';
    mostraFormMovimento.value = true;
  }

  function apriFormUscita() {
    tipoFormMovimento.value = 'uscita';
    mostraFormMovimento.value = true;
  }

  function apriFormTrasferimento() {
    tipoFormMovimento.value = 'trasferimento';
    mostraFormMovimento.value = true;
  }

  function chiudiForm() {
    mostraFormMovimento.value = false;
  }

  return {
    mostraFormMovimento,
    tipoFormMovimento,
    apriFormEntrata,
    apriFormUscita,
    apriFormTrasferimento,
    chiudiForm,
  };
});
