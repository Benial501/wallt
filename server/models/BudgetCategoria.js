const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const BudgetCategoria = sequelize.define('BudgetCategoria', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  budget_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  categoria: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  percentuale: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  importo: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
}, {
  tableName: 'budget_categorie',
});

module.exports = BudgetCategoria;
