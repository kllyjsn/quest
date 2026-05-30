"""Risk management engine — position sizing, drawdown limits, PDT compliance."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum


class RiskAction(StrEnum):
    ALLOW = "allow"
    REDUCE = "reduce"
    BLOCK = "block"
    LIQUIDATE = "liquidate"


@dataclass
class RiskLimits:
    max_position_pct: float = 0.25  # Max 25% in a single position
    max_sector_pct: float = 0.40  # Max 40% in a single sector
    max_drawdown_warning: float = -0.10  # -10% triggers warning
    max_drawdown_reduce: float = -0.15  # -15% triggers 50% cash
    max_drawdown_liquidate: float = -0.25  # -25% triggers full liquidation
    trailing_stop_pct: float = -0.08  # -8% trailing stop per position
    take_profit_pct: float = 0.20  # +20% take profit (partial)
    take_profit_sell_pct: float = 0.50  # Sell 50% at take profit
    min_cash_reserve_pct: float = 0.05  # Always keep 5% cash
    pdt_max_day_trades: int = 3  # Max 3 day trades per 5 business days
    pdt_window_days: int = 5  # PDT rolling window


@dataclass
class Position:
    symbol: str
    quantity: float
    entry_price: float
    current_price: float
    entry_time: datetime
    sector: str = "Unknown"
    high_water_mark: float = 0.0

    @property
    def market_value(self) -> float:
        return self.quantity * self.current_price

    @property
    def cost_basis(self) -> float:
        return self.quantity * self.entry_price

    @property
    def unrealized_pnl(self) -> float:
        return self.market_value - self.cost_basis

    @property
    def unrealized_pnl_pct(self) -> float:
        if self.cost_basis == 0:
            return 0
        return self.unrealized_pnl / self.cost_basis

    @property
    def drawdown_from_high(self) -> float:
        if self.high_water_mark <= 0:
            return 0
        return (self.current_price - self.high_water_mark) / self.high_water_mark


@dataclass
class DayTrade:
    symbol: str
    timestamp: datetime
    buy_price: float
    sell_price: float


class RiskManager:
    def __init__(self, limits: RiskLimits | None = None):
        self.limits = limits or RiskLimits()
        self.day_trades: list[DayTrade] = []
        self.peak_portfolio_value: float = 0
        self.risk_events: list[dict] = []

    def update_peak(self, portfolio_value: float):
        if portfolio_value > self.peak_portfolio_value:
            self.peak_portfolio_value = portfolio_value

    def current_drawdown(self, portfolio_value: float) -> float:
        if self.peak_portfolio_value <= 0:
            return 0
        return (portfolio_value - self.peak_portfolio_value) / self.peak_portfolio_value

    def check_portfolio_drawdown(self, portfolio_value: float) -> dict:
        dd = self.current_drawdown(portfolio_value)

        if dd <= self.limits.max_drawdown_liquidate:
            self._log_risk_event("LIQUIDATION_TRIGGER", f"Drawdown {dd:.1%} hit liquidation level", "critical")
            msg = f"RUIN STOP: {dd:.1%} drawdown — liquidating all positions"
            return {"action": RiskAction.LIQUIDATE, "drawdown": dd, "message": msg}

        if dd <= self.limits.max_drawdown_reduce:
            self._log_risk_event("DRAWDOWN_REDUCE", f"Drawdown {dd:.1%} hit reduction level", "high")
            return {"action": RiskAction.REDUCE, "drawdown": dd, "message": f"Drawdown {dd:.1%} — reducing to 50% cash"}

        if dd <= self.limits.max_drawdown_warning:
            self._log_risk_event("DRAWDOWN_WARNING", f"Drawdown {dd:.1%}", "medium")
            return {"action": RiskAction.ALLOW, "drawdown": dd, "message": f"Warning: drawdown at {dd:.1%}"}

        return {"action": RiskAction.ALLOW, "drawdown": dd, "message": "OK"}

    def check_position_size(
        self, symbol: str, proposed_value: float, portfolio_value: float
    ) -> dict:
        if portfolio_value <= 0:
            return {"action": RiskAction.BLOCK, "message": "Portfolio value is zero"}

        position_pct = proposed_value / portfolio_value
        if position_pct > self.limits.max_position_pct:
            max_value = portfolio_value * self.limits.max_position_pct
            return {
                "action": RiskAction.REDUCE,
                "message": (
                    f"{symbol}: {position_pct:.1%} exceeds"
                    f" {self.limits.max_position_pct:.0%} limit. Max: ${max_value:,.0f}"
                ),
                "max_value": max_value,
            }
        return {"action": RiskAction.ALLOW, "message": "OK"}

    def check_sector_exposure(
        self, sector: str, positions: list[Position], portfolio_value: float
    ) -> dict:
        if portfolio_value <= 0:
            return {"action": RiskAction.BLOCK, "message": "Portfolio value is zero"}

        sector_value = sum(p.market_value for p in positions if p.sector == sector)
        sector_pct = sector_value / portfolio_value
        if sector_pct > self.limits.max_sector_pct:
            return {
                "action": RiskAction.BLOCK,
                "message": f"Sector {sector} at {sector_pct:.1%} exceeds {self.limits.max_sector_pct:.0%} limit",
                "sector_exposure": sector_pct,
            }
        return {"action": RiskAction.ALLOW, "message": "OK"}

    def check_trailing_stop(self, position: Position) -> dict:
        if position.high_water_mark <= 0:
            return {"action": RiskAction.ALLOW, "message": "No high water mark set"}

        dd = position.drawdown_from_high
        if dd <= self.limits.trailing_stop_pct:
            return {
                "action": RiskAction.LIQUIDATE,
                "message": (
                    f"{position.symbol}: trailing stop at {dd:.1%}"
                    f" from high of ${position.high_water_mark:.2f}"
                ),
            }
        return {"action": RiskAction.ALLOW, "message": "OK"}

    def check_take_profit(self, position: Position) -> dict:
        if position.unrealized_pnl_pct >= self.limits.take_profit_pct:
            sell_qty = position.quantity * self.limits.take_profit_sell_pct
            return {
                "action": RiskAction.REDUCE,
                "message": (
                    f"{position.symbol}: +{position.unrealized_pnl_pct:.1%}"
                    f" — selling {self.limits.take_profit_sell_pct:.0%} ({sell_qty:.2f} shares)"
                ),
                "sell_quantity": sell_qty,
            }
        return {"action": RiskAction.ALLOW, "message": "OK"}

    def check_pdt(self) -> dict:
        cutoff = datetime.now() - timedelta(days=self.limits.pdt_window_days)
        recent = [dt for dt in self.day_trades if dt.timestamp > cutoff]
        count = len(recent)
        remaining = self.limits.pdt_max_day_trades - count

        if remaining <= 0:
            return {
                "action": RiskAction.BLOCK,
                "message": f"PDT limit reached: {count}/{self.limits.pdt_max_day_trades} day trades used",
                "day_trades_used": count,
                "day_trades_remaining": 0,
            }
        return {
            "action": RiskAction.ALLOW,
            "message": f"{remaining} day trades remaining",
            "day_trades_used": count,
            "day_trades_remaining": remaining,
        }

    def record_day_trade(self, symbol: str, buy_price: float, sell_price: float):
        self.day_trades.append(
            DayTrade(symbol=symbol, timestamp=datetime.now(), buy_price=buy_price, sell_price=sell_price)
        )

    def kelly_position_size(
        self, win_rate: float, avg_win: float, avg_loss: float, fraction: float = 0.5
    ) -> float:
        """
        Half-Kelly criterion for position sizing.
        fraction=0.5 is half-Kelly (recommended for safety).
        """
        if avg_loss == 0 or avg_win == 0:
            return 0.0
        b = avg_win / abs(avg_loss)  # Win/loss ratio
        p = win_rate
        q = 1 - p
        kelly = (b * p - q) / b
        return max(0, kelly * fraction)

    def get_risk_summary(self, portfolio_value: float, positions: list[Position]) -> dict:
        dd = self.current_drawdown(portfolio_value)
        pdt = self.check_pdt()
        dd_check = self.check_portfolio_drawdown(portfolio_value)

        sector_exposure: dict[str, float] = {}
        for p in positions:
            sector_exposure[p.sector] = sector_exposure.get(p.sector, 0) + p.market_value

        position_heat = []
        for p in positions:
            position_heat.append({
                "symbol": p.symbol,
                "pnl_pct": round(p.unrealized_pnl_pct, 4),
                "weight": round(p.market_value / portfolio_value, 4) if portfolio_value > 0 else 0,
                "trailing_stop": self.check_trailing_stop(p),
                "take_profit": self.check_take_profit(p),
            })

        return {
            "portfolio_value": portfolio_value,
            "peak_value": self.peak_portfolio_value,
            "drawdown": round(dd, 4),
            "drawdown_status": dd_check,
            "pdt_status": pdt,
            "sector_exposure": {
                k: round(v / portfolio_value, 4) if portfolio_value > 0 else 0
                for k, v in sector_exposure.items()
            },
            "position_heat": position_heat,
            "recent_risk_events": self.risk_events[-10:],
        }

    def _log_risk_event(self, event_type: str, description: str, severity: str):
        self.risk_events.append({
            "timestamp": datetime.now().isoformat(),
            "event_type": event_type,
            "description": description,
            "severity": severity,
        })
