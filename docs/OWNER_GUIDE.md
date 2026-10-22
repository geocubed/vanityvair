# Running Vanity Vair

Last checked: October 22, 2026.

## Where things stand

The site works locally at `http://localhost:4321`. The yellow preview banner and account switcher use fictional accounts; they are not real email sign-in. Production and staging configuration still contains placeholder database IDs and empty Cloudflare Access settings. The deployment scripts deliberately refuse to publish this configuration.

The GitHub repository is public. It holds application code, schema migrations, fonts, and fictional sample content. Articles written in the editor, people you invite, their email addresses, and uploaded photos live in the database and media storage. They are not included in a Git push. Never put content exports, secrets, or private backups into the repository.

You can practise locally now. Start real publishing after the hosted site, real owner account, sign-in, and backups have been checked. Local writing is not automatically transferred to production. Keep original photos and a separate copy of any real writing you start before launch.

## First launch: do these in order

1. **Set up Cloudflare staging.** Create its separate D1 database and private R2 bucket, and configure its Access team and application audience in `wrangler.jsonc`. Protect the staging hostname with Access while testing. This is a test copy, not the final public site.
2. **Apply every migration in `migrations/`** to staging. Add your real owner account directly to its `users` table. Do not run the demo seed against a hosted database.
3. **Configure email sign-in.** Enable Cloudflare Access One-time PIN. Allow your exact email, and protect `/editor*`, `/api/*`, and `/preview/*`. The app also verifies the signed identity and active database membership.
4. **Test one complete workflow.** Sign in as the owner, invite a real test contributor, publish a test article and Gallery post, open them while signed out, then delete and restore them. Confirm an uninvited email cannot reach private pages, APIs, previews, or unpublished photos. Check a physical phone and Safari.
5. **Make a content backup and test restoring it** into a separate test database and bucket. Keep a copy outside GitHub and outside the live Cloudflare resources.
6. **Configure production separately.** Use a clean production database and private media bucket; apply all migrations; add the real owner; configure production Access. Add the approved `vanityvair.com` custom-domain route and deploy. Preserve existing DNS and email records. Do not deploy the local account switcher or sample database.
7. **Repeat the sign-in and signed-out checks** on the final hostname before inviting everyone. Confirm an article and uploaded photo survive a later code deployment.

The detailed environment commands and configuration are in [README.md](../README.md#separate-cloudflare-environments). Hosting account setup, costs, and domain changes have not been performed by this source update.

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

1. Select **Gallery** in the writing desk. Add one to ten photos.
2. Use the reorder controls to choose the cover and sequence. Add a caption and optional hashtags, such as `#shotoniphone`. Clicking a hashtag in the public Gallery shows matching posts.
3. Select **Preview post**. This is private and does not publish or make private photos public. Return to editing to make changes.
4. Select **Post to Gallery** when ready. Gallery posts publish immediately, including those posted by contributors; they do not use article review.
5. In the compact image grid, click a photo or use **Edit** to change photos, their order, caption, or visibility. Hover/focus reveals **Edit** and **Delete**; controls remain visible on touch devices.

The homepage automatically shows the four newest visible Gallery posts after its first ad.

### Invite a contributor

There are two steps; adding someone in the website alone does not grant sign-in.

1. In **Our people**, add their name, email, bio, and optional portfolio link.
2. Add the **same exact email** to the hosted site's Cloudflare Access allow-list.
3. Send them your hosted `/editor` link yourself. They enter their email and use the code sent by Cloudflare. The website does not send a separate invitation email.
4. They can set a portrait under **My profile**, write their own articles, submit them for your review, and publish Gallery moments directly. They do not need GitHub access.

To remove access, deactivate the person in **Our people** and remove their email from Cloudflare Access. Existing public bylines stay attributed.

### Photos, ads, and Trash

- **Photo library:** browse and search uploaded photos, correct descriptions and credits, and check storage use. Referenced images are protected from deletion, including photos belonging to recoverable trashed posts/articles.
- **Ads:** owner-only management for banner/poster images and links. These are your friends' free promotions. Updating artwork does not require a GitHub push.
- **Trash:** deleted articles and Gallery posts stay recoverable for 30 days. Restore returns their previous visibility, so previously public items become public again. Contributors manage their own Gallery posts and unpublished articles; published article deletion/restoration is owner-only. Recovery ends after 30 days; expired records are permanently removed on the next editorial API visit. The uploaded files stay in Photo library until separately removed when unused.

## Updating the website

**Content updates** happen in the writing desk. **Code updates** change layout or behavior and go through GitHub and deployment. A GitHub push alone does not deploy this Worker; the repository does not currently configure automatic deployment.

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

## Backups: the three pieces

| Piece | Contains | How to protect it |
| --- | --- | --- |
| GitHub | Source code and migrations | Commit/push reviewed changes; keep a local clone. |
| D1 export | Articles, Gallery posts, people, captions, tags, Trash, media inventory | Export to a private backup folder. |
| R2 objects | The actual uploaded image files | Copy the objects named by the media inventory into the same backup set. |

**GitHub is not a backup of your writing or uploads. Trash is not a backup either.**

Before significant updates and regularly while publishing, pause editing/uploads briefly and make a matched database-plus-media backup. Suggested routine once live: daily while actively posting, weekly when quiet, and before every database migration. No automatic off-site backup job is currently configured; this routine is manual until one is set up.

A production database export uses this command after the environment exists (replace the destination with a private folder outside the repository):

```sh
npx wrangler d1 export DB --env production --remote --output /absolute/private/backup/database.sql
```

Then download the matching R2 objects under their original media IDs. [README.md](../README.md#backup-export-and-recovery) has the per-object command. An SQL export without the photo files is incomplete. Save the environment, date, source commit, object inventory, and checksums with the backup. Keep at least one copy on a different device or private backup service. Backups contain contributor emails and private drafts, so never commit them or attach them to a public issue.

D1's Time Travel is additional recovery support for the hosted database. Its retention depends on the account plan; verify the applicable window in Cloudflare. It does not replace a matched copy of the uploaded images or an independent backup.

Test a recovery before relying on it: import the SQL into a new staging database, restore photos into a new private bucket using their original IDs, connect the test app, and check an article, a carousel, a draft, and sign-in. Do not practise a full restore on live production.

## Quick maintenance routine

- While posting: keep originals, review pending articles, check photo credits and storage use.
- Weekly: confirm a recent complete backup exists; open the public site and sign in once.
- Monthly: review contributor access, Cloudflare usage/billing, and dependency/security notices. Test upgrades locally and in staging before production.
- After any incident: stop changing content, preserve the current state, identify the last good commit and backup, and recover in staging first.

Official references, checked October 22, 2026: [Cloudflare email PIN sign-in](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), and [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
