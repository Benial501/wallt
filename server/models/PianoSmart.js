const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Testa di un Piano Smart. Nessun campo qui muove denaro: il piano è una
 * pianificazione, non un'operazione (vedi la migration 20260924000031).
 *
 * `context_snapshot` conserva SOLO gli aggregati con cui il motore ha deciso
 * (medie, coperture, pressioni, finestre, risposte manuali), mai una copia
 * dei movimenti: serve a poter rispondere "perché questo piano", non a
 * duplicare lo storico.
 */
const PianoSmart = sequelize.define('PianoSmart', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  incoming_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  source_type: {
    type: DataTypes.STRING(30),
    allowNull: false,
  },
  source_recurring: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  mandatory_expenses: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
  allocatable_capital: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  recommended_total: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  engine_version: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  context_snapshot: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  reason_codes: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'draft',
  },
}, {
  tableName: 'piani_smart',
});

module.exports = PianoSmart;
