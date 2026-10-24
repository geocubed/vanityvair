CREATE TABLE promotion_companies(id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE);
INSERT INTO promotion_companies(id,name) SELECT lower(hex(randomblob(16))),trim(name) FROM promotions GROUP BY trim(name) COLLATE NOCASE;
ALTER TABLE promotions ADD COLUMN company_id TEXT REFERENCES promotion_companies(id);
UPDATE promotions SET company_id=(SELECT id FROM promotion_companies c WHERE c.name=trim(promotions.name) COLLATE NOCASE);
CREATE TABLE kitchen_activity(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT UNIQUE,actor_email TEXT,actor_name TEXT NOT NULL,kind TEXT NOT NULL,target_id TEXT NOT NULL DEFAULT '',title TEXT NOT NULL,action TEXT NOT NULL,summary TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX kitchen_activity_actor ON kitchen_activity(actor_email,seq);
CREATE TABLE kitchen_reads(user_email TEXT PRIMARY KEY,seen_seq INTEGER NOT NULL DEFAULT 0);
INSERT INTO kitchen_activity(event_key,actor_name,kind,title,action,summary,created_at) VALUES('release-kitchen-2026-10-23','Vanity Vair','website','A fresh Kitchen','Site update','Renamed the writing desk to the Kitchen; added company-first ads, automatic format detection, on-site ad previews, random company-aware placements, article-side posters, and the Kitchen activity log. Also includes the hero selector, mobile header and footer, photo sizing, wrapping, and caption italics.','2026-10-23T18:00:00.000Z');
