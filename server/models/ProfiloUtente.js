const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const ProfiloUtente = sequelize.define('ProfiloUtente', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
  },
  fascia_eta: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  situazione_lavorativa: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  entrata_fissa: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  entrata_mensile: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  situazione_abitativa: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  costo_abitazione: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  paga_bollette: {
    type: DataTypes.ENUM('tutte', 'divise', 'no'),
    defaultValue: 'no',
  },
  stima_bollette: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  ha_auto: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  ha_moto: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  usa_mezzi_pubblici: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  spesa_benzina: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  spesa_mezzi: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  spese_fisse_extra: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  risparmia: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  ha_investimenti: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  fa_scommesse: {
    type: DataTypes.STRING(50),
    defaultValue: 'no',
  },
  onboarding_completato: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'profili_utente',
});

module.exports = ProfiloUtente;
