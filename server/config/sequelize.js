require('dotenv').config();

const { Sequelize } = require('sequelize');

const env = process.env.NODE_ENV || 'development';
const config = require('./database')[env] || require('./database').development;

const options = {
  host: config.host,
  port: config.port,
  dialect: config.dialect,
  dialectOptions: config.dialectOptions,
  pool: config.pool,
  logging: config.logging ?? false,
  define: config.define,
};

const sequelize = config.url
  ? new Sequelize(config.url, options)
  : new Sequelize(config.database, config.username, config.password, options);

module.exports = sequelize;
