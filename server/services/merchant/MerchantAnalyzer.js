const MerchantNormalizer = require('./MerchantNormalizer');
const MerchantDictionary = require('./MerchantDictionary');
const MerchantMatcher = require('./MerchantMatcher');
const MerchantResolver = require('./MerchantResolver');
const PersonalMerchantRulesService = require('./PersonalMerchantRulesService');
const { MerchantLookupService } = require('./lookup');
const { AITransactionClassifier } = require('./ai');
const { getUserAiCategorizationEnabled } = require('../aiConsent.service');
const { DA_VERIFICARE_CATEGORIA } = require('./constants');

/**
 * Orchestratore Merchant Intelligence.
 * Pipeline: regole personali → dizionario → lookup → AI → da_verificare.
 */
class MerchantAnalyzer {
  constructor({
    normalizer = new MerchantNormalizer(),
    dictionary = new MerchantDictionary(),
    matcher = null,
    resolver = new MerchantResolver(),
    personalRulesService = new PersonalMerchantRulesService(),
    lookupService = MerchantLookupService.createDefault(),
    aiClassifier = AITransactionClassifier.createDefault(),
  } = {}) {
    this.normalizer = normalizer;
    this.dictionary = dictionary;
    this.matcher = matcher || new MerchantMatcher({ dictionary: this.dictionary });
    this.resolver = resolver;
    this.personalRulesService = personalRulesService;
    this.lookupService = lookupService;
    this.aiClassifier = aiClassifier;
    this._registerBuiltInAliases();
  }

  _registerBuiltInAliases() {
    const aliases = [
      {
        id: 'amazon_amzn',
        name: 'Amazon',
        category: 'acquisti_vari',
        activityType: 'ecommerce',
        keywords: ['amzn eu', 'amzn mktp', 'amzn mkpt', 'amazon eu', 'amazon retail'],
        confidence: 96,
      },
      {
        id: 'paypal_merchant',
        name: 'PayPal',
        category: 'altro_uscita',
        activityType: 'payment',
        keywords: ['paypal'],
        confidence: 85,
      },
    ];
    this.dictionary.registerMany(aliases);
  }

  _buildUnverifiedResult({ original, cleaned }) {
    return {
      merchant: null,
      merchantId: null,
      categoria: DA_VERIFICARE_CATEGORIA,
      confidenza: 0,
      descrizionePulita: cleaned || original,
      descrizioneOriginale: original,
      activityType: null,
      indirizzo: null,
      matchedKeyword: null,
      source: 'unverified',
    };
  }

  _buildAIResult({ original, cleaned, ai }) {
    return {
      merchant: ai.merchant ?? null,
      merchantId: null,
      categoria: ai.categoria ?? DA_VERIFICARE_CATEGORIA,
      confidenza: ai.confidenza,
      motivazione: ai.motivazione ?? null,
      descrizionePulita: cleaned || original,
      descrizioneOriginale: original,
      activityType: null,
      indirizzo: null,
      matchedKeyword: null,
      source: ai.source,
    };
  }

  _buildLookupResult({ original, cleaned, lookup }) {
    return {
      merchant: lookup.merchant,
      merchantId: lookup.merchantId ?? null,
      categoria: lookup.categoria ?? DA_VERIFICARE_CATEGORIA,
      confidenza: lookup.confidenza,
      descrizionePulita: cleaned || original,
      descrizioneOriginale: original,
      activityType: lookup.tipologia ?? null,
      indirizzo: lookup.indirizzo ?? null,
      matchedKeyword: null,
      source: lookup.source,
    };
  }

  _buildDictionaryResult({ original, cleaned, resolved }) {
    return {
      merchant: resolved.merchant,
      merchantId: resolved.merchantId,
      categoria: resolved.categoria,
      confidenza: resolved.confidenza,
      descrizionePulita: cleaned || resolved.merchant,
      descrizioneOriginale: original,
      activityType: resolved.activityType,
      indirizzo: null,
      matchedKeyword: resolved.matchedKeyword,
      source: resolved.source,
    };
  }

  _buildPersonalResult({ original, cleaned, personal }) {
    return {
      merchant: personal.merchant,
      merchantId: personal.merchantId,
      categoria: personal.categoria,
      confidenza: personal.confidenza,
      descrizionePulita: cleaned || original,
      descrizioneOriginale: original,
      activityType: null,
      indirizzo: null,
      matchedKeyword: personal.matchedKeyword,
      source: personal.source,
    };
  }

