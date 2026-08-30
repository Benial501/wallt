const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Obiettivo = sequelize.define('Obiettivo', {
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
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  importo_target: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  importo_attuale: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  deadline: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  icona: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  completato: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'obiettivi',
});

module.exports = Obiettivo;
