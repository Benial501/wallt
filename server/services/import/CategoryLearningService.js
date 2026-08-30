const { CategorieRegola } = require('../../models');
const CategoryMatcherService = require('./CategoryMatcherService');
const { extractLearningPattern } = require('../merchant/patternUtils');

/**
 * CategoryLearningService
 * - crea/aggiorna regole personali quando l'utente corregge una categoria
 */
class CategoryLearningService {
  constructor({ categorieRegolaModel = CategorieRegola } = {}) {
    this.CategorieRegola = categorieRegolaModel;
  }

  async learnRule({ userId, descrizione, categoria, transaction } = {}) {
    if (!userId) throw new Error('userId mancante');
    if (!descrizione) throw new Error('descrizione mancante');
    if (!categoria) throw new Error('categoria mancante');

    const pattern = extractLearningPattern(descrizione);
    if (!pattern) return null;

    const prioritaIncrement = 15;
    const basePriorita = 80;

    // Upsert manuale (MySQL + nullable user_id): cerchiamo regola esatta per user_id/pattern/categoria.
    const existing = await this.CategorieRegola.findOne({
      where: { user_id: userId, pattern, categoria, attiva: true },
      transaction,
    });

    if (existing) {
      existing.priorita = Math.min(100, (existing.priorita ?? 50) + prioritaIncrement);
      existing.attiva = true;
      await existing.save({ transaction });
      CategoryMatcherService.clearUserCache(userId);
      return existing;
    }

    const rule = await this.CategorieRegola.create({
      user_id: userId,
      pattern,
      categoria,
      priorita: basePriorita,
      attiva: true,
    }, { transaction });

    CategoryMatcherService.clearUserCache(userId);
    return rule;
  }
}

module.exports = CategoryLearningService;

