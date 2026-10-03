const {
  sequelize, OnboardingSession, CategoriaPersonale, CategoriaDefaultNascosta,
  Conto, Movimento, Obiettivo, ObiettivoContributo, Debito,
  PreferenzeNotifiche, ProfiloUtente,
  OnboardingImport,
} = require('../models');
const { CATEGORIE_DEFAULT, isCategoriaSistema } = require('../constants/categorie');
const { VALID_FASCE_ETA } = require('../utils/ageRestriction');
const { syncUserFeatureFlagsFromProfilo } = require('../utils/featureAccess');
const CategoryLearningService = require('./import/CategoryLearningService');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const categoriesByKey = new Map(CATEGORIE_DEFAULT.map(c => [`${c.tipo}:${c.id}`, c]));
const accountTypes = new Set(['banca', 'app_pagamento', 'contanti', 'investimento', 'wallet', 'risparmio', 'carta_credito']);
const frequencies = new Set(['settimanale', 'mensile', 'annuale']);
const preferenceKeys = new Set(['promemoria_giornaliero_attivo', 'alert_budget_attivi', 'alert_ricorrenti_attivi', 'alert_obiettivi_attivi', 'riepilogo_settimanale_attivo']);
const normalizeName = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
const amount = (value, { zero = false } = {}) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < (zero ? 0 : 0.01) || n > 9999999999.99 || Math.abs(Math.round(n * 100) - n * 100) > 0.000001) throw fail('Importo non valido');
  return n;
};
const items = (value, max, label) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw fail(`${label}: elenco non valido`);
  return value;
};
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function validateAnswers(answers) {
  if (!VALID_FASCE_ETA.includes(answers.fascia_eta)) throw fail('Seleziona la fascia d’età per completare la configurazione');
  const accounts = items(answers.conti, 20, 'Conti');
  if (answers.categorie !== undefined && (!answers.categorie || typeof answers.categorie !== 'object' || Array.isArray(answers.categorie))) throw fail('Categorie non valide');
  const accountKeys = new Set();
  const accountNames = new Set();
  accounts.forEach(account => {
    const name = normalizeName(account.nome);
    if (typeof account.key !== 'string' || !/^[\w-]{1,60}$/.test(account.key) || accountKeys.has(account.key)) throw fail('Riferimento conto non valido o duplicato');
    if (!name || name.length > 100 || accountNames.has(name.toLocaleLowerCase('it'))) throw fail('Nome conto non valido o duplicato');
    if (!accountTypes.has(account.tipo)) throw fail('Tipo conto non valido');
    amount(account.saldo ?? 0, { zero: true });
    accountKeys.add(account.key);
    accountNames.add(name.toLocaleLowerCase('it'));
  });

  const categorySelection = answers.categorie;
  const selected = categorySelection ? items(categorySelection.selected, CATEGORIE_DEFAULT.length, 'Categorie') : [];
  const custom = categorySelection ? items(categorySelection.custom, 30, 'Categorie personalizzate') : [];
  const categoryKeys = new Set(categorySelection ? [] : CATEGORIE_DEFAULT.map(c => `${c.tipo}:${c.id}`));
  selected.forEach(category => {
    const key = `${category.tipo}:${category.id}`;
    if (!categoriesByKey.has(key) || categoryKeys.has(key)) throw fail('Categoria predefinita non valida o duplicata');
    categoryKeys.add(key);
  });
  CATEGORIE_DEFAULT.filter(c => isCategoriaSistema(c.id) || c.tipo === 'entrata').forEach(c => categoryKeys.add(`${c.tipo}:${c.id}`));
  const customNames = new Set();
  custom.forEach(category => {
    const name = normalizeName(category.nome);
    if (!name || name.length > 80 || !['entrata', 'uscita'].includes(category.tipo)) throw fail('Categoria personale non valida');
    const nameKey = `${category.tipo}:${name.toLocaleLowerCase('it')}`;
    if (customNames.has(nameKey) || CATEGORIE_DEFAULT.some(c => c.tipo === category.tipo && c.nome.toLocaleLowerCase('it') === name.toLocaleLowerCase('it'))) throw fail('Categoria personale duplicata');
    if (typeof category.id !== 'string' || !/^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(category.id) || categoryKeys.has(`${category.tipo}:${category.id}`)) throw fail('Identificativo categoria non valido');
    customNames.add(nameKey);
    categoryKeys.add(`${category.tipo}:${category.id}`);
  });

  const rules = [
    ...items(answers.entrate, 20, 'Entrate').map(item => ({ ...item, tipo: 'entrata' })),
    ...items(answers.spese, 40, 'Spese').map(item => ({ ...item, tipo: 'uscita' })),
    ...items(answers.abbonamenti, 30, 'Abbonamenti').map(item => ({ ...item, tipo: 'uscita' })),
    ...items(answers.impegni, 20, 'Impegni').filter(item => Number(item.rata) > 0).map(item => ({ ...item, importo: item.rata, tipo: 'uscita' })),
  ];
  rules.forEach(rule => {
    if (!normalizeName(rule.nome) || normalizeName(rule.nome).length > 200) throw fail('Nome ricorrenza non valido');
    amount(rule.importo);
    if (!frequencies.has(rule.frequenza)) throw fail('Frequenza ricorrenza non valida');
    if (!Number.isInteger(Number(rule.giorno)) || Number(rule.giorno) < 1 || Number(rule.giorno) > (rule.frequenza === 'settimanale' ? 7 : 31)) throw fail('Giorno ricorrenza non valido');
    if (rule.frequenza === 'annuale' && (!Number.isInteger(Number(rule.mese)) || Number(rule.mese) < 1 || Number(rule.mese) > 12)) throw fail('Mese ricorrenza non valido');
    if (!accountKeys.has(rule.conto_key)) throw fail('Associa ogni entrata e spesa a un tuo conto');
    if (!categoryKeys.has(`${rule.tipo}:${rule.categoria}`)) throw fail('Categoria ricorrenza non disponibile');
  });
  const goals = items(answers.obiettivi, 20, 'Obiettivi');
  goals.forEach(goal => {
    if (!normalizeName(goal.nome) || normalizeName(goal.nome).length > 100) throw fail('Nome obiettivo non valido');
    const target = amount(goal.importo_target);
    if (amount(goal.importo_attuale ?? 0, { zero: true }) > target) throw fail('L’importo già accumulato supera il traguardo');
    if (goal.deadline && !validDate(goal.deadline)) throw fail('Data obiettivo non valida');
  });
  items(answers.impegni, 20, 'Impegni').forEach(commitment => {
    if (!normalizeName(commitment.nome) || normalizeName(commitment.nome).length > 200) throw fail('Nome impegno non valido');
    const hasResidual = commitment.saldo_residuo !== undefined && commitment.saldo_residuo !== '';
    const hasRate = commitment.rata !== undefined && commitment.rata !== '';
    if (!hasResidual && !hasRate) throw fail('Inserisci una rata o un debito residuo per ogni impegno');
    if (hasResidual) amount(commitment.saldo_residuo, { zero: true });
    if (commitment.rata !== undefined && commitment.rata !== '') amount(commitment.rata);
    if (commitment.conto_key && !accountKeys.has(commitment.conto_key)) throw fail('Conto impegno non valido');
    if (commitment.prossima_scadenza && !validDate(commitment.prossima_scadenza)) throw fail('Data impegno non valida');
    if (commitment.data_fine && !validDate(commitment.data_fine)) throw fail('Data impegno non valida');
  });
  const preferences = answers.preferenze || {};
  if (typeof preferences !== 'object' || Array.isArray(preferences) || Object.keys(preferences).some(key => !preferenceKeys.has(key) || typeof preferences[key] !== 'boolean')) throw fail('Preferenze di notifica non valide');
  return { accounts, selected, custom, categoryKeys, rules, goals, preferences };
}

