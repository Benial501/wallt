const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('ScheduledPaymentContribution', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  pagamento_programmato_id: { type: DataTypes.INTEGER, allowNull: false },
  importo: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  data_contributo: { type: DataTypes.DATEONLY, allowNull: false },
}, { tableName: 'contributi_pagamenti_programmati' });
