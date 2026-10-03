const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('OnboardingImport', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  session_id: { type: DataTypes.INTEGER, allowNull: false },
  account_key: { type: DataTypes.STRING(60), allowNull: false },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
  preview: { type: DataTypes.JSONB, allowNull: false },
  rows: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
}, { tableName: 'onboarding_imports' });
