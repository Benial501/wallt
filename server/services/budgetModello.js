/**
 * Modelli del budget a tre voci: quale consigliare, quali percentuali valgono
 * per un piano, quanti centesimi spettano a ogni voce.
 *
 * Modulo puro, senza database: gira anche in `npm run test:unit`. I numeri
 * stanno in constants/budget.js.
 */
const {
  VOCI, MODELLI_PRONTI, MODELLO_PERSONALIZZATO, SOGLIA_SPESE_FISSE_ALTE, percentualiValide,
} = require('../constants/budget');
const { calcolaSpeseFisse } = require('../utils/speseFisse');

const entrataInCentesimi = (entrataEuro) => {
  const valore = parseFloat(entrataEuro);
  if (!Number.isFinite(valore) || valore <= 0) return 0;
  return Math.round(valore * 100);
};

const consiglio = (modello, codice, quota) => ({
  modello,
  percentuali: { ...MODELLI_PRONTI[modello] },
  motivo: { codice, quota_spese_fisse: quota },
});

/**
 * Il modello da proporre alla prima scelta, dal profilo dell'onboarding.
 * Vale solo in quel momento: una volta salvato, il piano non segue il profilo.
 */
const consigliaModello = (profilo) => {
  if (profilo?.situazione_abitativa === 'vivo_con_genitori') {
    return consiglio('risparmio_deciso', 'vive_con_genitori', null);
  }
  const entrata = entrataInCentesimi(profilo?.entrata_mensile);
  if (!entrata) return consiglio('equilibrato', 'senza_entrata', null);

  // In centesimi interi: 810 € su 2.000 € dà 40,5 punti esatti, non
  // 40,4999… da arrotondare per il verso sbagliato.
  const speseFisse = Math.round(calcolaSpeseFisse(profilo) * 100);
  const quota = Math.round((speseFisse * 100) / entrata) / 100;
  // Confronto stretto e sul valore non arrotondato: con le spese fisse
  // esattamente al 40% il 50% dei Bisogni lascia ancora dieci punti a spesa
  // alimentare e salute.
  if (speseFisse / entrata > SOGLIA_SPESE_FISSE_ALTE) return consiglio('spese_fisse_alte', 'spese_fisse_alte', quota);
  return consiglio('equilibrato', 'equilibrato', quota);
};

/**
 * Le percentuali che valgono per un piano. Per un modello pronto sono quelle
 * del server, qualunque cosa sia stata inviata; per «personalizzato» quelle
 * inviate, se valide. `null` se il piano non è accettabile.
 */
const percentualiDelPiano = (modello, percentuali) => {
  if (MODELLI_PRONTI[modello]) return { ...MODELLI_PRONTI[modello] };
  if (modello === MODELLO_PERSONALIZZATO && percentualiValide(percentuali)) {
    return VOCI.reduce((acc, v) => ({ ...acc, [v]: percentuali[v] }), {});
  }
  return null;
};

/**
 * Obiettivo di ogni voce in centesimi interi, a somma esatta: il resto della
 * divisione va alle voci con la parte frazionaria più alta (metodo del resto
 * maggiore) e, a parità, nell'ordine di VOCI.
 */
const obiettiviInCentesimi = (percentuali, entrataEuro) => {
  const totale = entrataInCentesimi(entrataEuro);
  const quote = VOCI.map((voce, indice) => {
    const esatto = totale * percentuali[voce];
    return { voce, indice, intero: Math.floor(esatto / 100), resto: esatto % 100 };
  });
  let daAssegnare = totale - quote.reduce((s, q) => s + q.intero, 0);
  [...quote]
    .sort((a, b) => b.resto - a.resto || a.indice - b.indice)
    .forEach((q) => {
      if (daAssegnare > 0 && q.resto > 0) {
        q.intero += 1;
        daAssegnare -= 1;
      }
    });
  return quote.reduce((acc, q) => ({ ...acc, [q.voce]: q.intero }), {});
};

module.exports = { consigliaModello, percentualiDelPiano, obiettiviInCentesimi };
