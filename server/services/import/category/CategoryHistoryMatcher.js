const { Op } = require('sequelize');
const { Movimento } = require('../../../models');
const { normalizeText, tokenize, jaccardSimilarity } = require('./textUtils');

/**
 * Usa lo storico movimenti dell'utente per classificare descrizioni simili.
 */
class CategoryHistoryMatcher {
  constructor({ movimentoModel = Movimento } = {}) {
    this.Movimento = movimentoModel;
    this._cache = new Map();
  }

  async _loadHistory(userId) {
    if (this._cache.has(userId)) return this._cache.get(userId);


    const rows = await this.Movimento.findAll({
      where: {
        user_id: userId,
        categoria_modificata: true,
        tipo: { [Op.in]: ['entrata', 'uscita'] },
        categoria: { [Op.ne]: null },
      },
      attributes: ['descrizione', 'categoria', 'tipo', 'categoria_modificata'],
      order: [['id', 'DESC']],
      limit: 500,
    });

    const byTipo = { entrata: [], uscita: [] };
    rows.forEach((row) => {
      const desc = normalizeText(row.descrizione);
      if (!desc || !row.categoria) return;
      const tokens = tokenize(row.descrizione);
      if (!tokens.length) return;
      byTipo[row.tipo]?.push({
        categoria: row.categoria,
        descrizione: desc,
        tokens,
        // Le correzioni manuali pesano di più nello storico.
        weight: row.categoria_modificata ? 3 : 1,
      });
    });


    this._cache.set(userId, byTipo);
    return byTipo;
  }

  async match({ userId, transaction }) {
    const tipo = transaction?.tipo;
    const descrizione = transaction?.descrizione;
    if (!userId || !tipo || !descrizione) return null;

    const history = await this._loadHistory(userId);
    const pool = history[tipo] || [];
    if (!pool.length) return null;

    const queryTokens = tokenize(descrizione);
    const queryNorm = normalizeText(descrizione);
    if (!queryTokens.length) return null;

    let best = null;

    for (const item of pool) {
      const sim = jaccardSimilarity(queryTokens, item.tokens);
      const containsBonus = (
        queryNorm.includes(item.descrizione.slice(0, 12))
        || item.descrizione.includes(queryNorm.slice(0, 12))
      ) ? 0.25 : 0;

      const score = (sim + containsBonus) * item.weight;
      if (sim >= 0.85 && (!best || score > best.score)) {
        best = { ...item, score };
      }
    }

    if (!best) return null;

    const confidenza = Math.min(92, Math.round(50 + best.score * 40));
    return {
      categoria: best.categoria,
      confidenza,
      matchedPattern: best.descrizione.slice(0, 40),
      source: 'history',
    };
  }
}

module.exports = CategoryHistoryMatcher;
