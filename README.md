# Vanity Vair

An independent friends’ magazine: Achievements, Announcements, Projects, and handpicked business promotions. Built with Astro, Cloudflare Workers, D1, a private R2 bucket, and a Tiptap writing desk.

## Review on your laptop and phone

```sh
npm install
npm run setup
npm run dev
```

Open **http://localhost:4321/** on the laptop. On a phone connected to the same Wi-Fi, open **http://10.0.0.50:4321/**. This address belongs to the current Wi-Fi connection and may change; use the `Network` URL printed by Astro if it does. Keep the laptop awake and the server running. Guest Wi-Fi isolation, a VPN, or a macOS firewall rule can prevent the phone connecting.

The writing desk is at `/editor`. A yellow local-preview banner lets you switch between the sample owner and Maya, a contributor. It does **not send email**. This shortcut exists only when both Astro development mode and `APP_ENV=local` are true. A built deployment always requires a verified Access token and an active database user.

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

### Contributors

In **Our people**, enter a friend’s name, email, bio, and optional HTTPS portfolio URL. Add the same email to the Cloudflare Access allow-list. Share `https://vanityvair.com/editor`; they enter their email, receive a code, and start writing. Inviting a person in this app does not send a separate invitation email or modify Cloudflare policies automatically.

To update a contributor’s byline, enter their existing email and updated details in the same form. **Remove editor access** deactivates them immediately in the app; also remove them from Access. Their public stories remain attributed. There is one owner; its initial account is created during production setup. The owner account cannot be deactivated through this UI.

### Ads

Open **Ads** in the owner’s writing desk (`/editor?tab=ads`). Upload a complete image, choose **Banner (8:1)** or **Poster (2:3)**, adjust the crop, enter an image description and an optional HTTPS or site link, then save. Recommended sizes are 1600 × 200 and 800 × 1200. All lettering and logos belong in the image itself. The uploader compresses the cropped image to at most 500 KB; the server checks file size, image dimensions, and shape too. Originals never upload.

Use the shape filters to browse the library. **Edit** replaces artwork or changes its link; **Pause / Activate** controls the rotation. **Delete** removes the rotation entry. Its image remains in the shared Photo library for reuse; remove it there when no story or ad references it. This also releases its storage allocation. Failed saves keep the form and uploaded image available for retry, and leaving an unsaved form prompts before discarding changes.

The homepage has two banner placements and a poster beside its latest stories. Article pages have a poster beside the body on wide screens, plus a banner after the story. Archive, category, and contributor pages have one bottom banner. Posters are hidden on phones. There are no floating placements, timers, or tracking scripts.

Each public page request advances a first-party session counter (`vv-edition`), independently selecting from active banners and posters. It holds no visitor identifier. Refreshing advances to the next artwork; singleton rotations repeat and empty placements disappear. Cookies must be allowed for the counter to persist. Only the selected images appear in the HTML. Images use ordinary same-origin `/media/UUID` URLs, without advertising metadata or an ad network. Blocker-specific filtering can still hide ordinary images; display cannot be guaranteed for every blocker.

After local migration and the normal demo seed, run `npm run db:seed:ads` to add four sample image files to local D1/R2. This preserves existing owner-uploaded artwork and never targets remote data. The sample businesses are fictional. Apply migration `0003_image_promotions.sql` to staging/production before deploying this version; older text-only cards stay in the dashboard but need artwork before appearing publicly.

### Photos and storage

Supported browser photos are converted to WebP (JPEG fallback), resized to at most 2,048 pixels on the long edge, then repeatedly adjusted until **500,000 bytes or less**. Only the resulting web photo uploads; original files and location metadata are not copied to R2. Transparent images are flattened onto white. JPEG, PNG and WebP work; HEIC/HEIF depends on browser decoding and otherwise gets a clear JPEG-export message. Raw files, GIF animation, and video uploads are excluded. Input files over 40 MB or 100 million pixels are rejected to protect phone memory.

The server independently bounds the request size, checks JPEG/WebP signatures, authorizes media references, and stores media in a private bucket. Draft photos require the uploader or owner. Public access is allowed only while a published article or active promotion references the image. Media responses are private/no-store so unpublishing revokes subsequent access; someone who already downloaded an image still has that copy.

**Photo library** shows usage. A database trigger stops new uploads at **7 GB** across the site; the meter warns before that. The owner can remove unused web photos after confirmation. Images referenced by a draft, published story, or promotion cannot be deleted. Keep photographic originals elsewhere.

## Separate Cloudflare environments

Nothing has been deployed to Cloudflare. Development data persists in `.wrangler/state`; staging and production have independent D1/R2 bindings in `wrangler.jsonc`. The deployment scripts intentionally refuse to run with placeholder database IDs, missing Access settings, or an unconfigured production hostname.

After visual approval:

