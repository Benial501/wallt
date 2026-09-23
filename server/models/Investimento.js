const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Investimento = sequelize.define('Investimento', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  nome_piattaforma: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  tipo: {
    type: DataTypes.ENUM('azioni', 'etf', 'crypto', 'fondi', 'obbligazioni', 'altro'),
    allowNull: false,
    defaultValue: 'azioni',
  },
  saldo_attuale: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  liquidabilita: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'sconosciuto',
  },
  giorni_disponibilita: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  condizioni_disponibilita: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  data_apertura: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  colore: {
    type: DataTypes.STRING(7),
    defaultValue: '#6C5CE7',
  },
  attivo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  note: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
}, {
  tableName: 'investimenti',
});

module.exports = Investimento;
