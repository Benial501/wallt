const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const PasswordResetToken = sequelize.define('PasswordResetToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  token_hash: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  used_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'password_reset_tokens',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = PasswordResetToken;
