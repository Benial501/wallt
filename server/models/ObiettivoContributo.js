const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const ObiettivoContributo = sequelize.define('ObiettivoContributo', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  obiettivo_id: {
    type: DataTypes.INTEGER,
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
  tableName: 'obiettivo_contributi',
});

module.exports = ObiettivoContributo;
