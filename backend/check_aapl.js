require('dotenv').config();
const { IncomeStatement } = require('./models');

async function check() {
  const data = await IncomeStatement.findAll({ 
    where: { symbol: 'AAPL' }, 
    order: [['fiscal_year', 'DESC'], ['fiscal_period', 'DESC']], 
    limit: 20, 
    raw: true 
  });
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

check();
