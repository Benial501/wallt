const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const RegolaPersonaleMerchant = sequelize.define('RegolaPersonaleMerchant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  pattern: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  merchant_name: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  merchant_id: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  categoria: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  priorita: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 85,
  },
  attiva: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  tableName: 'regole_personali_merchant',
});

module.exports = RegolaPersonaleMerchant;
