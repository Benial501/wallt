const round2 = (val) => Math.round(val * 100) / 100;

/** I tre livelli che un utente può assegnare a una categoria (vedi
 * `constants/categorie.js#ESSENZIALITA_VALUES`, stessa lista, duplicata qui
 * solo per non far dipendere questo servizio puro dalle constants Express). */
const LIVELLI_VALIDI = ['essenziale', 'semi_essenziale', 'discrezionale'];

/** Quarto "livello": non è un giudizio di essenzialità, è l'assenza di uno.
 * Distinto da 'discrezionale' perché "non so" e "so che è facoltativa" sono
 * affermazioni diverse: la prima non deve mai ridurre silenziosamente le
 * spese essenziali stimate né gonfiare le spese "non essenziali". */
const NON_CLASSIFICATA = 'non_classificata';

/**
 * Essenzialità di una categoria.
 *
 * Ritorna NON_CLASSIFICATA (mai 'discrezionale') quando la categoria non è
 * nella lista fornita (es. un id orfano: una categoria personale cancellata
 * per davvero, o un id predefinito rimosso dal catalogo in una versione
 * successiva) o quando è presente ma il suo campo essenzialita non è uno dei
 * tre valori validi (es. categorie di tipo 'entrata', per cui l'essenzialità
 * non è applicabile ed è sempre null). Sottostimare le spese essenziali è un
 * rischio meno grave che dichiararle "note" quando non lo sono: per questo
 * NON_CLASSIFICATA resta comunque fuori dal totale essenziale di
 * `fondoSicurezza.service.js`, esattamente come 'discrezionale' — la
 * distinzione serve a chi consuma l'aggregazione per sapere che il dato è
 * incompleto, non a cambiare il calcolo del fondo di sicurezza.
 */
const getEssenzialita = (categoriaId, categorieUscita) => {
  const cat = categorieUscita.find((c) => c.id === categoriaId);
  if (cat && LIVELLI_VALIDI.includes(cat.essenzialita)) return cat.essenzialita;
  return NON_CLASSIFICATA;
};

/**
 * @param {Object<string, number>} totaliPerCategoria - es. { svago: 120, affitto: 800 }
 * @param {Array} categorieUscita - list(userId) filtrato a tipo 'uscita'
 * @returns {{essenziale:number, semi_essenziale:number, discrezionale:number,
 *   non_classificata:number, totale:number}} i quattro gruppi si
 *   riconciliano sempre con `totale` (== somma di `totaliPerCategoria`).
 */
const aggregaPerEssenzialita = (totaliPerCategoria, categorieUscita) => {
  const totali = {
    essenziale: 0, semi_essenziale: 0, discrezionale: 0, [NON_CLASSIFICATA]: 0,
  };
  Object.entries(totaliPerCategoria || {}).forEach(([categoriaId, importo]) => {
    const essenzialita = getEssenzialita(categoriaId, categorieUscita);
    totali[essenzialita] = (totali[essenzialita] || 0) + (parseFloat(importo) || 0);
  });
  return {
    essenziale: round2(totali.essenziale),
    semi_essenziale: round2(totali.semi_essenziale),
    discrezionale: round2(totali.discrezionale),
    non_classificata: round2(totali[NON_CLASSIFICATA]),
    totale: round2(totali.essenziale + totali.semi_essenziale
      + totali.discrezionale + totali[NON_CLASSIFICATA]),
  };
};

module.exports = {
  getEssenzialita, aggregaPerEssenzialita, LIVELLI_VALIDI, NON_CLASSIFICATA,
};
