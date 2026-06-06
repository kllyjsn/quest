"""Authentication endpoints — register, login, profile."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserInfo,
    create_token,
    hash_password,
    require_auth,
    verify_password,
)
from app.db import get_db

router = APIRouter()


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest):
    """Create a new user account."""
    db = await get_db()
    try:
        existing = await db.execute("SELECT id FROM users WHERE email = ?", (req.email,))
        if await existing.fetchone():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

        hashed = hash_password(req.password)
        now = datetime.now(UTC).isoformat()
        cursor = await db.execute(
            "INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)",
            (req.email, hashed, req.display_name or req.email.split("@")[0], now),
        )
        await db.commit()
        user_id = cursor.lastrowid

        token = create_token(user_id, req.email)
        return TokenResponse(
            access_token=token,
            user_id=user_id,
            email=req.email,
            display_name=req.display_name or req.email.split("@")[0],
        )
    finally:
        await db.close()


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    """Log in and get a JWT token."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, email, password_hash, display_name FROM users WHERE email = ?",
            (req.email,),
        )
        row = await cursor.fetchone()
        if not row or not verify_password(req.password, row["password_hash"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

        token = create_token(row["id"], row["email"])
        return TokenResponse(
            access_token=token,
            user_id=row["id"],
            email=row["email"],
            display_name=row["display_name"],
        )
    finally:
        await db.close()


@router.get("/me")
async def get_profile(user: UserInfo = Depends(require_auth)):
    """Get current user profile."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, email, display_name, created_at FROM users WHERE id = ?",
            (user.user_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        has_alpaca = bool(
            (await (await db.execute("SELECT alpaca_api_key FROM users WHERE id = ?", (user.user_id,))).fetchone())[
                "alpaca_api_key"
            ]
        )
        has_robinhood = bool(
            (await (await db.execute("SELECT robinhood_token FROM users WHERE id = ?", (user.user_id,))).fetchone())[
                "robinhood_token"
            ]
        )

        return {
            "user_id": row["id"],
            "email": row["email"],
            "display_name": row["display_name"],
            "created_at": row["created_at"],
            "has_alpaca_keys": has_alpaca,
            "has_robinhood_token": has_robinhood,
        }
    finally:
        await db.close()


@router.put("/broker-keys")
async def update_broker_keys(
    alpaca_api_key: str | None = None,
    alpaca_secret_key: str | None = None,
    robinhood_token: str | None = None,
    user: UserInfo = Depends(require_auth),
):
    """Save broker API keys for the authenticated user."""
    db = await get_db()
    try:
        updates = []
        params = []
        if alpaca_api_key is not None:
            updates.append("alpaca_api_key = ?")
            params.append(alpaca_api_key)
        if alpaca_secret_key is not None:
            updates.append("alpaca_secret_key = ?")
            params.append(alpaca_secret_key)
        if robinhood_token is not None:
            updates.append("robinhood_token = ?")
            params.append(robinhood_token)

        if not updates:
            return {"status": "no changes"}

        params.append(user.user_id)
        await db.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        await db.commit()
        return {"status": "updated"}
    finally:
        await db.close()
