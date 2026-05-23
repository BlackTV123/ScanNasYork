/**
 * Model Index — Associations & Exports
 *
 * NOTE: DailyMetric is SOFT DEPRECATED.
 * It is still exported for migration scripts but no longer has
 * active associations with Ticker. Workers no longer write to it.
 */

const sequelize = require('../db/sequelize');
const Ticker = require('./Ticker');
const DailyMetric = require('./DailyMetric');  // Kept for migration only
const IncomeStatement = require('./IncomeStatement');

// Associations (Active)
Ticker.hasMany(IncomeStatement, { foreignKey: 'symbol', sourceKey: 'symbol', as: 'income_statements' });
IncomeStatement.belongsTo(Ticker, { foreignKey: 'symbol', targetKey: 'symbol', as: 'ticker' });

// DailyMetric associations REMOVED — data now lives in Tickers directly

module.exports = { sequelize, Ticker, DailyMetric, IncomeStatement };
