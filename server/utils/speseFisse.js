const toNumber = (val) => parseFloat(val) || 0;

/**
 * Spese fisse mensili dichiarate nell'onboarding: casa (affitto o mutuo),
 * bollette (metà se divise), carburante, mezzi pubblici e altre spese fisse.
 *
 * Sono dichiarazioni, non movimenti: servono a consigliare un modello di
 * budget prima che ci sia uno storico (services/budgetModello.js).
 */
const calcolaSpeseFisse = (profilo) => {
  let speseFisse = 0;

  if (['affitto', 'proprieta_mutuo'].includes(profilo.situazione_abitativa)) {
    speseFisse += toNumber(profilo.costo_abitazione);
  }

  if (profilo.paga_bollette === 'tutte') {
    speseFisse += toNumber(profilo.stima_bollette);
  } else if (profilo.paga_bollette === 'divise') {
    speseFisse += toNumber(profilo.stima_bollette) / 2;
  }

  if (profilo.ha_auto || profilo.ha_moto) {
    speseFisse += toNumber(profilo.spesa_benzina);
  }

  if (profilo.usa_mezzi_pubblici) {
    speseFisse += toNumber(profilo.spesa_mezzi);
  }

  speseFisse += toNumber(profilo.spese_fisse_extra);

  return Math.round(speseFisse * 100) / 100;
};

module.exports = { calcolaSpeseFisse };
