const { body, param, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Dati non validi',
      errori: errors.array().map((e) => ({
        campo: e.path,
        messaggio: e.msg,
      })),
    });
  }
  return next();
};

const idParam = param('id')
  .isInt({ min: 1 })
  .withMessage('ID non valido');

const validateIdParam = [idParam, validate];

// --- Auth ---

const validateRegister = [
  body('nome')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Il nome deve avere almeno 2 caratteri'),
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email non valida'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password min 8 caratteri')
    .matches(/[A-Z]/)
    .withMessage('Password deve contenere almeno una lettera maiuscola')
    .matches(/[0-9]/)
    .withMessage('Password deve contenere almeno un numero')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password deve contenere almeno un carattere speciale'),
  body('privacy_accepted_at')
    .isISO8601()
    .withMessage('Devi accettare la Privacy Policy'),
  body('terms_accepted_at')
    .isISO8601()
    .withMessage('Devi accettare i Termini e Condizioni'),
  body('use_ai_categorization')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('Valore consenso AI non valido'),
  validate,
];

const validateLogin = [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email non valida'),
  body('password')
    .notEmpty()
    .withMessage('Password obbligatoria'),
  validate,
];

const validateForgotPassword = [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email non valida'),
  validate,
];

const validateResetPassword = [
  body('token')
    .trim()
    .matches(/^[a-f0-9]{64}$/)
    .withMessage('Token di reset non valido'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password min 8 caratteri')
    .matches(/[A-Z]/)
    .withMessage('Password deve contenere almeno una lettera maiuscola')
    .matches(/[0-9]/)
    .withMessage('Password deve contenere almeno un numero')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password deve contenere almeno un carattere speciale'),
  validate,
];

const validateVerifyResetToken = [
  body('token')
    .trim()
    .matches(/^[a-f0-9]{64}$/)
    .withMessage('Token di reset non valido'),
  validate,
];

const validateVerifyPassword = [
  body('password')
    .notEmpty()
    .withMessage('Password obbligatoria'),
  validate,
];

const validateGoogleStepUpVerify = [
  body('credential')
    .isString()
    .notEmpty()
    .withMessage('Credenziale Google obbligatoria'),
  body('challenge')
    .isString()
    .notEmpty()
    .withMessage('Challenge obbligatorio'),
  validate,
];

// --- Movimenti ---

const validateMovimento = [
  body('importo')
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo non valido')
    .custom((val) => parseFloat(val) >= 0.01)
    .withMessage('Importo deve essere maggiore di zero'),
  body('tipo')
    .isIn(['entrata', 'uscita'])
    .withMessage('Tipo non valido'),
  body('categoria')
    .notEmpty()
    .withMessage('Categoria obbligatoria'),
  body('conto_id')
    .isInt({ min: 1 })
    .withMessage('Conto non valido'),
  body('data')
    .isISO8601({ strict: false })
    .withMessage('Data non valida'),
  body('descrizione')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .escape()
    .isLength({ max: 500 })
    .withMessage('Descrizione troppo lunga'),
  body('ricorrente')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('Ricorrente non valido'),
  // Solo 'mensile' è effettivamente processata dal cron (ricorrenti.service.js).
  // Non esporre frequenze che il backend ignora silenziosamente.
  body('ricorrente_frequenza')
    .optional({ values: 'null' })
    .isIn(['mensile'])
    .withMessage('Solo la frequenza mensile è supportata'),
  body('ricorrente_giorno')
    .optional({ values: 'null' })
    .isInt({ min: 1, max: 31 })
    .withMessage('Giorno ricorrente non valido'),
  validate,
];

const validateUpdateMovimento = [
  idParam,
  body('importo')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo non valido')
    .custom((val) => parseFloat(val) >= 0.01)
    .withMessage('Importo deve essere maggiore di zero'),
  body('descrizione')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .escape()
    .isLength({ max: 500 })
    .withMessage('Descrizione troppo lunga'),
  body('categoria_id')
    .optional({ values: 'null' })
    .isInt({ min: 1 })
    .withMessage('Categoria non valida'),
  body('categoria')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .escape()
    .isLength({ max: 100 })
    .withMessage('Categoria non valida'),
  body('data')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Data non valida'),
  body('conto_id')
    .optional({ values: 'null' })
    .isInt({ min: 1 })
    .withMessage('Conto non valido'),
  body('tipo')
    .optional({ values: 'null' })
    .isIn(['entrata', 'uscita'])
    .withMessage('Tipo non valido'),
  body('ricorrente')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('Ricorrente non valido'),
  body('ricorrente_frequenza')
    .optional({ values: 'null' })
    .isIn(['mensile'])
    .withMessage('Solo la frequenza mensile è supportata'),
  body('ricorrente_giorno')
    .optional({ values: 'null' })
    .isInt({ min: 1, max: 31 })
    .withMessage('Giorno ricorrente non valido'),
  validate,
];

const validateDeleteMovimento = validateIdParam;

// --- Conti ---

const CONTO_TIPI_CREATE = [
  'banca', 'app_pagamento', 'contanti', 'investimento', 'scommesse',
  'wallet', 'wallet_digitale', 'risparmio', 'carta_credito',
];

const CONTO_TIPI_UPDATE = [
  'banca', 'app_pagamento', 'contanti', 'investimento', 'scommesse',
  'wallet', 'wallet_digitale', 'risparmio', 'carta_credito',
  'digitale', 'altro',
];

const validateConto = [
  body('nome')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nome obbligatorio'),
  body('tipo')
    .isIn(CONTO_TIPI_CREATE)
    .withMessage('Tipo non valido'),
  body('saldo_iniziale')
    .optional({ values: 'null' })
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      const n = Number(value);
      return Number.isFinite(n) && n >= 0;
    })
    .withMessage('Saldo iniziale non valido'),
  body('icona')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Icona non valida'),
  body('colore')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Colore non valido'),
  validate,
];

