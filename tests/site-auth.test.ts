import {it,expect} from 'vitest';
import {newToken,passwordHash,tokenHash,verifyPassword,sessionUser} from '../src/lib/site-auth';
it('salts and peppers password verifiers and rejects wrong passwords and short credentials',async()=>{
 const password='a good test passphrase';const pepper=newToken();
 const hash=await passwordHash(password,pepper);
 expect(hash).not.toContain(password);expect(hash).not.toBe(await passwordHash(password,pepper));
 expect(await verifyPassword(password,hash,pepper)).toBe(true);
 expect(await verifyPassword('a different long password',hash,pepper)).toBe(false);
 expect(await verifyPassword(password,hash,newToken())).toBe(false);
 await expect(passwordHash('short',pepper)).rejects.toThrow();
 await expect(passwordHash(password,'')).rejects.toThrow();
});
it('uses unpredictable 256-bit tokens and never stores a bearer token as its verifier',async()=>{
 const token=newToken();expect(token).toMatch(/^[a-f0-9]{64}$/);expect(newToken()).not.toBe(token);expect(await tokenHash(token)).not.toBe(token);
 expect(await sessionUser({} as any,undefined)).toBeNull();expect(await sessionUser({} as any,'forged')).toBeNull();
});
