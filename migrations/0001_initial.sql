PRAGMA foreign_keys = ON;
CREATE TABLE users (
 email TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','contributor')),
 bio TEXT NOT NULL DEFAULT '', slug TEXT NOT NULL UNIQUE, link TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE stories (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, deck TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL DEFAULT '' CHECK(category IN ('','Achievements','Announcements','Projects')),
 body TEXT NOT NULL DEFAULT '', hero TEXT NOT NULL DEFAULT '', hero_alt TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '',
 author_email TEXT NOT NULL REFERENCES users(email), status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published')),
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 published_at TEXT, published_json TEXT, save_token TEXT NOT NULL DEFAULT ''
);
CREATE INDEX stories_author ON stories(author_email, updated_at DESC);
CREATE INDEX stories_published ON stories(published_at DESC) WHERE published_json IS NOT NULL;
CREATE TABLE media (
 id TEXT PRIMARY KEY, owner_email TEXT NOT NULL REFERENCES users(email), bytes INTEGER NOT NULL CHECK(bytes > 0 AND bytes <= 500000),
 mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/webp')), name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE media_refs (
 media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
 story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
 visibility TEXT NOT NULL CHECK(visibility IN ('draft','public')),
 PRIMARY KEY(media_id, story_id, visibility)
);
CREATE TABLE storage_usage (id INTEGER PRIMARY KEY CHECK(id=1), bytes INTEGER NOT NULL DEFAULT 0);
INSERT INTO storage_usage(id,bytes) VALUES(1,0);
CREATE TRIGGER cap_media BEFORE INSERT ON media BEGIN
 SELECT CASE WHEN (SELECT bytes FROM storage_usage WHERE id=1) + NEW.bytes > 7000000000 THEN RAISE(ABORT, 'Storage limit reached') END;
END;
CREATE TRIGGER count_media AFTER INSERT ON media BEGIN UPDATE storage_usage SET bytes=bytes+NEW.bytes WHERE id=1; END;
CREATE TRIGGER release_media AFTER DELETE ON media BEGIN UPDATE storage_usage SET bytes=bytes-OLD.bytes WHERE id=1; END;
CREATE TABLE promotions (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, headline TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 url TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0
);
