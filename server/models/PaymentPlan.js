const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('PaymentPlan', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  conto_id: { type: DataTypes.INTEGER, allowNull: false },
  categoria: { type: DataTypes.STRING(100), allowNull: true },
  descrizione: { type: DataTypes.STRING(500), allowNull: true },
  importo_acquisto: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  importo_iniziale: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  numero_pagamenti: { type: DataTypes.INTEGER, allowNull: false },
  tasso_annuo: { type: DataTypes.DECIMAL(8, 4), allowNull: false, defaultValue: 0 },
  totale_da_restituire: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  interessi_stimati: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  movimento_iniziale_id: { type: DataTypes.INTEGER, allowNull: true },
  stato: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'attivo' },
}, { tableName: 'piani_pagamento' });
