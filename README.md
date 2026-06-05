# ScanNasYork — Quantamental Stock Screener

A high-performance, web-based stock screener designed for Nasdaq-listed equities. Analyzes 5,000+ symbols using both technical (RSI, MACD) and fundamental (EPS, Revenue, P/E, Sector) metrics.

## Quick Start

### Prerequisites
- Node.js 18+ LTS
- PostgreSQL 13+
- (Optional) Polygon.io API Key for initial symbol discovery

### 1. Setup Environment
```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials
```

### 2. Install Dependencies
```bash
cd backend
npm install
```

### 3. Initialize Database
```bash
# Create the database first in PostgreSQL:
# CREATE DATABASE scannas_york;
npm run db:init
```

### 4. Seed Data (Nasdaq Symbols)
```bash
# Seed symbols from Polygon.io API (requires API key)
# This will fetch all Nasdaq (XNAS) tickers
npm run db:seed
```

### 5. Start the Server
```bash
npm run dev
```
Open **http://localhost:3000** in your browser.

---

## 🚀 Data Processing (Workers)

The screener uses a hybrid high-performance scraping engine that is **100% free** and requires no paid API keys for updates:

1. **Yahoo Finance:** Used for daily technical data, market cap, P/E ratios, and current EPS.
2. **SEC EDGAR API:** Used for deep historical fundamental data (5-10 years of Revenue, Net Income, and EPS).

### SEC EDGAR API Integration
To comply with strict US Securities and Exchange Commission (SEC) regulations, the fundamental worker implements:
- **User-Agent Compliance:** Custom headers (`ScanNasYork_Project [email]`) to prevent IP bans.
- **CIK Mapping:** Translates standard tickers (AAPL) into SEC 10-digit Central Index Keys (0000320193).
- **Strict Rate Limiting:** Enforces a sleep timer of 150ms between requests to stay well below the maximum 10 requests/second limit.
- **Smart Filtering:** Parses complex `companyfacts` JSON to differentiate between 3-month quarterly periods and 12-month annual periods.

### Run Full Update (Recommended)
This runs technical analysis followed by fundamental updates for all stocks.
```bash
npm run update:all
```

### Optimized Performance
- **Smart Batching:** Processes stocks in batches of 5 (Fundamentals) or 10 (Technicals) with breather delays to respect API limits.
- **Checkpointing:** Automatically skips stocks updated in the last 12 hours to save resources.
- **Force Update:** Bypass checkpoints and refresh everything immediately:
  ```bash
  npm run update:all -- --force
  ```

### Individual Workers
```bash
# Run once
npm run worker:technical
npm run worker:fundamental

# Run on schedule (Cron)
npm run worker:technical -- --cron
npm run worker:fundamental -- --cron
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│         Frontend (Vanilla JS)           │
│   Screener Page  │  Stock Detail Page   │
└────────────────┬────────────────────────┘
                 │ REST API
┌────────────────┴────────────────────────┐
│         Express.js API Server           │
│  Dynamic SQL Query Builder + Caching    │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│         PostgreSQL Database             │
│  Tickers │ Daily_Metrics │ Income_Stmts │
└─────────────────────────────────────────┘
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/stocks/screen` | Multi-criteria screening |
| GET | `/api/v1/stocks/sectors` | Available sectors list |
| GET | `/api/v1/stocks/:symbol` | Stock detail (pre-computed indicators) |
| GET | `/api/v1/stocks/:symbol/chart` | On-demand candlestick price history (1d/5d/1w/1m/3m/6m) |
| GET | `/api/v1/stocks/:symbol/forecast` | On-demand analyst target & EPS/revenue projections |
| GET | `/api/v1/stocks/:symbol/financial-chart` | Chronological Revenue/EPS historical charts data |
| GET | `/api/health` | Health check |

## Tech Stack
- **Backend:** Node.js, Express, Sequelize ORM, PostgreSQL
- **Frontend:** Vanilla HTML/CSS/JS, TradingView Lightweight Charts (v4)
- **Data:** Yahoo Finance (Technical/Fundamental), SEC EDGAR (Historical Fundamentals), Polygon.io (Reference)

---

## Detailed Requirements
For complete System Overview, Functional Requirements (FR), and Non-Functional Requirements (NFR) specifications, refer to [system_requirements.md](file:///d:/ScanNasYork/ScanNasYork/system_requirements.md).
