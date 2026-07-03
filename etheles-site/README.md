# ETHELES STUDIO — company site

One-page static site for the studio (matches the in-game intro branding:
hex emblem, green/white chancery wordmark on deep navy).

`index.html` is fully self-contained (inline CSS, SVG emblem, Google Fonts).

## Deploy (separate Netlify site)

1. Netlify → **Add new site → Import from Git** → pick this repo.
2. **Base directory:** `etheles-site` · **Publish directory:** `etheles-site`
   · Build command: *(leave empty)*.
3. Deploy — done. Preview it on the `*.netlify.app` URL first.

## Attach the domain (once etheles.studio is registered)

1. Register `etheles.studio` in Cloudflare → Domain Registration.
2. Netlify site → Domain management → Add custom domain → `etheles.studio`.
3. In Cloudflare DNS add the records Netlify shows (apex `A` / `www` CNAME)
   — set them to **DNS-only** (grey cloud), same rule as `api.gridclanpuzzle.win`.
4. Netlify provisions HTTPS automatically.

## Company email

Cloudflare → Email Routing on `etheles.studio` → route
`hello@etheles.studio` → your Gmail (free). Update the site if the
address ever changes.
