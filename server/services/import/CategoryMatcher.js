const { matchesKeyword } = require('../../utils/keywordMatch');

const stripAccents = (str) => str.normalize('NFD').replace(/\p{Diacritic}/gu, '');

const normalizeText = (value) => {
  const str = String(value ?? '');
  return stripAccents(str).toLowerCase().replace(/\s+/g, ' ').trim();
};

/**
 * Motore di matching basato su parole chiave.
 * Responsabilità: decidere la categoria suggerita a partire da tipo + descrizione.
 */
class CategoryMatcher {
  constructor() {
    // Regole facilmente estendibili: basta aggiungere nuove keyword o nuove categoryId.
    this.rules = {
      entrata: [
        { categoryId: 'stipendio', keywords: ['stipendio', 'salary', 'payroll'] },
        { categoryId: 'altro_entrata', keywords: ['rimborso', 'rimborso spese', 'rimbors'] },
      ],
      uscita: [
        { categoryId: 'cibo_spesa', keywords: ['esselunga', 'coop', 'conad', 'lidl'] },
        { categoryId: 'acquisti_vari', keywords: ['amazon', 'zalando'] },
        { categoryId: 'benzina_trasporti', keywords: ['eni', 'q8', 'ip'] },
        { categoryId: 'abbonamenti', keywords: ['netflix', 'spotify', 'disney'] },
        { categoryId: 'bollette', keywords: ['enel', 'hera'] },
        // “Telefonia” non esiste come categoria dedicata nel system attuale: mappiamo su bollette.
        { categoryId: 'bollette', keywords: ['tim', 'vodafone', 'fastweb'] },
        { categoryId: 'mezzi_pubblici', keywords: ['trenitalia', 'italo'] },
        { categoryId: 'trasferimento_denaro', keywords: ['bonifico', 'transfer', 'trasferimento', 'p2p', 'satispay', 'wise'] },
      ],
    };
  }

  /**
   * `transaction.descrizionePulita`, se presente, è la descrizione già ripulita
   * da rumore bancario (codici POS, date, cifre carta, città finale) da
   * MerchantNormalizer: usarla riduce ulteriormente i match casuali rispetto
   * al testo grezzo dell'estratto conto. Se assente, si usa la descrizione
   * grezza normalizzata (comportamento invariato per i chiamanti esistenti).
   */
  match(transaction) {
    const text = normalizeText(transaction.descrizionePulita || transaction.descrizione);
    const tipo = transaction.tipo;

    const rulesForType = this.rules[tipo] || [];
    for (const rule of rulesForType) {
      if (rule.keywords.some((kw) => matchesKeyword(text, normalizeText(kw)))) {
        return rule.categoryId;
      }
    }

    return null;
  }
}

module.exports = CategoryMatcher;

