require('dotenv').config({ path: __dirname + '/.env' });
const { pool } = require('./db/pool');

(async () => {
  try {
    console.log('Migrating RSI/MACD data to tickers table...');
    const sql = `
      UPDATE tickers t 
      SET rsi_14 = m.rsi_14, 
          macd = m.macd 
      FROM (
        SELECT DISTINCT ON (symbol) symbol, rsi_14, macd 
        FROM daily_metrics 
        ORDER BY symbol, date DESC
      ) m 
      WHERE t.symbol = m.symbol
    `;
    const res = await pool.query(sql);
    console.log(`Successfully updated ${res.rowCount} stocks with technical data.`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
