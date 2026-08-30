const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Movimento = sequelize.define('Movimento', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  conto_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  conto_destinazione_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  tipo: {
    type: DataTypes.ENUM('entrata', 'uscita', 'trasferimento'),
    allowNull: false,
  },
  importo: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  categoria: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  descrizione: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  data: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  ricorrente: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  ricorrente_frequenza: {
    type: DataTypes.ENUM('giornaliera', 'settimanale', 'mensile', 'annuale'),
    allowNull: true,
  },
  ricorrente_giorno: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  categoria_automatica: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  categoria_confidenza: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  categoria_modificata: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  tableName: 'movimenti',
});

module.exports = Movimento;
