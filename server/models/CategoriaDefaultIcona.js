const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

// Una riga = "questo utente ha scelto un'icona e/o un nome diversi per questa
// categoria predefinita"; `null` vale "quello di catalogo". La chiave include `tipo`: `da_verificare` esiste su entrambi i versi.
module.exports = sequelize.define('CategoriaDefaultIcona', {
  user_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
  categoria_id: { type: DataTypes.STRING(50), allowNull: false, primaryKey: true },
  tipo: { type: DataTypes.STRING(10), allowNull: false, primaryKey: true },
  icona: { type: DataTypes.STRING(50), allowNull: true },
  nome: { type: DataTypes.STRING(80), allowNull: true },
}, { tableName: 'categorie_default_icone' });
