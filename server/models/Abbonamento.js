const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Abbonamento = sequelize.define('Abbonamento', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  servizio_id: { type: DataTypes.STRING(60), allowNull: true },
  chiave: { type: DataTypes.STRING(120), allowNull: false },
  ordine: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
  nome: { type: DataTypes.STRING(100), allowNull: false },
  icona: { type: DataTypes.STRING(60), allowNull: true },
  costo: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  periodo_mesi: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
  // null significa «finché non lo annullo».
  durata_mesi: { type: DataTypes.SMALLINT, allowNull: true },
  data_inizio: { type: DataTypes.DATEONLY, allowNull: true },
  stato: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'attivo' },
  origine: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'manuale' },
  da_verificare: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  riattivato_da_addebito: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  annullato_il: { type: DataTypes.DATEONLY, allowNull: true },
  ultimo_addebito_data: { type: DataTypes.DATEONLY, allowNull: true },
  ultimo_addebito_importo: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  modificato_utente_il: { type: DataTypes.DATE, allowNull: true },
  movimento_ricorrente_id: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'abbonamenti',
});

module.exports = Abbonamento;
