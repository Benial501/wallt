const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Abbonamento commerciale. Predisposto, non usato: nessun pagamento è
 * implementato e nessuna subscription finta viene creata per gli utenti beta
 * (a loro basta l'entitlement con source 'beta_25').
 *
 * I campi `provider_*` sono identificatori opachi del fornitore di pagamento,
 * non credenziali: non autorizzano nulla da soli e non vengono mai restituiti
 * al browser (vedi piano.controller.js).
 */
const Subscription = sequelize.define('Subscription', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  plan: { type: DataTypes.STRING(30), allowNull: false },
  status: { type: DataTypes.STRING(30), allowNull: false },
  billing_provider: { type: DataTypes.STRING(30), allowNull: true },
  provider_customer_id: { type: DataTypes.STRING(255), allowNull: true },
  provider_subscription_id: { type: DataTypes.STRING(255), allowNull: true },
  current_period_start: { type: DataTypes.DATE, allowNull: true },
  current_period_end: { type: DataTypes.DATE, allowNull: true },
  cancel_at_period_end: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'subscriptions' });

module.exports = Subscription;
