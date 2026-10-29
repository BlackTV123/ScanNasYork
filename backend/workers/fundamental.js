/**
 * Fundamental Worker — Yahoo Finance + SEC EDGAR Version
 * 100% Free. No API Keys needed.
 * Fetches market cap, P/E, revenue, EPS from Yahoo.
 * Fetches 5-10 years of Annual and Quarterly Income Statements from SEC EDGAR.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cron = require('node-cron');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
const { Ticker, IncomeStatement, sequelize } = require('../models');
const logger = require('../utils/logger');
const { workerOptions, fundamentalWhere, needsYahoo, needsSec, resumeCandidates } = require('../utils/worker-selection');

const { getCikMapping, fetchSecIncomeStatements } = require('../services/stocks/sec-data');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
    return chunks;
}

// 3. Fetch Earnings Calendar from FMP (Recent 30 days)
async function getEarningsRecent() {
    const apiKeyStr = process.env.FMP_API_KEY || '';
    const apiKey = apiKeyStr.replace(/^apikey=/, '').trim();
    if (!apiKey || apiKey.startsWith('your_')) return [];

    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 30); // Check last 30 days
    const to = new Date(today);
    to.setDate(to.getDate() + 2); // And next 2 days

    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${fromStr}&to=${toStr}&apikey=${apiKey}`;

    try {
        logger.info(`Checking Earnings Calendar (30-day window): ${fromStr} to ${toStr}...`);
        const res = await fetch(url);
        const data = await res.json();
        if (!Array.isArray(data)) return [];

        const symbols = data.filter(i => !i.symbol.includes('.')).map(i => i.symbol);
        logger.info(`Found ${symbols.length} companies reporting earnings today.`);
        return symbols;
    } catch (e) {
        logger.warn(`Failed to fetch earnings calendar: ${e.message}`);
        return [];
    }
}

async function runGlobalQ4Fix() {
    logger.info('=== Starting Global Q4 Consistency Check ===');
    try {
        const { Op } = require('sequelize');
        const symbolsData = await IncomeStatement.findAll({
            attributes: [[sequelize.fn('DISTINCT', sequelize.col('symbol')), 'symbol']],
            raw: true
        });
        const symbols = symbolsData.map(s => s.symbol);
        let createdCount = 0;

        for (let i = 0; i < symbols.length; i += 100) {
            const batch = symbols.slice(i, i + 100);
            const stmts = await IncomeStatement.findAll({ where: { symbol: { [Op.in]: batch } }, raw: true });
            const grouped = {};
            for (const st of stmts) {
                if (!grouped[st.symbol]) grouped[st.symbol] = {};
                if (!grouped[st.symbol][st.fiscal_year]) grouped[st.symbol][st.fiscal_year] = {};
                grouped[st.symbol][st.fiscal_year][st.fiscal_period] = st;
            }
            for (const symbol of batch) {
                const years = grouped[symbol] || {};
                for (const yr in years) {
                    const data = years[yr];
                    if (data.FY && data.Q1 && data.Q2 && data.Q3 && !data.Q4) {
                        const fy = data.FY, q1 = data.Q1, q2 = data.Q2, q3 = data.Q3;
                        if (![q1, q2, q3].every(row => row.currency === fy.currency)) continue;
                        const calcQ4 = {
                            symbol, period_type: 'Quarterly', fiscal_year: parseInt(yr), fiscal_period: 'Q4',
                            report_date: fy.report_date, source_api: 'auto_global_fix', currency: fy.currency
                        };
                        const sub = (f, a, b, c) => (f == null || a == null || b == null || c == null) ? null : (BigInt(f) - BigInt(a) - BigInt(b) - BigInt(c)).toString();
                        calcQ4.revenue = sub(fy.revenue, q1.revenue, q2.revenue, q3.revenue);
                        calcQ4.net_income = sub(fy.net_income, q1.net_income, q2.net_income, q3.net_income);
                        if (calcQ4.revenue || calcQ4.net_income) { await IncomeStatement.upsert(calcQ4); createdCount++; }
                    }
                }
            }
        }
        logger.info(`=== Global Q4 Check Done! Created ${createdCount} missing Q4 records ===`);
    } catch (e) { logger.error(`Global Q4 Fix failed: ${e.message}`); }
}

async function runFundamentalWorker() {
    const startTime = Date.now();
    logger.info('=== Yahoo + SEC Hybrid Smart Worker START ===');

    try {
        const twelveHoursAgo = new Date();
        twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { Op } = require('sequelize');
        const options = workerOptions();
        const isForce = options.force;
        const queryOptions = { attributes: ['symbol', 'last_sec_update', 'last_fundamental_update'], raw: true,
            where: fundamentalWhere(options, twelveHoursAgo) };
        logger.info(options.resume ? 'RESUME mode: Retry missing Yahoo and SEC checkpoints independently.' :
            isForce ? 'FORCE mode: Refreshing selected stocks.' : 'Checkpointing active: Only selected stocks needing an update.');

        const tickers = await Ticker.findAll(queryOptions);
        let totalTickers = tickers.length;
        logger.info(`Loaded ${totalTickers} tickers to process.`);

        if (!totalTickers) {
            if (await Ticker.count() === 0) throw new Error('No ticker symbols in the database. Run npm run db:seed first.');
            logger.info('No matching stocks need an update. Use --force to refresh recent stocks.');
            return;
        }

        const [cikMap, earningsRecent] = await Promise.all([
            getCikMapping(),
            options.resume ? Promise.resolve([]) : getEarningsRecent()
        ]);

        const candidates = options.resume ? resumeCandidates(tickers, cikMap) : tickers;
        if (options.resume) {
            logger.info(`Resume: ${candidates.length} stocks with missing source updates; ${tickers.length - candidates.length} without an applicable SEC mapping skipped.`);
            totalTickers = candidates.length;
            if (!totalTickers) return;
        }
        let processed = 0, errors = 0;

        // We'll process in chunks of 20 for Yahoo (High Speed)
        const batches = chunkArray(candidates, 20);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];

            // Step 1: Parallel Yahoo Update (FAST)
            await Promise.all(batch.map(async (t) => {
                if (!needsYahoo(t, options)) return;
                try {
                    const summary = await yf.quoteSummary(t.symbol, { modules: ['price', 'summaryDetail', 'summaryProfile', 'financialData', 'defaultKeyStatistics', 'assetProfile'] });
                    const priceData = summary.price || {};
                    const profile = summary.summaryProfile || {};
                    const fd = summary.financialData || {};
                    const ks = summary.defaultKeyStatistics || {};
                    const businessDesc = summary.assetProfile?.longBusinessSummary || null;

                    if (priceData && summary) {
                        await Ticker.update({
                            sector: profile.sector || null,
                            industry: profile.industry || null,
                            market_cap: priceData.marketCap || null,
                            pe_ratio: summary.summaryDetail?.trailingPE ?? null,
                            ttm_eps: ks.trailingEps || null,
                            ttm_revenue: fd.totalRevenue || null,
                            latest_eps_yoy_growth: fd.earningsGrowth ? (fd.earningsGrowth * 100).toFixed(2) : null,
                            revenue_yoy_growth: fd.revenueGrowth ? (fd.revenueGrowth * 100).toFixed(2) : null,
                            target_mean_price: fd.targetMeanPrice || null,
                            description: businessDesc,
                            last_fundamental_update: new Date()
                        }, { where: { symbol: t.symbol } });
                    }
                } catch (err) {
                    errors++;
                    logger.warn(`Yahoo fail for ${t.symbol}: ${err.message}`);
                }
            }));

            // Step 2: Sequential SEC Update (Rate Limited)
            for (const t of batch) {
                const cik = cikMap[t.symbol];

                // Smart Logic:
                // 1. Force mode -> TRUE
                // 2. Reported in last 30 days AND we haven't checked SEC in 30 days -> TRUE
                // 3. Haven't checked SEC in 90 days (3 months) -> TRUE
                const isEarningsDay = earningsRecent.includes(t.symbol);
                const needsSecUpdate = needsSec(t, options, isEarningsDay, thirtyDaysAgo, ninetyDaysAgo);

                if (cik && needsSecUpdate) {
                    try {
                        const secData = await fetchSecIncomeStatements(cik);
                        const currentYear = new Date().getFullYear();
                        
                        // Default to 1 (Current + Previous Year) for normal update, 8 years for FULL mode
                        let historyYears = isForce ? 8 : 1;
                        
                        // Allow manual override via --years=N
                        const yearsArg = process.argv.find(arg => arg.startsWith('--years='));
                        if (yearsArg) historyYears = parseInt(yearsArg.split('=')[1]);

                        const recentData = secData.filter(d => d.fiscal_year >= currentYear - historyYears);
                        logger.debug(`[${t.symbol}] Saving ${recentData.length} statements (Since ${currentYear - historyYears})`);

                        for (const stmt of recentData) {
                            await IncomeStatement.upsert({
                                symbol: t.symbol,
                                period_type: stmt.fiscal_period === 'FY' ? 'Annual' : 'Quarterly',
                                fiscal_year: stmt.fiscal_year,
                                fiscal_period: stmt.fiscal_period,
                                revenue: stmt.revenue || null,
                                net_income: stmt.net_income || null,
                                eps: stmt.eps || null,
                                report_date: stmt.report_date,
                                source_api: 'sec_edgar',
                                currency: 'USD',
                            });
                        }

                        // 💡 Calculate Consecutive Revenue Growth Years
                        const annualStmts = await IncomeStatement.findAll({
                            where: { symbol: t.symbol, period_type: 'Annual', revenue: { [Op.not]: null } },
                            order: [['fiscal_year', 'DESC']],
                            raw: true
                        });
                        
                        let streak = 0;
                        for (let j = 0; j < annualStmts.length - 1; j++) {
                            if (annualStmts[j].currency === annualStmts[j+1].currency && BigInt(annualStmts[j].revenue) > BigInt(annualStmts[j+1].revenue)) {
                                streak++;
                            } else {
                                break;
                            }
                        }

                        await Ticker.update({ last_sec_update: new Date(), revenue_consecutive_years: streak }, { where: { symbol: t.symbol } });
                        logger.debug(`[${processed + 1}/${totalTickers}] ✅ SEC + Yahoo: ${t.symbol} ${isEarningsDay ? '(EARNINGS DAY!)' : ''} - Streak: ${streak}`);

                        await sleep(110);
                    } catch (err) {
                        errors++;
                        logger.warn(`SEC fail for ${t.symbol}: ${err.message}`);
                    }
                } else {
                    logger.debug(`[${processed + 1}/${totalTickers}] ⚡ Yahoo Only (SEC Cached): ${t.symbol}`);
                }
                processed++;
            }

            logger.info(`Progress: ${processed}/${totalTickers} tickers completed.`);
        }

        // AUTO-CALCULATE Q4 FOR ENTIRE DB AT THE END
        await runGlobalQ4Fix();

        logger.info(`=== Worker DONE === ${processed} stocks checked, ${errors} source errors in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        if (errors) throw new Error(`Fundamental update incomplete: ${errors} source errors. Run with --resume to retry missing updates.`);
    } catch (err) {
        logger.error('Fundamental worker fatal error', { error: err.message });
        throw err;
    }
}

if (require.main === module) {
    if (process.argv.includes('--cron')) {
        const schedule = process.env.FUNDAMENTAL_WORKER_CRON || '0 20 * * 1-5';
        logger.info(`Yahoo+SEC worker scheduled: ${schedule}`);
        cron.schedule(schedule, runFundamentalWorker, { timezone: 'America/New_York' });
    } else {
        runFundamentalWorker().then(() => process.exit(0)).catch(() => process.exit(1));
    }
}

module.exports = { runFundamentalWorker };
