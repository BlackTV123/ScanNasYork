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
const { Ticker, IncomeStatement } = require('../models');
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

    return Object.values(stmts).map(s => {
        delete s.filed;
        return s;
    });
}

// 3. Fetch Earnings Calendar from FMP (Differential Update)
async function getEarningsToday() {
    const apiKeyStr = process.env.FMP_API_KEY || '';
    const apiKey = apiKeyStr.replace('apikey=', '');
    if (!apiKey) return [];

    const today = new Date().toISOString().split('T')[0];
    const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${today}&to=${today}&apikey=${apiKey}`;
    
    try {
        logger.info(`Checking Earnings Calendar for: ${today}...`);
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

async function runFundamentalWorker() {
  const startTime = Date.now();
  logger.info('=== Yahoo + SEC Hybrid Smart Worker START ===');

  try {
    const [cikMap, earningsToday] = await Promise.all([
        getCikMapping(),
        getEarningsToday()
    ]);
    
    const twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { Op } = require('sequelize');
    const isForce = process.argv.includes('--force');

    const queryOptions = { attributes: ['symbol', 'last_sec_update'], raw: true };
    if (!isForce) {
      queryOptions.where = {
        [Op.or]: [
          { last_fundamental_update: { [Op.lt]: twelveHoursAgo } },
          { last_fundamental_update: null }
        ]
      };
      logger.info('Checkpointing active: Only fetching stocks older than 12h.');
    } else {
      logger.info('FORCE mode: Fetching all stocks regardless of last update.');
    }

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
            
            // Smart Logic: Force SEC update if it's earnings day, otherwise check 7-day cache
            const isEarningsDay = earningsToday.includes(t.symbol);
            const needsSecUpdate = isForce || isEarningsDay || !t.last_sec_update || new Date(t.last_sec_update) < sevenDaysAgo;

            if (cik && needsSecUpdate) {
                try {
                    const secData = await fetchSecIncomeStatements(cik);
                    const currentYear = new Date().getFullYear();
                    const recentData = secData.filter(d => d.fiscal_year >= currentYear - 5);

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
