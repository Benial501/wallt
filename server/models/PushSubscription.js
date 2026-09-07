const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Sottoscrizione Web Push di un browser. `endpoint` è univoco globalmente
 * (lo assegna il push service del browser): se lo stesso dispositivo viene
 * riusato da un altro account WALLT, la riga viene riassegnata invece di
 * essere duplicata.
 *
 * Una sottoscrizione che il push service rifiuta con 404/410 viene
 * disattivata (`attiva = false`), non cancellata: resta la traccia di quando
 * e perché è stata scartata.
 */
const PushSubscription = sequelize.define('PushSubscription', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  endpoint: {
    type: DataTypes.TEXT,
    allowNull: false,
    unique: true,
  },
  p256dh: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  auth: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  user_agent: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  attiva: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  ultimo_errore: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  disattivata_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'push_subscriptions',
});

module.exports = PushSubscription;
