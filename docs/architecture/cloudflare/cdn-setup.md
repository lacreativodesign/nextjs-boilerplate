# Cloudflare CDN Configuration Runbook

This runbook defines production Cloudflare configuration for static asset delivery, image optimization, and edge caching for the Next.js application.

## 1) Cloudflare Setup

### Account and zone

1. Add the production domain to Cloudflare.
2. Switch nameservers at the registrar to Cloudflare nameservers.
3. Verify zone status is **Active**.

### DNS configuration

Create these records in Cloudflare DNS:

- `A @` -> Vercel edge IP (proxied = ON)
- `CNAME www` -> `<your-vercel-project>.vercel.app` (proxied = ON)
- Any additional subdomains serving frontend traffic should be proxied = ON.
- Keep API/internal-only origins as DNS-only unless edge protection is explicitly required.

### SSL/TLS settings

- Encryption mode: **Full (strict)**
- Always Use HTTPS: **ON**
- Minimum TLS Version: **TLS 1.2** (or TLS 1.3 only if compatible)
- Automatic HTTPS Rewrites: **ON**
- HSTS: enabled after validation window.

## 2) Static Asset Optimization

### Cache behavior

Configure Cloudflare Cache Rules:

1. **Static immutable assets**
   - Match: `http.request.uri.path matches "^/(?:_next/static|.*\\.(?:js|css|png|jpg|jpeg|gif|svg|webp|avif|ico|woff|woff2))$"`
   - Cache eligibility: **Eligible**
   - Browser TTL: **1 year**
   - Edge TTL: **1 month**
   - Origin cache control: **Honor**

2. **Bypass auth and user-specific APIs**
   - Match: `http.request.uri.path starts_with "/api/auth" or http.request.uri.path starts_with "/api/login" or http.request.uri.path starts_with "/api/logout" or http.request.uri.path starts_with "/api/session"`
   - Cache eligibility: **Bypass**

3. **Cache public APIs only**
   - Match: `http.request.uri.path starts_with "/api/public/"`
   - Cache eligibility: **Eligible**
   - Edge TTL: **1 hour**
   - Browser TTL: **5 minutes**
   - Cache key: include query string

### Compression and minification

In Speed -> Optimization:

- Auto Minify: **HTML + CSS + JS = ON**
- Brotli: **ON**

## 3) Image Optimization

### Cloudflare Images delivery

- Store/serve transformed images via Cloudflare Images (`imagedelivery.net`).
- Use variant-based transformations for thumbnails, cards, and detail views.
- Enable format negotiation to deliver **AVIF/WebP** to supported browsers.

### Next.js integration

- `next.config.js` now includes `imagedelivery.net` in allowed image domains and AVIF/WebP output formats.
- For all `<Image />` usage, continue providing explicit `sizes` to keep responsive `srcset` generation optimal.
- Next.js Image uses lazy loading by default when `priority` is not set.

### Image CDN URL pattern

Use Cloudflare Images URL format:

`https://imagedelivery.net/<account_hash>/<image_id>/<variant>`

## 4) Performance Rules

Use Cloudflare Rules to enforce:

- Cache static paths and immutable file extensions.
- Cache only public APIs.
- Bypass cache on auth/session endpoints.
- Edge TTL target: **2592000 seconds (30 days)** for static assets.

## 5) Security Features

### Platform protections

- DDoS protection: automatic (Cloudflare default)
- Bot protection: **Bot Fight Mode ON** (or Super Bot Fight Mode on eligible plan)
- WAF managed rules: **ON** with Cloudflare Managed Ruleset

### Rate limiting rules

Configure rate limits at minimum for:

- `/api/auth/*`
- `/api/login`
- `/api/session*`
- `/api/*` write endpoints (`POST`, `PUT`, `PATCH`, `DELETE`)

Recommended baseline:

- Auth endpoints: 10 requests/min/IP, block 10 min
- Generic API writes: 120 requests/min/IP, challenge or block based on risk profile

## 6) Validation Checklist

- Static assets are served with Cloudflare `cf-cache-status: HIT` after warmup.
- Cache hit rate for static assets > 80%.
- TTFB < 200ms for cached static routes.
- Lighthouse Performance >= 95 on production pages.
- Auth/session APIs return `cf-cache-status: BYPASS`.
