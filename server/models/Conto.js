const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Conto = sequelize.define('Conto', {
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
  tipo: {
    type: DataTypes.STRING(50),
    defaultValue: 'banca',
  },
  saldo: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  icona: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  colore: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  ordine: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  attivo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  nascosto: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Solo per il conto di tipo 'emergenza': la soglia del fondo in mesi di
  // spese essenziali. Null su ogni altro conto.
  mesi_sicurezza_target: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'conti',
});

module.exports = Conto;