1. Authenticate Wrangler with the owner’s Cloudflare account. Keep Workers on its **Free** plan. Enable R2 **Standard** storage and Zero Trust **Free** as appropriate for the account. Check the current plan/seat allowances before enabling services.
2. Create `vanity-vair-staging` and `vanity-vair-production` D1 databases, and matching private `vanity-vair-staging-media` / `vanity-vair-production-media` R2 buckets. Replace only the matching environment’s database ID in `wrangler.jsonc`. Do not enable `r2.dev` access or attach a public bucket custom domain.
3. Create a Cloudflare Access application on each deployed hostname for `/editor*`, `/api/*`, and `/preview/*`. Enable **One-time PIN** and restrict its Allow policy to specific invited emails. For staging, protect the whole hostname if the preview should be private. Fill `ACCESS_TEAM_DOMAIN` (e.g. `your-team.cloudflareaccess.com`) and the application audience `ACCESS_AUD` for that environment. A real email-code test is required before launch.
4. Apply migrations to each remote database explicitly. Example for staging:

   ```sh
   npx wrangler d1 migrations apply DB --env staging --remote
   ```

5. Add the real owner to `users` in that database, using Cloudflare’s D1 console or a securely prepared SQL file. Required fields are `email`, `name`, `role='owner'`, `slug`, and `active=1`; bio/link may be empty. The email must match the Access identity. **Never seed the local sample accounts into production.**
6. Run `npm run deploy:staging`. Verify the sign-in flow with the real invited email; check that an uninvited user cannot reach the editor, APIs, private previews, or draft media. A forged JWT and the local-preview cookie must fail on the built deployment.
7. After approval, add `routes: [{ "pattern": "vanityvair.com", "custom_domain": true }]` inside `env.production`. Keep `workers_dev=false`, disable unauthenticated preview hostnames, then run `npm run deploy:production`. Verify HTTPS and decide on `www` redirect in Cloudflare. Existing mail/DNS records should be preserved.

The Worker independently verifies JWT signature, issuer, audience, expiry, and active database membership. The API enforces roles/ownership, checks write-request Origin, sanitizes body HTML, validates links, and performs parameterized SQL writes. Do not rely solely on Access protecting the editor’s HTML page: protect the API and preview paths too.

## Costs and limits

Target: **$0 monthly service cost at small publication scale**, plus the domain. This is not a contractual zero-bill guarantee.

Published Cloudflare allowances checked during implementation:

- [Workers Free](https://developers.cloudflare.com/workers/platform/pricing/): 100,000 dynamic requests/day. Keep the account on Free; exhaustion can interrupt service rather than automatically justify upgrading.
- [D1 Free](https://developers.cloudflare.com/d1/platform/pricing/): 5 million rows read/day, 100,000 rows written/day, 5 GB total storage. Free-tier query exhaustion returns errors until reset.
- [R2 Standard](https://developers.cloudflare.com/r2/pricing/): 10 GB-month storage, 1 million Class A and 10 million Class B operations/month, free egress. R2 usage above included allowances is billable. The 7 GB app limit covers tracked uploads only, not other account buckets, failed-delete orphans, backups, or operation counts.
- [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/) notify; they **do not cap or pause usage**. No R2 account spending hard-stop has been verified. Configure available alerts and review usage before launch. If absolutely no possible overage charge is acceptable, R2 must remain disabled until a hard-stop alternative is selected.

The build uses the passthrough image service; it does not enable Cloudflare Images or a paid image-transformation service. Database usage includes drafts and snapshots; media is not duplicated for publication. Backups need their own storage budget.

## Backup, export, and recovery

Keep source and `package-lock.json` in a private repository. Do not commit `.dev.vars`, `.env`, local database state, exports, tokens, or private drafts.

Export the selected remote database before migrations and periodically after publishing:

```sh
npx wrangler d1 export DB --env production --remote --output /absolute/private/backup/vanity-vair.sql
```

This SQL export includes posts, snapshots, people, promotions, and the media inventory/references. Copy the private R2 objects named by `media.id` to the same private backup location using the R2 dashboard or `wrangler r2 object get vanity-vair-production-media/OBJECT_ID --remote --file /absolute/private/backup/OBJECT_ID`. Verify the downloaded bytes against the inventory. There is no scheduled backup service configured in this first version.

Test a restore into a new staging database/bucket before treating a backup as usable. Import with `wrangler d1 execute ... --file ...`, restore objects under the original IDs, and bind the staging app to those resources. Do not import on top of a running production database. Media IDs and references must stay aligned. Cloudflare D1 Time Travel may provide additional recovery, but should not replace independent exports.

## Verification

```sh
npm run check
npm run build
# In another terminal with the dev server running:
npm run test
```

Vitest covers sanitizer/link validation, categories, author permissions, failing closed on missing/invalid tokens, story lifecycle, stale-save rejection, write-request origin, image limits, draft-media privacy, published-media references, unpublish revocation, category/search pages, and promo rendering. Workflow tests mutate only the local demo environment; use a disposable development database.

The browser review checks desktop and 390px phone layouts plus real editor controls. A 7.3 MB synthetic JPEG was compressed to 493 KB through the actual upload interface. Physical phone/Safari and real Cloudflare OTP testing remain launch checks; viewport emulation does not replace them.
