require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await c.connect();

  // Check what years/periods exist
  const r1 = await c.query(`
    SELECT period_type, fiscal_year, COUNT(*) as cnt 
    FROM income_statements 
    GROUP BY period_type, fiscal_year 
    ORDER BY period_type, fiscal_year DESC
  `);
  console.log('=== Income Statements by period_type & year ===');
  console.table(r1.rows);

  // Check a specific symbol like AAPL
  const r2 = await c.query(`
    SELECT period_type, fiscal_year, fiscal_period, revenue, eps, net_income, report_date
    FROM income_statements 
    WHERE symbol = 'AAPL'
    ORDER BY period_type DESC, fiscal_year DESC, fiscal_period DESC
  `);
  console.log('\n=== AAPL Income Statements ===');
  console.table(r2.rows);

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