const validateUpdateConto = [
  idParam,
  body('nome')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nome non valido'),
  body('saldo_iniziale')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Saldo iniziale non valido'),
  body('tipo')
    .optional({ values: 'null' })
    .isIn(CONTO_TIPI_UPDATE)
    .withMessage('Tipo non valido'),
  body('icona')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Icona non valida'),
  body('colore')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Colore non valido'),
  body('ordine')
    .optional({ values: 'null' })
    .isInt({ min: 0 })
    .withMessage('Ordine non valido'),
  validate,
];

const validateDeleteConto = validateIdParam;

const validateTrasferimento = [
  body('importo')
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo non valido'),
  body('conto_origine_id')
    .isInt({ min: 1 })
    .withMessage('Conto origine non valido'),
  body('conto_destinazione_id')
    .isInt({ min: 1 })
    .withMessage('Conto destinazione non valido'),
  body('data')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Data non valida'),
  validate,
];

// --- Import ---

const validateImportConferma = [
  body('fileId')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .notEmpty()
    .withMessage('fileId non valido'),
  body('mappings')
    .optional({ values: 'null' })
    .isObject()
    .withMessage('mappings deve essere un oggetto'),
  body('transactions')
    .optional({ values: 'null' })
    .isArray({ min: 1 })
    .withMessage('transactions deve essere un array non vuoto'),
  body('transactions.*.data')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Data transazione non valida'),
  body('transactions.*.descrizione')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .escape()
    .isLength({ max: 500 })
    .withMessage('Descrizione transazione troppo lunga'),
  body('transactions.*.importo')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo transazione non valido'),
  body('transactions.*.tipo')
    .optional({ values: 'null' })
    .isIn(['entrata', 'uscita'])
    .withMessage('Tipo transazione non valido'),
  body('transactions.*.conto_id')
    .optional({ values: 'null' })
    .isInt({ min: 1 })
    .withMessage('Conto transazione non valido'),
  body('transactions.*.categoria_finale')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .escape()
    .isLength({ max: 100 })
    .withMessage('Categoria transazione non valida'),
  body('transactions.*.clientTxId')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('clientTxId non valido'),
  body('aggiorna_saldo')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('aggiorna_saldo non valido'),
  body().custom((_value, { req }) => {
    const hasFileId = typeof req.body?.fileId === 'string' && req.body.fileId.trim().length > 0;
    const hasTransactions = Array.isArray(req.body?.transactions) && req.body.transactions.length > 0;
    if (!hasFileId && !hasTransactions) {
      throw new Error('fileId o transactions richiesto');
    }
    return true;
  }),
  validate,
];

// --- Impostazioni ---

const validateUpdateProfilo = [
  body('nome')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .escape()
    .isLength({ min: 2, max: 100 })
    .withMessage('Nome non valido'),
  body('email')
    .optional({ values: 'null' })
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email non valida'),
  body('avatar')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Avatar non valido'),
  validate,
];

const validateUpdatePreferenze = [
  body('valuta')
    .optional({ values: 'null' })
    .isIn(['EUR', 'USD', 'GBP', 'CHF', 'JPY'])
    .withMessage('Valuta non valida'),
  body('tema')
    .optional({ values: 'null' })
    .isIn(['light', 'dark'])
    .withMessage('Tema non valido'),
  body('reminder')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('Reminder non valido'),
  body('mostra_scommesse')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('mostra_scommesse non valido'),
  body('mostra_investimenti')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('mostra_investimenti non valido'),
  body('use_ai_categorization')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('use_ai_categorization non valido'),
  validate,
];

