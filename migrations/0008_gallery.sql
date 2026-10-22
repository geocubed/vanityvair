CREATE TABLE gallery_posts (
 id TEXT PRIMARY KEY,
 author_email TEXT NOT NULL REFERENCES users(email),
 media_id TEXT NOT NULL REFERENCES media(id),
 caption TEXT NOT NULL DEFAULT '' CHECK(length(caption)<=1000),
 created_at TEXT NOT NULL,
 hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1))
);
CREATE INDEX gallery_recent ON gallery_posts(hidden,created_at DESC);
