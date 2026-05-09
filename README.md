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

The screener uses a high-performance **Yahoo Finance** scraping engine. It is **100% free** and requires no API keys for technical or fundamental updates.

### Run Full Update (Recommended)
This runs technical analysis followed by fundamental updates for all stocks.
```bash
npm run update:all
```

### Optimized Performance
- **Smart Batching:** Processes stocks in batches of 10 with a 1-second breather.
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
| GET | `/api/v1/stocks/:symbol` | Stock detail & indicators |
| GET | `/api/v1/stocks/:symbol/history` | Price history (Daily) |
| GET | `/api/health` | Health check |

## Tech Stack
- **Backend:** Node.js, Sequelize ORM, PostgreSQL
- **Frontend:** Vanilla HTML/CSS/JS, Chart.js
- **Data:** Yahoo Finance (Technical/Fundamental), Polygon.io (Reference)
