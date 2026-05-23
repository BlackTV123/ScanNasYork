require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Ticker, IncomeStatement, sequelize } = require('./models');
const { Op } = require('sequelize');
const logger = require('./utils/logger');

async function runPatch() {
    logger.info('=== Starting Fast Patch: Consecutive Rev Growth Years ===');
    try {
        const tickers = await Ticker.findAll({ attributes: ['symbol'], raw: true });
        logger.info(`Found ${tickers.length} tickers to calculate streak for.`);
        
        let processed = 0;
        
        // We can do this in parallel chunks of 50
        const chunkSize = 50;
        for (let i = 0; i < tickers.length; i += chunkSize) {
            const batch = tickers.slice(i, i + chunkSize);
            await Promise.all(batch.map(async (t) => {
                const annualStmts = await IncomeStatement.findAll({
                    where: { symbol: t.symbol, period_type: 'Annual', revenue: { [Op.not]: null } },
                    order: [['fiscal_year', 'DESC']],
                    raw: true
                });
                
                let streak = 0;
                for (let j = 0; j < annualStmts.length - 1; j++) {
                    if (BigInt(annualStmts[j].revenue) > BigInt(annualStmts[j+1].revenue)) {
                        streak++;
                    } else {
                        break;
                    }
                }
                
                if (streak > 0) {
                    await Ticker.update(
                        { revenue_consecutive_years: streak },
                        { where: { symbol: t.symbol } }
                    );
                }
            }));
            
            processed += batch.length;
            if (processed % 500 === 0) {
                logger.info(`Patch progress: ${processed}/${tickers.length} completed.`);
            }
        }
        
        logger.info('=== Streak Patch COMPLETE! ===');
    } catch (e) {
        logger.error(e);
    }
    process.exit(0);
}

runPatch();
