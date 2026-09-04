require('dotenv').config();

const { Sequelize } = require('sequelize');

// Sequelize carica il driver del dialetto con un require() dinamico. Il
// bundler di Vercel traccia solo i require statici, quindi senza queste due
// righe `pg` non finisce nel pacchetto della funzione e l'inizializzazione
// muore con "Please install pg package manually". Importarli qui li rende
// tracciabili; `dialectModule` dice a Sequelize di usare questa istanza
// invece di cercarla a runtime.
const pg = require('pg');
require('pg-hstore');

const env = process.env.NODE_ENV || 'development';
const config = require('./database')[env] || require('./database').development;

const options = {
  host: config.host,
  port: config.port,
  dialect: config.dialect,
  dialectModule: pg,
  dialectOptions: config.dialectOptions,
  pool: config.pool,
  logging: config.logging ?? false,
  define: config.define,
};

const sequelize = config.url
  ? new Sequelize(config.url, options)
  : new Sequelize(config.database, config.username, config.password, options);

module.exports = sequelize;
