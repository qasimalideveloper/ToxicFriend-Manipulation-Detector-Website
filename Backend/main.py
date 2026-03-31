import os
import sqlite3
from datetime import datetime, timezone
import hashlib

from flask import Flask, jsonify, request
from flask_cors import CORS


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "data.db")
DB_PATH = os.environ.get("DATABASE_URL", DEFAULT_DB_PATH)

# Ensure the directory for the SQLite file exists (useful when DATABASE_URL points elsewhere)
db_dir = os.path.dirname(DB_PATH)
if db_dir and not os.path.exists(db_dir):
    os.makedirs(db_dir, exist_ok=True)


def get_db_connection():
    """Return a new SQLite connection with sensible defaults."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def ensure_logins_schema(conn: sqlite3.Connection):
    """Ensure the logins table has the user_id column and uniqueness enforced."""
    columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(logins);").fetchall()
    }
    if "user_id" not in columns:
        conn.execute("ALTER TABLE logins ADD COLUMN user_id TEXT;")
        conn.execute(
            "UPDATE logins SET user_id = printf('legacy-%s', id) WHERE user_id IS NULL;"
        )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_logins_user_id ON logins(user_id);"
    )


def init_db():
    """Create the SQLite tables if they do not already exist."""
    with get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS logins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        ensure_logins_schema(conn)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
                message TEXT,
                created_at TEXT NOT NULL
            );
            """
        )


def serialize_row(row):
    """Convert a sqlite3.Row into a plain dict."""
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def current_timestamp():
    """Return an ISO 8601 UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


app = Flask(__name__)
# Configure CORS to allow requests from your Netlify domain and admin page
# Add your admin page URL to the origins list
CORS(app, 
     resources={
         r"/api/*": {
             "origins": ["https://toxicfriend.netlify.app"],
             "methods": ["GET", "POST", "OPTIONS"],
             "allow_headers": ["Content-Type", "Authorization"]
         },
         r"/api/admin/*": {
             "origins": ["*"],  # Allow admin from any origin (you can restrict this later)
             "methods": ["GET", "POST", "OPTIONS"],
             "allow_headers": ["Content-Type", "Authorization"]
         }
     },
     supports_credentials=True)

# Admin credentials - Set these as environment variables for security
# Default values (CHANGE THESE IN PRODUCTION!)
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "")

# If no hash is set, use a default password hash (admin123)
# In production, set ADMIN_PASSWORD_HASH environment variable
if not ADMIN_PASSWORD_HASH:
    # Default password: "admin123" - CHANGE THIS!
    ADMIN_PASSWORD_HASH = hashlib.sha256("admin123".encode()).hexdigest()

init_db()


@app.route("/api/logins", methods=["POST"])
def create_login():
    """
    Store a user's name when they enter the site.
    Expected JSON: {"name": "Alice", "user_id": "uuid"}
    """
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    user_id = (payload.get("user_id") or "").strip()

    if not name:
        return jsonify({"error": "Name is required"}), 400
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    timestamp = current_timestamp()
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO logins (user_id, name, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE
            SET name = excluded.name,
                created_at = excluded.created_at
            """,
            (user_id, name, timestamp),
        )
        row = conn.execute(
            "SELECT id, user_id, name, created_at FROM logins WHERE user_id = ?",
            (user_id,),
        ).fetchone()

    return (
        jsonify(
            {
                "id": row["id"],
                "user_id": row["user_id"],
                "name": row["name"],
                "created_at": row["created_at"],
            }
        ),
        201,
    )


@app.route("/api/logins", methods=["GET"])
def list_logins():
    """Return all recorded login names."""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT id, user_id, name, created_at FROM logins ORDER BY created_at DESC;"
        ).fetchall()
    return jsonify([serialize_row(row) for row in rows])


@app.route("/api/feedback", methods=["POST"])
def create_feedback():
    """
    Store a feedback entry.
    Expected JSON: {"name": "...", "stars": 4, "message": "..."}
    """
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    message = (payload.get("message") or "").strip()
    stars = payload.get("stars")

    if not name:
        return jsonify({"error": "Name is required"}), 400

    try:
        stars = int(stars)
    except (TypeError, ValueError):
        return jsonify({"error": "Stars must be an integer between 1 and 5"}), 400

    if not 1 <= stars <= 5:
        return jsonify({"error": "Stars must be between 1 and 5"}), 400

    timestamp = current_timestamp()
    with get_db_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO feedback (name, stars, message, created_at) VALUES (?, ?, ?, ?)",
            (name, stars, message, timestamp),
        )
        feedback_id = cursor.lastrowid

    return (
        jsonify(
            {
                "id": feedback_id,
                "name": name,
                "stars": stars,
                "message": message,
                "created_at": timestamp,
            }
        ),
        201,
    )


@app.route("/api/feedback", methods=["GET"])
def list_feedback():
    """Return all saved feedback entries."""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, stars, message, created_at FROM feedback ORDER BY created_at DESC;"
        ).fetchall()
    return jsonify([serialize_row(row) for row in rows])


@app.route("/api/admin/authenticate", methods=["POST"])
def authenticate_admin():
    """
    Authenticate admin user.
    Expected JSON: {"username": "...", "password": "..."}
    Returns: {"success": true/false}
    """
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = (payload.get("password") or "").strip()

    if not username or not password:
        return jsonify({"success": False, "error": "Username and password are required"}), 400

    # Hash the provided password
    password_hash = hashlib.sha256(password.encode()).hexdigest()

    # Check credentials
    if username == ADMIN_USERNAME and password_hash == ADMIN_PASSWORD_HASH:
        return jsonify({"success": True}), 200
    else:
        return jsonify({"success": False, "error": "Invalid username or password"}), 401


@app.route("/health", methods=["GET"])
def healthcheck():
    """Simple health check endpoint for render/monitoring."""
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")

