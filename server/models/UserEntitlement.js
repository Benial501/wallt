const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Il permesso di usare una feature, separato dal piano commerciale.
 *
 * `source` dice PERCHÉ l'utente ce l'ha, e non è intercambiabile con lo
 * stato: un posto beta (`beta_25`) consuma la quota dei 25, una concessione
 * dello staff (`admin`) no. Il client non invia mai questo campo.
 *
 * UNIQUE(user_id, feature_key) è nella migrazione: è ciò che rende
 * l'assegnazione idempotente e impedisce di occupare due posti con due
 * richieste simultanee dello stesso utente.
 */
const UserEntitlement = sequelize.define('UserEntitlement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  feature_key: { type: DataTypes.STRING(40), allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
  source: { type: DataTypes.STRING(30), allowNull: false },
  granted_at: { type: DataTypes.DATE, allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: true },
  revoked_at: { type: DataTypes.DATE, allowNull: true },
  actor_user_id: { type: DataTypes.INTEGER, allowNull: true },
  nota: { type: DataTypes.STRING(300), allowNull: true },
}, { tableName: 'user_entitlements' });

module.exports = UserEntitlement;
