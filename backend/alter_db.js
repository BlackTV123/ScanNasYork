require('dotenv').config({ path: __dirname + '/.env' });
const { pool } = require('./db/pool');

(async () => {
  try {
    await pool.query('ALTER TABLE tickers ADD COLUMN IF NOT EXISTS rsi_14 DECIMAL(10, 2);');
    await pool.query('ALTER TABLE tickers ADD COLUMN IF NOT EXISTS macd DECIMAL(10, 4);');
    console.log('Successfully altered tables.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
