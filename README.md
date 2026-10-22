# Vanity Vair

> **Launch configuration update (October 22, 2026): domain-only budget.** Production and staging now store uploaded photo bytes in D1 (`0011_database_photos.sql`), with a 300 MB upload cap. Do not enable R2, Workers Paid, or other paid services. For the deployed site, export D1 to back up both content and photos; test restoration in staging. Free service limits may interrupt availability rather than trigger an upgrade.


An independent friends’ magazine: Achievements, Announcements, Projects, and handpicked business promotions. Built with Astro, Cloudflare Workers Free, D1 Free, and a Tiptap writing desk.

For day-to-day publishing, contributor invitations, launch steps, updates, and backups, start with the [Owner Guide](docs/OWNER_GUIDE.md).

## Review on your laptop and phone

```sh
npm install
npm run setup
npm run dev
```

Open **http://localhost:4321/** on the laptop. On a phone connected to the same Wi-Fi, open **http://10.0.0.50:4321/**. This address belongs to the current Wi-Fi connection and may change; use the `Network` URL printed by Astro if it does. Keep the laptop awake and the server running. Guest Wi-Fi isolation, a VPN, or a macOS firewall rule can prevent the phone connecting.

The writing desk is at `/editor`. A yellow local-preview banner lets you switch between the sample owner and Maya, a contributor. It does **not send email**. This shortcut exists only when both Astro development mode and `APP_ENV=local` are true. A built deployment requires a valid site session and an active database user.

All current contributors, business names, and stories are fictional samples. Sample photographs are served from Unsplash; they are illustrative and do not portray the fictional authors. The demo seed runs only against local storage and uses `INSERT OR IGNORE`, so rerunning setup does not overwrite edits. No local content is deployed automatically.

Send design notes and screenshots in the Codex chat. Useful things to review: masthead, homepage story balance, phone navigation, article text size, promotion appearance, and how easy the writing desk feels.

## Owner guide

### Write and publish

1. Open the writing desk and choose **New story**.
2. Give it a headline, an optional introduction/category, and write with the formatting toolbar. Photos can be chosen, dropped, or pasted into the story. **＋ Video** embeds HTTPS YouTube/Vimeo links; videos stay on those providers and may use their own cookies when viewed.
3. Drafts autosave after a short pause. A browser recovery copy protects unsaved writing if the connection drops. Conflicting edits in another tab produce a warning rather than overwrite that tab’s work.
4. **Preview** opens a private article page. **Submit for review** sends a contributor’s draft to the owner.
5. The owner opens **For review**, makes changes, and selects **Publish story**. **Return to draft** allows more work. **Unpublish** removes public access and keeps the working draft.

An article’s last approved snapshot remains public while anyone edits its next draft. Saving never updates the public snapshot; only publishing does. Each story keeps its original URL when its headline changes. The first six newest published stories populate the homepage; the searchable archive contains up to the most recent 250. Pagination is a future improvement once the magazine approaches that size.

### Trash

Gallery posts and saved articles can be moved to **Trash** in the writing desk. They disappear from public pages immediately. Restore within 30 days to recover the content, photos, hashtags, and previous visibility; a previously public item becomes public again. Contributors manage their own Gallery posts and unpublished articles; only the owner can trash or restore published articles. Article deletion checks the current revision so an older tab cannot delete a newer save.

Recovery expires 30 days after deletion. Expired records and their references are permanently removed on the next editorial API request. Uploaded files stay in the Photo library, where unused photos can be removed separately. Apply migration `0010_trash.sql` before deploying. Gallery management uses a compact image grid: hover or focus for Edit/Delete controls, always visible on touch devices. Open a tile to change photos, their order, caption, or visibility.

### Gallery

