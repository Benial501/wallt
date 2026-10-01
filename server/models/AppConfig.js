const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Configurazione modificabile a runtime: feature flag e limiti.
 *
 * Contiene SOLO le chiavi deliberatamente cambiate. I default stanno in
 * `constants/appConfig.js`, quindi una tabella vuota si comporta come il
 * codice e cancellare una riga ripristina il default invece di produrre un
 * `null`.
 */
const AppConfig = sequelize.define('AppConfig', {
  chiave: { type: DataTypes.STRING(80), primaryKey: true },
  valore: { type: DataTypes.JSONB, allowNull: false },
  aggiornato_da: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'app_config' });

module.exports = AppConfig;
