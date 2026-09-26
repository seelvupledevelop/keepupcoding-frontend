# KeepUpCoding — Frontend

The public KeepUpCoding site (Soft-UI storefront) as a **standalone,
frontend-only repository**: static HTML/CSS/JS with no build step, served by
nginx and published through Caddy with automatic HTTPS on a single VPS.

This repo is intentionally frontend-only. The API, database, payment rails,
and LiteLLM gateway live in the separate `keepupcoding-ui` repository and are
deployed independently.

## Repository layout

| Path | Contents |
| --- | --- |
| `index.html` | Single-page shell (hash router, Soft UI, GDPR banner, SEO/JSON-LD) |
| `css/` · `js/` | Styles and application logic (vanilla, no build step) |
| `img/` | Logos and images |
| `locales/` | UI translations (en/ru/uk/zh-CN + more) |
| `robots.txt` · `sitemap.xml` | SEO — replace placeholder domains before go-live |
| `Dockerfile` + `nginx-frontend.conf` | Static container (nginx :8088) |
| `compose.yaml` + `Caddyfile` | Public stack: Caddy (80/443, auto-TLS) → nginx |
| `scripts/deploy.sh` | Idempotent deploy/update on the VPS |

## Deploy to a VPS (Docker)

```bash
# 1. Get the code on the VPS
git clone git@github.com:seelvupledevelop/keepupcoding-frontend.git
cd keepupcoding-frontend

# 2. Configure the domain
cp .env.example .env
nano .env                     # APP_DOMAIN + ACME_EMAIL (real values)

# 3. DNS: point APP_DOMAIN's A/AAAA record at this VPS, then:
./scripts/deploy.sh
```

Caddy obtains the Let's Encrypt certificate automatically on first request;
the script polls until the site answers `200` over HTTPS.

### Pointing the site at a separately hosted API

The shell reads `window.KEEPUP_API_BASE`. By default it is same-origin
(`''`). To target an API on another origin, edit the marked config line at
the bottom of `index.html`:

```html
<script>window.KEEPUP_API_BASE = 'https://api.example.com';</script>
```

The API deployment must list this site's origin in its `CORS_ORIGINS`.

## Updating

```bash
git pull
./scripts/deploy.sh
```

## Notes

- Only Caddy exposes ports 80/443; nginx is not published.
- Static assets are cached 1 h; the HTML shell is always `no-store`.
- Keep `.env` out of git and Docker (both are pre-configured to exclude it).
- `sitemap.xml` / `robots.txt` / `index.html` canonical tags still contain
  `app.example.com` placeholders — replace them with the real domain when it
  is chosen.
