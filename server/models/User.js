const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  nome: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  avatar: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  // Immagine caricata dall'utente (data URL). Distinta da `avatar`, che
  // contiene l'URL della foto Google usato come fallback.
  avatar_immagine: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  valuta: {
    type: DataTypes.STRING(3),
    defaultValue: 'EUR',
  },
  tema: {
    type: DataTypes.ENUM('dark', 'light'),
    defaultValue: 'dark',
  },
  reminder: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  mostra_scommesse: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  mostra_investimenti: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  auth_provider: {
    type: DataTypes.ENUM('local', 'google'),
    defaultValue: 'local',
  },
  google_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true,
  },
  privacy_accepted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  terms_accepted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  use_ai_categorization: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  password_changed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'users',
});

module.exports = User;
