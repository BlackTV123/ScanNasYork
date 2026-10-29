/**
 * Sequelize Instance & Connection
 */

const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'scannas_york',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    dialect: 'mysql',
    dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 20,
      min: 2,
      acquire: 10000,
      idle: 30000,
    },
    define: {
      engine: 'InnoDB',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      underscored: true,   // snake_case column names
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

module.exports = sequelize;
