const { CategorieRegola } = require('../../models');
const BaseCategoryMatcher = require('./CategoryMatcher');
const CategoryHistoryMatcher = require('./category/CategoryHistoryMatcher');
const LocalAIClassifier = require('./category/LocalAIClassifier');
const OpenAICategoryClassifier = require('./category/OpenAICategoryClassifier');
const { normalizeText } = require('./category/textUtils');
const { matchesKeyword } = require('../../utils/keywordMatch');
const PersonalMerchantRulesService = require('../merchant/PersonalMerchantRulesService');
const MerchantNormalizer = require('../merchant/MerchantNormalizer');
const { getUserAiCategorizationEnabled } = require('../aiConsent.service');
const { CATEGORIE_USCITA_IDS, CATEGORIE_ENTRATA_IDS } = require('../../constants/categorie');

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const ENTRATA_CATEGORIE = new Set(CATEGORIE_ENTRATA_IDS);
const USCITA_CATEGORIE = new Set(CATEGORIE_USCITA_IDS);

const isCategoriaCompatibileConTipo = (categoria, tipo) => {
  if (!categoria) return false;
  if (tipo === 'entrata') return ENTRATA_CATEGORIE.has(categoria);
  if (tipo === 'uscita') return USCITA_CATEGORIE.has(categoria);
  return true;
};

const defaultCategoria = (tipo) => (tipo === 'entrata' ? 'altro_entrata' : 'altro_uscita');

const REVOLUT_CATEGORY_MAP = {
  groceries: 'cibo_spesa',
  grocery: 'cibo_spesa',
  restaurants: 'cibo_spesa',
  restaurant: 'cibo_spesa',
  shopping: 'acquisti_vari',
  transport: 'benzina_trasporti',
  travel: 'svago',
  bills: 'bollette',
  utilities: 'bollette',
  entertainment: 'svago',
  health: 'salute',
  subscriptions: 'abbonamenti',
  services: 'altro_uscita',
  cash: 'altro_uscita',
  transfer: 'trasferimento_denaro',
  p2p: 'trasferimento_denaro',
  exchange: 'altro_uscita',
  topup: 'altro_entrata',
  top_up: 'altro_entrata',
  salary: 'stipendio',
  refund: 'altro_entrata',
};

const mapRevolutCategory = (revolutCategory, tipo) => {
  if (!revolutCategory) return null;
  const key = normalizeText(revolutCategory).replace(/\s+/g, '_');
  const mapped = REVOLUT_CATEGORY_MAP[key];
  if (!mapped) return null;
  return isCategoriaCompatibileConTipo(mapped, tipo) ? mapped : null;
};

const mapRevolutType = (revolutType, tipo) => {
  if (!revolutType || tipo !== 'uscita') return null;
  const key = normalizeText(revolutType).replace(/\s+/g, '_');
  if (key === 'transfer' || key === 'p2p') return 'trasferimento_denaro';
  return null;
};

const patternMatches = (descriptionNorm, patternNorm) => matchesKeyword(descriptionNorm, patternNorm);

/**
 * Pipeline categorizzazione:
 * 1. Regole utente
 * 2. Regole globali
 * 3. Storico movimenti utente
 * 4. AI locale (knowledge + euristiche)
 * 5. OpenAI opzionale (batch)
 * 6. Fallback categoria generica (sempre)
 */
class CategoryMatcherService {
  static _sharedRulesCache = new Map();

  static clearUserCache(userId) {
    if (userId) CategoryMatcherService._sharedRulesCache.delete(userId);
    else CategoryMatcherService._sharedRulesCache.clear();
  }

