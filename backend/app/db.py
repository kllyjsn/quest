"""SQLite persistence layer for trades, signals, portfolio snapshots, and backtest results."""

import os
from pathlib import Path

import aiosqlite

DB_PATH = os.getenv("QUANT_EDGE_DB", str(Path(__file__).parent.parent / "data" / "quant_edge.db"))


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db


async def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    db = await aiosqlite.connect(DB_PATH)
    await db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            created_at TEXT NOT NULL,
            alpaca_api_key TEXT,
            alpaca_secret_key TEXT,
            robinhood_token TEXT
        );

        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 0,
            timestamp TEXT NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            order_type TEXT NOT NULL,
            broker TEXT NOT NULL DEFAULT 'alpaca',
            strategy TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            pnl REAL,
            notes TEXT,
            is_paper INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            symbol TEXT NOT NULL,
            strategy TEXT NOT NULL,
            signal_type TEXT NOT NULL,
            strength REAL NOT NULL,
            metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS portfolio_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 0,
            timestamp TEXT NOT NULL,
            total_value REAL NOT NULL,
            cash REAL NOT NULL,
            positions TEXT NOT NULL,
            drawdown REAL NOT NULL DEFAULT 0,
            regime TEXT,
            is_paper INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS paper_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 0,
            started_at TEXT NOT NULL,
            initial_capital REAL NOT NULL DEFAULT 1000.0,
            current_cash REAL NOT NULL DEFAULT 1000.0,
            positions_json TEXT NOT NULL DEFAULT '{}',
            peak_value REAL NOT NULL DEFAULT 1000.0,
            trade_log_json TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            ended_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS backtest_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 0,
            timestamp TEXT NOT NULL,
            strategy TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            initial_capital REAL NOT NULL,
            final_value REAL NOT NULL,
            total_return REAL NOT NULL,
            annual_return REAL NOT NULL,
            sharpe_ratio REAL,
            sortino_ratio REAL,
            max_drawdown REAL,
            win_rate REAL,
            total_trades INTEGER,
            equity_curve TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS risk_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            event_type TEXT NOT NULL,
            description TEXT NOT NULL,
            severity TEXT NOT NULL,
            action_taken TEXT
        );
        """
    )
    await db.commit()
    await db.close()
