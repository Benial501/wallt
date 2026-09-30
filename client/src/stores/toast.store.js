import { defineStore } from 'pinia';
import { ref } from 'vue';
import { vibra } from '@/utils/haptica';

let nextId = 0;

/**
 * Quanto resta a schermo un messaggio, per tipo.
 *
 * Un errore non puo' durare quanto una conferma: la conferma dice che e'
 * andato tutto bene e si puo' ignorare, l'errore va letto e spesso contiene
 * un'istruzione ("controlla la connessione e riprova"). Tre secondi bastano
 * per "Movimento aggiunto", non per capire cosa fare dopo un guasto.
 */
const DURATE = {
  success: 3000,
  info: 3500,
  warning: 5000,
  error: 7000,
};

export const useToastStore = defineStore('toast', () => {
  const toasts = ref([]);
  const timer = new Map();

  const rimuovi = (id) => {
    const t = timer.get(id);
    if (t) { clearTimeout(t); timer.delete(id); }
    toasts.value = toasts.value.filter((x) => x.id !== id);
  };

  const programmaChiusura = (id, durata) => {
    const precedente = timer.get(id);
    if (precedente) clearTimeout(precedente);
    timer.set(id, setTimeout(() => rimuovi(id), durata));
  };

  const show = (message, type = 'info', duration = null) => {
    const id = ++nextId;
    const durata = duration ?? DURATE[type] ?? DURATE.info;
    toasts.value.push({ id, message, type, durata });
    programmaChiusura(id, durata);
    return id;
  };

  /** Sospende il conto alla rovescia: usato mentre il puntatore e' sopra. */
  const trattieni = (id) => {
    const t = timer.get(id);
    if (t) { clearTimeout(t); timer.delete(id); }
  };

  /** Riprende il conto alla rovescia quando il puntatore se ne va. */
  const riprendi = (id) => {
    const toast = toasts.value.find((x) => x.id === id);
    if (toast) programmaChiusura(id, toast.durata);
  };

  const reset = () => {
    for (const t of timer.values()) clearTimeout(t);
    timer.clear();
    toasts.value = [];
  };

  /**
   * Il riscontro tattile sta qui e non nei venti punti che mostrano un
   * messaggio: ogni esito dell'app passa gia' da questo store, quindi e'
   * l'unico posto in cui aggiungerlo una volta sola. `info` non vibra — e'
   * un'informazione, non l'esito di un gesto.
   */
  const success = (msg) => { vibra('successo'); return show(msg, 'success'); };
  const error = (msg) => { vibra('errore'); return show(msg, 'error'); };
  const warning = (msg) => { vibra('conferma'); return show(msg, 'warning'); };
  const info = (msg) => show(msg, 'info');

  return { toasts, show, success, error, info, warning, rimuovi, trattieni, riprendi, reset };
});
