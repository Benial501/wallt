const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const MovimentoInvestimento = sequelize.define('MovimentoInvestimento', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  investimento_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.ENUM('versamento', 'prelievo', 'rendimento', 'perdita'),
    allowNull: false,
  },
  importo: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  data: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  nota: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  saldo_dopo: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
}, {
  tableName: 'movimenti_investimento',
  updatedAt: false,
});

module.exports = MovimentoInvestimento;
