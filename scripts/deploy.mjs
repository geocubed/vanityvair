import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const environment=process.argv[2];
if(!['staging','production'].includes(environment))throw new Error('Choose staging or production.');
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8')).env[environment];
if(config.d1_databases[0].database_id.startsWith('REPLACE')||!config.vars.ACCESS_TEAM_DOMAIN||!config.vars.ACCESS_AUD)throw new Error('Configure this environment’s separate D1 database, private R2 bucket, and Cloudflare Access team/audience before deploying. See README.md.');
if(environment==='production'&&!config.routes?.some(r=>r.custom_domain&&r.pattern==='vanityvair.com'))throw new Error('Add the approved production custom domain in wrangler.jsonc first.');
execFileSync('npm',['run','build'],{stdio:'inherit',env:{...process.env,CLOUDFLARE_ENV:environment}});
execFileSync('npx',['wrangler','deploy'],{stdio:'inherit',env:{...process.env,CLOUDFLARE_ENV:environment}});
