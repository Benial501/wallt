const { sequelize, OnboardingSession, OnboardingImport } = require('../models');
const { CATEGORIE_DEFAULT, isCategoriaSistema } = require('../constants/categorie');
const FileImport = require('./importazioni/services/ImportService');
const { validateAnswers } = require('./onboardingFinalization.service');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const getSession = async userId => {
  const session = await OnboardingSession.findOne({ where: { user_id: userId } });
  if (!session) throw fail('Configurazione guidata non disponibile', 404);
  if (session.status === 'completed') throw fail('Configurazione già completata', 409);
  return session;
};

const catalogForDraft = valid => [
  ...CATEGORIE_DEFAULT.filter(category => valid.categoryKeys.has(`${category.tipo}:${category.id}`) || isCategoriaSistema(category.id)),
  ...valid.custom.map(category => ({ id: category.id, nome: category.nome, tipo: category.tipo })),
];

async function previewImport(userId, accountKey, file) {
  const session = await getSession(userId);
  const valid = validateAnswers(session.answers || {});
  const account = valid.accounts.find(item => item.key === accountKey);
  if (!account) throw fail('Scegli un conto presente nella configurazione');
  const preview = await new FileImport().previewImport({
    userId, buffer: file.buffer, fileName: file.originalname,
    options: {
      accounts: [{ id: null, nome: account.nome }],
      availableCategories: catalogForDraft(valid),
    },
  });
  if (preview.items.length > 500) throw fail('Questo estratto contiene più di 500 movimenti. Dividilo in file più piccoli o importalo dopo la configurazione.');
  const row = await sequelize.transaction(async transaction => {
    const current = await OnboardingSession.findOne({ where: { user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (current.status !== 'draft') throw fail('Configurazione già completata', 409);
    const latest = validateAnswers(current.answers || {});
    if (!latest.accounts.some(item => item.key === accountKey)) throw fail('Il conto dell’estratto non è più presente');
    if ((await OnboardingImport.count({ where: { session_id: current.id }, transaction })) >= 5) throw fail('Puoi caricare al massimo cinque estratti durante la configurazione');
    return OnboardingImport.create({ session_id: current.id, account_key: accountKey, preview: preview.items }, { transaction });
  });
  return { import_id: row.id, items: preview.items, summary: preview.summary, warnings: preview.warnings };
}

async function confirmImport(userId, importId, decisions) {
  return sequelize.transaction(async transaction => {
    const session = await OnboardingSession.findOne({ where: { user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!session) throw fail('Configurazione guidata non disponibile', 404);
    const row = await OnboardingImport.findOne({ where: { id: importId, session_id: session.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw fail('Estratto non trovato', 404);
    if (session.status !== 'draft') throw fail('Configurazione già completata', 409);
    const valid = validateAnswers(session.answers || {});
    if (!valid.accounts.some(item => item.key === row.account_key)) throw fail('Il conto dell’estratto non è più presente');
    if (!Array.isArray(decisions) || decisions.length > row.preview.length) throw fail('Revisione dell’estratto non valida');
    const previewById = new Map(row.preview.map(item => [item.clientTxId, item]));
    const seen = new Set();
    const accepted = [];
    for (const decision of decisions) {
      const original = previewById.get(decision?.clientTxId);
      if (!original || seen.has(decision.clientTxId)) throw fail('Riga dell’estratto non valida o duplicata');
      seen.add(decision.clientTxId);
      if (decision.includi !== true) continue;
      if (original.isDuplicate || original.richiede_trasferimento) throw fail('Questa riga non può essere importata come movimento ordinario');
      if (!valid.categoryKeys.has(`${original.tipo}:${decision.categoria_finale}`)) throw fail('Categoria non disponibile nella tua configurazione');
      const description = decision.descrizione === undefined ? original.descrizione : String(decision.descrizione).trim();
      if (!description || description.length > 500) throw fail('Descrizione movimento non valida');
      accepted.push({
        clientTxId: original.clientTxId, data: original.data, descrizione: description,
        importo: original.importo, tipo: original.tipo, categoria_finale: decision.categoria_finale,
        categoria_suggerita: original.categoria_suggerita,
        categoria_confidenza: original.categoria_confidenza,
        categoria_fonte: original.categoria_fonte,
      });
    }
    await row.update({ rows: accepted, status: 'confirmed' }, { transaction });
    return { confermati: accepted.length };
  });
}

async function listImports(userId) {
  const session = await getSession(userId);
  const rows = await OnboardingImport.findAll({ where: { session_id: session.id }, order: [['id', 'ASC']] });
  return rows.map(row => ({ import_id: row.id, account_key: row.account_key, status: row.status, items: row.preview, confermati: row.rows.length }));
}

module.exports = { previewImport, confirmImport, listImports };
