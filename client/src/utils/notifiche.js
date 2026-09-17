import { creaRisorsa } from './risorsa.js';

export const DATI_NOTIFICHE_INIZIALI = Object.freeze({
  notifiche: [],
  totale: 0,
  nonLette: 0,
});

export const creaRisorsaNotifiche = (fetcher) => creaRisorsa(fetcher, {
  iniziale: DATI_NOTIFICHE_INIZIALI,
  vuotoSe: (data) => (data?.notifiche || []).length === 0,
});
