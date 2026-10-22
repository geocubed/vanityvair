// Run only from an authenticated owner's Mac. The private HTML is a bearer
// invitation: keep it outside the public repository and share with nobody.
import {randomBytes,createHash} from 'node:crypto';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const [environment,email,output]=process.argv.slice(2);
if(!['staging','production'].includes(environment)||!email||!output)throw Error('Usage: node scripts/owner-invite.mjs staging|production OWNER_EMAIL /absolute/private/owner-setup.html');
const target=resolve(output);if(!output.startsWith('/')||target.startsWith(process.cwd()+'/'))throw Error('Choose an absolute output path outside the repository.');
const token=randomBytes(32).toString('hex');const hash=createHash('sha256').update(token).digest('hex');
const quoted=email.toLowerCase().replaceAll("'","''");const folder=mkdtempSync(join(tmpdir(),'vv-owner-'));const file=join(folder,'invite.sql');
try{
 writeFileSync(file,`DELETE FROM auth_invites WHERE email='${quoted}'; INSERT INTO auth_invites(token_hash,email,expires_at) SELECT '${hash}',email,${Date.now()+86400000} FROM users WHERE email='${quoted}' AND role='owner' AND active=1;`,{mode:0o600});
 const output=execFileSync('npx',['wrangler','d1','execute','DB','--env',environment,'--remote','--file',file,'--json'],{encoding:'utf8'});
 const json=output.match(/(\[\s*\{[\s\S]*\])\s*$/)?.[1];
 if(!json)throw Error('Could not verify the database response.');
 const result=JSON.parse(json);
 if(!result.some(row=>row.meta?.changes>0))throw Error('No active owner found with that email.');
 const origin=environment==='production'?'https://vanityvair.com':'https://vanity-vair-staging.felixsoong2.workers.dev';
 writeFileSync(target,`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Private Vanity Vair setup</title><main style="max-width:550px;margin:80px auto;font:20px system-ui;line-height:1.6"><h1>Your writing desk.</h1><p>This private invitation expires in 24 hours and works once. Open it and choose your password on the website. Do not share this file.</p><p><a href="${origin}/sign-in?mode=join#${token}">Choose your password and start posting →</a></p></main>`,{mode:0o600});
 console.log('Private owner setup file created. Open it locally; do not commit or share it.');
}finally{rmSync(folder,{recursive:true,force:true});}
