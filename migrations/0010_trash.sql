ALTER TABLE stories ADD COLUMN deleted_at TEXT;
ALTER TABLE gallery_posts ADD COLUMN deleted_at TEXT;
CREATE INDEX stories_trash ON stories(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX gallery_trash ON gallery_posts(deleted_at) WHERE deleted_at IS NOT NULL;
