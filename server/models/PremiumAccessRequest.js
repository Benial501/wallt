const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * La domanda di accesso a una feature Premium.
 *
 * Non autorizza niente: è un registro dell'interesse, separato dal permesso
 * (`user_entitlements`) esattamente come il piano commerciale è separato
 * dall'entitlement. Approvare una richiesta concede l'entitlement; è quella
 * concessione ad autorizzare, non questo `status`.
 *
 * `UNIQUE(user_id, requested_feature)` è nella migrazione, non qui: un
 * vincolo dichiarato solo nel modello non protegge da due richieste
 * simultanee (Coding Rule 22).
 */
const PremiumAccessRequest = sequelize.define('PremiumAccessRequest', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  requested_feature: { type: DataTypes.STRING(40), allowNull: false },
  status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
  requested_at: { type: DataTypes.DATE, allowNull: false },
  reviewed_at: { type: DataTypes.DATE, allowNull: true },
  reviewed_by: { type: DataTypes.INTEGER, allowNull: true },
  decision_reason: { type: DataTypes.STRING(300), allowNull: true },
}, { tableName: 'premium_access_requests' });

module.exports = PremiumAccessRequest;
