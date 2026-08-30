const MerchantLookupProvider = require('../MerchantLookupProvider');

/**
 * Provider Foursquare Places (stub).
 * Attivo quando FOURSQUARE_API_KEY è impostata.
 * Implementazione HTTP da completare in futuro.
 */
class FoursquareProvider extends MerchantLookupProvider {
  constructor() {
    super({ name: 'foursquare' });
    this.apiKey = process.env.FOURSQUARE_API_KEY || '';
  }

  isEnabled() {
    return !!this.apiKey;
  }

  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  async lookup(_context) {
    // Placeholder: integrazione Foursquare Places API.
    return null;
  }
}

module.exports = FoursquareProvider;
