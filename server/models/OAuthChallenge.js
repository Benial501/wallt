const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const OAuthChallenge = sequelize.define('OAuthChallenge', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  challenge_hash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
  },
  nonce_hash: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  provider: {
    type: DataTypes.STRING(16),
    allowNull: false,
  },
  purpose: {
    type: DataTypes.STRING(16),
    allowNull: false,
  },
  platform: {
    type: DataTypes.STRING(8),
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  consumed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'oauth_challenges',
});

module.exports = OAuthChallenge;
