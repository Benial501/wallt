/**
 * Contratto base per provider di lookup merchant esterni.
 * Implementazioni future: Google Places, OpenStreetMap, Foursquare, ecc.
 *
 * @typedef {Object} MerchantLookupContext
 * @property {string} query - Testo di ricerca (descrizione pulita)
 * @property {string} [descrizione] - Descrizione bancaria originale
 * @property {string} [cleanedDescription] - Descrizione normalizzata
 * @property {'entrata'|'uscita'} [tipo] - Tipo movimento
 *
 * @typedef {Object} MerchantLookupResult
 * @property {string} merchant - Nome merchant
 * @property {string|null} [merchantId] - ID esterno del provider
 * @property {string|null} categoria - Categoria WALLT suggerita
 * @property {string|null} tipologia - Tipologia attività (es. restaurant, gas_station)
 * @property {string|null} indirizzo - Indirizzo formattato
 * @property {number} confidenza - 0-100
 * @property {string} provider - Nome provider (es. google_places)
 */
class MerchantLookupProvider {
  constructor({ name, enabled = false } = {}) {
    if (!name) throw new Error('MerchantLookupProvider richiede name');
    this.name = name;
    this._enabledOverride = enabled;
  }

  /**
   * Indica se il provider è configurato e utilizzabile.
   * @returns {boolean}
   */
  isEnabled() {
    return !!this._enabledOverride;
  }

  /**
   * Esegue lookup merchant esterno.
   * @param {MerchantLookupContext} _context
   * @returns {Promise<MerchantLookupResult|null>}
   */
  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  async lookup(_context) {
    throw new Error(`lookup() non implementato in ${this.name}`);
  }
}

module.exports = MerchantLookupProvider;
