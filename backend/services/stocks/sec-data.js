/** Shared SEC client: queued requests and cached public symbol-to-CIK mapping. */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createSecClient({ fetchFn = fetch, now = Date.now, pause = sleep } = {}) {
  let queue = Promise.resolve();
  let lastStart = null;
  let mapping = null;
  let mappingTime = 0;
  let pendingMapping;
  function request(url) {
    const task = queue.then(async () => {
      if (lastStart !== null) await pause(Math.max(0, 150 - (now() - lastStart)));
      lastStart = now();
      const response = await fetchFn(url, {
        headers: { 'User-Agent': process.env.SEC_USER_AGENT || 'ScanNasYork_Project passakorn.study@example.com', 'Accept-Encoding': 'gzip, deflate' },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`SEC API Error: ${response.status}`);
      return response.json();
    });
    queue = task.catch(() => {});
    return task;
  }
  return {
    async getCikMapping() {
      if (mapping && now() - mappingTime < 86400000) return mapping;
      if (pendingMapping) return pendingMapping;
      pendingMapping = request('https://www.sec.gov/files/company_tickers.json').then(data => {
        const rows = Object.values(data);
        if (!rows.length || !rows.every(row => row.ticker && row.cik_str)) throw new Error('Invalid SEC CIK mapping');
        mapping = Object.fromEntries(rows.map(row => [row.ticker.replace(/\./g, '-'), String(row.cik_str).padStart(10, '0')]));
        mappingTime = now();
        return mapping;
      }).finally(() => { pendingMapping = null; });
      return pendingMapping;
    },
    async fetchSecIncomeStatements(cik) {
      if (!/^\d{10}$/.test(cik)) throw new Error('Invalid SEC CIK');
      return parseSecFacts(await request(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`));
    },
  };
}

function parseSecFacts(data) {
    const gaap = data.facts?.["us-gaap"];
    if (!gaap) return [];

    // Find all possible revenue concept keys
    const revKeys = ["Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueGoodsNet", "RevenuesNetOfInterestExpense"];
    
    // Get the units helper
    const getUnits = (concept) => {
        if (!concept || !concept.units) return null;
        const u = concept.units.USD || concept.units.USDPerShare || concept.units["USD/shares"];
        return (u && u.length > 0) ? u : null;
    };

    // 1. First Pass: Detect Fiscal Year End Month (needed for accurate period mapping)
    let fyEndMonth = 12; // Default
    const fyReports = getUnits(gaap.Revenues || gaap.SalesRevenueNet)?.filter(d => d.fp === 'FY') || [];
    if (fyReports.length > 0) {
        // Take the latest FY report to see which month it ends in
        const latestFY = fyReports.sort((a, b) => b.fy - a.fy)[0];
        fyEndMonth = new Date(latestFY.end).getMonth() + 1; // 1-12
    }

    const stmts = {};
    const addFact = (arr, field) => {
        if (!arr) return;
        for (const item of arr) {
            if (!item.fp) continue;
            const endDate = new Date(item.end);
            if (isNaN(endDate)) continue;

            const days = (endDate - new Date(item.start)) / (1000 * 60 * 60 * 24);
            
            // Calculate fiscal year based on end date and detected FY end month.
            // (Ignoring SEC 'fy' field because it can be misleading for restatements)
            let fiscalYear = endDate.getFullYear();
            if (endDate.getMonth() + 1 > fyEndMonth) {
                fiscalYear += 1;
            }
            
            let period = item.fp;
            if (days > 80 && days < 105) period = item.fp.startsWith('Q') ? item.fp : 'Q4';
            else if (days > 350 && days < 380) period = 'FY';
            else continue;

            const key = `${fiscalYear}-${period}`;
            if (!stmts[key]) {
                stmts[key] = { fiscal_year: fiscalYear, fiscal_period: period, report_date: item.end };
            }

            const isLatest = !stmts[key].filed || item.filed > stmts[key].filed;
            const hasFrame = !!item.frame;
            const isNewField = !stmts[key][field];

            if (item.val !== null && (isNewField || (hasFrame && isLatest) || isLatest)) {
                stmts[key][field] = item.val;
                if (hasFrame || isLatest) stmts[key].filed = item.filed;
                stmts[key].report_date = item.end;
            }
        }
    };

    // 1. Merge all potential Revenue tags
    for (const k of revKeys) {
        addFact(getUnits(gaap[k]), 'revenue');
    }
    // Fallback for revenue if none of the above found
    if (Object.values(stmts).every(s => s.revenue == null)) {
        const fallbackKey = Object.keys(gaap).find(k => k.toLowerCase().includes("revenue") && gaap[k].units);
        if (fallbackKey) addFact(getUnits(gaap[fallbackKey]), 'revenue');
    }

    // 2. Add Net Income and EPS
    addFact(getUnits(gaap.NetIncomeLoss), 'net_income');
    addFact(getUnits(gaap.EarningsPerShareDiluted) || getUnits(gaap.EarningsPerShareBasic), 'eps');


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


const client = createSecClient();
module.exports = { ...client, createSecClient, parseSecFacts };
