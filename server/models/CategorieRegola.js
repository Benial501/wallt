const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const CategorieRegola = sequelize.define('CategorieRegola', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  pattern: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  categoria: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  tipo: { type: DataTypes.STRING(10), allowNull: true },
  priorita: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 50,
  },
  attiva: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  tableName: 'categorie_regole',
});

module.exports = CategorieRegola;

