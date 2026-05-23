require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
const { Ticker } = require('./models');
const logger = require('./utils/logger');
const { Op } = require('sequelize');

function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

async function runPatch() {
    logger.info('=== Starting Fast Patch: Description ===');
    try {
        // Fetch tickers that don't have a description yet
        const tickers = await Ticker.findAll({ 
            attributes: ['symbol'], 
            where: { description: null },
            raw: true 
        });
        logger.info(`Found ${tickers.length} tickers needing descriptions.`);
        
        const batches = chunkArray(tickers, 20);
        let processed = 0;

        for (const batch of batches) {
            await Promise.all(batch.map(async (t) => {
                try {
                    const summary = await yf.quoteSummary(t.symbol, { modules: ['assetProfile'] }).catch(() => null);
                    if (summary && summary.assetProfile) {
                        const businessDesc = summary.assetProfile.longBusinessSummary || null;
                        
                        if (businessDesc !== null) {
                            await Ticker.update(
                                { description: businessDesc },
                                { where: { symbol: t.symbol } }
                            );
                        }
                    }
                } catch (e) {
                    // ignore errors
                }
            }));
            processed += batch.length;
            if (processed % 200 === 0) {
                logger.info(`Patch progress: ${processed}/${tickers.length} completed.`);
            }
        }
        logger.info('=== Fast Patch COMPLETE! ===');
    } catch (e) {
        logger.error(e);
    }
    process.exit(0);
}

runPatch();
