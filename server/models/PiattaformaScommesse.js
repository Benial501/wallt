const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const PiattaformaScommesse = sequelize.define('PiattaformaScommesse', {
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
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  saldo: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  limite_mensile: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  attiva: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  conto_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'piattaforme_scommesse',
});

module.exports = PiattaformaScommesse;
