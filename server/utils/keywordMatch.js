/**
 * Matching di keyword con protezione dai falsi positivi su sottostringhe corte.
 * Riusa la stessa soglia già in uso in CategoryMatcherService/MerchantDictionary:
 * le keyword di 4 caratteri o meno devono corrispondere a un token intero
 * (altrimenti "ip" matcherebbe dentro "SKIPER", "tim" dentro "OPTIMUM",
 * "bar" dentro "BARBIERI"/"IMBARCO"/"BARILLA", ecc.). Le keyword più lunghe
 * o composte da più parole restano un match a sottostringa, dove il rischio
 * di falsi positivi è molto più basso.
 *
 * `text` e `keyword` devono essere già normalizzati (lowercase, accenti
 * rimossi) dal chiamante: questa funzione non fa normalizzazione propria,
 * per restare compatibile con le diverse normalizzazioni già in uso nei vari
 * moduli del progetto.
 */
const SHORT_KEYWORD_MAX_LENGTH = 4;

const tokenize = (text) => String(text ?? '').split(/[^a-z0-9]+/).filter(Boolean);

const matchesKeyword = (text, keyword, shortKeywordMaxLength = SHORT_KEYWORD_MAX_LENGTH) => {
  if (!text || !keyword) return false;

  if (keyword.includes(' ')) {
    return text.includes(keyword);
  }

  if (keyword.length <= shortKeywordMaxLength) {
    return tokenize(text).includes(keyword);
  }

  return text.includes(keyword);
};

module.exports = {
  matchesKeyword,
  SHORT_KEYWORD_MAX_LENGTH,
};
