import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { User } from './types';
const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function accessEmail(request: Request, team: string, aud: string) {
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !aud) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  try {
    if (!keysets.has(team)) keysets.set(team, createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`)));
    const { payload } = await jwtVerify(token, keysets.get(team)!, { issuer: `https://${team}`, audience: aud, algorithms: ['RS256'] });
    return typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  } catch { return null; }
}
export function canEdit(user: User, story: { author_email: string }) { return user.role === 'owner' || user.email === story.author_email; }