const validatePassword = [
  body('password_attuale')
    .notEmpty()
    .withMessage('Password attuale obbligatoria'),
  body('nuova_password')
    .isLength({ min: 8 })
    .withMessage('Password min 8 caratteri')
    .matches(/[A-Z]/)
    .withMessage('Deve contenere una maiuscola')
    .matches(/[0-9]/)
    .withMessage('Deve contenere un numero'),
  validate,
];

const validateResetAccount = [
  body('password')
    .optional({ values: 'null' })
    .isString()
    .notEmpty()
    .withMessage('Password non valida'),
  body('conferma')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .equals('RESETTA')
    .withMessage('Digita RESETTA per confermare'),
  validate,
];

const validateDeleteAccount = [
  body('password')
    .optional({ values: 'null' })
    .isString()
    .notEmpty()
    .withMessage('Password non valida'),
  body('conferma')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .equals('ELIMINA')
    .withMessage('Digita ELIMINA per confermare'),
  validate,
];

// --- Budget ---

const validateBudget = [
  body('mese')
    .isInt({ min: 1, max: 12 })
    .withMessage('Mese non valido'),
  body('anno')
    .isInt({ min: 2020, max: 2100 })
    .withMessage('Anno non valido'),
  body('importo_totale')
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo non valido'),
  body('categorie')
    .isArray({ min: 1 })
    .withMessage('Almeno una categoria'),
  body('categorie.*.categoria')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Categoria budget non valida'),
  body('categorie.*.percentuale')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Percentuale categoria non valida'),
  body('categorie.*.importo')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo categoria non valido'),
  validate,
];

const validateUpdateBudget = [
  idParam,
  body('importo_totale')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo non valido'),
  body('categorie')
    .optional({ values: 'null' })
    .isArray({ min: 1 })
    .withMessage('Almeno una categoria'),
  body('categorie.*.categoria')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Categoria budget non valida'),
  body('categorie.*.percentuale')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Percentuale categoria non valida'),
  body('categorie.*.importo')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo categoria non valido'),
  validate,
];

// --- Obiettivi ---

const validateObiettivo = [
  body('nome')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nome obbligatorio'),
  body('importo_target')
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo target non valido'),
  body('deadline')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Deadline non valida'),
  body('icona')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Icona non valida'),
  body('importo_iniziale')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo iniziale non valido'),
  validate,
];

const validateUpdateObiettivo = [
  idParam,
  body('nome')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nome non valido'),
  body('importo_target')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo target non valido'),
  body('deadline')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Deadline non valida'),
  body('icona')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Icona non valida'),
  validate,
];

const validateDeleteObiettivo = validateIdParam;

const validateContributo = [
  idParam,
  body('importo')
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo non valido'),
  body('data')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Data non valida'),
  body('nota')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .escape()
    .isLength({ max: 255 })
    .withMessage('Nota troppo lunga'),
  validate,
];

// --- Investimenti ---

const validateInvestimento = [
  body('nome_piattaforma')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nome piattaforma obbligatorio'),
  body('tipo')
    .isIn(['azioni', 'etf', 'crypto', 'fondi', 'obbligazioni', 'altro'])
    .withMessage('Tipo non valido'),
  body('saldo_iniziale')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Saldo iniziale non valido'),
  body('colore')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 7 })
    .withMessage('Colore non valido'),
  body('note')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .escape()
    .isLength({ max: 255 })
    .withMessage('Note troppo lunghe'),
  validate,
];

const validateUpdateInvestimento = [
  idParam,
  body('nome_piattaforma')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nome piattaforma non valido'),
  body('tipo')
    .optional({ values: 'null' })
    .isIn(['azioni', 'etf', 'crypto', 'fondi', 'obbligazioni', 'altro'])
    .withMessage('Tipo non valido'),
  body('colore')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 7 })
    .withMessage('Colore non valido'),
  body('note')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .escape()
    .isLength({ max: 255 })
    .withMessage('Note troppo lunghe'),
  validate,
];

const validateDeleteInvestimento = validateIdParam;

const validateMovimentoInvestimento = [
  idParam,
  body('tipo')
    .isIn(['versamento', 'prelievo', 'rendimento', 'perdita'])
    .withMessage('Tipo non valido'),
  body('importo')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo non valido'),
  body('data')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Data non valida'),
  body('nota')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .escape()
    .isLength({ max: 255 })
    .withMessage('Nota troppo lunga'),
  body('saldo_dopo')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Saldo non valido'),
  body('conto_collegato_id')
    .optional({ values: 'null' })
    .isInt({ min: 1 })
    .withMessage('Conto collegato non valido'),
  validate,
];

