const MerchantLookupProvider = require('../MerchantLookupProvider');

/**
 * Provider Google Places (stub).
 * Attivo quando GOOGLE_PLACES_API_KEY è impostata.
 * Implementazione HTTP da completare in futuro.
 */
class GooglePlacesProvider extends MerchantLookupProvider {
  constructor() {
    super({ name: 'google_places' });
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  }

  isEnabled() {
    return !!this.apiKey;
  }

  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  async lookup(_context) {
    // Placeholder: integrazione Google Places API (Text Search / Place Details).
    return null;
  }
}

module.exports = GooglePlacesProvider;
