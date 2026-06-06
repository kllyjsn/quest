"""Market data pipeline — fetches and caches historical + real-time data."""

import asyncio
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf

# Universe definitions
SP500_SECTORS = {
    "XLK": "Technology",
    "XLV": "Health Care",
    "XLF": "Financials",
    "XLY": "Consumer Discretionary",
    "XLP": "Consumer Staples",
    "XLE": "Energy",
    "XLI": "Industrials",
    "XLB": "Materials",
    "XLRE": "Real Estate",
    "XLU": "Utilities",
    "XLC": "Communication Services",
}

SECTOR_ETFS = list(SP500_SECTORS.keys())

# Top liquid stocks across sectors for the universe
UNIVERSE = [
    # Tech
    "AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "TSLA", "AVGO", "AMD", "CRM",
    "ADBE", "NFLX", "ORCL", "INTC", "QCOM",
    # Health Care
    "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "ABT", "DHR", "BMY",
    # Financials
    "JPM", "V", "MA", "BAC", "GS", "MS", "BLK", "AXP", "WFC", "C",
    # Consumer Discretionary
    "HD", "MCD", "NKE", "SBUX", "LOW", "TJX", "BKNG", "CMG",
    # Consumer Staples
    "PG", "KO", "PEP", "COST", "WMT", "PM", "CL", "MDLZ",
    # Energy
    "XOM", "CVX", "COP", "SLB", "EOG", "MPC",
    # Industrials
    "CAT", "GE", "HON", "UNP", "RTX", "DE", "BA", "LMT",
    # Communication
    "GOOG", "DIS", "CMCSA", "T", "VZ", "TMUS",
    # Materials
    "LIN", "APD", "SHW", "ECL",
    # Utilities
    "NEE", "DUK", "SO", "D",
    # Real Estate
    "PLD", "AMT", "CCI", "EQIX",
]

_cache: dict[str, tuple[datetime, pd.DataFrame]] = {}
CACHE_TTL = timedelta(minutes=15)


async def get_historical_data(
    symbols: list[str],
    period: str = "1y",
    interval: str = "1d",
) -> dict[str, pd.DataFrame]:
    """Fetch historical OHLCV data for a list of symbols."""

    async def _fetch(symbol: str) -> tuple[str, pd.DataFrame | None]:
        cache_key = f"{symbol}_{period}_{interval}"
        if cache_key in _cache:
            ts, df = _cache[cache_key]
            if datetime.now() - ts < CACHE_TTL:
                return symbol, df
        try:
            loop = asyncio.get_event_loop()
            ticker = yf.Ticker(symbol)
            df = await loop.run_in_executor(
                None, lambda: ticker.history(period=period, interval=interval)
            )
            if df is not None and not df.empty:
                _cache[cache_key] = (datetime.now(), df)
                return symbol, df
        except Exception:
            pass
        return symbol, None

    tasks = [_fetch(s) for s in symbols]
    results = await asyncio.gather(*tasks)
    return {sym: df for sym, df in results if df is not None}


async def get_quotes(symbols: list[str]) -> dict[str, dict]:
    """Get current quotes for symbols using yfinance."""
    quotes = {}
    loop = asyncio.get_event_loop()
    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            info = await loop.run_in_executor(None, lambda t=ticker: t.fast_info)
            if isinstance(info, dict):
                price = float(info.get("lastPrice", 0))
                prev_close = float(info.get("previousClose", 0))
                mkt_cap = float(info.get("marketCap", 0))
            else:
                price = float(getattr(info, "last_price", 0))
                prev_close = float(getattr(info, "previous_close", 0))
                mkt_cap = float(getattr(info, "market_cap", 0))
            quotes[symbol] = {
                "symbol": symbol,
                "price": price,
                "previous_close": prev_close,
                "market_cap": mkt_cap,
            }
        except Exception:
            pass
    return quotes


def compute_returns(prices: pd.Series, period: int = 1) -> pd.Series:
    """Compute percentage returns over a given period."""
    return prices.pct_change(period).dropna()


def compute_volatility(returns: pd.Series, window: int = 21) -> pd.Series:
    """Annualized rolling volatility."""
    return returns.rolling(window).std() * np.sqrt(252)


def compute_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index."""
    delta = prices.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=period).mean()
    avg_loss = loss.rolling(window=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def compute_bollinger_bands(
    prices: pd.Series, window: int = 20, num_std: float = 2.0
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Bollinger Bands: middle, upper, lower."""
    middle = prices.rolling(window).mean()
    std = prices.rolling(window).std()
    upper = middle + num_std * std
    lower = middle - num_std * std
    return middle, upper, lower


def compute_macd(
    prices: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """MACD line, signal line, histogram."""
    ema_fast = prices.ewm(span=fast).mean()
    ema_slow = prices.ewm(span=slow).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram
