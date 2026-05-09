/**
 * Database Initializer — Sequelize ORM Version
 * Creates all tables from model definitions.
 * Usage: npm run db:init
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sequelize, Ticker, DailyMetric, IncomeStatement } = require('../models');
const logger = require('../utils/logger');

(async () => {
  try {
    logger.info('Connecting to database...');
    await sequelize.authenticate();
    logger.info('Connection established');

    logger.info('Syncing models (creating tables)...');
    await sequelize.sync({ force: false }); // force: true would DROP existing tables
    logger.info('All models synchronized successfully');

    // List created tables
    const [results] = await sequelize.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    logger.info('Tables:', { tables: results.map(r => r.table_name) });
  } catch (err) {
    logger.error('Database initialization failed', { error: err.message });
  } finally {
    await sequelize.close();
    process.exit(0);
  }
})();
