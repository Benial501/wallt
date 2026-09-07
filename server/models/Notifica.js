const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Una notifica del centro notifiche.
 *
 * `dedupe_key` è unica per utente: è la garanzia (a livello di database) che
 * il cron, rieseguito o eseguito in parallelo, non possa creare doppioni.
 */
const Notifica = sequelize.define('Notifica', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  titolo: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  messaggio: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  link: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  priorita: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'normale',
  },
  canale: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'in_app',
  },
  letta: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  letta_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  dedupe_key: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  programmata_per: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  giorno_riferimento: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  conta_nel_limite: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  push_inviata_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
}, {
  tableName: 'notifiche',
});

module.exports = Notifica;
