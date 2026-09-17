const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Debito = sequelize.define('Debito', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  nome: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  tipo: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'altro',
  },
  saldo_residuo: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  rata_periodica: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  tasso_interesse: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  taeg: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  frequenza: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'mensile',
  },
  prossima_scadenza: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  data_fine: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  conto_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  attivo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'debiti',
});

module.exports = Debito;
