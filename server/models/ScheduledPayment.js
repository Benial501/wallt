const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('ScheduledPayment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  piano_id: { type: DataTypes.INTEGER, allowNull: true },
  ricorrenza_origine_id: { type: DataTypes.INTEGER, allowNull: true },
  ricorrenza_periodo: { type: DataTypes.STRING(20), allowNull: true },
  conto_id: { type: DataTypes.INTEGER, allowNull: false },
  tipo: { type: DataTypes.STRING(20), allowNull: false },
  importo: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  categoria: { type: DataTypes.STRING(100), allowNull: true },
  descrizione: { type: DataTypes.STRING(500), allowNull: true },
  data_scadenza: { type: DataTypes.DATEONLY, allowNull: false },
  stato: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'in_attesa' },
  movimento_id: { type: DataTypes.INTEGER, allowNull: true },
  pagato_il: { type: DataTypes.DATEONLY, allowNull: true },
}, { tableName: 'pagamenti_programmati' });
