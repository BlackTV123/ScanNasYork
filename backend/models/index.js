/**
 * Model Index — Associations & Exports
 */

const sequelize = require('../db/sequelize');
const Ticker = require('./Ticker');
const IncomeStatement = require('./IncomeStatement');
const EconomicSeries = require('./EconomicSeries');

// Associations (Active)
Ticker.hasMany(IncomeStatement, { foreignKey: 'symbol', sourceKey: 'symbol', as: 'income_statements' });
IncomeStatement.belongsTo(Ticker, { foreignKey: 'symbol', targetKey: 'symbol', as: 'ticker' });

module.exports = { sequelize, Ticker, IncomeStatement, EconomicSeries };
