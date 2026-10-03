const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('OnboardingSession', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  schema_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
  current_step: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'utilizzi' },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
  answers: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  result: { type: DataTypes.JSONB, allowNull: true },
  last_saved_at: { type: DataTypes.DATE, allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'onboarding_sessions' });
