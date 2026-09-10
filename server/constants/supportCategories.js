/**
 * Categorie del modulo di assistenza e di contatto.
 *
 * Unica fonte lato server: le usano sia la rotta autenticata `/api/support`
 * sia quella pubblica `/api/contatto`. La copia per il frontend sta in
 * `client/src/utils/supportCategories.js` e deve restare identica carattere per
 * carattere, apostrofo ASCII compreso: una differenza qui fa comparire nella UI
 * una voce che l'API rifiuta con 400.
 */
const SUPPORT_CATEGORIES = [
  'Problema tecnico',
  "Problema con l'account",
  'Problema con entrate/uscite',
  'Suggerimento',
  'Segnalazione bug',
  'Altro',
];

module.exports = { SUPPORT_CATEGORIES };