async function finalizeOnboarding(userId) {
  const result = await sequelize.transaction(async transaction => {
    const session = await OnboardingSession.findOne({ where: { user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!session) throw fail('Configurazione guidata non disponibile', 404);
    if (session.status === 'completed') return session.result;
    if (session.schema_version !== 2) throw fail('Versione della configurazione non supportata', 409);
    const answers = session.answers || {};
    const valid = validateAnswers(answers);

    if (answers.categorie) {
      const selectedKeys = new Set(valid.selected.map(c => `${c.tipo}:${c.id}`));
      const hidden = CATEGORIE_DEFAULT.filter(c => c.tipo === 'uscita' && !isCategoriaSistema(c.id) && !selectedKeys.has(`${c.tipo}:${c.id}`));
      await CategoriaDefaultNascosta.bulkCreate(hidden.map(c => ({ user_id: userId, categoria_id: c.id, tipo: c.tipo })), { transaction, ignoreDuplicates: true });
      for (const category of valid.custom) {
        await CategoriaPersonale.create({
          id: category.id, user_id: userId,
          nome: normalizeName(category.nome), nome_normalizzato: normalizeName(category.nome).toLocaleLowerCase('it'), tipo: category.tipo,
          icona: 'Tag', colore: '#3498DB',
          essenzialita: category.tipo === 'uscita' ? (category.essenzialita || 'discrezionale') : null,
        }, { transaction });
      }
    }

    const accountIds = new Map();
    for (const [index, account] of valid.accounts.entries()) {
      const row = await Conto.create({
        user_id: userId, nome: normalizeName(account.nome), tipo: account.tipo,
        saldo: amount(account.saldo ?? 0, { zero: true }), ordine: index + 1,
        icona: '💳', colore: '#00D4AA',
      }, { transaction });
      accountIds.set(account.key, row.id);
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const rule of valid.rules) {
      await Movimento.create({
        user_id: userId, conto_id: accountIds.get(rule.conto_key), tipo: rule.tipo,
        importo: amount(rule.importo), categoria: rule.categoria, descrizione: normalizeName(rule.nome), data: today,
        ricorrente: true, ricorrente_frequenza: rule.frequenza, ricorrente_giorno: Number(rule.giorno),
        ricorrente_mese: rule.frequenza === 'annuale' ? Number(rule.mese) : null,
        natura_entrata: rule.tipo === 'entrata' ? 'ricorrente' : 'sconosciuto',
        periodicita_entrata: rule.tipo === 'entrata' ? rule.frequenza : 'sconosciuta',
      }, { transaction });
    }
    const stagedImports = await OnboardingImport.findAll({ where: { session_id: session.id, status: 'confirmed' }, transaction, order: [['id', 'ASC']] });
    const seenImports = new Set();
    let imported = 0;
    const learning = new CategoryLearningService();
    for (const batch of stagedImports) {
      const contoId = accountIds.get(batch.account_key);
      if (!contoId) throw fail('Il conto associato a un estratto non è più presente');
      for (const row of batch.rows) {
        if (!valid.categoryKeys.has(`${row.tipo}:${row.categoria_finale}`)) throw fail('Categoria di un movimento importato non disponibile');
        const key = `${batch.account_key}:${row.data}:${row.tipo}:${row.importo}:${row.descrizione.toLocaleLowerCase('it')}`;
        if (seenImports.has(key)) continue;
        seenImports.add(key);
        await Movimento.create({
          user_id: userId, conto_id: contoId, tipo: row.tipo, importo: amount(row.importo),
          categoria: row.categoria_finale, descrizione: row.descrizione, data: row.data,
          ricorrente: false, origine: 'import',
          categoria_automatica: !!row.categoria_suggerita,
          categoria_confidenza: row.categoria_confidenza,
          categoria_modificata: row.categoria_finale !== row.categoria_suggerita,
          categoria_fonte: row.categoria_finale !== row.categoria_suggerita ? 'user' : (row.categoria_fonte || 'import'),
        }, { transaction });
        if (row.categoria_finale !== row.categoria_suggerita) {
          await learning.learnRule({ userId, descrizione: row.descrizione, categoria: row.categoria_finale, tipo: row.tipo, transaction });
        }
        imported += 1;
      }
    }
    for (const commitment of items(answers.impegni, 20, 'Impegni')) {
      if (commitment.saldo_residuo === undefined) continue;
      await Debito.create({
        user_id: userId, nome: normalizeName(commitment.nome), saldo_residuo: amount(commitment.saldo_residuo, { zero: true }),
        rata_periodica: commitment.rata === undefined || commitment.rata === '' ? null : amount(commitment.rata),
        frequenza: commitment.frequenza || 'mensile', conto_id: accountIds.get(commitment.conto_key) || null,
        prossima_scadenza: commitment.prossima_scadenza || null, data_fine: commitment.data_fine || null,
      }, { transaction });
    }
    for (const goal of valid.goals) {
      const current = amount(goal.importo_attuale ?? 0, { zero: true });
      const row = await Obiettivo.create({
        user_id: userId, nome: normalizeName(goal.nome), importo_target: amount(goal.importo_target),
        importo_attuale: current, deadline: goal.deadline || null, icona: '🎯',
        completato: current >= amount(goal.importo_target), tipo_obiettivo: 'generico',
      }, { transaction });
      if (current > 0) await ObiettivoContributo.create({ obiettivo_id: row.id, importo: current, data: today, nota: 'Importo iniziale' }, { transaction });
    }
    const [notificationPreferences] = await PreferenzeNotifiche.findOrCreate({ where: { user_id: userId }, defaults: { user_id: userId }, transaction });
    await notificationPreferences.update(valid.preferences, { transaction });
    const [profile] = await ProfiloUtente.findOrCreate({ where: { user_id: userId }, defaults: { user_id: userId }, transaction });
    await profile.update({ fascia_eta: answers.fascia_eta, onboarding_completato: true }, { transaction });
    await syncUserFeatureFlagsFromProfilo(userId, profile, {}, transaction);

    const response = { riepilogo: {
      categorie: valid.selected.length + valid.custom.length,
      conti: valid.accounts.length,
      entrate: valid.rules.filter(rule => rule.tipo === 'entrata').length,
      spese_programmate: valid.rules.filter(rule => rule.tipo === 'uscita').length,
      movimenti_importati: imported,
      obiettivi: valid.goals.length,
    } };
    await session.update({ status: 'completed', completed_at: new Date(), result: response }, { transaction });
    await OnboardingImport.destroy({ where: { session_id: session.id }, transaction });
    return response;
  });
  require('./import/CategoryMatcherService').clearUserCache(userId);
  return result;
}

module.exports = { validateAnswers, finalizeOnboarding };
