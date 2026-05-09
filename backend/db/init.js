/**
 * Database Initializer
 * Reads and executes schema.sql to create all tables and indexes.
 * Usage: node db/init.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');
const logger = require('../utils/logger');

async function initializeDatabase() {
  logger.info('Starting database initialization...');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  const client = await pool.connect();
  try {
    await client.query(schema);
    logger.info('Database schema created successfully');

    // Verify tables exist
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    logger.info('Created tables:', {
      tables: result.rows.map(r => r.table_name),
    });
  } catch (err) {
    logger.error('Database initialization failed', { error: err.message });
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

initializeDatabase()
  .then(() => {
    logger.info('Database initialization complete');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('Fatal error during initialization', { error: err.message });
    process.exit(1);
  });
