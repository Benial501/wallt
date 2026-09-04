require('dotenv').config();

const shared = {
  dialect: 'postgres',
  logging: false,
  define: {
    timestamps: true,
    underscored: true,
  },
};

/**
 * TLS verso Supabase. La verifica del certificato resta ATTIVA per default:
 * non va disabilitata "per far funzionare il deploy".
 *
 * - DATABASE_SSL_CA: contenuto PEM del certificato root scaricabile da
 *   Supabase Dashboard → Database Settings → SSL Configuration. Equivale a
 *   `sslmode=verify-full` ed è la configurazione consigliata.
 * - Senza DATABASE_SSL_CA si usa lo store di CA pubbliche di Node.
 * - DATABASE_SSL_NO_VERIFY=true è l'unica via per disattivare la verifica ed
 *   è una scelta esplicita e temporanea (es. errore SELF_SIGNED_CERT_IN_CHAIN
 *   mentre si recupera il certificato), non un default.
 */
const sslOptions = () => {
  const ca = (process.env.DATABASE_SSL_CA || '').trim();
  if (ca) {
    return {
      require: true,
      rejectUnauthorized: true,
      // Le variabili Vercel sono monoriga: accetta anche i "\n" letterali.
      ca: ca.includes('\\n') ? ca.replace(/\\n/g, '\n') : ca,
    };
  }

  if (process.env.DATABASE_SSL_NO_VERIFY === 'true') {
    return { require: true, rejectUnauthorized: false };
  }

  return { require: true, rejectUnauthorized: true };
};

const readUrl = (environmentVariable) => {
  const value = (process.env[environmentVariable] || '').trim();
  return value || null;
};

/**
 * Modalità esplicite e mutuamente esclusive:
 *   - connection string se la variabile URL è valorizzata;
 *   - altrimenti i parametri DB_* separati, ma SOLO dove è previsto un
 *     fallback locale (development/test). Produzione e migrazioni non
 *     inventano host o credenziali di default.
 */
const connection = (urlVariable, { localDatabase = null } = {}) => {
  const url = readUrl(urlVariable);
  if (url) {
    return { url, use_env_variable: urlVariable };
  }

  if (!localDatabase) return {};

  return {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 5432,
    database: localDatabase,
  };
};

// `NODE_ENV=migration` esiste solo per `npm run migrate:production`. Senza la
// sua connection string fallirebbe con un errore generico di sequelize-cli:
// meglio dirlo subito e per esteso. Il controllo riguarda solo l'ambiente
// attivo, così development/test/production non ne sono influenzati.
if (process.env.NODE_ENV === 'migration' && !readUrl('DATABASE_MIGRATION_URL')) {
  throw new Error(
    'NODE_ENV=migration richiede DATABASE_MIGRATION_URL (Session pooler Supabase, porta 5432, '
    + 'oppure Direct connection). Impostala in server/.env e rilancia `npm run migrate:production`.',
  );
}

module.exports = {
  development: {
    ...shared,
    ...connection('DATABASE_URL', { localDatabase: process.env.DB_NAME || 'wallt_db' }),
  },
  production: {
    ...shared,
    ...connection('DATABASE_URL'),
    dialectOptions: {
      ssl: sslOptions(),
    },
    // Il transaction pooler di Supabase è pensato per funzioni brevi. Un pool
    // per istanza molto piccolo evita di esaurire le connessioni sul piano Free.
    pool: {
      max: 2,
      min: 0,
      idle: 0,
      acquire: 10000,
      evict: 1000,
    },
  },
  // Solo per sequelize-cli: le migrazioni vogliono una sessione stabile
  // (Session pooler o Direct connection), non il transaction pooler.
  migration: {
    ...shared,
    ...connection('DATABASE_MIGRATION_URL'),
    dialectOptions: {
      ssl: sslOptions(),
    },
    pool: {
      max: 1,
      min: 0,
    },
  },
  test: {
    ...shared,
    ...connection('TEST_DATABASE_URL', { localDatabase: process.env.DB_NAME_TEST || 'wallt_test' }),
  },
};
