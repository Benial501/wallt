const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const AuthRateLimit = sequelize.define('AuthRateLimit', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  key_hash: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  route: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  window_start: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  hit_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
}, {
  tableName: 'auth_rate_limits',
});

module.exports = AuthRateLimit;
