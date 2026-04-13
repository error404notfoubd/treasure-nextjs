# Treasure Hunt Slots

A single [Next.js](https://nextjs.org/) app that combines a mobile-first **slot game** (public site), an **SMS-verified survey** flow backed by [Supabase](https://supabase.com/), and a **role-based admin dashboard** intended to run on a **separate subdomain** (for example `dashboard.example.com`).

---

## Features

| Area | What it does |
|------|----------------|
| **Public game** | `/` — Treasure Hunt slot experience with terms and privacy pages. |
| **Survey & OTP** | `/api/survey/*` — registration, SMS verification via [Prelude](https://www.prelude.so/), rate limits, session cookies. |
| **Dashboard** | `/login`, `/signup`, `/dashboard/*` — Supabase Auth, `profiles` with roles (owner, admin, editor, viewer), leads, requests, users, audit log, settings. |
| **Security** | Optional host / origin allowlist; dashboard admin APIs only on `dashboard.*` host; CSRF on mutating dashboard APIs; `no-store` + `Cross-Origin-Resource-Policy: same-site` on `/api/*`; roles enforced server-side via `requireRole` / Supabase `getUser`. |

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

Open [http://localhost:3000](http://localhost:3000) for the slot game.

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

## Dashboard hosting model

- **Production:** Point DNS for `dashboard.<your-domain>` at the same deployment as the public site (derived from the incoming `Host`; `www.` is stripped when building the dashboard hostname).
- **Local:** Open the game at [http://localhost:3000](http://localhost:3000); the dashboard is at [http://dashboard.localhost:3000](http://dashboard.localhost:3000) (same port).

**Dashboard APIs** (`/api/auth/*` except survey, `/api/users`, `/api/responses`, `/api/audit`) are **rejected unless `Host` is a `dashboard.*` hostname** (e.g. not callable from `www.` / game-only host), so admin cookies are not useful from the marketing origin. Mutating methods also require the **CSRF** double-submit token. **Survey** `/api/survey/*` stays on the public host, is rate-limited, and uses a **signed HttpOnly** session for verify/resend — anyone can still POST new survey attempts (by design); abuse is mitigated by limits and validation, not secrecy.

**Server as source of truth:** Role and approval checks use **`requireRole`** → **`getSessionUser()`**, which validates the Supabase session on the server and loads **`profiles`** with the service key; request bodies cannot elevate privileges.

Role definitions and permission helpers live in **`lib/roles.js`**.

---

## Database

Schema, RLS, and helper SQL live under **`sql/`**. See **[sql/README.md](./sql/README.md)** for how to run `Create_All.sql`, teardown scripts, and the security model.

---

## Project layout (high level)

```
app/
  (game)/          # Slot home, terms, privacy — slot global styles
  (dashboard)/     # Login, signup, dashboard pages — Tailwind dashboard UI
  api/             # Survey + dashboard REST handlers
  globals.css      # Game stylesheet
  dashboard-globals.css
components/
  game/            # Slot machine UI (SlotGame)
  dashboard/       # Sidebar and other dashboard-only components
  …                # Shared: icons, modal, toast, skeleton, LegalPage
lib/
  config/          # GAME_CONFIG — credits, payouts, survey limits, auth rate limits, …
  supabase/        # Service-role client + getAuthAdminClient / getDataClient
  auth/            # Dashboard session (getSessionUser, requireRole), auth route rate limits
  dashboard/       # CSRF apiFetch, dashboard host checks (used by proxy + API routes)
  survey/          # Survey validation, OTP/session cookies, Prelude SMS, tokens
  …                # ip, roles, rateLimit, audit, phoneE164, …
proxy.js           # Allowlist, subdomain routing, CSRF, auth cookies (Next.js 16+ Proxy middleware)
sql/               # Postgres / Supabase definitions
```

**Middleware:** This app uses **`proxy.js` only** (export `proxy` + `config`). Do **not** add a root **`middleware.js`** — Next.js will error if both files exist, and tooling that expects `middleware.js` should be pointed at **`proxy.js`** instead.

---

## License

Private project (`"private": true` in `package.json`). Adjust as needed for your distribution.
