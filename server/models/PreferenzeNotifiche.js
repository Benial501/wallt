const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Preferenze di notifica: una riga per utente, creata al primo accesso al
 * centro notifiche o alla prima esecuzione del cron. I default riproducono
 * il comportamento richiesto: promemoria e alert attivi, riepilogo
 * settimanale e push spenti finché l'utente non li attiva.
 */
const PreferenzeNotifiche = sequelize.define('PreferenzeNotifiche', {
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
  promemoria_giornaliero_attivo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  alert_budget_attivi: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  alert_ricorrenti_attivi: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  alert_obiettivi_attivi: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  riepilogo_settimanale_attivo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  push_attive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  orario_promemoria: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: '20:00',
  },
  timezone: {
    type: DataTypes.STRING(64),
    allowNull: false,
    defaultValue: 'Europe/Rome',
  },
  quiet_hours_inizio: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: '22:00',
  },
  quiet_hours_fine: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: '08:00',
  },
  max_notifiche_giornaliere: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2,
  },
  giornata_controllata_il: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
}, {
  tableName: 'preferenze_notifiche',
});

module.exports = PreferenzeNotifiche;
