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

// SEC Headers Configuration
const SEC_HEADERS = {
    "User-Agent": "ScanNasYork_Project passakorn.study@example.com",
    "Accept-Encoding": "gzip, deflate"
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// 1. Fetch Ticker to CIK mapping from SEC
async function getCikMapping() {
    logger.info("Loading SEC CIK mapping...");
    const response = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: SEC_HEADERS });
    if (!response.ok) throw new Error("Failed to fetch CIK mapping");
    const data = await response.json();

    const tickerToCik = {};
    for (let key in data) {
        const company = data[key];
        const paddedCik = String(company.cik_str).padStart(10, '0');
        tickerToCik[company.ticker] = paddedCik;
    }
    return tickerToCik;
}

// 2. Fetch Income Statements from SEC EDGAR
async function fetchSecIncomeStatements(cik) {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const res = await fetch(url, { headers: SEC_HEADERS });
    if (!res.ok) throw new Error(`SEC API Error: ${res.status}`);
    const data = await res.json();

    const gaap = data.facts["us-gaap"];
    if (!gaap) return [];

    // Find best revenue concept
    const revKeys = ["Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax"];
    let revKey = revKeys.find(k => gaap[k]) || Object.keys(gaap).find(k => k.toLowerCase().includes("revenue"));

    const revenues = gaap[revKey]?.units?.USD || [];
    const netIncomes = gaap.NetIncomeLoss?.units?.USD || [];
    const epsData = (gaap.EarningsPerShareDiluted || gaap.EarningsPerShareBasic)?.units?.USD || gaap.EarningsPerShareDiluted?.units?.USDPerShare || gaap.EarningsPerShareBasic?.units?.USDPerShare || [];

    const stmts = {};

    const addFact = (arr, field) => {
        if (!arr) return;
        for (const item of arr) {
            if (!item.fy || !item.fp) continue;

            if (!item.start || !item.end) continue;
            const days = (new Date(item.end) - new Date(item.start)) / (1000 * 60 * 60 * 24);

            if (item.fp.startsWith('Q') && (days < 80 || days > 100)) continue;
            if (item.fp === 'FY' && (days < 350 || days > 380)) continue;

            const key = `${item.fy}-${item.fp}`;
            if (!stmts[key]) {
                stmts[key] = { fiscal_year: item.fy, fiscal_period: item.fp, report_date: item.end };
            }

            if (!stmts[key][field] || item.filed > (stmts[key].filed || '')) {
                stmts[key][field] = item.val;
                stmts[key].filed = item.filed;
                stmts[key].report_date = item.end;
            }
        }
    };

    addFact(revenues, 'revenue');
    addFact(netIncomes, 'net_income');
    addFact(epsData, 'eps');

    // 4. Auto-Calculate Q4 (Since SEC 10-K merges Q4 into FY)
    const years = [...new Set(Object.values(stmts).map(s => s.fiscal_year))];
    for (const yr of years) {
        const fy = stmts[`${yr}-FY`];
        const q1 = stmts[`${yr}-Q1`];
        const q2 = stmts[`${yr}-Q2`];
        const q3 = stmts[`${yr}-Q3`];
        const q4Key = `${yr}-Q4`;

        if (fy && q1 && q2 && q3 && !stmts[q4Key]) {
            const calcQ4 = {
                fiscal_year: yr,
                fiscal_period: 'Q4',
                report_date: fy.report_date,
            };
            if (fy.revenue != null && q1.revenue != null && q2.revenue != null && q3.revenue != null) {
                calcQ4.revenue = fy.revenue - q1.revenue - q2.revenue - q3.revenue;
            }
            if (fy.net_income != null && q1.net_income != null && q2.net_income != null && q3.net_income != null) {
                calcQ4.net_income = fy.net_income - q1.net_income - q2.net_income - q3.net_income;
            }
            if (Object.keys(calcQ4).length > 3) stmts[q4Key] = calcQ4;
        }
    }

    return Object.values(stmts).map(s => {
        delete s.filed;
        return s;
    });
}

