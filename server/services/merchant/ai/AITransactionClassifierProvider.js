/**
 * Contratto base per provider AI di classificazione transazioni.
 *
 * @typedef {Object} AITransactionContext
 * @property {string} descrizione - Descrizione bancaria originale
 * @property {string} [cleanedDescription] - Descrizione normalizzata
 * @property {'entrata'|'uscita'} [tipo] - Tipo movimento
 * @property {number} [importo] - Importo transazione
 *
 * @typedef {Object} AITransactionResult
 * @property {string|null} merchant - Nome merchant inferito
 * @property {string} categoria - Categoria WALLT
 * @property {string} motivazione - Spiegazione breve della scelta
 * @property {number} confidenza - 0-100
 * @property {string} provider - Nome provider (es. local, openai)
 */
class AITransactionClassifierProvider {
  constructor({ name, enabled = false } = {}) {
    if (!name) throw new Error('AITransactionClassifierProvider richiede name');
    this.name = name;
    this._enabledOverride = enabled;
  }

  isEnabled() {
    return !!this._enabledOverride;
  }

  /**
   * @param {AITransactionContext} _context
   * @returns {Promise<AITransactionResult|null>}
   */
  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  async classify(_context) {
    throw new Error(`classify() non implementato in ${this.name}`);
  }
}

module.exports = AITransactionClassifierProvider;
