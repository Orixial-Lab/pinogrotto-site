# PinoGrotto website

The public site for pinogrotto.com and the private Steward desk, hosted on Cloudflare Pages.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| `public/index.html` | the whole site | Allocations, The Cape, Provenance, Find your match, Trade desk, Request an introduction, Steward desk |
| `public/pg-backend.js` | browser | Connects the page to the backend: live ledger, saved requests, passports, wine matches, desk data, downloads |
| `functions/api/[[path]].js` | Cloudflare | Every `/api/*` route, the D1 database, Steward sign-in checks, emails, AI matches, rate limits |
| `public/steward/` | browser | Sign-in landing page. Cloudflare Access guards it, then it opens the desk |
| `public/_headers` | Cloudflare | Security headers |
| `robots.txt`, `sitemap.xml`, `llms.txt` | domain root | For search engines and AI assistants |

### Who can do what

- **Anyone:** read the allocation ledger (name, vintage, estate number, region, cases made and placed only), look up one Bottle Passport by its case code, send an introduction request (6 per hour per visitor), ask for a wine match (20 per hour per visitor).
- **A signed-in Steward:** everything in the desk. Sign-in is handled by Cloudflare Access in front of `/steward` and `/api/admin/*`, and the function checks every Access token again itself (signature, audience, issuer, expiry and, optionally, an email allow-list). If Access isn't set up, the desk stays locked.

### Settings (Cloudflare dashboard, Pages project, Settings)

| Name | Kind | Value |
|---|---|---|
| `DB` | D1 binding | the `pinogrotto` database |
| `AI` | Workers AI binding | for Find your match |
| `ACCESS_TEAM_DOMAIN` | variable | e.g. `pinogrotto.cloudflareaccess.com` |
| `ACCESS_AUD` | variable | the Access application's Audience (AUD) tag |
| `EDITOR_EMAILS` | variable, optional | comma-separated Steward emails |
| `NOTIFY_EMAIL` | variable | where new requests are emailed |
| `RESEND_API_KEY` | secret, optional | from resend.com; without it, requests still save to the desk |
| `MAIL_FROM` | variable, optional | defaults to `PinoGrotto website <website@pinogrotto.com>` |
| `AI_MODEL` | variable, optional | defaults to `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |

The database tables are created automatically on the first request.

## Working on it locally

Needs Node 22 or newer. No install step.

```sh
tools/start.sh /tmp/pg.sqlite     # site + backend on http://localhost:8788, signed in as a test Steward
tools/seed.sh                     # optional sample wines and one passport (case PG-26ABCD-01)
node tools/test-access.mjs        # checks the Steward sign-in verification against forged tokens
```

The local server emulates D1 on SQLite and stubs the AI. Pushing to the `main` branch publishes the site.
