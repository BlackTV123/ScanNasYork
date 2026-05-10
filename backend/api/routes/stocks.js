/**
 * Stock Routes
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/stockController');
const { screenQuerySchema, symbolParamSchema, historyQuerySchema } = require('../validators');

// Validation middleware
function validate(schema, source = 'query') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map(d => d.message),
      });
    }
    req[source] = value;
    next();
  };
}

// GET /api/v1/stocks/sectors — must be before :symbol
router.get('/sectors', controller.getSectors);

// GET /api/v1/stocks/screen
router.get('/screen', validate(screenQuerySchema), controller.screenStocks);

// GET /api/v1/stocks/:symbol/history
router.get('/:symbol/history', validate(symbolParamSchema, 'params'), controller.getStockHistory);

// GET /api/v1/stocks/:symbol/financial-chart (Mega Prompt Version)
router.get('/:symbol/financial-chart', validate(symbolParamSchema, 'params'), controller.getFinancialChartData);

// GET /api/v1/stocks/:symbol
router.get('/:symbol', validate(symbolParamSchema, 'params'), controller.getStockDetail);

module.exports = router;
