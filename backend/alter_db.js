require('dotenv').config({ path: __dirname + '/.env' });
const { pool } = require('./db/pool');

(async () => {
  try {
    await pool.query('ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS rsi_14_ma DECIMAL(5, 2);');
    await pool.query('ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS rsi_14_bb_upper DECIMAL(5, 2);');
    await pool.query('ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS rsi_14_bb_lower DECIMAL(5, 2);');
    console.log('Successfully altered table.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
