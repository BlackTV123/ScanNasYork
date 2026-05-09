require('dotenv').config({ path: __dirname + '/.env' });
const { DailyMetric, Ticker } = require('./models');
const { createApiClients } = require('./utils/api-clients');

(async () => {
  try {
    const { polygon, alphaVantage } = createApiClients();
    console.log('Fetching SMCI from APIs...');

    // Get today's market date
    const now = new Date();
    if (now.getDay() === 0) now.setDate(now.getDate() - 2);
    if (now.getDay() === 6) now.setDate(now.getDate() - 1);
    const today = now.toISOString().split('T')[0];

    // Polygon grouped daily
    console.log('Getting Polygon bars for ' + today);
    const bars = await polygon.getGroupedDaily(today);
    const smciBar = bars.find(b => b.T === 'SMCI');

    if (!smciBar) {
      console.log('No polygon bar for SMCI today.');
      process.exit(0);
    }

    // Fetch RSI and MACD
    let rsi = null, macd = null, macd_signal = null, macd_hist = null;
    try {
      const rsiData = await alphaVantage.getRSI('SMCI');
      const latestRsiDate = Object.keys(rsiData)[0];
      rsi = parseFloat(rsiData[latestRsiDate]['RSI']);

      const macdData = await alphaVantage.getMACD('SMCI');
      const latestMacdDate = Object.keys(macdData)[0];
      macd = parseFloat(macdData[latestMacdDate]['MACD']);
      macd_signal = parseFloat(macdData[latestMacdDate]['MACD_Signal']);
      macd_hist = parseFloat(macdData[latestMacdDate]['MACD_Hist']);
    } catch (e) {
      console.log('Alpha Vantage fetch failed:', e.message);
    }

    await DailyMetric.upsert({
      symbol: 'SMCI', date: today,
      open: smciBar.o, high: smciBar.h, low: smciBar.l, close: smciBar.c, volume: smciBar.v,
      rsi_14: rsi,
      macd: macd, macd_signal: macd_signal, macd_histogram: macd_hist
    });

    await Ticker.update(
      { current_price: smciBar.c, price_change_pct: 0, last_technical_update: new Date() },
      { where: { symbol: 'SMCI' } }
    );
    console.log('SMCI updated successfully!');
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
})();
