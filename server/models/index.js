const sequelize = require('../config/sequelize');

const User = require('./User');
const CategoriaPersonale = require('./CategoriaPersonale');
User.hasMany(CategoriaPersonale, { foreignKey: 'user_id', as: 'categoriePersonali', onDelete: 'CASCADE' });
CategoriaPersonale.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
const ProfiloUtente = require('./ProfiloUtente');
const Conto = require('./Conto');
const Movimento = require('./Movimento');
const BudgetMensile = require('./BudgetMensile');
const BudgetCategoria = require('./BudgetCategoria');
const Obiettivo = require('./Obiettivo');
const ObiettivoContributo = require('./ObiettivoContributo');
const PiattaformaScommesse = require('./PiattaformaScommesse');
const MovimentoScommesse = require('./MovimentoScommesse');
const Investimento = require('./Investimento');
const MovimentoInvestimento = require('./MovimentoInvestimento');
const CategorieRegola = require('./CategorieRegola');
const RegolaPersonaleMerchant = require('./RegolaPersonaleMerchant');
const PasswordResetToken = require('./PasswordResetToken');
const AuthRateLimit = require('./AuthRateLimit');
const Notifica = require('./Notifica');
const PreferenzeNotifiche = require('./PreferenzeNotifiche');
const PushSubscription = require('./PushSubscription');

// User associations
User.hasOne(ProfiloUtente, { foreignKey: 'user_id', as: 'profilo' });
ProfiloUtente.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Conto, { foreignKey: 'user_id', as: 'conti' });
Conto.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Movimento, { foreignKey: 'user_id', as: 'movimenti' });
Movimento.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Movimento.belongsTo(Conto, { foreignKey: 'conto_id', as: 'conto' });
Movimento.belongsTo(Conto, { foreignKey: 'conto_destinazione_id', as: 'contoDestinazione' });

User.hasMany(BudgetMensile, { foreignKey: 'user_id', as: 'budgets' });
BudgetMensile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

BudgetMensile.hasMany(BudgetCategoria, { foreignKey: 'budget_id', as: 'categorie' });
BudgetCategoria.belongsTo(BudgetMensile, { foreignKey: 'budget_id', as: 'budget' });

User.hasMany(Obiettivo, { foreignKey: 'user_id', as: 'obiettivi' });
Obiettivo.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Obiettivo.hasMany(ObiettivoContributo, { foreignKey: 'obiettivo_id', as: 'contributi' });
ObiettivoContributo.belongsTo(Obiettivo, { foreignKey: 'obiettivo_id', as: 'obiettivo' });

User.hasMany(PiattaformaScommesse, { foreignKey: 'user_id', as: 'piattaformeScommesse' });
PiattaformaScommesse.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(MovimentoScommesse, { foreignKey: 'user_id', as: 'movimentiScommesse' });
MovimentoScommesse.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

PiattaformaScommesse.hasMany(MovimentoScommesse, { foreignKey: 'piattaforma_id', as: 'movimenti' });
MovimentoScommesse.belongsTo(PiattaformaScommesse, { foreignKey: 'piattaforma_id', as: 'piattaforma' });

Conto.hasOne(PiattaformaScommesse, { foreignKey: 'conto_id', as: 'piattaformaScommesse' });
PiattaformaScommesse.belongsTo(Conto, { foreignKey: 'conto_id', as: 'conto' });

User.hasMany(Investimento, { foreignKey: 'user_id', as: 'investimenti' });
Investimento.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(MovimentoInvestimento, { foreignKey: 'user_id', as: 'movimentiInvestimento' });
MovimentoInvestimento.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Investimento.hasMany(MovimentoInvestimento, { foreignKey: 'investimento_id', as: 'movimenti' });
MovimentoInvestimento.belongsTo(Investimento, { foreignKey: 'investimento_id', as: 'investimento' });

User.hasMany(PasswordResetToken, { foreignKey: 'user_id', as: 'passwordResetTokens' });
PasswordResetToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Notifica, { foreignKey: 'user_id', as: 'notifiche' });
Notifica.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasOne(PreferenzeNotifiche, { foreignKey: 'user_id', as: 'preferenzeNotifiche' });
PreferenzeNotifiche.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(PushSubscription, { foreignKey: 'user_id', as: 'pushSubscriptions' });
PushSubscription.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
  CategoriaPersonale,
  sequelize,
  User,
  ProfiloUtente,
  Conto,
  Movimento,
  BudgetMensile,
  BudgetCategoria,
  Obiettivo,
  ObiettivoContributo,
  PiattaformaScommesse,
  MovimentoScommesse,
  Investimento,
  MovimentoInvestimento,
  CategorieRegola,
  RegolaPersonaleMerchant,
  PasswordResetToken,
  AuthRateLimit,
  Notifica,
  PreferenzeNotifiche,
  PushSubscription,
};