// --- Scommesse ---

const validatePiattaformaScommesse = [
  body('nome')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nome obbligatorio'),
  body('saldo_iniziale')
    .optional({ values: 'null' })
    .custom((value) => value === undefined || value === null || value === '' || !Number.isNaN(Number(value)))
    .withMessage('Saldo iniziale non valido')
    .bail()
    .customSanitizer((value) => (value === undefined || value === null || value === '' ? 0 : Number(value))),
  body('limite_mensile')
    .optional({ values: 'null' })
    .custom((value) => value === undefined || value === null || value === '' || !Number.isNaN(Number(value)))
    .withMessage('Limite mensile non valido')
    .bail()
    .customSanitizer((value) => (value === undefined || value === null || value === '' ? null : Number(value))),
  validate,
];

const validateUpdatePiattaformaScommesse = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID piattaforma non valido'),
  body('nome')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nome non valido'),
  body('limite_mensile')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Limite mensile non valido'),
  validate,
];

const validateDeletePiattaformaScommesse = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID piattaforma non valido'),
  validate,
];

const validateMovimentoScommesse = [
  body('piattaforma_id')
    .isInt({ min: 1 })
    .withMessage('Piattaforma non valida'),
  body('tipo')
    .isIn(['deposito', 'prelievo', 'vincita', 'perdita'])
    .withMessage('Tipo non valido'),
  body('importo')
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Importo non valido'),
  body('data')
    .optional({ values: 'null' })
    .isISO8601({ strict: false })
    .withMessage('Data non valida'),
  body('nota')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .escape()
    .isLength({ max: 255 })
    .withMessage('Nota troppo lunga'),
  body('conto_collegato_id')
    .optional({ values: 'null' })
    .isInt({ min: 1 })
    .withMessage('Conto collegato non valido'),
  validate,
];

// --- Profilo finanziario ---

const validateUpdateProfiloFinanziario = [
  body('fascia_eta')
    .optional({ values: 'null' })
    .isIn(['under_18', '18_24', '25_34', '35_44', '45_54', '55_plus'])
    .withMessage('fascia_eta non valida'),
  body('situazione_lavorativa')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 50 })
    .withMessage('situazione_lavorativa non valida'),
  body('entrata_fissa')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('entrata_fissa non valido'),
  body('entrata_mensile')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('entrata_mensile non valida'),
  body('situazione_abitativa')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 50 })
    .withMessage('situazione_abitativa non valida'),
  body('costo_abitazione')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('costo_abitazione non valido'),
  body('paga_bollette')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage('paga_bollette non valido'),
  body('stima_bollette')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('stima_bollette non valida'),
  body('ha_auto')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('ha_auto non valido'),
  body('ha_moto')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('ha_moto non valido'),
  body('usa_mezzi_pubblici')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('usa_mezzi_pubblici non valido'),
  body('spesa_benzina')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('spesa_benzina non valida'),
  body('spesa_mezzi')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('spesa_mezzi non valida'),
  body('spese_fisse_extra')
    .optional({ values: 'null' })
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('spese_fisse_extra non valida'),
  body('risparmia')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 50 })
    .withMessage('risparmia non valido'),
  body('ha_investimenti')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 50 })
    .withMessage('ha_investimenti non valido'),
  body('fa_scommesse')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage('fa_scommesse non valido'),
  body('onboarding_completato')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('onboarding_completato non valido'),
  validate,
];

module.exports = {
  validate,
  handleValidation: validate,
  validateIdParam,
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateVerifyResetToken,
  validateVerifyPassword,
  validateGoogleStepUpVerify,
  validateMovimento,
  validateUpdateMovimento,
  validateDeleteMovimento,
  validateConto,
  validateUpdateConto,
  validateDeleteConto,
  validateTrasferimento,
  validateImportConferma,
  validateUpdateProfilo,
  validateUpdatePreferenze,
  validatePassword,
  validateResetAccount,
  validateDeleteAccount,
  validateBudget,
  validateUpdateBudget,
  validateObiettivo,
  validateUpdateObiettivo,
  validateDeleteObiettivo,
  validateContributo,
  validateInvestimento,
  validateUpdateInvestimento,
  validateDeleteInvestimento,
  validateMovimentoInvestimento,
  validatePiattaformaScommesse,
  validateUpdatePiattaformaScommesse,
  validateDeletePiattaformaScommesse,
  validateMovimentoScommesse,
  validateUpdateProfiloFinanziario,
};
