const logger = require('../utils/logger');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, ProfiloUtente } = require('../models');
const { repairUserProfilo } = require('../services/onboarding.service');
const { isOnboardingComplete } = require('../utils/onboarding');
const { isMinorProfilo, maskUserFeaturesForMinor } = require('../utils/ageRestriction');
const { findUserByEmail } = require('../utils/findUserByEmail');
const { maskUserFeatureFlags } = require('../utils/featureAccess');
const EmailService = require('../services/email/EmailService');

const toBool = (value, defaultValue = true) => {
  if (value === false || value === 0 || value === '0') return false;
  if (value === true || value === 1 || value === '1') return true;
  if (value === undefined || value === null) return defaultValue;
  return Boolean(value);
};

const formatUser = (user) => {
  const json = user.toJSON ? user.toJSON() : { ...user };
  delete json.password;

  const profilo = json.profilo
    ? {
      ...json.profilo,
      onboarding_completato: isOnboardingComplete(json.profilo),
    }
    : null;

  return maskUserFeatureFlags(maskUserFeaturesForMinor({
    ...json,
    profilo,
    mostra_scommesse: toBool(json.mostra_scommesse, true),
    mostra_investimenti: toBool(json.mostra_investimenti, true),
    reminder: toBool(json.reminder, true),
    use_ai_categorization: toBool(json.use_ai_categorization, false),
  }, profilo), profilo);
};

const generateToken = (user) => {
  const userId = user?.id ?? user?.userId;
  const authProvider = user?.auth_provider ?? 'local';

  return jwt.sign(
    { userId, auth_provider: authProvider },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  );
};

const register = async (req, res) => {
  try {
    const {
      nome,
      email,
      password,
      privacy_accepted_at,
      terms_accepted_at,
      use_ai_categorization,
    } = req.body;

    if (!nome || !email || !password) {
      return res.status(400).json({ message: 'Nome, email e password sono obbligatori' });
    }

    if (!privacy_accepted_at || !terms_accepted_at) {
      return res.status(400).json({ message: 'Devi accettare Privacy Policy e Termini e Condizioni' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'La password deve avere almeno 8 caratteri' });
    }

    const existingUser = await findUserByEmail(User, email);
    if (existingUser) {
      return res.status(409).json({ message: 'Email già registrata' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      nome,
      email,
      password: hashedPassword,
      privacy_accepted_at: new Date(privacy_accepted_at),
      terms_accepted_at: new Date(terms_accepted_at),
      use_ai_categorization: toBool(use_ai_categorization, false),
    });

    await repairUserProfilo(user.id);

    const userCompleto = await User.findByPk(user.id, {
      attributes: { exclude: ['password'] },
      include: [{ model: ProfiloUtente, as: 'profilo' }],
    });

    const token = generateToken(userCompleto);

    await EmailService.sendWelcomeEmail(userCompleto);

    res.status(201).json({
      message: 'Registrazione completata',
      token,
      user: formatUser(userCompleto),
    });
  } catch (error) {
    logger.error('Errore registrazione', { err: error });
    res.status(500).json({ message: 'Errore durante la registrazione' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email e password sono obbligatori' });
    }

    const user = await findUserByEmail(User, email);

    if (!user) {
      return res.status(401).json({ message: 'Credenziali non valide' });
    }

    const userWithProfilo = await User.findByPk(user.id, {
      include: [{ model: ProfiloUtente, as: 'profilo' }],
    });

    if (!userWithProfilo.password) {
      return res.status(401).json({ message: 'Accedi con Google per questo account' });
    }

    const isValidPassword = await bcrypt.compare(password, userWithProfilo.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Credenziali non valide' });
    }

    await repairUserProfilo(userWithProfilo.id);
    await userWithProfilo.update({ last_login_at: new Date() });

    const userCompleto = await User.findByPk(userWithProfilo.id, {
      attributes: { exclude: ['password'] },
      include: [{ model: ProfiloUtente, as: 'profilo' }],
    });

    const token = generateToken(userCompleto);

    res.json({
      message: 'Login effettuato',
      token,
      user: formatUser(userCompleto),
    });
  } catch (error) {
    logger.error('Errore login', { err: error });
    res.status(500).json({ message: 'Errore durante il login' });
  }
};

const me = async (req, res) => {
  try {
    await repairUserProfilo(req.userId);

    const user = await User.findByPk(req.userId, {
      attributes: { exclude: ['password'] },
      include: [{ model: ProfiloUtente, as: 'profilo' }],
    });

    if (!user) {
      return res.status(404).json({ message: 'Utente non trovato' });
    }

    res.json({ user: formatUser(user) });
  } catch (error) {
    logger.error('Errore fetch profilo', { err: error });
    res.status(500).json({ message: 'Errore durante il recupero del profilo' });
  }
};

module.exports = {
  register,
  login,
  me,
  formatUser,
  generateToken,
};
