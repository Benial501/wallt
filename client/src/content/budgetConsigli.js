/**
 * Le frasi del consulente del budget.
 *
 * Il server sceglie il caso e manda i numeri (server/services/budgetConsiglio.js);
 * il testo si compone qui, con le etichette delle voci prese dal glossario,
 * così la lingua sta in un posto solo e ogni frase è verificabile
 * (tests/budgetConsigli.test.js).
 *
 * Solo testo: nessuna dipendenza da Vue, dall'API o dagli store.
 */
import { GLOSSARIO } from './glossario.js';
import { MODELLI_PRONTI, VOCI } from '../utils/budget.js';

const voce = (id) => GLOSSARIO[`budget_${id}`].etichetta;

const elenco = (nomi) => (nomi.length > 1 ? `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}` : nomi[0]);

const percentualiModello = (modello) => VOCI.map((v) => MODELLI_PRONTI[modello][v]).join('/');

const FRASI = {
  entrata_mancante: () => 'Indica la tua entrata mensile per vedere come dividerla.',

  bisogni_oltre: ({ eccedenza, suggerisci_modello: suggerito }, { formatValuta }) => {
    const frase = `I ${voce('bisogni')} hanno superato l'obiettivo di ${formatValuta(eccedenza)}: la differenza va tolta dai ${voce('desideri')}.`;
    if (!suggerito || !MODELLI_PRONTI[suggerito]) return frase;
    return `${frase} Il modello ${percentualiModello(suggerito)} potrebbe adattarsi meglio a te.`;
  },

  desideri_oltre: ({ eccedenza, categorie = [] }, { formatValuta, nomeCategoria }) => {
    const frase = `Hai superato i ${voce('desideri')} di ${formatValuta(eccedenza)}`;
    if (!categorie.length) return `${frase}.`;
    const verbo = categorie.length > 1 ? 'pesano' : 'pesa';
    return `${frase}: ${verbo} di più ${elenco(categorie.map(nomeCategoria))}.`;
  },

  futuro_indietro: ({ mancante }, { formatValuta }) => (
    `Mancano ${formatValuta(mancante)} per il ${voce('futuro')}: spostali sul conto risparmio. Piano Smart ti dice dove.`
  ),

  in_regola: ({ restante_desideri: restante, giorni }, { formatValuta }) => {
    let quando = 'fino a fine mese';
    if (giorni === 1) quando = 'per 1 giorno';
    else if (giorni > 1) quando = `per ${giorni} giorni`;
    return `Sei in linea: restano ${formatValuta(restante)} di ${voce('desideri')} ${quando}.`;
  },
};

/** Nome di ogni modello nella scelta del modello. */
export const NOMI_MODELLI = Object.freeze({
  equilibrato: 'Equilibrato',
  spese_fisse_alte: 'Spese fisse alte',
  risparmio_deciso: 'Risparmio deciso',
  personalizzato: 'Personalizzato',
});

/** Una riga che dice per chi è il modello. */
export const DESCRIZIONI_MODELLI = Object.freeze({
  equilibrato: 'Il modello più classico: metà a ciò che serve, un terzo a ciò che scegli, un quinto al futuro.',
  spese_fisse_alte: 'Per chi ha affitto o mutuo pesanti: prima di tutto pagare ciò che serve.',
  risparmio_deciso: 'Per chi ha poche spese fisse, ad esempio chi vive con i genitori.',
  personalizzato: 'Tre percentuali tue, che devono fare 100.',
});

const MOTIVI = {
  equilibrato: (quota) => `Le spese fisse che hai indicato valgono il ${quota}% della tua entrata: puoi permetterti il modello più classico.`,
  spese_fisse_alte: (quota) => `Le spese fisse che hai indicato valgono il ${quota}% della tua entrata: ai ${voce('bisogni')} serve più spazio.`,
  vive_con_genitori: () => 'Vivi con i tuoi genitori e hai poche spese fisse: puoi mettere da parte di più.',
  senza_entrata: () => 'È il modello più classico: un buon punto di partenza.',
};

/**
 * Perché WALLT consiglia quel modello, dal motivo calcolato dal server
 * (services/budgetModello.js#consigliaModello).
 * @param {{codice:string, quota_spese_fisse:?number}|null} motivo
 */
export const fraseMotivoModello = (motivo) => {
  const frase = motivo && MOTIVI[motivo.codice];
  if (!frase) return '';
  return frase(Math.round((motivo.quota_spese_fisse || 0) * 100));
};

/**
 * @param {{codice:string, dati:object}|null} consiglio - da GET /budget/stato
 * @param {{formatValuta:(n:number)=>string, nomeCategoria:(id:string)=>string}} opzioni
 * @returns {string} la frase, o '' per un codice che il client non conosce
 */
export const fraseConsiglio = (consiglio, opzioni) => {
  const frase = consiglio && FRASI[consiglio.codice];
  return frase ? frase(consiglio.dati || {}, opzioni) : '';
};
