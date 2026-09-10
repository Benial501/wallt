const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const passport = require('./config/passport');
const authRoutes = require('./routes/auth.routes');
const profiloRoutes = require('./routes/profilo.routes');
const contiRoutes = require('./routes/conti.routes');
const movimentiRoutes = require('./routes/movimenti.routes');
const budgetRoutes = require('./routes/budget.routes');
const obiettiviRoutes = require('./routes/obiettivi.routes');
const scommesseRoutes = require('./routes/scommesse.routes');
const analisiRoutes = require('./routes/analisi.routes');
const impostazioniRoutes = require('./routes/impostazioni.routes');
const investimentiRoutes = require('./routes/investimenti.routes');
const importazioniRoutes = require('./routes/importazioni.routes');
const notificheRoutes = require('./routes/notifiche.routes');
const cronRoutes = require('./routes/cron.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler.middleware');
const {
  apiLimiter,
  authLimiter,
  stepUpLimiter,
} = require('./middleware/rateLimit.middleware');

const createApp = (options = {}) => {
  const {
    enableRateLimit = true,
  } = options;

  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    app.set('trust proxy', 1);
  }

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173'];

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    ...(isProduction && {
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  }));

  app.use('/api/auth/google', (_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    next();
  });
  app.use('/api/auth/google/callback', (_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    next();
  });

  app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Step-Up-Token'],
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(passport.initialize());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'WALLT API attiva' });
  });

  // Vercel Cron non usa il JWT utente: la rotta ha un Bearer secret dedicato
  // e resta fuori dal rate limiter in-memory delle normali richieste API.
  app.use('/api/cron', cronRoutes);

  // Il browser spesso chiede favicon/robots sulla porta API: non sono crash.
  app.get(['/favicon.ico', '/robots.txt'], (_req, res) => {
    res.status(204).end();
  });

  if (enableRateLimit) {
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/register', authLimiter);
    app.use('/api/auth/forgot-password', authLimiter);
    app.use('/api/auth/reset-password', authLimiter);
    app.use('/api/auth/reset-password/verify', authLimiter);
    app.use('/api/auth/verify-password', stepUpLimiter);
    app.use('/api/auth/google/challenge', stepUpLimiter);
    app.use('/api/auth/verify-google', stepUpLimiter);
    app.use('/api', apiLimiter);
  }

  app.use('/api/auth', authRoutes);
  app.use('/api/profilo', profiloRoutes);
  app.use('/api/conti', contiRoutes);
  app.use('/api/movimenti', movimentiRoutes);
  app.use('/api/budget', budgetRoutes);
  app.use('/api/obiettivi', obiettiviRoutes);
  app.use('/api/scommesse', scommesseRoutes);
  app.use('/api/analisi', analisiRoutes);
  app.use('/api/impostazioni', impostazioniRoutes);
  app.use('/api/categorie', require('./routes/categorie.routes'));
  app.use('/api/investimenti', investimentiRoutes);
  app.use('/api/importazioni', importazioniRoutes);
  app.use('/api/notifiche', notificheRoutes);
  app.use('/api/support', require('./routes/support.routes'));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

module.exports = { createApp };
