const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Una delle cinque categorie di un piano. `recommended_*` è quello che il
 * motore ha proposto, `final_*` quello che l'utente ha confermato o
 * modificato: restano distinti per sempre, altrimenti non è più possibile
 * dire perché il piano era stato proposto così.
 *
 * Le percentuali sono nullable per progetto: a capitale allocabile zero una
 * percentuale non esiste, e scrivere 0.00 dichiarerebbe un dato che non c'è.
 */
const PianoSmartAllocazione = sequelize.define('PianoSmartAllocazione', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  plan_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  recommended_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  final_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  recommended_percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  final_percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  reason_codes: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
}, {
  tableName: 'piani_smart_allocazioni',
});

module.exports = PianoSmartAllocazione;