// 3. Fetch Earnings Calendar from FMP (Recent 30 days)
async function getEarningsRecent() {
    const apiKeyStr = process.env.FMP_API_KEY || '';
    const apiKey = apiKeyStr.replace('apikey=', '');
    if (!apiKey) return [];

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
                        const calcQ4 = {
                            symbol, period_type: 'Quarterly', fiscal_year: parseInt(yr), fiscal_period: 'Q4',
                            report_date: fy.report_date, source_api: 'auto_global_fix'
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
        const [cikMap, earningsRecent] = await Promise.all([
            getCikMapping(),
            getEarningsRecent()
        ]);

        const twelveHoursAgo = new Date();
        twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { Op } = require('sequelize');
        const isForce = process.argv.includes('--force') || process.argv.includes('-f') || process.argv.includes('--full');
        const targetSymbol = process.argv.find(arg => arg.startsWith('--symbol='))?.split('=')[1]?.toUpperCase();

        const queryOptions = { attributes: ['symbol', 'last_sec_update'], raw: true };
        const where = {};

        if (targetSymbol) {
            where.symbol = targetSymbol;
            logger.info(`Targeting specific symbol: ${targetSymbol}`);
        } else if (!isForce) {
            where[Op.or] = [
                { last_fundamental_update: { [Op.lt]: twelveHoursAgo } },
                { last_fundamental_update: null }
            ];
            logger.info('Checkpointing active: Only fetching stocks older than 12h.');
        } else {
            logger.info('FORCE mode: Fetching all stocks regardless of last update.');
        }

        queryOptions.where = where;

        const tickers = await Ticker.findAll(queryOptions);
        const totalTickers = tickers.length;
        logger.info(`Loaded ${totalTickers} tickers to process.`);

        let processed = 0, errors = 0;

        // We'll process in chunks of 20 for Yahoo (High Speed)
        const batches = chunkArray(tickers, 20);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];

            // Step 1: Parallel Yahoo Update (FAST)
            await Promise.all(batch.map(async (t) => {
                try {
                    const [quote, summary] = await Promise.all([
                        yf.quote(t.symbol).catch(() => null),
                        yf.quoteSummary(t.symbol, { modules: ['financialData', 'assetProfile'] }).catch(() => null)
                    ]);

                    if (quote && summary) {
                        const fd = summary.financialData || {};
                        const profile = summary.assetProfile || {};
                        await Ticker.update({
                            sector: profile.sector || null,
                            industry: profile.industry || null,
                            market_cap: quote.marketCap || null,
                            pe_ratio: quote.trailingPE || null,
                            ttm_eps: quote.epsTrailingTwelveMonths || null,
                            ttm_revenue: fd.totalRevenue || null,
                            latest_eps_yoy_growth: fd.earningsGrowth ? (fd.earningsGrowth * 100).toFixed(2) : null,
                            last_fundamental_update: new Date()
                        }, { where: { symbol: t.symbol } });
                    }
                } catch (err) {
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
                const hasRecentEarnings = earningsRecent.includes(t.symbol);
                const needsSecUpdate = isForce || 
                    (hasRecentEarnings && (!t.last_sec_update || new Date(t.last_sec_update) < thirtyDaysAgo)) ||
                    (!t.last_sec_update || new Date(t.last_sec_update) < ninetyDaysAgo);

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
                            });
                        }
                        await Ticker.update({ last_sec_update: new Date() }, { where: { symbol: t.symbol } });
                        logger.debug(`[${processed + 1}/${totalTickers}] ✅ SEC + Yahoo: ${t.symbol} ${isEarningsDay ? '(EARNINGS DAY!)' : ''}`);

                        await sleep(110);
                    } catch (err) {
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

        logger.info(`=== Worker DONE === ${processed} ok, ${errors} errors in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    } catch (err) {
        logger.error('Fundamental worker fatal error', { error: err.message, stack: err.stack });
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
