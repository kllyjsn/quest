# Quant Edge — Systematic Quantitative Trading Engine

A production-grade quantitative trading system with multi-factor signal generation, regime-adaptive strategies, institutional risk management, and dual-broker execution via Alpaca (primary) and Robinhood MCP (secondary).

## Architecture

```
Frontend (React + TypeScript + Tailwind + Recharts)
  ↕ REST API
Backend (FastAPI + Python)
  ├── Strategy Engine (momentum, mean-reversion, sector rotation, multi-factor)
  ├── Risk Management (position limits, drawdown stops, PDT compliance, Kelly sizing)
  ├── Portfolio Constructor (correlation-aware, sector-capped)
  ├── Backtest Engine (walk-forward, Monte Carlo)
  ├── Market Data Pipeline (yfinance, real-time quotes)
  └── Broker Integrations (Alpaca MCP primary, Robinhood MCP secondary)
```

## Quick Start

### Backend
```bash
cd backend
pip install -e .
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Strategies

| Strategy | Description | Regime |
|----------|-------------|--------|
| Multi-Factor Ranking | Composite z-score across momentum, quality, value, volatility | All |
| Momentum | 6-month price return, skip last month (Jegadeesh-Titman) | Bull |
| Mean Reversion | RSI + Bollinger Band oversold signals on quality stocks | Sideways/Bear |
| Sector Rotation | Relative strength ranking of 11 GICS sectors | All |
| Earnings Catalyst | Pre/post earnings drift capture | Event-driven |

## Risk Controls

- Max single position: 25% of portfolio
- Max sector exposure: 40%
- Max drawdown trigger: -15% → reduce to 50% cash
- Ruin stop: -25% → full liquidation + notification
- PDT compliance: 3 day trades / 5 business days tracked
- Trailing stop-loss: -8% per position
- Partial take-profit: +20% → sell 50%
- Min cash reserve: 5%

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide React
- **Backend**: Python 3.11+, FastAPI, pandas, numpy, scipy, yfinance
- **Data**: SQLite
- **Brokers**: Alpaca Trading API, Robinhood Agentic MCP
