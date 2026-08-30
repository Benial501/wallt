const { normalizeText } = require('./textUtils');
const { CATEGORIE_USCITA_IDS, CATEGORIE_ENTRATA_IDS } = require('../../constants/categorie');

const ENTRATA_CATEGORIE = new Set(CATEGORIE_ENTRATA_IDS);
const USCITA_CATEGORIE = new Set(CATEGORIE_USCITA_IDS);

/**
 * Confronta descrizione pulita con MerchantDictionary.
 */
class MerchantMatcher {
  constructor({ dictionary } = {}) {
    this.dictionary = dictionary;
  }

  match({ cleanedDescription, tipo, candidates = null }) {
    const text = normalizeText(cleanedDescription);
    if (!text || !this.dictionary) {
      return [];
    }

    const rawCandidates = candidates || this.dictionary.findCandidates(text);
    if (!rawCandidates.length) return [];

    return rawCandidates
      .map(({ merchant, matchedKeyword, score }) => {
        const categoryOk = this._isCategoryCompatible(merchant.category, tipo);
        const adjustedScore = categoryOk ? score : Math.max(0, score - 25);

        return {
          merchantId: merchant.id,
          merchant: merchant.name,
          merchantNormalized: merchant.nameNormalized,
          category: merchant.category,
          activityType: merchant.activityType,
          confidenza: Math.min(100, Math.round(adjustedScore)),
          matchedKeyword,
          categoryCompatible: categoryOk,
        };
      })
      .filter((c) => c.confidenza >= 40)
      .sort((a, b) => b.confidenza - a.confidenza);
  }

  _isCategoryCompatible(category, tipo) {
    if (!category || !tipo) return true;
    if (tipo === 'entrata') return ENTRATA_CATEGORIE.has(category);
    if (tipo === 'uscita') return USCITA_CATEGORIE.has(category);
    return true;
  }
}

module.exports = MerchantMatcher;
