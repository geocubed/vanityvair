import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const demo = JSON.parse(readFileSync(new URL('../src/data/demo.json', import.meta.url), 'utf8'));
const quote = (v) => v == null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`;
const insert = (table, row) => `INSERT OR IGNORE INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(quote).join(',')});`;
const sql = [
  ...demo.authors.map(a => insert('users', a)),
  ...demo.stories.map(s => insert('stories', { ...s, status: 'published', revision: 1, created_at: s.published_at, updated_at: s.published_at, published_json: JSON.stringify(s) })),
  ...demo.promotions.map(p => insert('promotions', p)),
].join('\n');
mkdirSync('.wrangler/seed', { recursive: true });
writeFileSync('.wrangler/seed/demo.sql', sql);
execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--file', '.wrangler/seed/demo.sql'], { stdio: 'inherit' });
