# oauth-exchange worker

A tiny Cloudflare Worker that performs the GitHub OAuth `code -> token` exchange
for the site's "Sign in with GitHub" button (`Common.GH` in `common.js`). It
exists because that one step needs the GitHub App's **client secret**, which
must never ship to the browser. Everything else (reading private-repo commits on
`/commits/`, posting snake high scores) happens in the browser with the
visitor's own user-to-server token.

This Worker is **not** part of the GitHub Pages site and is **not** deployed by
the site's `deploy.yml`. The source here is for the record; it is deployed
separately. `oauth-exchange.ts` is the entry point.

## Live deployment

- Worker URL: `https://oauth-exchange.rjayasin.workers.dev`
- GitHub App client ID (public): `Iv23lixPSQk9WGC2qD8F` (also hardcoded in `common.js`)

## Deploy

Create the project **outside** the site repo so Wrangler never bundles the site
or its `node_modules`:

```bash
npm create cloudflare@latest oauth-exchange   # Hello World -> Worker -> TypeScript
cd oauth-exchange
# copy this repo's worker/oauth-exchange.ts to src/index.ts
```

`wrangler.toml` should be code-only — no `assets`/`[site]` block:

```toml
name = "oauth-exchange"
main = "src/index.ts"
compatibility_date = "2025-06-01"
```

Set the two secrets (from the GitHub App's settings -> "Client secrets") and
deploy:

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler deploy
```

`GITHUB_CLIENT_SECRET` is the **client secret string**, not the App's `.pem`
private key (that key is for app-as-itself auth, which this project does not
use).

## GitHub App settings

- Callback URLs: `https://rjayasin.github.io/snake/` and
  `https://rjayasin.github.io/commits/`
- "Expire user authorization tokens": **off** (so browser tokens don't need
  refreshing)
- Permissions: **Contents: Read & write**, **Metadata: Read-only**
- Installed on the account for **All repositories**

## Sanity check

```bash
# missing code -> 400 + CORS header
curl -i -X POST https://oauth-exchange.rjayasin.workers.dev \
  -H 'Content-Type: application/json' -d '{}'

# CORS preflight -> 200 with access-control-allow-* headers
curl -i -X OPTIONS https://oauth-exchange.rjayasin.workers.dev

# bogus code -> 400 bad_verification_code (proves secrets are wired)
curl -i -X POST https://oauth-exchange.rjayasin.workers.dev \
  -H 'Content-Type: application/json' -d '{"code":"bogus"}'
```
