# Running Vanity Vair

> **Launch configuration update (October 22, 2026): domain-only budget.** Production and staging now store uploaded photo bytes in D1 (`0011_database_photos.sql`), with a 300 MB upload cap. Do not enable R2, Workers Paid, or other paid services. For the deployed site, export D1 to back up both content and photos; test restoration in staging. Free service limits may interrupt availability rather than trigger an upgrade.


Last checked: October 22, 2026.

## Hosting and budget

The hosted site uses Cloudflare Workers Free and D1 Free. Both writing and uploaded photo bytes live in D1. Uploads stop at 300 MB; every photo is compressed to 500 KB or less. Keep the account on Workers Free. Do not enable R2, Cloudflare Images, paid email services, or a paid Workers plan. Free service limits can interrupt the site or prevent uploads; they do not justify an automatic upgrade.

The public GitHub repository contains source, migrations, and fictional fixtures only. Real content, contributor emails, password verifiers, invitations, and photo bytes belong in the private database. Never commit exports, invitation links, or secrets.

The Kitchen uses the site's own invitation-only login. Cloudflare Access/Zero Trust is not required. If a separate Zero Trust subscription was activated in the Cloudflare dashboard, review that account subscription independently; the website does not use it.

## First launch

Apply all migrations to the separate staging database. Configure its private `AUTH_PEPPER` secret, deploy, then test sign-in, invitation expiry/reuse, logout, uploads, private media, and posting. Staging has a separate owner password from production.

For production, apply migrations to the clean production database, configure a different private `AUTH_PEPPER`, add the owner email, and deploy to the approved custom domain. Never seed demonstration accounts or copy local preview data to production. Verify signed-out privacy, take a database backup, and test restoring it to staging. Preserve existing email/DNS records.

A private single-use owner setup link activates the owner's password. The owner chooses the password on the website. Do not put passwords into chat. Keep `AUTH_PEPPER` in a password manager or another secure private location: it is required to verify existing passwords after a full disaster recovery. Rotating it invalidates passwords and requires new invitation/reset links.

## Your everyday workflow

Open `/editor` on the actual hosted site once launched. On your laptop today, that is `http://localhost:4321/editor`.

### Publish an article

1. Select **New story**. Add a headline, introduction, category if wanted, and your writing.
2. Add a cover photo or photos in the body. Each photo needs an accessible description and a photographer credit, or the Screenshot option. Uploads are resized and compressed automatically; keep your originals separately.
3. Use **Preview** to see the private article. Drafts autosave, and the Save button is available too.
4. As owner, select **Publish story**. A contributor selects **Submit for review**; you then open **For review**, edit if needed, and publish it.
5. Editing a published article does not change its approved public version until you publish again. **Unpublish** takes it offline and retains a draft. **Move to Trash** removes it publicly and starts the recovery window.

Do not edit the same article in multiple tabs; stale saves are rejected to protect the newer version.

### Post to Gallery

1. Select **Gallery** in the Kitchen. Add one to ten photos.
2. Use the reorder controls to choose the cover and sequence. Add a caption and optional hashtags, such as `#shotoniphone`. Clicking a hashtag in the public Gallery shows matching posts.
3. Select **Preview post**. This is private and does not publish or make private photos public. Return to editing to make changes.
4. Select **Post to Gallery** when ready. Gallery posts publish immediately, including those posted by contributors; they do not use article review.
5. In the compact image grid, click a photo or use **Edit** to change photos, their order, caption, or visibility. Hover/focus reveals **Edit** and **Delete**; controls remain visible on touch devices.

The homepage automatically shows the four newest visible Gallery posts after its first ad.

### Invite a contributor

1. In **Our people**, add their name, email, bio, and optional portfolio.
2. Select **Invitation / reset link** on their card. Copy the link and share it privately yourself. The website does not email it.
3. They open the link within 24 hours and choose a password of 14–128 characters. The link works once. Generating another link cancels the earlier one.
4. They sign in at `/sign-in` using that email and password. They can set a portrait, write articles for review, and post Gallery moments directly. They need neither Cloudflare nor GitHub accounts.

