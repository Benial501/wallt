const { RegolaPersonaleMerchant } = require('../../models');
const { normalizeText, extractLearningPattern } = require('./patternUtils');
const { matchesKeyword } = require('../../utils/keywordMatch');

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const { CATEGORIE_USCITA_IDS, CATEGORIE_ENTRATA_IDS } = require('../../constants/categorie');

const ENTRATA_CATEGORIE = new Set(CATEGORIE_ENTRATA_IDS);
const USCITA_CATEGORIE = new Set(CATEGORIE_USCITA_IDS);

const isCategoriaCompatibileConTipo = (categoria, tipo) => {
  if (!categoria) return true;
  if (tipo === 'entrata') return ENTRATA_CATEGORIE.has(categoria);
  if (tipo === 'uscita') return USCITA_CATEGORIE.has(categoria);
  return true;
};

/**
 * Regole personali Merchant Intelligence.
 * Apprende automaticamente da correzioni utente e ha priorità sul dizionario globale.
 */
class PersonalMerchantRulesService {
  static _sharedCache = new Map();

  static clearUserCache(userId) {
    if (userId) PersonalMerchantRulesService._sharedCache.delete(userId);
    else PersonalMerchantRulesService._sharedCache.clear();
  }

  constructor({ regolaModel = RegolaPersonaleMerchant } = {}) {
    this.RegolaPersonaleMerchant = regolaModel;
    this._cache = PersonalMerchantRulesService._sharedCache;
  }

  async loadRules(userId) {
    if (!userId) return [];
    if (this._cache.has(userId)) return this._cache.get(userId);

    const rules = await this.RegolaPersonaleMerchant.findAll({
      where: { user_id: userId, attiva: true },
      order: [['priorita', 'DESC'], ['updated_at', 'DESC'], ['id', 'ASC']],
    });

    this._cache.set(userId, rules);
    return rules;
  }

  computeConfidence({ rule, descriptionNorm, patternNorm, tipo }) {
    const exact = descriptionNorm === patternNorm;
    const patternLen = patternNorm.length;

    let base = exact ? 98 : 92;
    if (!exact) {
      if (patternLen >= 10) base = 96;
      else if (patternLen >= 6) base = 94;
      else base = 92;
    }

    const priorityBonus = clamp(Math.floor((rule.priorita ?? 85) / 4), 0, 8);
    const typePenalty = isCategoriaCompatibileConTipo(rule.categoria, tipo) ? 0 : -20;

    return Math.round(clamp(base + priorityBonus + typePenalty, 0, 100));
  }

  _findBestMatch({ personalRules, descrizione, cleanedDescription, tipo }) {
    if (!personalRules?.length) return null;

    const descriptionNorm = normalizeText(descrizione);
    const cleanedNorm = normalizeText(cleanedDescription || '');
    if (!descriptionNorm && !cleanedNorm) return null;

    const candidates = [];

    for (const rule of personalRules) {
      const patternNorm = normalizeText(rule.pattern);
      if (!patternNorm) continue;

      const matches = matchesKeyword(descriptionNorm, patternNorm)
        || (cleanedNorm && matchesKeyword(cleanedNorm, patternNorm));

      if (!matches) continue;
      if (rule.categoria && !isCategoriaCompatibileConTipo(rule.categoria, tipo)) continue;

      candidates.push({
        rule,
        patternNorm,
        confidenza: this.computeConfidence({
          rule,
          descriptionNorm,
          patternNorm,
          tipo,
        }),
      });
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => (
      b.confidenza - a.confidenza
      || b.patternNorm.length - a.patternNorm.length
      || (b.rule.priorita ?? 0) - (a.rule.priorita ?? 0)
    ));

    const best = candidates[0];
    const { rule, patternNorm, confidenza } = best;

    return {
      merchant: rule.merchant_name ?? null,
      merchantId: rule.merchant_id ?? null,
      categoria: rule.categoria ?? null,
      confidenza,
      matchedKeyword: patternNorm,
      source: 'user',
    };
  }

  matchFromRules({ personalRules, descrizione, cleanedDescription, tipo }) {
    return this._findBestMatch({ personalRules, descrizione, cleanedDescription, tipo });
  }

  matchForCategory({ personalRules, descrizione, cleanedDescription, tipo }) {
    const match = this._findBestMatch({ personalRules, descrizione, cleanedDescription, tipo });
    if (!match?.categoria) return null;

    return {
      categoria: match.categoria,
      confidenza: match.confidenza,
      categoria_automatica: true,
      matchedPattern: match.matchedKeyword,
      source: 'user',
    };
  }

  async learnRule({
    userId,
    descrizione,
    merchantName,
    merchantId,
    categoria,
    transaction,
  } = {}) {
    if (!userId) throw new Error('userId mancante');
    if (!descrizione) throw new Error('descrizione mancante');

    const pattern = extractLearningPattern(descrizione);
    if (!pattern) return null;

    const normalizedMerchant = merchantName ? String(merchantName).trim() : null;
    const normalizedMerchantId = merchantId ? String(merchantId).trim() : null;
    const normalizedCategoria = categoria ? String(categoria).trim() : null;

    if (!normalizedMerchant && !normalizedCategoria) return null;

    const prioritaIncrement = 15;
    const basePriorita = 85;

    const existing = await this.RegolaPersonaleMerchant.findOne({
      where: { user_id: userId, pattern, attiva: true },
      transaction,
    });

    if (existing) {
      if (normalizedMerchant) {
        existing.merchant_name = normalizedMerchant;
        if (normalizedMerchantId) existing.merchant_id = normalizedMerchantId;
      }
      if (normalizedCategoria) existing.categoria = normalizedCategoria;
      existing.priorita = Math.min(100, (existing.priorita ?? basePriorita) + prioritaIncrement);
      existing.attiva = true;
      await existing.save({ transaction });
      PersonalMerchantRulesService.clearUserCache(userId);
      return existing;
    }

    const rule = await this.RegolaPersonaleMerchant.create({
      user_id: userId,
      pattern,
      merchant_name: normalizedMerchant,
      merchant_id: normalizedMerchantId,
      categoria: normalizedCategoria,
      priorita: basePriorita,
      attiva: true,
    }, { transaction });

    PersonalMerchantRulesService.clearUserCache(userId);
    return rule;
  }
}

module.exports = PersonalMerchantRulesService;
