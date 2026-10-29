const { Op } = require('sequelize');

function workerOptions(args = process.argv) {
  const resume = args.includes('--resume');
  const force = args.some(arg => ['--force', '-f', '--full'].includes(arg));
  if (resume && force) throw new Error('Use --resume or --force/--full, not both.');
  const symbol = args.find(arg => arg.startsWith('--symbol='))?.split('=')[1]?.toUpperCase();
  return { resume, force, symbol };
}

function technicalWhere({ resume, force, symbol }, cutoff) {
  const where = symbol ? { symbol } : {};
  if (resume) where.last_technical_update = null;
  else if (!force && !symbol) where[Op.or] = [
    { last_technical_update: { [Op.lt]: cutoff } }, { last_technical_update: null },
  ];
  return where;
}

function fundamentalWhere({ resume, force, symbol }, cutoff) {
  const where = symbol ? { symbol } : {};
  if (resume) where[Op.or] = [{ last_fundamental_update: null }, { last_sec_update: null }];
  else if (!force && !symbol) where[Op.or] = [
    { last_fundamental_update: { [Op.lt]: cutoff } }, { last_fundamental_update: null },
  ];
  return where;
}

function needsYahoo(ticker, { resume }) {
  return !resume || !ticker.last_fundamental_update;
}

function needsSec(ticker, { resume, force }, isEarningsDay, thirtyDaysAgo, ninetyDaysAgo) {
  if (resume) return !ticker.last_sec_update;
  return force || !ticker.last_sec_update || new Date(ticker.last_sec_update) < ninetyDaysAgo ||
    (isEarningsDay && new Date(ticker.last_sec_update) < thirtyDaysAgo);
}

function resumeCandidates(tickers, cikMap) {
  return tickers.filter(ticker => !ticker.last_fundamental_update ||
    (!ticker.last_sec_update && cikMap[ticker.symbol]));
}

module.exports = { workerOptions, technicalWhere, fundamentalWhere, needsYahoo, needsSec, resumeCandidates };
