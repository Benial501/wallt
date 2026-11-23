/**
 * La frase del consulente del budget: quale caso mostrare, con quali numeri.
 *
 * Modulo puro. Restituisce un codice (constants/budget.js#CODICI_CONSIGLIO) e
 * i dati in centesimi; il testo lo compone il client
 * (client/src/content/budgetConsigli.js). Ne vale una sola, la prima vera
 * nell'ordine di priorità.
 *
 * Il budget non si adatta alle spese: il modello lo cambia solo l'utente.
 * Il consulente può soltanto suggerirne un altro, quando i Bisogni hanno
 * superato l'obiettivo per tre mesi completi di fila.
 */

// Il modello da suggerire a chi sfora i Bisogni con continuità. Nessun
// suggerimento per chi ha già i Bisogni più larghi o ha scelto lui le
// percentuali.
const MODELLO_PIU_LARGO = { equilibrato: 'spese_fisse_alte', risparmio_deciso: 'equilibrato' };

const dueCategoriePiuPesanti = (perCategoria) => [...(perCategoria || new Map()).entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 2)
  .map(([categoria]) => categoria);

/**
 * @param {{entrataCentesimi:number, modello:string, giorniRimanenti:number,
 *   bisogniOltreDaTreMesi:boolean, voci:{bisogni:{obiettivo:number,usato:number},
 *   desideri:{obiettivo:number,usato:number,perCategoria:Map<string,number>},
 *   futuro:{obiettivo:number,usato:number}}}} input
 * @returns {{codice:string, dati:object}}
 */
const scegliConsiglio = ({
  entrataCentesimi, modello, giorniRimanenti, bisogniOltreDaTreMesi, voci,
}) => {
  if (!(entrataCentesimi > 0)) return { codice: 'entrata_mancante', dati: {} };

  const { bisogni, desideri, futuro } = voci;

  if (bisogni.usato > bisogni.obiettivo) {
    return {
      codice: 'bisogni_oltre',
      dati: {
        eccedenza: bisogni.usato - bisogni.obiettivo,
        suggerisci_modello: (bisogniOltreDaTreMesi && MODELLO_PIU_LARGO[modello]) || null,
      },
    };
  }

  if (desideri.usato > desideri.obiettivo) {
    return {
      codice: 'desideri_oltre',
      dati: { eccedenza: desideri.usato - desideri.obiettivo, categorie: dueCategoriePiuPesanti(desideri.perCategoria) },
    };
  }

  if (futuro.obiettivo > 0 && futuro.usato < futuro.obiettivo) {
    return { codice: 'futuro_indietro', dati: { mancante: futuro.obiettivo - futuro.usato } };
  }

  return {
    codice: 'in_regola',
    dati: { restante_desideri: desideri.obiettivo - desideri.usato, giorni: giorniRimanenti },
  };
};

module.exports = { scegliConsiglio };