For a forgotten password, generate a new invitation/reset link. Using it changes the password and signs out existing sessions. Removing editor access in **Our people** blocks their existing sessions immediately. Their published bylines remain attributed. Sessions expire after seven days; **Sign out** invalidates the current session.

### Photos, ads, and Trash

- **Photo library:** browse and search uploaded photos, correct descriptions and credits, and check storage use. Referenced images are protected from deletion, including photos belonging to recoverable trashed posts/articles.
- **Ads:** owner-only management for banner/poster images and links. These are your friends' free promotions. Updating artwork does not require a GitHub push.
- **Trash:** deleted articles and Gallery posts stay recoverable for 30 days. Restore returns their previous visibility, so previously public items become public again. Contributors manage their own Gallery posts and unpublished articles; published article deletion/restoration is owner-only. Recovery ends after 30 days; expired records are permanently removed on the next editorial API visit. The uploaded files stay in Photo library until separately removed when unused.

## Updating the website

**Content updates** happen in the Kitchen. **Code updates** change layout or behavior and go through GitHub and deployment. A GitHub push alone does not deploy this Worker; the repository does not currently configure automatic deployment.

For a code change:

1. Back up production content before changes involving database/schema or uploads.
2. Work on a `codex/…` branch; keep `package-lock.json`. Review the diff for secrets and content exports.
3. Run `npm ci` in a fresh checkout. Run `npm run setup` only for a disposable local demo database, then `npm run dev`.
4. Run `npm run check`, `npm test`, and `npm run build`. Tests write/delete fixtures in the local sample database; never point them at production.
5. Apply new migrations to staging and deploy staging. Check the affected pages and the owner/contributor permissions.
6. Review and merge the source update. Before production deployment, take a fresh content backup, apply compatible migrations, and deploy production using the documented environment command.
7. Check sign-in, the homepage, an article, Gallery, and an uploaded photo. Record the deployed commit and backup location privately.

Do not rerun seeds on production or replace its database with `.wrangler/state`. A code rollback does not reverse a database migration. Restore a backup into a separate test environment first if data recovery is needed.

A useful request for future updates: “Make this change, test it locally and in staging, back up production before migrating it, and tell me exactly which commit was deployed.”

## Backups

GitHub holds the code. A **D1 export holds writing, photos, people, and authentication records** for this deployed storage design. Keep the export private, outside this public repository. Keep original photos separately. Trash is useful recovery, not a backup.

Pause editing briefly and export before migrations, daily while actively posting, and weekly when quiet:

```sh
npx wrangler d1 export DB --env production --remote --output /absolute/private/backup/database.sql
```

Record the date, environment, and source commit. Keep another copy on a separate device/private backup service, and securely retain the environment's `AUTH_PEPPER`. No scheduled off-site backup is configured yet. Database exports contain private drafts, emails, password verifiers, and hashed sessions/invitations: never publish them.

Test restoration into a separate staging database, never on production. Import the SQL, configure the matching secret only in the isolated test environment, and verify an article, draft, photo, and carousel. Revoke imported authentication sessions/invitations before exposing a restored environment. D1 Free Time Travel currently offers seven days of additional database recovery; independent exports remain necessary.

Legacy local sample images still live in local R2 simulation. Those fixtures are not deployed and are not copied into production.

## Quick maintenance routine

- While posting: keep originals, review pending articles, check photo credits and storage use.
- Weekly: confirm a recent complete backup exists; open the public site and sign in once.
- Monthly: review contributor access, Cloudflare usage/billing, and dependency/security notices. Test upgrades locally and in staging before production.
- After any incident: stop changing content, preserve the current state, identify the last good commit and backup, and recover in staging first.

Official references: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
