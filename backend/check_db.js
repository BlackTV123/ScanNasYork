require('dotenv').config();
const { Ticker, DailyMetric, IncomeStatement, sequelize } = require('./models');
const { Op } = require('sequelize');

async function check() {
  const twelveHoursAgo = new Date();
  twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

  const total = await Ticker.count();
  
  // 1. Ticker Basic Data
  const missingPrice = await Ticker.count({ where: { current_price: null } });
  const missingMarketCap = await Ticker.count({ where: { market_cap: null } });
  const missingSector = await Ticker.count({ where: { sector: null } });

  // 2. Technical Data (DailyMetrics)
  const tickersWithMetrics = await DailyMetric.findAll({
    attributes: [ [sequelize.fn('DISTINCT', sequelize.col('symbol')), 'symbol'] ],
    raw: true
  });
  const symbolsWithMetrics = new Set(tickersWithMetrics.map(m => m.symbol));
  const missingAllMetrics = total - symbolsWithMetrics.size;

  // 3. Fundamental Data (IncomeStatements)
  const tickersWithIncome = await IncomeStatement.findAll({
    attributes: [ [sequelize.fn('DISTINCT', sequelize.col('symbol')), 'symbol'] ],
    raw: true
  });
  const symbolsWithIncome = new Set(tickersWithIncome.map(i => i.symbol));
  const missingAllIncome = total - symbolsWithIncome.size;

  console.log('======================================');
  console.log('📊 DATABASE COMPLETENESS REPORT 📊');
  console.log('======================================');
  console.log(`Total Tickers in DB: ${total}`);
  console.log('--------------------------------------');
  console.log('Ticker Metadata:');
  console.log(`- Missing Current Price: ${missingPrice} (${((missingPrice/total)*100).toFixed(1)}%)`);
  console.log(`- Missing Market Cap:    ${missingMarketCap} (${((missingMarketCap/total)*100).toFixed(1)}%)`);
  console.log(`- Missing Sector/Ind:   ${missingSector} (${((missingSector/total)*100).toFixed(1)}%)`);
  console.log('--------------------------------------');
  console.log('Data Coverage:');
  console.log(`- Tickers with NO Technical Data (History):  ${missingAllMetrics}`);
  console.log(`- Tickers with NO Fundamental Data (Income): ${missingAllIncome}`);
  console.log('--------------------------------------');
  
  const needingTech = await Ticker.count({
    where: { [Op.or]: [{ last_technical_update: { [Op.lt]: twelveHoursAgo } }, { last_technical_update: null }, { current_price: null }] }
  });
  const needingFund = await Ticker.count({
    where: { [Op.or]: [{ last_fundamental_update: { [Op.lt]: twelveHoursAgo } }, { last_fundamental_update: null }, { market_cap: null }] }
  });

  console.log('Current Worker Status:');
  console.log(`- Tickers pending technical update: ${needingTech}`);
  console.log(`- Tickers pending fundamental update: ${needingFund}`);
  console.log('======================================');

  process.exit(0);
}

check();
