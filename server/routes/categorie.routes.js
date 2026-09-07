const router = require('express').Router();
const { randomUUID } = require('crypto');
const { sequelize, CategoriaPersonale, Movimento, CategorieRegola, RegolaPersonaleMerchant, User, BudgetCategoria, BudgetMensile } = require('../models');
const { list, serialize, error } = require('../services/categorie.service');
const { CATEGORIE_DEFAULT } = require('../constants/categorie');
const normalizeName = value => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
const ICONS = ['Tag', 'House', 'ShoppingBasket', 'Car', 'ShoppingBag', 'Heart', 'Dumbbell', 'Music', 'Plane', 'Wallet', 'BookOpen', 'Gift', 'Briefcase', 'Coffee', 'Gamepad2', 'GraduationCap', 'PawPrint'];
router.use(require('../middleware/auth.middleware'));
router.get('/', async (req, res) => res.json({ categorie: await list(req.userId, { includeArchived: req.query.archiviate === 'true' }), icone: ICONS }));
function validate(body) {
  if (typeof body.nome !== 'string' || !body.nome.trim() || body.nome.trim().length > 80) throw error('Nome categoria obbligatorio, massimo 80 caratteri');
  if (!['entrata', 'uscita'].includes(body.tipo)) throw error('Tipo categoria non valido');
  if (!ICONS.includes(body.icona || 'Tag') || !/^#[0-9a-f]{6}$/i.test(body.colore || '#3498DB')) throw error('Icona o colore non valido');
  const nome = body.nome.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (CATEGORIE_DEFAULT.some(c => c.tipo === body.tipo && normalizeName(c.nome) === normalizeName(nome))) throw error('Esiste già una categoria predefinita con questo nome', 409);
  return { nome, nome_normalizzato: normalizeName(nome), tipo: body.tipo, icona: body.icona || 'Tag', colore: body.colore || '#3498DB' };
}
const clear = userId => {
  require('../services/import/CategoryMatcherService').clearUserCache(userId);
  require('../services/merchant/PersonalMerchantRulesService').clearUserCache(userId);
};
const handle = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (e) { if (e.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Categoria già presente, anche tra quelle archiviate' }); next(e); }
};
router.post('/', handle(async (req, res) => {
  const fields = validate(req.body);
  const c = await CategoriaPersonale.create({ ...fields, id: `custom_${randomUUID()}`, user_id: req.userId });
  clear(req.userId);
  res.status(201).json({ categoria: serialize(c) });
}));
router.put('/:id', handle(async (req, res) => {
  const fields = validate(req.body);
  const c = await sequelize.transaction(async transaction => {
    const category = await CategoriaPersonale.findOne({ where: { id: req.params.id, user_id: req.userId, attiva: true }, transaction, lock: transaction.LOCK.UPDATE });
    if (!category) throw error('Categoria personale non trovata', 404);
    if (category.tipo !== fields.tipo) {
      const used = await Movimento.count({ where: { user_id: req.userId, categoria: category.id }, transaction });
      const rules = await CategorieRegola.count({ where: { user_id: req.userId, categoria: category.id }, transaction });
      const budgets = await BudgetCategoria.count({ where: { categoria: category.id }, include: [{ model: BudgetMensile, as: 'budget', where: { user_id: req.userId } }], transaction });
      const merchantRules = await RegolaPersonaleMerchant.count({ where: { user_id: req.userId, categoria: category.id }, transaction });
      if (used || rules || budgets || merchantRules) throw error('Non puoi cambiare tipo a una categoria già utilizzata', 409);
    }
    return category.update(fields, { transaction });
  });
  clear(req.userId);
  res.json({ categoria: serialize(c) });
}));
router.delete('/:id', handle(async (req, res) => {
  await sequelize.transaction(async transaction => {
    const c = await CategoriaPersonale.findOne({ where: { id: req.params.id, user_id: req.userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!c) throw error('Categoria personale non trovata', 404);
    await c.update({ attiva: false }, { transaction });
    for (const model of [CategorieRegola, RegolaPersonaleMerchant]) await model.update({ attiva: false }, { where: { user_id: req.userId, categoria: c.id }, transaction });
  });
  clear(req.userId);
  res.json({ message: 'Categoria archiviata. I movimenti esistenti sono conservati.' });
}));
module.exports = router;
