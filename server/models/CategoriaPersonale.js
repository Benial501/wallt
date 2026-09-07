const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('CategoriaPersonale', {
  id: { type: DataTypes.STRING(50), primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  nome: { type: DataTypes.STRING(80), allowNull: false },
  nome_normalizzato: { type: DataTypes.STRING(80), allowNull: false },
  tipo: { type: DataTypes.STRING(10), allowNull: false },
  icona: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'Tag' },
  colore: { type: DataTypes.STRING(7), allowNull: false, defaultValue: '#3498DB' },
  attiva: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: 'categorie_personali', indexes: [{ unique: true, fields: ['user_id', 'tipo', 'nome_normalizzato'] }] });
