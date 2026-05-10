const SEC_HEADERS = {
    "User-Agent": "ScanNasYork_Project passakorn.study@example.com",
    "Accept-Encoding": "gzip, deflate"
};

async function testSecFacts() {
    // AAPL CIK
    const cik = "0000320193";
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    
    try {
        const response = await fetch(url, { headers: SEC_HEADERS });
        const data = await response.json();
        
        const gaap = data.facts["us-gaap"];
        let maxRevenueKey = "";
        let maxRevenueCount = 0;
        
        for (const key in gaap) {
            if (key.toLowerCase().includes("revenue") || key.toLowerCase().includes("sales")) {
                const count = gaap[key].units?.USD?.length || 0;
                console.log(`Key: ${key}, Count: ${count}`);
                if (count > maxRevenueCount) {
                    maxRevenueCount = count;
                    maxRevenueKey = key;
                }
            }
        }
        console.log(`\nBest Revenue Key: ${maxRevenueKey} (${maxRevenueCount} items)`);
        
    } catch(e) {
        console.error(e);
    }
}
testSecFacts();
