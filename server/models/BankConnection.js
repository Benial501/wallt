const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Una connessione bancaria Open Banking.
 *
 * Non contiene credenziali: `provider_connection_id` è l'identificatore
 * opaco del consenso presso il provider, `state_hash` è lo SHA-256 del
 * `state` del callback (mai il `state` stesso) e `iban_mascherato` porta solo
 * la coda dell'IBAN. Vedi la migrazione 20261001000042 per il ragionamento
 * completo e per l'indice parziale che impone una sola connessione viva per
 * utente.
 */
const BankConnection = sequelize.define('BankConnection', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  conto_id: { type: DataTypes.INTEGER, allowNull: true },
  provider: { type: DataTypes.STRING(30), allowNull: false },
  institution_id: { type: DataTypes.STRING(120), allowNull: false },
  institution_name: { type: DataTypes.STRING(200), allowNull: true },
  provider_connection_id: { type: DataTypes.STRING(255), allowNull: true },
  provider_account_id: { type: DataTypes.STRING(255), allowNull: true },
  status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'in_attesa' },
  state_hash: { type: DataTypes.STRING(64), allowNull: true },
  state_expires_at: { type: DataTypes.DATE, allowNull: true },
  state_used_at: { type: DataTypes.DATE, allowNull: true },
  consent_created_at: { type: DataTypes.DATE, allowNull: true },
  consent_expires_at: { type: DataTypes.DATE, allowNull: true },
  last_sync_at: { type: DataTypes.DATE, allowNull: true },
  last_successful_sync_at: { type: DataTypes.DATE, allowNull: true },
  last_error_at: { type: DataTypes.DATE, allowNull: true },
  error_code: { type: DataTypes.STRING(40), allowNull: true },
  sync_started_at: { type: DataTypes.DATE, allowNull: true },
  iban_mascherato: { type: DataTypes.STRING(30), allowNull: true },
  valuta: { type: DataTypes.STRING(3), allowNull: true },
  saldo_provider: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  sync_ok_totali: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  sync_errori_totali: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  movimenti_importati_totali: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  duplicati_evitati_totali: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'bank_connections' });

module.exports = BankConnection;
