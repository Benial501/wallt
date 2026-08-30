const CategoryKnowledgeBase = require('../../../import/category/CategoryKnowledgeBase');
const { normalizeText, tokenize } = require('../../../import/category/textUtils');
const AITransactionClassifierProvider = require('../AITransactionClassifierProvider');
const { normalizeCategory } = require('../categoryLists');

const IT_STOPWORDS = new Set([
  'pagamento', 'pos', 'operazione', 'transazione', 'trx', 'carta', 'card',
  'bancomat', 'atm', 'sepa', 'sdd', 'sct', 'the', 'and', 'via', 'milano', 'roma',
]);

/**
 * Provider AI locale (offline, senza API esterne).
 * Fallback garantito all'interno del layer AI.
 */
class LocalAITransactionProvider extends AITransactionClassifierProvider {
  constructor() {
    super({ name: 'local', enabled: true });
    this.knowledgeBase = new CategoryKnowledgeBase();
  }

  _inferMerchantName(cleanedDescription) {
    const tokens = tokenize(cleanedDescription)
      .filter((t) => !IT_STOPWORDS.has(t) && t.length >= 3);

    if (!tokens.length) return null;

    const nameTokens = tokens.slice(0, 3);
    return nameTokens
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
      .join(' ');
  }

  async classify({ descrizione, cleanedDescription, tipo } = {}) {
    const text = String(descrizione ?? '').trim();
    const cleaned = String(cleanedDescription ?? text).trim();
    if (!text && !cleaned) return null;

    const kbResult = this.knowledgeBase.score({ tipo, descrizione: text || cleaned });
    const merchant = this._inferMerchantName(cleaned || text);

    if (kbResult && kbResult.confidenza >= 40) {
      const categoria = normalizeCategory(kbResult.categoria, tipo);
      const matched = kbResult.matchedPattern || 'profilo categoria locale';

      return {
        merchant,
        categoria,
        motivazione: `Profilo locale: keyword "${matched}" associata a ${categoria}.`,
        confidenza: Math.round(Math.min(85, kbResult.confidenza)),
        provider: this.name,
      };
    }

    const norm = normalizeText(cleaned || text);
    const heuristicRules = tipo === 'entrata'
      ? [
        { categoria: 'stipendio', patterns: ['stipend', 'salary', 'payroll'], conf: 72, reason: 'Termini tipici di accredito stipendio.' },
        { categoria: 'altro_entrata', patterns: ['bonific', 'accred', 'ricev', 'incass'], conf: 58, reason: 'Movimento in entrata generico.' },
      ]
      : [
        { categoria: 'cibo_spesa', patterns: ['spesa', 'supermerc', 'aliment', 'market'], conf: 58, reason: 'Termini legati alla spesa alimentare.' },
        { categoria: 'benzina_trasporti', patterns: ['benzin', 'carbur', 'distribut', 'autostr'], conf: 60, reason: 'Termini legati a carburante o mobilità.' },
        { categoria: 'bollette', patterns: ['bollett', 'utenz', 'luce', 'gas'], conf: 58, reason: 'Termini tipici di utenze e bollette.' },
        { categoria: 'svago', patterns: ['ristor', 'bar', 'pizzer', 'cinema'], conf: 55, reason: 'Termini legati a svago o ristorazione.' },
        { categoria: 'acquisti_vari', patterns: ['pos', 'pagament', 'acquist', 'shop'], conf: 48, reason: 'Pagamento POS/acquisto generico.' },
      ];

    for (const rule of heuristicRules) {
      const hit = rule.patterns.find((p) => norm.includes(p));
      if (hit) {
        return {
          merchant,
          categoria: normalizeCategory(rule.categoria, tipo),
          motivazione: `${rule.reason} Rilevato: "${hit}".`,
          confidenza: rule.conf,
          provider: this.name,
        };
      }
    }

    if (kbResult) {
      return {
        merchant,
        categoria: normalizeCategory(kbResult.categoria, tipo),
        motivazione: `Analisi semantica locale con confidenza moderata (${kbResult.confidenza}).`,
        confidenza: Math.max(38, Math.round(kbResult.confidenza)),
        provider: this.name,
      };
    }

    const defaultCategoria = normalizeCategory(
      tipo === 'entrata' ? 'altro_entrata' : 'altro_uscita',
      tipo,
    );

    return {
      merchant,
      categoria: defaultCategoria,
      motivazione: 'Descrizione ambigua: classificazione generica per tipo movimento.',
      confidenza: 35,
      provider: this.name,
    };
  }
}

module.exports = LocalAITransactionProvider;
