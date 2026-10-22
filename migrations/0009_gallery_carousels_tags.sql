CREATE TABLE gallery_images (
 post_id TEXT NOT NULL REFERENCES gallery_posts(id) ON DELETE CASCADE,
 media_id TEXT NOT NULL REFERENCES media(id),
 position INTEGER NOT NULL CHECK(position>=0 AND position<10),
 PRIMARY KEY(post_id,position), UNIQUE(post_id,media_id)
);
INSERT INTO gallery_images(post_id,media_id,position) SELECT id,media_id,0 FROM gallery_posts;
CREATE INDEX gallery_image_media ON gallery_images(media_id);
CREATE TABLE gallery_tags (
 post_id TEXT NOT NULL REFERENCES gallery_posts(id) ON DELETE CASCADE,
 tag TEXT NOT NULL,
 PRIMARY KEY(post_id,tag)
);
CREATE INDEX gallery_tag_lookup ON gallery_tags(tag,post_id);
