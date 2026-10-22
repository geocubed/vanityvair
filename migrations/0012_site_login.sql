ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
CREATE TABLE auth_sessions (
 token_hash TEXT PRIMARY KEY,
 email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_invites (
 token_hash TEXT PRIMARY KEY,
 email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE TABLE auth_limits (
 key TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
