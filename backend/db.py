import aiosqlite
import json
import os
from pathlib import Path
from passlib.context import CryptContext

DB_PATH = Path(__file__).parent / "thirdeye.db"
DATABASE_URL = os.getenv("DATABASE_URL", "")
USE_POSTGRES = bool(DATABASE_URL)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

if USE_POSTGRES:
    import asyncpg

    _pg_pool: "asyncpg.Pool | None" = None

    async def _get_pool():
        global _pg_pool
        if _pg_pool is None:
            _pg_pool = await asyncpg.create_pool(DATABASE_URL)
        return _pg_pool


async def init_db():
    if USE_POSTGRES:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    title TEXT DEFAULT 'New Scan',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id SERIAL PRIMARY KEY,
                    session_id INTEGER NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES sessions(id)
                )
            """)
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT DEFAULT 'New Scan',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES sessions(id)
                );
            """)
            await db.commit()


# ── Users ──
async def create_user(username: str, password: str) -> dict | None:
    pw_hash = pwd_context.hash(password)
    if USE_POSTGRES:
        pool = await _get_pool()
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
                    username, pw_hash,
                )
                return {"id": row["id"], "username": username}
        except asyncpg.UniqueViolationError:
            return None
    else:
        try:
            async with aiosqlite.connect(DB_PATH) as db:
                cursor = await db.execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (username, pw_hash),
                )
                await db.commit()
                return {"id": cursor.lastrowid, "username": username}
        except aiosqlite.IntegrityError:
            return None


async def _fetch_user_by_username(username: str):
    if USE_POSTGRES:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT id, username, password_hash FROM users WHERE username = $1", username,
            )
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT id, username, password_hash FROM users WHERE username = ?", (username,),
            )
            return await cursor.fetchone()


async def authenticate_user(username: str, password: str) -> dict | None:
    row = await _fetch_user_by_username(username)
    if not row or not pwd_context.verify(password, row["password_hash"]):
        return None
    return {"id": row["id"], "username": row["username"]}


# ── Sessions ──
async def create_session(user_id: int) -> dict:
    if USE_POSTGRES:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "INSERT INTO sessions (user_id, title) VALUES ($1, $2) RETURNING id",
                user_id, "New Scan",
            )
            return {"id": row["id"], "title": "New Scan", "user_id": user_id}
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "INSERT INTO sessions (user_id, title) VALUES (?, ?)",
                (user_id, "New Scan"),
            )
            await db.commit()
            return {"id": cursor.lastrowid, "title": "New Scan", "user_id": user_id}


async def get_sessions(user_id: int) -> list[dict]:
    query_pg = """SELECT s.id, s.title, s.created_at,
                         (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as msg_count
                  FROM sessions s WHERE s.user_id = $1 ORDER BY s.created_at DESC"""
    query_sqlite = """SELECT s.id, s.title, s.created_at,
                              (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as msg_count
                       FROM sessions s WHERE s.user_id = ? ORDER BY s.created_at DESC"""
    if USE_POSTGRES:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(query_pg, user_id)
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(query_sqlite, (user_id,))
            rows = await cursor.fetchall()
    return [{"id": r["id"], "title": r["title"], "created_at": str(r["created_at"]), "msg_count": r["msg_count"]} for r in rows]


async def rename_session(session_id: int, title: str):
    if USE_POSTGRES:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.execute("UPDATE sessions SET title = $1 WHERE id = $2", title, session_id)
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("UPDATE sessions SET title = ? WHERE id = ?", (title, session_id))
            await db.commit()


# ── Messages ──
async def add_message(session_id: int, role: str, content: str):
    if USE_POSTGRES:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)",
                session_id, role, content,
            )
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
                (session_id, role, content),
            )
            await db.commit()


async def get_messages(session_id: int) -> list[dict]:
    if USE_POSTGRES:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, role, content, created_at FROM messages WHERE session_id = $1 ORDER BY created_at ASC",
                session_id,
            )
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,),
            )
            rows = await cursor.fetchall()
    return [{"id": r["id"], "role": r["role"], "content": r["content"], "created_at": str(r["created_at"])} for r in rows]


async def get_session_analyses(session_id: int) -> list[dict]:
    msgs = await get_messages(session_id)
    analyses = []
    for m in msgs:
        if m["role"] == "assistant":
            try:
                analyses.append(json.loads(m["content"]))
            except:
                pass
    return analyses