Gallery (`/gallery`) is a public photo feed, separate from articles. Signed-in contributors choose or upload up to 10 photos in **Gallery** in the writing desk, add an optional caption (up to 1,000 characters), and select **Post to Gallery** to publish immediately. Photos require a description and photographer credit (or Screenshot), and use the existing 500 KB compression and storage cap. Each person can edit their own captions, hide posts, and restore them; the owner can manage all posts. Hidden posts stop appearing publicly and their photos lose public access unless another public story, profile, promotion, or Gallery post references them. Hidden posts retain their photos for restoration.

The public page shows up to the latest 200 moments, with compact photo carousels, dots, keyboard navigation, native touch swiping, and full photo viewing. Hashtags in captions become links to exact, case-insensitive tag feeds; editing a caption updates its tags. Reorder selected photos before posting to choose the cover. Unfinished composer selections/captions stay in that browser. Caption edits must be saved explicitly. Apply `0008_gallery.sql` and `0009_gallery_carousels_tags.sql` before deploying. The latter preserves existing single-photo posts. Optional local samples: `node scripts/seed-gallery.mjs`; these use the existing illustrative Unsplash photos and never target remote data.

### Contributors

Every contributor can open **My profile** in the writing desk to upload or remove their own portrait. Photos display as black-and-white circles above article bylines and on contributor pages. Saving a portrait makes that photo public; replacing or removing it revokes public access unless a story or ad also uses it. Apply migration `0007_profile_photos.sql` before deploying this version.

In **Our people**, enter the friend's details, then select **Invitation / reset link** on their card. Share it privately. They choose a password and sign in at `/sign-in`; the site sends no invitation emails. Removing their access blocks existing sessions immediately. Existing published bylines remain attributed.

### Ads

Open **Ads** in the owner’s writing desk (`/editor?tab=ads`). Upload a complete image, choose **Banner (4:1)** or **Poster (1:4)**, adjust the crop, enter an image description and an optional HTTPS or site link, then save. Recommended sizes are 1600 × 400 and 400 × 1600. All lettering and logos belong in the image itself. The uploader compresses the cropped image to at most 500 KB; the server checks file size, image dimensions, and shape too. Originals never upload.

Use the shape filters to browse the library. **Edit** replaces artwork or changes its link; **Pause / Activate** controls the rotation. **Delete** removes the rotation entry. Its image remains in the shared Photo library for reuse; remove it there when no story or ad references it. This also releases its storage allocation. Failed saves keep the form and uploaded image available for retry, and leaving an unsaved form prompts before discarding changes.

The homepage has two banner placements and a poster beside its latest stories. Article pages have a poster beside the body on wide screens, plus a banner after the story. Archive, category, and contributor pages have one bottom banner. Posters are hidden on phones. There are no floating placements, timers, or tracking scripts.

Each public page request advances a first-party session counter (`vv-edition`), independently selecting from active banners and posters. It holds no visitor identifier. Refreshing advances to the next artwork; singleton rotations repeat and empty placements disappear. Cookies must be allowed for the counter to persist. Only the selected images appear in the HTML. Images use ordinary same-origin `/media/UUID` URLs, without advertising metadata or an ad network. Blocker-specific filtering can still hide ordinary images; display cannot be guaranteed for every blocker.

After local migration and the normal demo seed, run `npm run db:seed:ads` to add four sample image files to local D1/R2. This preserves existing owner-uploaded artwork and never targets remote data. The sample businesses are fictional. Apply migration `0003_image_promotions.sql` to staging/production before deploying this version; older text-only cards stay in the dashboard but need artwork before appearing publicly.

### Photos and storage

Supported browser photos are converted to WebP (JPEG fallback), resized to at most 2,048 pixels on the long edge, then repeatedly adjusted until **500,000 bytes or less**. Only the resulting web photo uploads; original files and location metadata are not uploaded. Transparent images are flattened onto white. JPEG, PNG and WebP work; HEIC/HEIF depends on browser decoding and otherwise gets a clear JPEG-export message. Raw files, GIF animation, and video uploads are excluded. Input files over 40 MB or 100 million pixels are rejected to protect phone memory.

