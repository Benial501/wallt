const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const MovimentoScommesse = sequelize.define('MovimentoScommesse', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  piattaforma_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.ENUM('deposito', 'prelievo', 'vincita', 'perdita'),
    allowNull: false,
  },
  importo: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  data: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  nota: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: 'movimenti_scommesse',
});

module.exports = MovimentoScommesse;
