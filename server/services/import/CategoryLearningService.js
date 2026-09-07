const { sequelize, CategorieRegola } = require('../../models');
const { assertCategory } = require('../categorie.service');
const { extractLearningPattern } = require('../merchant/patternUtils');
const { CATEGORIE_DEFAULT } = require('../../constants/categorie');
class CategoryLearningService {
  constructor({ categorieRegolaModel = CategorieRegola } = {}) { this.CategorieRegola = categorieRegolaModel; }
  async learnRule({ userId, descrizione, categoria, tipo, transaction } = {}) {
    if (!userId || !descrizione || !categoria) return null;
    if (categoria === 'da_verificare') return null;
    const pattern = extractLearningPattern(descrizione);
    if (!pattern) return null;
    tipo = tipo || CATEGORIE_DEFAULT.find(c => c.id === categoria)?.tipo;
    const learn = async t => {
      // Serializza le correzioni dello stesso utente, incluse richieste concorrenti.
      await sequelize.query('SELECT pg_advisory_xact_lock(71907, :userId)', { replacements: { userId: Number(userId) }, transaction: t });
      await assertCategory(userId, categoria, tipo, { transaction: t });
      const where = { user_id: userId, pattern, tipo, attiva: true };
      const existing = await this.CategorieRegola.findOne({ where, transaction: t });
      const rule = existing
        ? await existing.update({ categoria, priorita: 100 }, { transaction: t })
        : await this.CategorieRegola.create({ ...where, categoria, priorita: 95 }, { transaction: t });
      t.afterCommit(() => require('./CategoryMatcherService').clearUserCache(userId));
      return rule;
    };
    return transaction ? learn(transaction) : sequelize.transaction(learn);
  }
}
module.exports = CategoryLearningService;
