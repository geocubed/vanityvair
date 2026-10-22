-- Photo bytes live in D1 so deployed environments need no billable R2 storage.
CREATE TABLE media_objects (
 id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
 data BLOB NOT NULL CHECK(length(data) <= 500000)
);
DROP TRIGGER cap_media;
CREATE TRIGGER cap_media BEFORE INSERT ON media BEGIN
 SELECT CASE WHEN (SELECT bytes FROM storage_usage WHERE id=1) + NEW.bytes > 300000000 THEN RAISE(ABORT, 'Storage limit reached') END;
END;
