const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

// Una riga = una categoria predefinita eliminata da un utente.
// La chiave comprende `tipo`: `da_verificare` esiste sia entrata sia uscita.
module.exports = sequelize.define('CategoriaDefaultNascosta', {
  user_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
  categoria_id: { type: DataTypes.STRING(50), allowNull: false, primaryKey: true },
  tipo: { type: DataTypes.STRING(10), allowNull: false, primaryKey: true },
}, { tableName: 'categorie_default_nascoste' });
