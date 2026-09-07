const {
  User,
  ProfiloUtente,
  Conto,
  Movimento,
  BudgetMensile,
  BudgetCategoria,
  Obiettivo,
  ObiettivoContributo,
  PiattaformaScommesse,
  MovimentoScommesse,
  Investimento,
  MovimentoInvestimento,
  CategorieRegola,
  RegolaPersonaleMerchant,
  Notifica,
  PreferenzeNotifiche,
  PushSubscription,
} = require('../models');

const isOAuthProvider = (authProvider) => !!authProvider && authProvider !== 'local';

/**
 * Elimina solo le transazioni (movimenti) e azzera i saldi dei conti.
 * I conti restano attivi con nome, icona e colore invariati.
 */
const deleteAllTransactions = async (userId, transaction) => {
  await Movimento.destroy({ where: { user_id: userId }, transaction });
  await Conto.update(
    { saldo: 0 },
    { where: { user_id: userId, attivo: true }, transaction },
  );
  // Gli avvisi già emessi (budget all'80%, pagamento in arrivo, ...) parlano
  // di movimenti che non esistono più. Vanno rimossi anche perché la loro
  // dedupe_key impedirebbe di riemettere lo stesso avviso se l'utente
  // ricostruisce i dati nello stesso periodo.
  await Notifica.destroy({ where: { user_id: userId }, transaction });
};

/**
 * Elimina tutti i dati finanziari dell'utente.
 * Non elimina: account, credenziali, preferenze utente, profilo/onboarding.
 */
const deleteAllUserData = async (userId, transaction) => {
  await MovimentoScommesse.destroy({ where: { user_id: userId }, transaction });
  await PiattaformaScommesse.destroy({ where: { user_id: userId }, transaction });

  const investimenti = await Investimento.findAll({ where: { user_id: userId }, transaction });
  for (const inv of investimenti) {
    await MovimentoInvestimento.destroy({ where: { investimento_id: inv.id }, transaction });
  }
  await MovimentoInvestimento.destroy({ where: { user_id: userId }, transaction });
  await Investimento.destroy({ where: { user_id: userId }, transaction });

  const obiettivi = await Obiettivo.findAll({ where: { user_id: userId }, transaction });
  for (const obj of obiettivi) {
    await ObiettivoContributo.destroy({ where: { obiettivo_id: obj.id }, transaction });
  }
  await Obiettivo.destroy({ where: { user_id: userId }, transaction });

  const budgets = await BudgetMensile.findAll({ where: { user_id: userId }, transaction });
  for (const b of budgets) {
    await BudgetCategoria.destroy({ where: { budget_id: b.id }, transaction });
  }
  await BudgetMensile.destroy({ where: { user_id: userId }, transaction });

  // Movimenti (entrate, uscite e trasferimenti)
  await Movimento.destroy({ where: { user_id: userId }, transaction });
  await Conto.destroy({ where: { user_id: userId }, transaction });
  await CategorieRegola.destroy({ where: { user_id: userId }, transaction });
  await RegolaPersonaleMerchant.destroy({ where: { user_id: userId }, transaction });

  // Le notifiche fanno riferimento a budget, obiettivi e movimenti appena
  // eliminati: tenerle vorrebbe dire mostrare avvisi su dati che non
  // esistono più. Le preferenze restano (sono impostazioni, non dati).
  await Notifica.destroy({ where: { user_id: userId }, transaction });
};

/**
 * Cancellazione completa dell'account: dati finanziari + profilo + utente.
 */
const deleteUserAccountCompletely = async (userId, transaction) => {
  await deleteAllUserData(userId, transaction);
  await PushSubscription.destroy({ where: { user_id: userId }, transaction });
  await PreferenzeNotifiche.destroy({ where: { user_id: userId }, transaction });
  await ProfiloUtente.destroy({ where: { user_id: userId }, transaction });
  await User.destroy({ where: { id: userId }, transaction });
};

module.exports = {
  deleteAllTransactions,
  deleteAllUserData,
  deleteUserAccountCompletely,
  isOAuthProvider,
};
