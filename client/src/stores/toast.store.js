import { defineStore } from 'pinia';
import { ref } from 'vue';

let nextId = 0;

export const useToastStore = defineStore('toast', () => {
  const toasts = ref([]);

  const show = (message, type = 'info', duration = 3000) => {
    const id = ++nextId;
    toasts.value.push({ id, message, type });

    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, duration);
  };

  const success = (msg) => show(msg, 'success');
  const error = (msg) => show(msg, 'error');
  const info = (msg) => show(msg, 'info');
  const warning = (msg) => show(msg, 'warning');

  return { toasts, show, success, error, info, warning };
});
