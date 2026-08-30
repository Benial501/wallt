require('dotenv').config();

const { Sequelize } = require('sequelize');

const env = process.env.NODE_ENV || 'development';
const config = require('./database')[env] || require('./database').development;

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging ?? false,
    define: config.define,
  },
);

module.exports = sequelize;
