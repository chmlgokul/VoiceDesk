from pathlib import Path
import os
import sqlite3
from collections.abc import Mapping
from datetime import datetime, timezone

DATABASE_PATH = Path(__file__).resolve().parent / "voicedesk.db"
ROLE_TO_DB = {"employee": "Employee", "it_support": "IT Support", "admin": "Admin"}
ROLE_FROM_DB = {value: key for key, value in ROLE_TO_DB.items()}


def _load_local_env():
    """Load local .env values without overriding environment variables already set."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.is_file():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if value.startswith(("'", '"')) and value.endswith(("'", '"')):
            value = value[1:-1]

        if key and key not in os.environ:
            os.environ[key] = value


class _Row(Mapping):
    """Provide SQLite-compatible named and positional access to Turso rows."""

    def __init__(self, columns, values):
        self._columns = tuple(columns)
        self._values = tuple(values)
        self._data = dict(zip(self._columns, self._values))

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return self._data[key]

    def __iter__(self):
        return iter(self._columns)

    def __len__(self):
        return len(self._columns)


class _CursorAdapter:
    """Adapt Turso cursors to the interface used by existing database functions."""

    def __init__(self, cursor):
        self._cursor = cursor
        description = cursor.description
        self._columns = [column[0] for column in description] if description else []

    @property
    def lastrowid(self):
        return self._cursor.lastrowid

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def fetchone(self):
        row = self._cursor.fetchone()
        return _Row(self._columns, row) if row is not None else None

    def fetchall(self):
        return [_Row(self._columns, row) for row in self._cursor.fetchall()]


class _ConnectionAdapter:
    """Keep the existing SQLite-style connection interface for Turso."""

    def __init__(self, connection):
        self._connection = connection

    def execute(self, sql, parameters=()):
        return _CursorAdapter(self._connection.execute(sql, parameters))

    def commit(self):
        return self._connection.commit()

    def rollback(self):
        return self._connection.rollback()

    def close(self):
        return self._connection.close()


def get_connection():
    """Use Turso when configured; otherwise use the local SQLite database."""
    _load_local_env()

    turso_url = os.getenv("TURSO_DATABASE_URL")
    turso_token = os.getenv("TURSO_AUTH_TOKEN")

    if turso_url and turso_token:
        import libsql

        connection = libsql.connect(turso_url, auth_token=turso_token)
        connection.execute("PRAGMA foreign_keys = ON")
        return _ConnectionAdapter(connection)

    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _public_user(row):
    if row is None:
        return None
    user = dict(row)
    if "role" in user:
        user["role"] = ROLE_FROM_DB.get(user["role"], user["role"].strip().lower().replace(" ", "_"))
    return user


def create_users_table():
    """Create users table without deleting existing users or password hashes."""
    connection = get_connection()
    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'Employee'
                    CHECK (role IN ('Employee', 'IT Support', 'Admin')),
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
        """)
        connection.commit()
    finally:
        connection.close()


def create_tasks_table():
    """Create/migrate tasks in place; existing task records are preserved."""
    create_users_table()
    connection = get_connection()
    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pending',
                priority TEXT NOT NULL DEFAULT 'Medium'
            )
        """)
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(tasks)").fetchall()}
        migrations = {
            "category": "TEXT NOT NULL DEFAULT 'General Service'",
            "original_request": "TEXT NOT NULL DEFAULT ''",
            "location": "TEXT",
            "deadline": "TEXT",
            "created_at": "TEXT",
            "user_id": "INTEGER REFERENCES users(id)",
        }
        for column, definition in migrations.items():
            if column not in columns:
                connection.execute(f"ALTER TABLE tasks ADD COLUMN {column} {definition}")
        connection.execute(
            "UPDATE tasks SET created_at = ? WHERE created_at IS NULL OR created_at = ''",
            (datetime.now(timezone.utc).isoformat(),),
        )
        connection.commit()
    finally:
        connection.close()


def create_categories_table():
    """Create category management storage and seed existing task categories safely."""
    create_tasks_table()
    connection = get_connection()
    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
        """)
        now = datetime.now(timezone.utc).isoformat()
        # Preserve current task category names so existing tasks remain represented.
        existing_names = connection.execute(
            "SELECT DISTINCT TRIM(category) AS name FROM tasks WHERE category IS NOT NULL AND TRIM(category) <> ''"
        ).fetchall()
        names = {row["name"] for row in existing_names}
        names.add("General Service")
        for name in sorted(names, key=str.casefold):
            connection.execute(
                "INSERT OR IGNORE INTO categories (name, is_active, created_at) VALUES (?, 1, ?)",
                (name, now),
            )
        connection.commit()
    finally:
        connection.close()


def create_all_tables():
    create_users_table()
    create_tasks_table()
    create_categories_table()


