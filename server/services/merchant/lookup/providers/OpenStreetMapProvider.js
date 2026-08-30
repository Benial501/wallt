const MerchantLookupProvider = require('../MerchantLookupProvider');

/**
 * Provider OpenStreetMap / Nominatim (stub).
 * Attivo quando MERCHANT_LOOKUP_OSM_ENABLED=true.
 * Implementazione HTTP da completare in futuro.
 */
class OpenStreetMapProvider extends MerchantLookupProvider {
  constructor() {
    super({ name: 'openstreetmap' });
    this.enabledFlag = String(process.env.MERCHANT_LOOKUP_OSM_ENABLED || '').toLowerCase() === 'true';
  }

  isEnabled() {
    return this.enabledFlag;
  }

  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  async lookup(_context) {
    // Placeholder: integrazione Nominatim / Overpass.
    return null;
  }
}

module.exports = OpenStreetMapProvider;
