const router = require('express').Router();
const YahooFinance = require('yahoo-finance2').default;
const { INSTRUMENTS, createForexService } = require('../../services/markets/market-data');
const logger = require('../../utils/logger');
const service = createForexService({ yahoo: new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] }) });
const macro = require('../../services/markets/macro-data').createMacroService();
const economics = require('../../services/markets/country-economics').createCountryEconomics({
  store: require('../../services/markets/economic-store'),
  onError: error => logger.warn('Country economics refresh/storage unavailable', { error: error.message }),
});
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/instruments', (req, res) => res.json({ success: true, data: INSTRUMENTS }));
router.get('/macro', async (req, res) => {
  try { res.json(await macro.get()); }
  catch (error) { logger.warn('Macro data unavailable', { error: error.message }); res.status(502).json({ success: false, error: 'Economic data unavailable' }); }
});
router.get('/:instrument/economics', async (req, res) => {
  try { res.json(await economics.get(req.params.instrument)); }
  catch (error) { res.status(error.status || 502).json({ success: false, error: error.status === 400 ? error.message : 'Country economics unavailable' }); }
});
router.get('/:instrument/chart', async (req, res) => {
  try {
    if (Object.hasOwn(req.query, 'range')) return res.status(400).json({ success: false, error: 'Use timeframe instead of range (5m, 15m, 30m, 1h, 4h, 1d, 1wk).' });
    res.json(await service.get(req.params.instrument, req.query.timeframe ?? '1h'));
  }
  catch (error) { logger.warn('Forex chart unavailable', { error: error.message }); res.status(error.status || 502).json({ success: false, error: error.status === 400 ? error.message : 'Market data unavailable. Please try again.' }); }
});
module.exports = router;
