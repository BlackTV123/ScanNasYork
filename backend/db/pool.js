/**
 * PostgreSQL Connection Pool
 * Manages database connections with configurable pooling.
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'scannas_york',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,                          // Maximum connections in the pool
  idleTimeoutMillis: 30000,         // Close idle connections after 30s
  connectionTimeoutMillis: 5000,    // Fail if can't connect in 5s
  statement_timeout: 10000,         // Abort queries taking > 10s
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

/**
 * Execute a parameterized query.
 * @param {string} text - SQL query text with $1, $2, ... placeholders
 * @param {Array} params - Parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', {
      query: text.substring(0, 120),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });
    return result;
  } catch (err) {
    logger.error('Query failed', {
      query: text.substring(0, 120),
      error: err.message,
    });
    throw err;
  }
}

/**
 * Get a client from the pool for transaction support.
 */
async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);

  // Monkey-patch to track release
  let released = false;
  client.release = () => {
    if (released) return;
    released = true;
    originalRelease();
  };

  client.query = (...args) => {
    if (released) {
      throw new Error('Cannot query after client has been released');
    }
    return originalQuery(...args);
  };

  return client;
}

/**
 * Execute a function within a transaction.
 */
async function transaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, getClient, transaction };
