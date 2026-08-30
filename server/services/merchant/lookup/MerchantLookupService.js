const logger = require('../../../utils/logger');
const GooglePlacesProvider = require('./providers/GooglePlacesProvider');
const OpenStreetMapProvider = require('./providers/OpenStreetMapProvider');
const FoursquareProvider = require('./providers/FoursquareProvider');

/**
 * Orchestratore lookup merchant: prova i provider registrati in ordine
 * e restituisce il primo risultato con confidenza sufficiente.
 */
class MerchantLookupService {
  constructor({ providers = [], minConfidenza = 40 } = {}) {
    this.providers = Array.isArray(providers) ? providers : [];
    this.minConfidenza = minConfidenza;
  }

  static createDefault() {
    return new MerchantLookupService({
      providers: [
        new GooglePlacesProvider(),
        new OpenStreetMapProvider(),
        new FoursquareProvider(),
      ],
    });
  }

  getEnabledProviders() {
    return this.providers.filter((p) => p.isEnabled());
  }

  hasEnabledProviders() {
    return this.getEnabledProviders().length > 0;
  }

  /**
   * Registra un provider aggiuntivo (per estensioni future).
   * @param {import('./MerchantLookupProvider')} provider
   */
  registerProvider(provider) {
    if (!provider) return;
    this.providers.push(provider);
  }

  /**
   * @param {import('./MerchantLookupProvider').MerchantLookupContext} context
   * @returns {Promise<(import('./MerchantLookupProvider').MerchantLookupResult & { source: string })|null>}
   */
  async lookup(context) {
    const query = String(context?.query ?? context?.cleanedDescription ?? context?.descrizione ?? '').trim();
    if (!query) return null;

    const enabledProviders = this.getEnabledProviders();
    if (!enabledProviders.length) return null;

    const payload = { ...context, query };

    for (const provider of enabledProviders) {
      try {
        const result = await provider.lookup(payload);
        if (!result?.merchant) continue;

        const confidenza = Number(result.confidenza ?? 0);
        if (!Number.isFinite(confidenza) || confidenza < this.minConfidenza) continue;

        return {
          merchant: result.merchant,
          merchantId: result.merchantId ?? null,
          categoria: result.categoria ?? null,
          tipologia: result.tipologia ?? null,
          indirizzo: result.indirizzo ?? null,
          confidenza: Math.round(Math.min(100, confidenza)),
          provider: result.provider ?? provider.name,
          source: `lookup_${result.provider ?? provider.name}`,
        };
      } catch (error) {
        logger.warn(`[MerchantLookup] ${provider.name} failed`, { err: error });
      }
    }

    return null;
  }
}

module.exports = MerchantLookupService;
