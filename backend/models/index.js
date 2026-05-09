/**
 * Model Index — Associations & Exports
 */

const sequelize = require('../db/sequelize');
const Ticker = require('./Ticker');
const DailyMetric = require('./DailyMetric');
const IncomeStatement = require('./IncomeStatement');

// Associations
Ticker.hasMany(DailyMetric, { foreignKey: 'symbol', sourceKey: 'symbol', as: 'metrics' });
DailyMetric.belongsTo(Ticker, { foreignKey: 'symbol', targetKey: 'symbol', as: 'ticker' });

Ticker.hasMany(IncomeStatement, { foreignKey: 'symbol', sourceKey: 'symbol', as: 'income_statements' });
IncomeStatement.belongsTo(Ticker, { foreignKey: 'symbol', targetKey: 'symbol', as: 'ticker' });

module.exports = { sequelize, Ticker, DailyMetric, IncomeStatement };