  constructor({
    categorieRegolaModel = CategorieRegola,
    fallbackMatcher = new BaseCategoryMatcher(),
    historyMatcher = new CategoryHistoryMatcher(),
    localAI = new LocalAIClassifier(),
    openAI = new OpenAICategoryClassifier(),
    personalMerchantRulesService = new PersonalMerchantRulesService(),
    merchantNormalizer = new MerchantNormalizer(),
  } = {}) {
    this.CategorieRegola = categorieRegolaModel;
    this.fallbackMatcher = fallbackMatcher;
    this.historyMatcher = historyMatcher;
    this.localAI = localAI;
    this.openAI = openAI;
    this.personalMerchantRulesService = personalMerchantRulesService;
    this.merchantNormalizer = merchantNormalizer;
    this._rulesCache = CategoryMatcherService._sharedRulesCache;
  }

  invalidateCache(userId) {
    CategoryMatcherService.clearUserCache(userId);
  }

  async _loadRules(userId) {
    if (this._rulesCache.has(userId)) return this._rulesCache.get(userId);

    const [userRules, globalRules] = await Promise.all([
      this.CategorieRegola.findAll({
        where: { attiva: true, user_id: userId },
        order: [['priorita', 'DESC'], ['id', 'ASC']],
      }),
      this.CategorieRegola.findAll({
        where: { attiva: true, user_id: null },
        order: [['priorita', 'DESC'], ['id', 'ASC']],
      }),
    ]);

    const payload = { userRules, globalRules };
    this._rulesCache.set(userId, payload);
    return payload;
  }

  computeConfidence({ tipo, descriptionNorm, rule, source }) {
    const patternNorm = normalizeText(rule.pattern);
    const patternLen = patternNorm.length;
    const exact = descriptionNorm === patternNorm;

    let base;
    if (exact) base = 95;
    else if (patternLen >= 10) base = 82;
    else if (patternLen >= 6) base = 72;
    else if (patternLen >= 3) base = 58;
    else base = 35;

    const sourceBonus = source === 'user' ? 12 : 8;
    const priorityBonus = clamp(Math.floor((rule.priorita ?? 50) / 5), 0, 20);
    const lengthBonus = clamp(Math.floor(patternLen / 2), 0, 10);
    const typeCompatibilityBonus = isCategoriaCompatibileConTipo(rule.categoria, tipo) ? 0 : -15;

    return Math.round(clamp(
      base + sourceBonus + priorityBonus + lengthBonus + typeCompatibilityBonus,
      0,
      100,
    ));
  }

  _matchRules({ tipo, descriptionNorm, rules, source }) {
    const candidates = [];

    for (const rule of rules) {
      if (!isCategoriaCompatibileConTipo(rule.categoria, tipo)) continue;
      const patternNorm = normalizeText(rule.pattern);
      if (!patternNorm) continue;
      if (patternMatches(descriptionNorm, patternNorm)) {
        candidates.push({
          categoria: rule.categoria,
          confidenza: this.computeConfidence({ tipo, descriptionNorm, rule, source }),
          matchedPattern: patternNorm,
          source,
          priorita: rule.priorita ?? 50,
          patternLen: patternNorm.length,
        });
      }
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => (
      b.confidenza - a.confidenza
      || b.patternLen - a.patternLen
      || b.priorita - a.priorita
    ));

    const best = candidates[0];
    return {
      categoria: best.categoria,
      confidenza: best.confidenza,
      categoria_automatica: true,
      matchedPattern: best.matchedPattern,
      source: best.source,
    };
  }

