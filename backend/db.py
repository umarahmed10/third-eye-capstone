import aiosqlite
import json
import hashlib
from pathlib import Path

DB_PATH = Path(__file__).parent / "thirdeye.db"


async def init_db():
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
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
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


async def authenticate_user(username: str, password: str) -> dict | None:
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, username FROM users WHERE username = ? AND password_hash = ?",
            (username, pw_hash),
        )
        row = await cursor.fetchone()
        return {"id": row["id"], "username": row["username"]} if row else None


# ── Sessions ──
async def create_session(user_id: int) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO sessions (user_id, title) VALUES (?, ?)",
            (user_id, "New Scan"),
        )
        await db.commit()
        return {"id": cursor.lastrowid, "title": "New Scan", "user_id": user_id}


async def get_sessions(user_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT s.id, s.title, s.created_at,
                      (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as msg_count
               FROM sessions s WHERE s.user_id = ? ORDER BY s.created_at DESC""",
            (user_id,),
        )
        rows = await cursor.fetchall()
        return [{"id": r["id"], "title": r["title"], "created_at": r["created_at"], "msg_count": r["msg_count"]} for r in rows]


async def rename_session(session_id: int, title: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE sessions SET title = ? WHERE id = ?", (title, session_id))
        await db.commit()


# ── Messages ──
async def add_message(session_id: int, role: str, content: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
            (session_id, role, content),
        )
        await db.commit()


async def get_messages(session_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        )
        rows = await cursor.fetchall()
        return [{"id": r["id"], "role": r["role"], "content": r["content"], "created_at": r["created_at"]} for r in rows]


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
