"""Portfolio construction — correlation-aware, sector-capped allocation."""



from app.engine.risk import RiskManager

# Sector mapping for the universe
SECTOR_MAP = {
    "AAPL": "Technology", "MSFT": "Technology", "NVDA": "Technology", "GOOGL": "Technology",
    "GOOG": "Technology", "META": "Technology", "AMZN": "Consumer Discretionary", "TSLA": "Technology",
    "AVGO": "Technology", "AMD": "Technology", "CRM": "Technology", "ADBE": "Technology",
    "NFLX": "Communication Services", "ORCL": "Technology", "INTC": "Technology", "QCOM": "Technology",
    "UNH": "Health Care", "JNJ": "Health Care", "LLY": "Health Care", "PFE": "Health Care",
    "ABBV": "Health Care", "MRK": "Health Care", "TMO": "Health Care", "ABT": "Health Care",
    "DHR": "Health Care", "BMY": "Health Care",
    "JPM": "Financials", "V": "Financials", "MA": "Financials", "BAC": "Financials",
    "GS": "Financials", "MS": "Financials", "BLK": "Financials", "AXP": "Financials",
    "WFC": "Financials", "C": "Financials",
    "HD": "Consumer Discretionary", "MCD": "Consumer Discretionary", "NKE": "Consumer Discretionary",
    "SBUX": "Consumer Discretionary", "LOW": "Consumer Discretionary", "TJX": "Consumer Discretionary",
    "BKNG": "Consumer Discretionary", "CMG": "Consumer Discretionary",
    "PG": "Consumer Staples", "KO": "Consumer Staples", "PEP": "Consumer Staples",
    "COST": "Consumer Staples", "WMT": "Consumer Staples", "PM": "Consumer Staples",
    "CL": "Consumer Staples", "MDLZ": "Consumer Staples",
    "XOM": "Energy", "CVX": "Energy", "COP": "Energy", "SLB": "Energy",
    "EOG": "Energy", "MPC": "Energy",
    "CAT": "Industrials", "GE": "Industrials", "HON": "Industrials", "UNP": "Industrials",
    "RTX": "Industrials", "DE": "Industrials", "BA": "Industrials", "LMT": "Industrials",
    "DIS": "Communication Services", "CMCSA": "Communication Services",
    "T": "Communication Services", "VZ": "Communication Services", "TMUS": "Communication Services",
    "LIN": "Materials", "APD": "Materials", "SHW": "Materials", "ECL": "Materials",
    "NEE": "Utilities", "DUK": "Utilities", "SO": "Utilities", "D": "Utilities",
    "PLD": "Real Estate", "AMT": "Real Estate", "CCI": "Real Estate", "EQIX": "Real Estate",
}


def build_portfolio(
    rankings: list[dict],
    portfolio_value: float,
    current_positions: dict[str, float] | None = None,
    risk_manager: RiskManager | None = None,
    max_positions: int = 8,
    regime: str = "bull",
) -> dict:
    """
    Build target portfolio from factor rankings with risk constraints.

    Returns target allocations and rebalance orders.
    """
    if risk_manager is None:
        risk_manager = RiskManager()

    limits = risk_manager.limits
    if current_positions is None:
        current_positions = {}

    # Select top N stocks
    top_stocks = rankings[:max_positions]
    if not top_stocks:
        return {"allocations": {}, "orders": [], "cash_pct": 1.0}

    # Base allocation: proportional to composite score (shifted to positive)
    scores = [max(s["composite"], 0.01) for s in top_stocks]
    total_score = sum(scores)
    base_weights = {s["symbol"]: score / total_score for s, score in zip(top_stocks, scores)}

    # Apply regime adjustment
    if regime == "bear":
        # Reduce equity exposure in bear market
        equity_target = 0.50
    elif regime == "sideways":
        equity_target = 0.75
    else:
        equity_target = 1.0 - limits.min_cash_reserve_pct

    # Scale weights to equity target
    allocations = {sym: w * equity_target for sym, w in base_weights.items()}

    # Apply position size cap
    for sym in allocations:
        if allocations[sym] > limits.max_position_pct:
            allocations[sym] = limits.max_position_pct

    # Apply sector cap
    sector_totals: dict[str, float] = {}
    for sym, w in allocations.items():
        sector = SECTOR_MAP.get(sym, "Unknown")
        sector_totals[sector] = sector_totals.get(sector, 0) + w

    for sector, total in sector_totals.items():
        if total > limits.max_sector_pct:
            scale = limits.max_sector_pct / total
            for sym in allocations:
                if SECTOR_MAP.get(sym, "Unknown") == sector:
                    allocations[sym] *= scale

    # Normalize so total <= equity_target
    total_alloc = sum(allocations.values())
    if total_alloc > equity_target:
        scale = equity_target / total_alloc
        allocations = {sym: w * scale for sym, w in allocations.items()}

    cash_pct = 1.0 - sum(allocations.values())

    # Generate rebalance orders
    orders = []
    for sym, target_weight in allocations.items():
        target_value = portfolio_value * target_weight
        current_value = current_positions.get(sym, 0)
        delta = target_value - current_value

        if abs(delta) / portfolio_value > 0.02:  # Only rebalance if drift > 2%
            orders.append({
                "symbol": sym,
                "side": "buy" if delta > 0 else "sell",
                "target_value": round(target_value, 2),
                "current_value": round(current_value, 2),
                "delta_value": round(delta, 2),
                "target_weight": round(target_weight, 4),
                "sector": SECTOR_MAP.get(sym, "Unknown"),
            })

    # Symbols to sell (currently held but not in target)
    for sym, val in current_positions.items():
        if sym not in allocations and val > 0:
            orders.append({
                "symbol": sym,
                "side": "sell",
                "target_value": 0,
                "current_value": round(val, 2),
                "delta_value": round(-val, 2),
                "target_weight": 0,
                "sector": SECTOR_MAP.get(sym, "Unknown"),
            })

    return {
        "allocations": {sym: round(w, 4) for sym, w in allocations.items()},
        "orders": sorted(orders, key=lambda x: abs(x["delta_value"]), reverse=True),
        "cash_pct": round(cash_pct, 4),
        "equity_target": equity_target,
        "num_positions": len(allocations),
        "sector_breakdown": {
            sector: round(sum(allocations.get(s, 0) for s in allocations if SECTOR_MAP.get(s) == sector), 4)
            for sector in set(SECTOR_MAP.get(s, "Unknown") for s in allocations)
        },
    }
