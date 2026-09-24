const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const PianoSmartAzione = sequelize.define('PianoSmartAzione', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  plan_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  action_key: { type: DataTypes.STRING(80), allowNull: false },
  title: { type: DataTypes.STRING(160), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  destination_type: { type: DataTypes.STRING(30), allowNull: false },
  destination_id: { type: DataTypes.INTEGER, allowNull: true },
  reason: { type: DataTypes.TEXT, allowNull: false },
  risk_if_ignored: { type: DataTypes.TEXT, allowNull: true },
  priority: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'da_fare' },
}, { tableName: 'piani_smart_azioni' });

module.exports = PianoSmartAzione;
