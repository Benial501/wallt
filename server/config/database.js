require('dotenv').config();

const shared = {
  dialect: 'postgres',
  logging: false,
  define: {
    timestamps: true,
    underscored: true,
  },
};

const localConnection = (database) => ({
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  database,
});

const urlConnection = (environmentVariable) => {
  const url = process.env[environmentVariable];
  if (!url) return {};

  return {
    url,
    use_env_variable: environmentVariable,
  };
};

module.exports = {
  development: {
    ...shared,
    ...localConnection(process.env.DB_NAME || 'wallt_db'),
    ...urlConnection('DATABASE_URL'),
  },
  production: {
    ...shared,
    ...urlConnection('DATABASE_URL'),
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
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
  test: {
    ...shared,
    ...localConnection(process.env.DB_NAME_TEST || 'wallt_test'),
    ...urlConnection('TEST_DATABASE_URL'),
  },
};
