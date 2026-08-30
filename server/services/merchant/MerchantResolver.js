/**
 * Seleziona il match merchant migliore tra i candidati.
 */
class MerchantResolver {
  resolve(candidates = []) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return null;
    }

    const sorted = [...candidates].sort((a, b) => {
      if (b.confidenza !== a.confidenza) return b.confidenza - a.confidenza;
      const lenA = (a.matchedKeyword || '').length;
      const lenB = (b.matchedKeyword || '').length;
      return lenB - lenA;
    });

    const best = sorted[0];
    if (!best || best.confidenza < 50) return null;

    return {
      merchantId: best.merchantId,
      merchant: best.merchant,
      merchantNormalized: best.merchantNormalized,
      categoria: best.category,
      activityType: best.activityType,
      confidenza: best.confidenza,
      matchedKeyword: best.matchedKeyword,
      source: 'merchant_dictionary',
    };
  }
}

module.exports = MerchantResolver;
