const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token non fornito' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId || decoded.id;
    req.authProvider = decoded.auth_provider;

    const user = await User.findByPk(req.userId, {
      attributes: ['id', 'password_changed_at'],
    });

    if (!user) {
      return res.status(401).json({ message: 'Utente non trovato' });
    }

    if (user.password_changed_at && decoded.iat) {
      const tokenIssuedAt = decoded.iat * 1000;
      if (tokenIssuedAt < user.password_changed_at.getTime()) {
        return res.status(401).json({ message: 'Sessione scaduta. Effettua di nuovo il login.' });
      }
    }

    next();
  } catch {
    return res.status(401).json({ message: 'Token non valido o scaduto' });
  }
};

module.exports = authMiddleware;
