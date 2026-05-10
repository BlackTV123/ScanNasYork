const fs = require('fs');
const SEC_HEADERS = {
    "User-Agent": "ScanNasYork_Project passakorn.study@example.com",
    "Accept-Encoding": "gzip, deflate"
};

async function fetchSecData(cik) {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const res = await fetch(url, { headers: SEC_HEADERS });
    if (!res.ok) throw new Error(`SEC API Error: ${res.status}`);
    const data = await res.json();
    const gaap = data.facts["us-gaap"];
    if (!gaap) return [];

    // Find best revenue key
    const revKeys = ["Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax"];
    let revKey = revKeys.find(k => gaap[k]) || Object.keys(gaap).find(k => k.toLowerCase().includes("revenue"));
    
    const revenues = gaap[revKey]?.units?.USD || [];
    const netIncomes = gaap.NetIncomeLoss?.units?.USD || [];
    const epsData = (gaap.EarningsPerShareDiluted || gaap.EarningsPerShareBasic)?.units?.USD || gaap.EarningsPerShareDiluted?.units?.USDPerShare || gaap.EarningsPerShareBasic?.units?.USDPerShare || [];

    // Group by FY and FP
    const stmts = {}; // key: "2023-Q1" or "2023-FY"

    const addFact = (arr, field) => {
        if (!arr) return;
        for (const item of arr) {
            if (!item.fy || !item.fp) continue;
            
            // Calculate duration in days
            if (!item.start || !item.end) continue;
            const days = (new Date(item.end) - new Date(item.start)) / (1000 * 60 * 60 * 24);
            
            // For quarters, duration must be ~90 days (allow 80-100)
            if (item.fp.startsWith('Q') && (days < 80 || days > 100)) continue;
            // For annual, duration must be ~365 days (allow 350-380)
            if (item.fp === 'FY' && (days < 350 || days > 380)) continue;

            const key = `${item.fy}-${item.fp}`;
            if (!stmts[key]) {
                stmts[key] = { fiscal_year: item.fy, fiscal_period: item.fp, report_date: item.end };
            }
            
            // Prefer the latest filed report for the same period
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

    const results = Object.values(stmts).map(s => {
        delete s.filed;
        return s;
    });

    return results;
}

async function test() {
    const data = await fetchSecData("0000320193"); // AAPL
    console.log(data.filter(d => d.fiscal_year >= 2023));
}
test();