The server independently bounds the request size, checks JPEG/WebP signatures, authorizes media references, and stores media in the private D1 database. Draft photos require the uploader or owner. Public access is allowed only while a published article or active promotion references the image. Media responses are private/no-store so unpublishing revokes subsequent access; someone who already downloaded an image still has that copy.

**Photo library** shows usage. A database trigger stops new uploads at **300 MB** across the site; the meter warns before that. The owner can remove unused web photos after confirmation. Images referenced by a draft, published story, or promotion cannot be deleted. Keep photographic originals elsewhere.

## Hosting, sign-in, budget, and backups

See [Owner Guide](docs/OWNER_GUIDE.md) for the current deployment and recovery procedure. Staging and production use Workers Free and D1 Free, with uploaded photo bytes stored in 32 KB D1 chunks so SQL exports remain restorable. The upload cap is 300 MB; individual photos remain limited to 500 KB. No deployed R2 binding is configured. Local sample assets retain local R2 simulation for compatibility.

Use the site's invitation-only email/password sign-in at `/sign-in`. There is no Cloudflare Access or paid email dependency. Create a person in **Our people**, generate their single-use 24-hour **Invitation / reset link**, and share it privately. Passwords require 14–128 characters. Sessions use secure HttpOnly cookies and expire after seven days. Removing an account blocks its existing sessions; resetting a password revokes them. Password verifiers use salted PBKDF2 at Workers' supported 100,000-iteration ceiling plus an environment-specific HMAC pepper stored as the private `AUTH_PEPPER` Worker secret.

Keep `AUTH_PEPPER` securely outside the repository and retain it for recovery. Never rotate it casually: existing passwords need it. Initial owner setup/recovery is available to the authenticated Cloudflare account owner:

```sh
node scripts/owner-invite.mjs production OWNER_EMAIL /absolute/private/owner-setup.html
```

Open the generated private file locally, follow its single-use link, and choose the password yourself. Do not share the file or put passwords in chat.

Apply all migrations explicitly to the selected environment, build/deploy with `npm run deploy:staging` or `npm run deploy:production`. The deploy script requires the environment's database ID and authentication secret. First-time provisioning may deploy a sign-in-disabled Worker before setting its secret; all editorial routes fail closed until configured. A GitHub push alone does not deploy.

**Only the yearly domain renewal is budgeted.** Keep Workers Free; do not activate R2, paid Workers, Images, paid email, or other metered subscriptions. At free limits, requests or writes can stop. [D1 Free limit behavior](https://developers.cloudflare.com/d1/reference/faq/) and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). A separately activated Zero Trust subscription is not used by this app and should be reviewed separately.

A private D1 export includes articles, photos, people, sessions, and invitations:

```sh
npx wrangler d1 export DB --env production --remote --output /absolute/private/backup/database.sql
```

Export before migrations and regularly while publishing. Keep another private copy and the authentication secret on a separate device or private backup service. Never commit exports to this public repository. Test importing into an isolated staging database before relying on backups. Revoke imported sessions/invitations before exposing a restored environment. Legacy local R2 fixtures are not production content. No automatic off-site backup service is configured.

## Verification

```sh
npm run check
npm run build
# In another terminal with the dev server running:
npm run test
```

Vitest covers sanitizer/link validation, categories, author permissions, failing closed on missing/invalid tokens, story lifecycle, stale-save rejection, write-request origin, image limits, draft-media privacy, published-media references, unpublish revocation, category/search pages, and promo rendering. Workflow tests mutate only the local demo environment; use a disposable development database.

The browser review checks desktop and 390px phone layouts plus real editor controls. A 7.3 MB synthetic JPEG was compressed to 493 KB through the actual upload interface. Physical phone/Safari and real Cloudflare OTP testing remain launch checks; viewport emulation does not replace them.