  async _matchSingle({ userId, transaction, rulesPayload, personalMerchantRules = [] }) {
    const tipo = transaction?.tipo;
    const descrizione = transaction?.descrizione;
    if (!tipo || !descrizione) {
      return {
        categoria: defaultCategoria(tipo),
        confidenza: 25,
        categoria_automatica: true,
        source: 'default',
        matchedPattern: null,
      };
    }

    const descriptionNorm = normalizeText(descrizione);
    if (!descriptionNorm) {
      return {
        categoria: defaultCategoria(tipo),
        confidenza: 25,
        categoria_automatica: true,
        source: 'default',
        matchedPattern: null,
      };
    }

    const { cleaned } = this.merchantNormalizer.normalize(descrizione);

    const fromRevolut = mapRevolutCategory(transaction.revolutCategory, tipo)
      || mapRevolutType(transaction.revolutType, tipo);
    if (fromRevolut) {
      return {
        categoria: fromRevolut,
        confidenza: 88,
        categoria_automatica: true,
        source: 'revolut',
        matchedPattern: transaction.revolutCategory || transaction.revolutType,
      };
    }

    const descriptionsToMatch = [descriptionNorm];
    if (cleaned && cleaned !== descriptionNorm) descriptionsToMatch.push(cleaned);

    const fromPersonalMerchant = this.personalMerchantRulesService.matchForCategory({
      personalRules: personalMerchantRules,
      descrizione,
      cleanedDescription: cleaned,
      tipo,
    });
    if (fromPersonalMerchant) return fromPersonalMerchant;

    const { userRules, globalRules } = rulesPayload;

    const fromUser = descriptionsToMatch.reduce((found, desc) => (
      found || this._matchRules({ tipo, descriptionNorm: desc, rules: userRules, source: 'user' })
    ), null);
    if (fromUser) return fromUser;

    const fromGlobal = descriptionsToMatch.reduce((found, desc) => (
      found || this._matchRules({ tipo, descriptionNorm: desc, rules: globalRules, source: 'global' })
    ), null);
    if (fromGlobal) return fromGlobal;

    const legacy = this.fallbackMatcher.match({ ...transaction, descrizionePulita: cleaned });
    if (legacy) {
      return {
        categoria: legacy,
        confidenza: 55,
        categoria_automatica: true,
        source: 'fallback',
        matchedPattern: null,
      };
    }

    const fromHistory = await this.historyMatcher.match({ userId, transaction });
    if (fromHistory) return { ...fromHistory, categoria_automatica: true };

    const fromAI = this.localAI.classify({ tipo, descrizione: cleaned || descrizione });
    return { ...fromAI, categoria_automatica: true };
  }

  async match({ userId, transaction }) {
    const [rulesPayload, personalMerchantRules] = await Promise.all([
      this._loadRules(userId),
      this.personalMerchantRulesService.loadRules(userId),
    ]);
    return this._matchSingle({ userId, transaction, rulesPayload, personalMerchantRules });
  }

  async matchBatch({ userId, transactions }) {
    if (!Array.isArray(transactions) || transactions.length === 0) return [];

    const [rulesPayload, personalMerchantRules, useAiCategorization] = await Promise.all([
      this._loadRules(userId),
      this.personalMerchantRulesService.loadRules(userId),
      getUserAiCategorizationEnabled(userId),
    ]);
    const results = [];
    const needsOpenAI = [];

    for (const tx of transactions) {
      const result = await this._matchSingle({
        userId,
        transaction: tx,
        rulesPayload,
        personalMerchantRules,
      });
      const enriched = {
        clientTxId: tx.clientTxId,
        ...result,
      };

      if (
        useAiCategorization
        && this.openAI.isEnabled()
        && (result.confidenza ?? 0) <= 55
        && ['ai_local', 'ai_default', 'default', 'fallback'].includes(result.source)
      ) {
        needsOpenAI.push(tx);
      }

      results.push(enriched);
    }

    if (needsOpenAI.length > 0) {
      const aiResults = await this.openAI.classifyBatch(needsOpenAI, { useAiCategorization });
      const aiMap = new Map(aiResults.map((r) => [r.clientTxId, r]));

      for (let i = 0; i < results.length; i += 1) {
        const ai = aiMap.get(results[i].clientTxId);
        if (ai && (ai.confidenza ?? 0) > (results[i].confidenza ?? 0)) {
          results[i] = { ...results[i], ...ai };
        }
      }
    }

    return results;
  }
}

module.exports = CategoryMatcherService;
