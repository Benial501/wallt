require('dotenv').config();

const shared = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  dialect: 'mysql',
  logging: false,
  define: {
    timestamps: true,
    underscored: true,
  },
};

module.exports = {
  development: {
    ...shared,
    database: process.env.DB_NAME || 'wallt_db',
  },
  production: {
    ...shared,
    database: process.env.DB_NAME,
  },
  test: {
    ...shared,
    database: process.env.DB_NAME_TEST || 'wallt_test',
  },
};
