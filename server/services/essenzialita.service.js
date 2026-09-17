const round2 = (val) => Math.round(val * 100) / 100;

/** Essenzialita di una categoria, o 'discrezionale' se non trovata (es. una
 * categoria personale poi eliminata: meglio sottostimare l'essenziale che
 * sovrastimarlo). */
const getEssenzialita = (categoriaId, categorieUscita) => {
  const cat = categorieUscita.find((c) => c.id === categoriaId);
  return cat?.essenzialita || 'discrezionale';
};

/**
 * @param {Object<string, number>} totaliPerCategoria - es. { svago: 120, affitto: 800 }
 * @param {Array} categorieUscita - list(userId) filtrato a tipo 'uscita'
 */
const aggregaPerEssenzialita = (totaliPerCategoria, categorieUscita) => {
  const totali = { essenziale: 0, semi_essenziale: 0, discrezionale: 0 };
  Object.entries(totaliPerCategoria || {}).forEach(([categoriaId, importo]) => {
    const essenzialita = getEssenzialita(categoriaId, categorieUscita);
    totali[essenzialita] = (totali[essenzialita] || 0) + (parseFloat(importo) || 0);
  });
  return {
    essenziale: round2(totali.essenziale),
    semi_essenziale: round2(totali.semi_essenziale),
    discrezionale: round2(totali.discrezionale),
    totale: round2(totali.essenziale + totali.semi_essenziale + totali.discrezionale),
  };
};

module.exports = { getEssenzialita, aggregaPerEssenzialita };
