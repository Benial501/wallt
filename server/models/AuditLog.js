const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Traccia degli eventi importanti su permessi e connessioni bancarie.
 *
 * `user_id` è il soggetto, `actor_user_id` è chi ha agito: su una concessione
 * amministrativa sono due persone diverse, e senza la distinzione l'audit non
 * risponde alla domanda per cui esiste.
 *
 * `metadata` passa sempre dal sanitizzatore del logger (auditLog.service.js):
 * niente token, password, segreti, importi o descrizioni di transazione.
 */
const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  actor_user_id: { type: DataTypes.INTEGER, allowNull: true },
  evento: { type: DataTypes.STRING(60), allowNull: false },
  entita: { type: DataTypes.STRING(40), allowNull: true },
  entita_id: { type: DataTypes.STRING(80), allowNull: true },
  esito: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ok' },
  metadata: { type: DataTypes.JSONB, allowNull: true },
}, { tableName: 'audit_logs' });

module.exports = AuditLog;
