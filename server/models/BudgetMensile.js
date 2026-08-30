const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const BudgetMensile = sequelize.define('BudgetMensile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  mese: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 12 },
  },
  anno: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  importo_totale: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  generato_da_ai: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'budget_mensili',
});

module.exports = BudgetMensile;
