
/**
 * Categorie che WALLT scrive da sé, senza che l'utente le scelga: non sono
 * eliminabili, altrimenti l'app genererebbe movimenti con una categoria che
 * l'utente ha tolto dalla propria lista.
 *
 * Ogni voce è verificata sul punto in cui viene scritta:
 * - da_verificare            fallback della cascata di categorizzazione
 *                            (CategoryMatcherService._finalize)
 * - altro_entrata            movimento "Saldo iniziale" alla creazione di un conto
 *                            (conti.controller.js)
 * - investimento             versamento su un investimento
 * - rendimento_investimenti  prelievo da un investimento
 *                            (investimenti.controller.js)
 * - deposito_scommesse       deposito su una piattaforma scommesse
 * - prelievo_scommesse       prelievo da una piattaforma scommesse
 *                            (scommesse.controller.js)
 *
 * `trasferimento_denaro` NON è qui: nessuno la scrive in automatico, è solo un
 * possibile esito della cascata, che _finalize scarta già se l'utente l'ha tolta.
 */
const CATEGORIE_SISTEMA_IDS = [
  'da_verificare',
  'altro_entrata',
  'investimento',
  'rendimento_investimenti',
  'deposito_scommesse',
  'prelievo_scommesse',
];
const CATEGORIE_SISTEMA = new Set(CATEGORIE_SISTEMA_IDS);
const isCategoriaSistema = id => CATEGORIE_SISTEMA.has(id);

// `sistema` viaggia fino al client: la UI deve sapere quali categorie non
// offrono l'eliminazione senza tenere una seconda copia di questo elenco.
const CATEGORIE_DEFAULT = require('./catalogoCategorie.json')
  .map(c => ({ ...c, sistema: isCategoriaSistema(c.id) }));
const CATEGORIE_USCITA_IDS = CATEGORIE_DEFAULT.filter(c => c.tipo === 'uscita').map(c => c.id);
const CATEGORIE_ENTRATA_IDS = CATEGORIE_DEFAULT.filter(c => c.tipo === 'entrata').map(c => c.id);
const CATEGORIE_USCITA_AI = CATEGORIE_USCITA_IDS;
const CATEGORIE_ENTRATA_AI = CATEGORIE_ENTRATA_IDS;
const CATEGORIA_USCITA_DISPLAY = Object.fromEntries(CATEGORIE_DEFAULT.filter(c => c.tipo === 'uscita').map(c => [c.id, c]));

module.exports = {
  CATEGORIE_DEFAULT,
  CATEGORIE_USCITA_IDS,
  CATEGORIE_ENTRATA_IDS,
  CATEGORIE_USCITA_AI,
  CATEGORIE_ENTRATA_AI,
  CATEGORIA_USCITA_DISPLAY,
  CATEGORIE_SISTEMA_IDS,
  CATEGORIE_SISTEMA,
  isCategoriaSistema,
};
