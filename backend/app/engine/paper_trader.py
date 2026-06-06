"""Paper trading engine — simulated execution for strategy validation.

This module runs the full quant strategy in paper mode:
- Fetches real market data daily
- Generates signals using the multi-factor model
- Executes simulated trades respecting all risk limits
- Tracks P&L, drawdown, and trade journal
- Designed to run for 30 days before going live

Can also connect to Alpaca paper trading API for production-identical simulation.
"""

import json
from datetime import datetime

from app.db import get_db
from app.engine.factors import rank_universe
from app.engine.market_data import SECTOR_ETFS, UNIVERSE, get_historical_data
from app.engine.portfolio import SECTOR_MAP, build_portfolio
from app.engine.regime import detect_regime
from app.engine.risk import Position, RiskLimits, RiskManager


class PaperTrader:
    """Simulated trading engine that tracks a paper portfolio."""

    def __init__(
        self,
        initial_capital: float = 1000.0,
        max_positions: int = 8,
        risk_limits: RiskLimits | None = None,
    ):
        self.initial_capital = initial_capital
        self.cash = initial_capital
        self.positions: dict[str, Position] = {}
        self.max_positions = max_positions
        self.risk_manager = RiskManager(risk_limits)
        self.risk_manager.update_peak(initial_capital)
        self.trade_log: list[dict] = []
        self.started_at = datetime.now()

    @property
    def portfolio_value(self) -> float:
        position_value = sum(p.market_value for p in self.positions.values())
        return self.cash + position_value

    async def update_prices(self) -> dict[str, float]:
        """Fetch current prices for all held positions + universe."""
        symbols = list(set(list(self.positions.keys()) + UNIVERSE[:30]))
        data = await get_historical_data(symbols, period="5d", interval="1d")
        prices = {}
        for sym, df in data.items():
            if df is not None and not df.empty and "Close" in df.columns:
                prices[sym] = float(df["Close"].iloc[-1])
                if sym in self.positions:
                    self.positions[sym].current_price = prices[sym]
                    self.positions[sym].high_water_mark = max(
                        self.positions[sym].high_water_mark, prices[sym]
                    )
        return prices

    async def run_cycle(self) -> dict:
        """Execute one trading cycle: update prices, check risk, generate signals, rebalance."""
        cycle_result = {
            "timestamp": datetime.now().isoformat(),
            "actions": [],
            "portfolio_value": 0,
            "regime": "unknown",
        }

        # 1. Update prices
        prices = await self.update_prices()
        self.risk_manager.update_peak(self.portfolio_value)

        # 2. Check portfolio-level risk
        dd_check = self.risk_manager.check_portfolio_drawdown(self.portfolio_value)
        if dd_check["action"] == "liquidate":
            await self._liquidate_all(prices, "Ruin stop triggered")
            cycle_result["actions"].append({"type": "LIQUIDATE_ALL", "reason": dd_check["message"]})
            cycle_result["portfolio_value"] = self.portfolio_value
            return cycle_result

        if dd_check["action"] == "reduce":
            await self._reduce_positions(prices, 0.5, "Drawdown reduction")
            cycle_result["actions"].append({"type": "REDUCE_50PCT", "reason": dd_check["message"]})

        # 3. Check per-position stops
        for sym, pos in list(self.positions.items()):
            stop_check = self.risk_manager.check_trailing_stop(pos)
            if stop_check["action"] == "liquidate":
                await self._sell(sym, pos.quantity, prices.get(sym, pos.current_price), "Trailing stop")
                cycle_result["actions"].append({"type": "STOP_LOSS", "symbol": sym, "reason": stop_check["message"]})

            tp_check = self.risk_manager.check_take_profit(pos)
            if tp_check["action"] == "reduce":
                sell_qty = tp_check.get("sell_quantity", pos.quantity * 0.5)
                await self._sell(sym, sell_qty, prices.get(sym, pos.current_price), "Take profit")
                cycle_result["actions"].append({"type": "TAKE_PROFIT", "symbol": sym, "reason": tp_check["message"]})

        # 4. Detect regime
        spy_data = await get_historical_data(["SPY"], period="2y")
        sector_data = await get_historical_data(SECTOR_ETFS, period="1y")
        regime = "bull"
        if "SPY" in spy_data:
            regime_info = detect_regime(spy_data["SPY"]["Close"], sector_data)
            regime = regime_info["regime"]
            if hasattr(regime, "value"):
                regime = regime.value
        cycle_result["regime"] = regime

        # 5. Generate signals and rank universe
        price_data = await get_historical_data(UNIVERSE, period="1y")
        rankings = rank_universe(price_data)

        # 6. Build target portfolio
        current_values = {sym: pos.market_value for sym, pos in self.positions.items()}
        target = build_portfolio(
            rankings=rankings,
            portfolio_value=self.portfolio_value,
            current_positions=current_values,
            risk_manager=self.risk_manager,
            max_positions=self.max_positions,
            regime=regime,
        )

        # 7. Execute rebalance orders
        for order in target.get("orders", []):
            sym = order["symbol"]
            if order["side"] == "sell" and sym in self.positions:
                sell_value = abs(order["delta_value"])
                price = prices.get(sym, self.positions[sym].current_price)
                qty = min(sell_value / price, self.positions[sym].quantity) if price > 0 else 0
                if qty > 0:
                    await self._sell(sym, qty, price, "Rebalance")
                    cycle_result["actions"].append({"type": "REBALANCE_SELL", "symbol": sym, "qty": round(qty, 4)})

            elif order["side"] == "buy":
                buy_value = min(order["delta_value"], self.cash * 0.95)
                if buy_value > 10 and sym in prices and prices[sym] > 0:
                    qty = buy_value / prices[sym]
                    await self._buy(sym, qty, prices[sym], "Rebalance")
                    cycle_result["actions"].append({"type": "REBALANCE_BUY", "symbol": sym, "qty": round(qty, 4)})

        # 8. Save snapshot
        await self._save_snapshot(regime)

        cycle_result["portfolio_value"] = round(self.portfolio_value, 2)
        return cycle_result

    async def _buy(self, symbol: str, qty: float, price: float, reason: str):
        cost = qty * price
        if cost > self.cash:
            qty = self.cash / price
            cost = qty * price

        self.cash -= cost

        if symbol in self.positions:
            pos = self.positions[symbol]
            total_qty = pos.quantity + qty
            avg_price = (pos.cost_basis + cost) / total_qty
            pos.quantity = total_qty
            pos.entry_price = avg_price
        else:
            self.positions[symbol] = Position(
                symbol=symbol,
                quantity=qty,
                entry_price=price,
                current_price=price,
                entry_time=datetime.now(),
                sector=SECTOR_MAP.get(symbol, "Unknown"),
                high_water_mark=price,
            )

        self.trade_log.append({
            "timestamp": datetime.now().isoformat(),
            "symbol": symbol,
            "side": "buy",
            "quantity": round(qty, 4),
            "price": round(price, 2),
            "reason": reason,
        })

    async def _sell(self, symbol: str, qty: float, price: float, reason: str):
        if symbol not in self.positions:
            return
        pos = self.positions[symbol]
        qty = min(qty, pos.quantity)
        proceeds = qty * price
        self.cash += proceeds

        pos.quantity -= qty
        if pos.quantity <= 0.001:
            del self.positions[symbol]

        self.trade_log.append({
            "timestamp": datetime.now().isoformat(),
            "symbol": symbol,
            "side": "sell",
            "quantity": round(qty, 4),
            "price": round(price, 2),
            "reason": reason,
            "pnl": round(proceeds - qty * pos.entry_price, 2),
        })

    async def _liquidate_all(self, prices: dict[str, float], reason: str):
        for sym in list(self.positions.keys()):
            price = prices.get(sym, self.positions[sym].current_price)
            await self._sell(sym, self.positions[sym].quantity, price, reason)

    async def _reduce_positions(self, prices: dict[str, float], fraction: float, reason: str):
        for sym in list(self.positions.keys()):
            price = prices.get(sym, self.positions[sym].current_price)
            sell_qty = self.positions[sym].quantity * fraction
            await self._sell(sym, sell_qty, price, reason)

    async def _save_snapshot(self, regime: str):
        db = await get_db()
        positions_json = json.dumps({
            sym: {"qty": round(p.quantity, 4), "price": round(p.current_price, 2), "entry": round(p.entry_price, 2)}
            for sym, p in self.positions.items()
        })
        drawdown = self.risk_manager.current_drawdown(self.portfolio_value)

        params = (
            datetime.now().isoformat(),
            round(self.portfolio_value, 2),
            round(self.cash, 2),
            positions_json,
            round(drawdown, 4),
            regime,
        )
        await db.execute(
            """INSERT INTO portfolio_snapshots
               (timestamp, total_value, cash, positions, drawdown, regime)
               VALUES (?, ?, ?, ?, ?, ?)""",
            params,
        )
        await db.commit()
        await db.close()

    def get_status(self) -> dict:
        positions_list = [
            {
                "symbol": p.symbol,
                "quantity": round(p.quantity, 4),
                "entry_price": round(p.entry_price, 2),
                "current_price": round(p.current_price, 2),
                "market_value": round(p.market_value, 2),
                "unrealized_pnl": round(p.unrealized_pnl, 2),
                "unrealized_pnl_pct": round(p.unrealized_pnl_pct * 100, 2),
                "sector": p.sector,
            }
            for p in self.positions.values()
        ]

        total_pnl = self.portfolio_value - self.initial_capital
        total_return = total_pnl / self.initial_capital

        return {
            "portfolio_value": round(self.portfolio_value, 2),
            "cash": round(self.cash, 2),
            "initial_capital": self.initial_capital,
            "total_pnl": round(total_pnl, 2),
            "total_return_pct": round(total_return * 100, 2),
            "positions": positions_list,
            "num_positions": len(self.positions),
            "drawdown": round(self.risk_manager.current_drawdown(self.portfolio_value) * 100, 2),
            "peak_value": round(self.risk_manager.peak_portfolio_value, 2),
            "total_trades": len(self.trade_log),
            "started_at": self.started_at.isoformat(),
            "days_running": (datetime.now() - self.started_at).days,
            "recent_trades": self.trade_log[-20:],
        }


# Global paper trader instance
_paper_trader: PaperTrader | None = None


def get_paper_trader() -> PaperTrader:
    global _paper_trader
    if _paper_trader is None:
        _paper_trader = PaperTrader()
    return _paper_trader


def reset_paper_trader(initial_capital: float = 1000.0):
    global _paper_trader
    _paper_trader = PaperTrader(initial_capital=initial_capital)
    return _paper_trader
