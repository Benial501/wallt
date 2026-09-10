/**
 * Categorie del modulo di assistenza e di contatto.
 *
 * Copia per il frontend di `server/constants/supportCategories.js`: deve
 * restare identica carattere per carattere, apostrofo ASCII compreso. Una
 * differenza fa comparire nella UI una voce che l'API rifiuta con 400.
 */
export const SUPPORT_CATEGORIES = [
  'Problema tecnico',
  "Problema con l'account",
  'Problema con entrate/uscite',
  'Suggerimento',
  'Segnalazione bug',
  'Altro',
];

export const SUBJECT_MAX = 160;
export const MESSAGE_MAX = 5000;
