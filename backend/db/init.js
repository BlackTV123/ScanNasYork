/**
 * Database Initializer — Sequelize ORM Version
 * Creates all tables from model definitions.
 * Usage: npm run db:init
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sequelize } = require('../models');
const logger = require('../utils/logger');

(async () => {
  try {
    logger.info('Connecting to database...');
    await sequelize.authenticate();
    logger.info('Connection established');

    logger.info('Syncing models (creating tables)...');
    await sequelize.sync({ force: false }); // force: true would DROP existing tables
    // Upgrade an existing pre-currency schema without rebuilding its records.
    const columns = await sequelize.getQueryInterface().describeTable('income_statements');
    if (!columns.currency) {
      await sequelize.getQueryInterface().addColumn('income_statements', 'currency', {
        type: require('sequelize').DataTypes.STRING(3), allowNull: false, defaultValue: 'USD',
      });
    }
    logger.info('All models synchronized successfully');

    // List created tables
    const tables = await sequelize.getQueryInterface().showAllTables();
    logger.info('Tables:', { tables });
  } catch (err) {
    logger.error('Database initialization failed', { error: err.message });
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