  /**
   * Analisi sincrona: regole personali + dizionario locale (senza lookup esterni).
   */
  analyzeWithRules({ descrizione, tipo, personalRules = [] } = {}) {
    const { original, cleaned } = this.normalizer.normalize(descrizione);

    const personal = this.personalRulesService.matchFromRules({
      personalRules,
      descrizione: original,
      cleanedDescription: cleaned,
      tipo,
    });

    if (personal && (personal.merchant || personal.categoria)) {
      return this._buildPersonalResult({ original, cleaned, personal });
    }

    const candidates = this.matcher.match({
      cleanedDescription: cleaned,
      tipo,
    });

    const resolved = this.resolver.resolve(candidates);
    if (resolved) {
      return this._buildDictionaryResult({ original, cleaned, resolved });
    }

    return {
      merchant: null,
      merchantId: null,
      categoria: null,
      confidenza: 0,
      descrizionePulita: cleaned || original,
      descrizioneOriginale: original,
      activityType: null,
      indirizzo: null,
      matchedKeyword: null,
      source: null,
      needsLookup: true,
    };
  }

  /**
   * Completa l'analisi quando matcher locale fallisce: lookup → AI → da_verificare.
   */
  async _resolveAfterMatcherFail({
    original,
    cleaned,
    tipo,
    partialResult,
    importo,
    useAiCategorization = false,
  }) {
    if (!partialResult?.needsLookup) return partialResult;

    const query = String(cleaned || original || '').trim();
    if (!query) {
      return this._buildUnverifiedResult({ original, cleaned });
    }

    if (this.lookupService?.hasEnabledProviders?.()) {
      const lookup = await this.lookupService.lookup({
        query,
        descrizione: original,
        cleanedDescription: cleaned,
        tipo,
      });

      if (lookup) {
        return this._buildLookupResult({ original, cleaned, lookup });
      }
    }

    if (this.aiClassifier?.hasEnabledProviders?.()) {
      const ai = await this.aiClassifier.classify({
        descrizione: original,
        cleanedDescription: cleaned,
        tipo,
        importo,
        useAiCategorization,
      });

      if (ai) {
        return this._buildAIResult({ original, cleaned, ai });
      }
    }

    return this._buildUnverifiedResult({ original, cleaned });
  }

  /**
   * Analizza una singola transazione (include lookup esterni se necessario).
   */
  async analyze({ descrizione, tipo, userId, importo } = {}) {
    const [personalRules, useAiCategorization] = await Promise.all([
      userId ? this.personalRulesService.loadRules(userId) : Promise.resolve([]),
      getUserAiCategorizationEnabled(userId),
    ]);

    const partial = this.analyzeWithRules({ descrizione, tipo, personalRules });
    const { original, cleaned } = this.normalizer.normalize(descrizione);

    return this._resolveAfterMatcherFail({
      original,
      cleaned,
      tipo,
      importo,
      partialResult: partial,
      useAiCategorization,
    });
  }

  /**
   * Analizza batch transazioni normalizzate (preview import).
   */
  async analyzeBatch(transactions = [], userId = null) {
    const [personalRules, useAiCategorization] = await Promise.all([
      userId ? this.personalRulesService.loadRules(userId) : Promise.resolve([]),
      getUserAiCategorizationEnabled(userId),
    ]);

    const partialResults = transactions.map((tx) => ({
      clientTxId: tx.clientTxId,
      tipo: tx.tipo,
      importo: tx.importo,
      ...this.analyzeWithRules({
        descrizione: tx.descrizione,
        tipo: tx.tipo,
        personalRules,
      }),
    }));

    const fallbackTargets = partialResults.filter((r) => r.needsLookup);
    if (!fallbackTargets.length) {
      return partialResults.map(({ needsLookup, tipo, importo, ...rest }) => rest);
    }

    await Promise.all(fallbackTargets.map(async (item) => {
      const resolved = await this._resolveAfterMatcherFail({
        original: item.descrizioneOriginale,
        cleaned: item.descrizionePulita,
        tipo: item.tipo,
        importo: item.importo,
        partialResult: item,
        useAiCategorization,
      });

      Object.assign(item, resolved);
      delete item.needsLookup;
      delete item.tipo;
      delete item.importo;
    }));

    return partialResults.map(({ needsLookup, tipo, importo, ...rest }) => rest);
  }

  registerMerchant(entry) {
    return this.dictionary.register(entry);
  }

  registerMerchants(entries = []) {
    return this.dictionary.registerMany(entries);
  }
}

module.exports = MerchantAnalyzer;
