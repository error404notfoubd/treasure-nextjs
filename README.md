# Treasure Hunt

A single [Next.js](https://nextjs.org/) app that combines a mobile-first **free treasure hunt adventure** on the public marketing site, an **SMS-verified survey** flow backed by [Supabase](https://supabase.com/), and a **role-based admin dashboard** intended to run on a **separate subdomain** (for example `dashboard.example.com`).

---

## Features

| Area | What it does |
|------|----------------|
| **Public game** | `/` — Free-to-play treasure hunt with on-site survey, terms, and privacy pages. |
| **Survey & OTP** | `/api/survey/*` — registration, SMS verification via [Prelude](https://www.prelude.so/), rate limits, session cookies. |
| **Dashboard** | `/login`, `/signup`, `/dashboard/*` — Supabase Auth, `profiles` with roles (owner, admin, editor, viewer), leads, requests, users, audit log, settings. |
| **Security** | Split by surface — see [Security](#security) (dashboard vs public game). |

---

## Requirements

- **Node.js** 20+ (LTS recommended)
- **pnpm** 10+ (`packageManager` is pinned in `package.json`)

---

## Quick start

```bash
cd treasure-nextjs
pnpm install
cp env.local.example .env.local
# Edit .env.local with your Supabase keys and Prelude token.
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the public game.

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server (Turbopack). |
| `pnpm build` | Production build. |
| `pnpm start` | Run the production server (after `build`). |
| `pnpm lint` | ESLint. |

---

## Environment variables

Copy **`env.local.example`** to **`.env.local`** and fill in values. Never commit `.env.local`.

**Supabase**

- `SUPABASE_URL` — Project URL.
- `SUPABASE_SECRET_KEY` — Server-only secret key (service role–equivalent; used by survey APIs and admin data access).
- `SUPABASE_PUBLISHABLE_KEY` — Publishable key for server proxy and server-side auth helpers.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Same project URL and publishable key for the browser (login/signup).

**Dashboard URL (not configurable)**

- The app always uses **`dashboard.`** plus your site host: e.g. `www.example.com` → `https://dashboard.example.com`; `localhost:3000` → `http://dashboard.localhost:3000`. `/login`, `/signup`, and `/dashboard` on the public host redirect there. There are no environment variables to override this.

**Host allowlist (optional)**

- `ALLOWED_DOMAIN` — Single production **apex** (you can paste `https://www.example.com/...`; it normalizes to `example.com`). Allows `Host` and `Origin`/`Referer` hostnames that are exactly that apex, or any **subdomain** of it (`www`, `dashboard`, nested labels, etc.). **HTTP and HTTPS** are both accepted for origins; port does not matter for matching. If unset, production apex is not enforced by this rule.
- `LOCAL_ALLOWED_HOST` — Single local label, usually `localhost`. Allows `localhost`, `*.localhost`, `127.0.0.1`, `[::1]`, any port, http/https. If unset, local is not enforced by this rule.
- If **both** are unset, host/origin enforcement is **off** (open for development). If either is set, every request must match **at least one** of the configured rules.

**Other**

- `PRELUDE_API_TOKEN` — SMS verification.
- Rate limit and OTP tuning — see comments in `env.local.example`.

---

## Security

The same Next.js deployment serves the **public marketing site** (game, terms, privacy, survey) and the **dashboard** on a **`dashboard.*` hostname**. Security controls differ by surface.

### Dashboard

- **Admin APIs are dashboard-only.** Routes such as **`/api/auth/*`** (login, signup, session, password flows), **`/api/users`**, **`/api/responses`**, **`/api/audit`**, and **`/api/dashboard/*`** reject requests unless **`Host` matches a `dashboard.*` hostname**. That limits where dashboard session cookies are useful, even if someone copies a cookie to another origin.
- **CSRF on mutations.** Client-side dashboard code uses **`apiFetch`** with a double-submit CSRF token; mutating dashboard API methods require a valid token.
- **Server-side auth and roles.** **`requireRole`** / **`getSessionUser()`** validate the Supabase session on the server and load **`profiles`** with the service key. Request bodies cannot grant roles or bypass approval checks.
- **Secrets stay server-only.** The **Supabase secret (service) key** is never sent to the browser; the dashboard uses publishable keys only where the Supabase client needs them (e.g. sign-in UI).

### Public game (marketing site)

- **Survey APIs stay on the public host.** **`/api/survey/*`** is intentionally reachable from the marketing origin (by design). Abuse is mitigated with **IP- and route-based rate limits**, validation, and Prelude-backed SMS limits — not by hiding the endpoint.
- **Survey session cookie.** Verify and resend flows use a **signed, HttpOnly** **`survey_session`** cookie (see `env.local.example` for token lifetime). The cookie is scoped to your public site origin.
- **Optional host / origin allowlist.** When **`ALLOWED_DOMAIN`** and/or **`LOCAL_ALLOWED_HOST`** are set, **`proxy.js`** enforces **`Host`** and **`Origin`/`Referer`** against those rules for **all** requests (public and dashboard). When both are unset, enforcement is off for local development.
- **API caching and isolation.** Survey and other **`/api/*`** responses use **`Cache-Control: no-store`** and **`Cross-Origin-Resource-Policy: same-site`** where configured, so responses are not treated as reusable cross-origin resources.

For **database RLS**, **`service_role`**, and table-level access, see **[sql/README.md](./sql/README.md)**.

---

## Dashboard hosting model

- **Production:** Point DNS for `dashboard.<your-domain>` at the same deployment as the public site (derived from the incoming `Host`; `www.` is stripped when building the dashboard hostname).
- **Local:** Open the public site at [http://localhost:3000](http://localhost:3000); the dashboard is at [http://dashboard.localhost:3000](http://dashboard.localhost:3000) (same port).

**Dashboard APIs** (`/api/auth/*`, `/api/users`, `/api/responses`, `/api/audit`, `/api/dashboard/*`) are **rejected unless `Host` is a `dashboard.*` hostname** (e.g. not callable from `www.` / public marketing host), so admin cookies are not useful from the marketing origin. Mutating methods also require the **CSRF** double-submit token. **`/api/survey/*`** stays on the public host — see [Security](#security).

**Server as source of truth:** Role and approval checks use **`requireRole`** → **`getSessionUser()`**, which validates the Supabase session on the server and loads **`profiles`** with the service key; request bodies cannot elevate privileges.

Role definitions and permission helpers live in **`lib/roles.js`**.

---

## Database

Schema, RLS, and helper SQL live under **`sql/`**. See **[sql/README.md](./sql/README.md)** for how to run **`Create_All_tables.sql`** then **`Create_All_functions.sql`**, **`Drop_All.sql`**, and the security model.

---

## Project layout (high level)

```
app/
  (game)/          # Public home, terms, privacy — game global styles
  (dashboard)/     # Login, signup, dashboard pages — Tailwind dashboard UI
  api/             # Survey + dashboard REST handlers
  globals.css      # Game stylesheet
  dashboard-globals.css
components/
  game/            # Public treasure hunt UI (`SlotGame` client component)
  dashboard/       # Sidebar and other dashboard-only components
  …                # Shared: icons, modal, toast, skeleton, LegalPage
lib/
  config/          # GAME_CONFIG — branding, survey fields, UI timing; economy caps live in DB (`app_settings`)
  supabase/        # Service-role client + getAuthAdminClient / getDataClient
  auth/            # Dashboard session (getSessionUser, requireRole), auth route rate limits
  dashboard/       # CSRF apiFetch, dashboard host checks (used by proxy + API routes)
  survey/          # Survey validation, OTP/session cookies, Prelude SMS, tokens
  …                # ip, roles, rateLimit, audit, phoneE164, …
proxy.js           # Allowlist, subdomain routing, CSRF, auth cookies (Next.js 16+ Proxy middleware)
sql/               # Create_All_tables.sql, Create_All_functions.sql, Drop_All.sql, README
```

**Middleware:** This app uses **`proxy.js` only** (export `proxy` + `config`). Do **not** add a root **`middleware.js`** — Next.js will error if both files exist, and tooling that expects `middleware.js` should be pointed at **`proxy.js`** instead.

---

## License

Private project (`"private": true` in `package.json`). Adjust as needed for your distribution.