def create_user(email, full_name, password_hash, role="employee"):
    create_all_tables()
    role_text = str(role).strip()
    # Accept API keys (it_support) and display labels (IT Support).
    role_key = ROLE_FROM_DB.get(role_text, role_text.lower().replace(" ", "_"))
    db_role = ROLE_TO_DB.get(role_key)
    if db_role is None:
        raise ValueError("Invalid role")
    connection = get_connection()
    try:
        cursor = connection.execute(
            "INSERT INTO users (full_name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
            (full_name.strip(), email.strip().lower(), password_hash, db_role, datetime.now(timezone.utc).isoformat()),
        )
        connection.commit()
        row = connection.execute("SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _public_user(row)
    finally:
        connection.close()


def get_user_by_email(email):
    create_all_tables()
    connection = get_connection()
    try:
        row = connection.execute("SELECT * FROM users WHERE email = ? COLLATE NOCASE", (email.strip(),)).fetchone()
        return _public_user(row)
    finally:
        connection.close()


def get_user_by_id(user_id):
    create_all_tables()
    connection = get_connection()
    try:
        row = connection.execute("SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
        return _public_user(row)
    finally:
        connection.close()


def list_users():
    create_all_tables()
    connection = get_connection()
    try:
        rows = connection.execute("SELECT id, full_name, email, role, is_active, created_at FROM users ORDER BY id").fetchall()
        return [_public_user(row) for row in rows]
    finally:
        connection.close()


def set_user_role(user_id, role):
    create_all_tables()
    role_text = str(role).strip()
    role_key = ROLE_FROM_DB.get(role_text, role_text.lower().replace(" ", "_"))
    db_role = ROLE_TO_DB.get(role_key)
    if db_role is None:
        raise ValueError("Invalid role")
    connection = get_connection()
    try:
        cursor = connection.execute("UPDATE users SET role = ? WHERE id = ?", (db_role, user_id))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def update_user_role(user_id, role):
    return set_user_role(user_id, role)


def update_user_password(user_id, password_hash):
    """Update a user's password hash without changing other account data."""
    connection = get_connection()
    try:
        cursor = connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user_id),
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def delete_user(user_id, current_admin_id):
    """Delete a user only when safe; preserve all task records."""
    create_all_tables()
    connection = get_connection()

    try:
        connection.execute("BEGIN IMMEDIATE")

        target = connection.execute(
            "SELECT id, role FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

        if target is None:
            connection.rollback()
            return "not_found"

        if user_id == current_admin_id:
            connection.rollback()
            return "cannot_delete_self"

        if target["role"] == "Admin":
            admin_count = connection.execute(
                "SELECT COUNT(*) FROM users WHERE role = 'Admin'"
            ).fetchone()[0]

            if admin_count <= 1:
                connection.rollback()
                return "last_admin"

        # Keep task history intact and detach tasks from the deleted account.
        connection.execute(
            "UPDATE tasks SET user_id = NULL WHERE user_id = ?",
            (user_id,),
        )

        connection.execute(
            "DELETE FROM users WHERE id = ?",
            (user_id,),
        )

        connection.commit()
        return "deleted"

    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()



def count_users():
    create_users_table()
    connection = get_connection()
    try:
        return connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    finally:
        connection.close()


def list_categories(include_inactive=True):
    create_categories_table()
    connection = get_connection()
    try:
        if include_inactive:
            rows = connection.execute("SELECT id, name, is_active, created_at FROM categories ORDER BY name COLLATE NOCASE").fetchall()
        else:
            rows = connection.execute("SELECT id, name, is_active, created_at FROM categories WHERE is_active = 1 ORDER BY name COLLATE NOCASE").fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def create_category(name):
    clean_name = str(name).strip()
    if not clean_name:
        raise ValueError("Category name cannot be empty.")
    create_categories_table()
    connection = get_connection()
    try:
        cursor = connection.execute(
            "INSERT INTO categories (name, is_active, created_at) VALUES (?, 1, ?)",
            (clean_name, datetime.now(timezone.utc).isoformat()),
        )
        connection.commit()
        row = connection.execute("SELECT id, name, is_active, created_at FROM categories WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)
    finally:
        connection.close()


def set_category_active(category_id, is_active):
    create_categories_table()
    connection = get_connection()
    try:
        cursor = connection.execute("UPDATE categories SET is_active = ? WHERE id = ?", (1 if is_active else 0, category_id))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def rename_category(category_id, name):
    clean_name = str(name).strip()
    if not clean_name:
        raise ValueError("Category name cannot be empty.")
    create_categories_table()
    connection = get_connection()
    try:
        cursor = connection.execute("UPDATE categories SET name = ? WHERE id = ?", (clean_name, category_id))
        connection.commit()
        if cursor.rowcount == 0:
            return None
        row = connection.execute("SELECT id, name, is_active, created_at FROM categories WHERE id = ?", (category_id,)).fetchone()
        return dict(row)
    finally:
        connection.close()


def add_task(title, priority="Medium", category="General Service", original_request="", location=None, deadline=None, user_id=None):
    clean_title = title.strip()
    if not clean_title:
        raise ValueError("Task title cannot be empty.")
    create_all_tables()
    connection = get_connection()
    try:
        cursor = connection.execute(
            """INSERT INTO tasks (title, status, priority, category, original_request, location, deadline, created_at, user_id)
               VALUES (?, 'Pending', ?, ?, ?, ?, ?, ?, ?)""",
            (clean_title, priority, category, original_request, location, deadline, datetime.now(timezone.utc).isoformat(), user_id),
        )
        connection.commit()
        return dict(connection.execute("SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)).fetchone())
    finally:
        connection.close()


def get_tasks(user_id=None):
    create_all_tables()
    connection = get_connection()
    try:
        if user_id is None:
            return connection.execute("SELECT * FROM tasks ORDER BY id DESC").fetchall()
        return connection.execute("SELECT * FROM tasks WHERE user_id = ? ORDER BY id DESC", (user_id,)).fetchall()
    finally:
        connection.close()


def count_tasks(user_id=None):
    create_all_tables()
    connection = get_connection()
    try:
        if user_id is None:
            return connection.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        return connection.execute("SELECT COUNT(*) FROM tasks WHERE user_id = ?", (user_id,)).fetchone()[0]
    finally:
        connection.close()


def update_task_status(task_id, status, user_id=None):
    create_all_tables()
    connection = get_connection()
    try:
        if user_id is None:
            cursor = connection.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id))
        else:
            cursor = connection.execute("UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?", (status, task_id, user_id))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


if __name__ == "__main__":
    create_all_tables()
    print(f"VoiceDesk database ready: {DATABASE_PATH}")