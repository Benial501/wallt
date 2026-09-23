const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

// Una riga = "questo utente ha personalizzato l'essenzialità di questa
// categoria predefinita di uscita". Solo tipo 'uscita': l'essenzialità non
// è applicabile alle entrate (essenzialita.service.js).
module.exports = sequelize.define('CategoriaDefaultEssenzialita', {
  user_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
  categoria_id: { type: DataTypes.STRING(50), allowNull: false, primaryKey: true },
  essenzialita: { type: DataTypes.STRING(20), allowNull: false },
}, { tableName: 'categorie_default_essenzialita' });
