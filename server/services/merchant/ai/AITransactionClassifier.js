const logger = require('../../../utils/logger');
const { pseudonymizeDescription } = require('./pseudonymizeDescription');

const OpenAITransactionProvider = require('./providers/OpenAITransactionProvider');
const LocalAITransactionProvider = require('./providers/LocalAITransactionProvider');
const AITransactionClassifierProvider = require('./AITransactionClassifierProvider');

/**
 * Orchestratore classificazione AI transazioni.
 * OpenAI solo se useAiCategorization === true; altrimenti solo provider locale.
 */
class AITransactionClassifier {
  constructor({ providers = [], minConfidenza = 35 } = {}) {
    this.providers = Array.isArray(providers) ? providers : [];
    this.minConfidenza = minConfidenza;
  }

  static createDefault() {
    return new AITransactionClassifier({
      providers: [
        new LocalAITransactionProvider(),
        new OpenAITransactionProvider(),
      ],
    });
  }

  _getProvider(name) {
    return this.providers.find((p) => p.name === name);
  }

  getEnabledProviders() {
    return this.providers.filter((p) => p.isEnabled());
  }

  hasEnabledProviders() {
    const local = this._getProvider('local');
    const openai = this._getProvider('openai');
    return (local?.isEnabled?.() ?? false) || (openai?.isEnabled?.() ?? false);
  }

  registerProvider(provider) {
    if (!provider) return;
    this.providers.push(provider);
  }

  /**
   * @param {import('./AITransactionClassifierProvider').AITransactionContext & { useAiCategorization?: boolean }} context
   */
  async classify(context) {
    const descrizione = String(context?.descrizione ?? context?.cleanedDescription ?? '').trim();
    if (!descrizione) return null;

    const useAi = context?.useAiCategorization === true;
    const providerOrder = useAi
      ? ['openai', 'local']
      : ['local'];

    for (const providerName of providerOrder) {
      const provider = this._getProvider(providerName);
      if (!provider?.isEnabled?.()) continue;

      try {
        const providerContext = providerName === 'openai'
          ? {
            ...context,
            descrizione: pseudonymizeDescription(context.descrizione ?? descrizione),
            cleanedDescription: pseudonymizeDescription(context.cleanedDescription ?? descrizione),
          }
          : context;

        if (providerName === 'openai') {
          logger.info('AI categorization requested');
        }

        const result = await provider.classify(providerContext);
        if (!result?.categoria) continue;

        const confidenza = Number(result.confidenza ?? 0);
        if (!Number.isFinite(confidenza) || confidenza < this.minConfidenza) continue;

        return {
          merchant: result.merchant ?? null,
          categoria: result.categoria,
          motivazione: result.motivazione ?? 'Classificazione AI.',
          confidenza: Math.round(Math.min(100, confidenza)),
          provider: result.provider ?? provider.name,
          source: `ai_${result.provider ?? provider.name}`,
        };
      } catch (error) {
        logger.warn(`[AITransactionClassifier] ${provider.name} failed`, { err: error });
      }
    }

    return null;
  }
}

module.exports = AITransactionClassifier;

module.exports.AITransactionClassifierProvider = AITransactionClassifierProvider;
module.exports.OpenAITransactionProvider = OpenAITransactionProvider;
module.exports.LocalAITransactionProvider = LocalAITransactionProvider;
