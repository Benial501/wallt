import { defineStore } from 'pinia';
import { computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';
import { loadCategorie, getCategoriaUscita } from '@/utils/categorie';
import { essenzialitaPerSpostamento } from '@/utils/budget';

/**
 * Budget a tre voci (Bisogni, Desideri, Futuro): un piano unico salvato sul
 * profilo, che vale per ogni mese finché l'utente non lo cambia.
 *
 * Due letture: il piano (con il modello consigliato e gli importi di ogni
 * modello, servono anche quando il piano non c'è ancora) e lo stato del mese,
 * che esiste solo se c'è un piano. Fuori dallo store si leggono i getter
 * calcolati, mai le risorse annidate (Coding Rule 23).
 */
export const useBudgetStore = defineStore('budget', () => {
  const risorsaPiano = creaRisorsa(
    async () => {
      const { data } = await api.get('/budget/piano');
      return data;
    },
    // "Vuoto" significa: il server ha risposto e il piano non c'è. I modelli e
    // il consigliato arrivano comunque, e la scelta del modello li usa.
    { iniziale: null, vuotoSe: (d) => !d || !d.piano },
  );

  const risorsaStato = creaRisorsa(
    async () => {
      const { data } = await api.get('/budget/stato');
      return data;
    },
    { iniziale: null },
  );

  // Su errore restano gli ultimi dati validi: `carica` non tocca mai `data`
  // quando fallisce (Coding Rule 17).
  const piano = computed(() => risorsaPiano.data.value?.piano || null);
  const entrata = computed(() => risorsaPiano.data.value?.entrata ?? null);
  const consigliato = computed(() => risorsaPiano.data.value?.consigliato || null);
  const modelli = computed(() => risorsaPiano.data.value?.modelli || []);
  const haPiano = computed(() => !!piano.value);
  const stato = computed(() => risorsaStato.data.value);
  const voci = computed(() => stato.value?.voci || null);
  const consiglio = computed(() => stato.value?.consiglio || null);
  const daAttribuire = computed(() => stato.value?.da_attribuire || null);

  /**
   * Stato della pagina: combina le due letture. Con un piano la pagina non è
   * pronta finché lo stato del mese non ha risposto almeno una volta, e se lo
   * stato non si aggiorna deve dichiarare che i numeri sono vecchi.
   */
  const statoPagina = computed(() => {
    const principale = risorsaPiano.stato.value;
    if (principale !== 'pronto') return principale;
    // Senza nessuno stato del mese letto la pagina non ha numeri da mostrare:
    // un errore lì è un errore della pagina, non un avviso sopra dati vecchi.
    if (risorsaStato.lastUpdated.value === null) {
      return risorsaStato.error.value ? 'errore' : 'caricamento';
    }
    if (risorsaStato.error.value) return 'errore-con-dati';
    return principale;
  });

  /** Il più vecchio dei due aggiornamenti riusciti: l'avviso non deve
   *  vantare una freschezza che una delle due letture non ha. */
  const lastUpdatedPagina = computed(() => {
    const a = risorsaPiano.lastUpdated.value;
    const b = risorsaStato.lastUpdated.value;
    if (a === null) return b;
    if (b === null) return a;
    return Math.min(a, b);
  });

  const caricaStato = () => (haPiano.value ? risorsaStato.carica() : undefined);

  /** Legge il piano e, se c'è, lo stato del mese. */
  const carica = async () => {
    await risorsaPiano.carica();
    return caricaStato();
  };

  /**
   * Ritenta il piano e poi (ri)carica lo stato: al primo caricamento fallito
   * lo stato non è mai stato chiesto, quindi non c'è nulla da ripetere.
   */
  const riprovaPagina = async () => {
    await risorsaPiano.riprova();
    return caricaStato();
  };

  /** Salva il modello scelto. Per un modello pronto il server usa le sue
   *  percentuali, qualunque cosa venga inviata. */
  const salvaPiano = async ({ modello, percentuali }) => {
    await api.put('/budget/piano', percentuali ? { modello, percentuali } : { modello });
    return carica();
  };

  /** L'entrata è quella del profilo: il budget non ne tiene una sua. */
  const salvaEntrata = async (importo) => {
    await api.put('/profilo', { entrata_mensile: importo });
    return carica();
  };

  /**
   * Sposta una categoria fra Bisogni e Desideri cambiandone l'essenzialità,
   * con le rotte delle categorie che esistono già. La stessa classificazione
   * vale per il fondo di emergenza.
   */
  const spostaCategoria = async (categoria, voceDestinazione) => {
    const essenzialita = essenzialitaPerSpostamento(categoria, voceDestinazione);
    if (categoria.predefinita) {
      await api.put(`/categorie/default/${encodeURIComponent(categoria.categoria)}/essenzialita`, { essenzialita });
    } else {
      // La rotta delle categorie personali riscrive la categoria intera:
      // nome, icona e colore restano quelli che ha.
      const personale = getCategoriaUscita(categoria.categoria);
      if (!personale) throw new Error('Categoria non trovata');
      await api.put(`/categorie/${encodeURIComponent(categoria.categoria)}`, {
        nome: personale.nome, tipo: 'uscita', icona: personale.icona, colore: personale.colore, essenzialita,
      });
    }
    await Promise.all([risorsaStato.carica(), loadCategorie()]);
  };

  const reset = () => {
    risorsaPiano.reset();
    risorsaStato.reset();
  };

  return {
    piano, entrata, consigliato, modelli, haPiano, stato, voci, consiglio, daAttribuire,
    statoPagina, lastUpdatedPagina,
    carica, riprovaPagina, salvaPiano, salvaEntrata, spostaCategoria, reset,
  };
});
