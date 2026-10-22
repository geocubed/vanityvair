-- Keep each SQL-exported image row below D1's statement-size limit, so
-- complete content/photo backups can be restored with ordinary SQL imports.
CREATE TABLE media_chunks (
 id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
 part INTEGER NOT NULL CHECK(part>=0 AND part<16),
 data BLOB NOT NULL CHECK(length(data)>0 AND length(data)<=32000),
 PRIMARY KEY(id,part)
);
INSERT INTO media_chunks(id,part,data)
WITH RECURSIVE parts(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM parts WHERE n<15)
SELECT o.id,p.n,substr(o.data,p.n*32000+1,32000)
FROM media_objects o CROSS JOIN parts p WHERE length(o.data)>p.n*32000;
DROP TABLE media_objects;
