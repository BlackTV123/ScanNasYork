# ScanNasYork — Quantamental Stock Screener

A high-performance, web-based stock screener capable of analyzing 6,000+ equities across NYSE and NASDAQ using both technical (RSI, MACD, SMA) and fundamental (EPS, Revenue, P/E) metrics.

## Quick Start

### Prerequisites
- Node.js 18+ LTS
- PostgreSQL 13+
- API Keys: [Polygon.io](https://polygon.io), [Financial Modeling Prep](https://financialmodelingprep.com)

### 1. Setup Environment
```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials and API keys
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

### 4. Seed Data
```bash
# Option A: Seed with demo data (no API keys needed)
npm run db:seed -- --demo

# Option B: Seed from Polygon.io API (requires API key)
npm run db:seed
```

### 5. Start the Server
```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

### 6. Run Workers (Production)
```bash
# Daily technical data (5 PM EST)
npm run worker:technical -- --cron

# Fundamental data (8 PM EST)
npm run worker:fundamental -- --cron
```

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
| GET | `/api/v1/stocks/sectors` | Available sectors |
| GET | `/api/v1/stocks/:symbol` | Stock detail |
| GET | `/api/v1/stocks/:symbol/history` | Price history |
| GET | `/api/health` | Health check |

## Tech Stack
- **Backend:** Node.js, Express, PostgreSQL, Winston, Joi
- **Frontend:** Vanilla HTML/CSS/JS, Chart.js
- **Data:** Polygon.io, Financial Modeling Prep, Alpha Vantage (backup)
