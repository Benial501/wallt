const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Conto = sequelize.define('Conto', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  nome: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  tipo: {
    type: DataTypes.STRING(50),
    defaultValue: 'banca',
  },
  saldo: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  icona: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  colore: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  ordine: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  attivo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'conti',
});

module.exports = Conto;
