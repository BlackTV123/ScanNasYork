/** MySQL promise pool for standalone database scripts. */
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  database: process.env.DB_NAME || 'scannas_york',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  charset: 'utf8mb4_unicode_ci',
  connectionLimit: 20,
  connectTimeout: 5000,
  supportBigNumbers: true,
  bigNumberStrings: true,
});

/** Execute SQL with ? placeholders; returns mysql2's [rows, fields]. */
async function query(text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    logger.error('Query failed', { error: err.message });
    throw err;
  }
}

async function getClient() {
  return pool.getConnection();
}

async function transaction(fn) {
  const client = await getClient();
  try {
    await client.beginTransaction();
    const result = await fn(client);
    await client.commit();
    return result;
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, getClient, transaction };
