const { CATEGORIE_DEFAULT } = require('../constants/categorie');
const CategoriaPersonale = require('../models/CategoriaPersonale');
const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const serialize = c => ({ ...c.toJSON(), userId: c.user_id, isDefault: false, gruppo: 'Personali', emoji: '🏷️' });
async function list(userId, { includeArchived = false, transaction } = {}) {
  const personal = await CategoriaPersonale.findAll({ where: { user_id: userId, ...(includeArchived ? {} : { attiva: true }) }, transaction, order: [['nome', 'ASC']] });
  return [...CATEGORIE_DEFAULT, ...personal.map(serialize)];
}
async function assertCategory(userId, id, tipo, { transaction, allowArchived = false } = {}) {
  if (!['entrata', 'uscita'].includes(tipo) || typeof id !== 'string') throw error('Categoria non valida per questo tipo di movimento');
  const standard = CATEGORIE_DEFAULT.find(c => c.id === id && c.tipo === tipo);
  if (standard) return standard;
  const personal = await CategoriaPersonale.findOne({ where: { id, tipo, user_id: userId, ...(allowArchived ? {} : { attiva: true }) }, transaction, ...(transaction ? { lock: transaction.LOCK.SHARE } : {}) });
  if (!personal) throw error('Categoria non disponibile o incompatibile con il movimento');
  return serialize(personal);
}
module.exports = { list, assertCategory, serialize, error };
