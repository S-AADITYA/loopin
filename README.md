# Loopin

Consumer social/loyalty app + restaurant ops, in one Next.js codebase backed by Supabase.
Real auth, a real Postgres database, real-time sync, and row-level security — not a mockup.

Three views in one app: **Guest** (discover, check in, earn points, post memories),
**Restaurant** (live order queue, inventory), **Intelligence** (regulars, revenue, low-stock alerts).

---

## 1. Prerequisites

- Node.js 22+
- A free [Supabase](https://supabase.com) account
- A free [Vercel](https://vercel.com) account
- A [GitHub](https://github.com) account (for CI/CD)

## 2. Set up Supabase (your database + auth)

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a name, region, and a strong database password (save it somewhere safe — you won't need it day-to-day, but you'll want it for backups).
2. Once the project is ready, open **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates every table, index, and security policy, and seeds four starter venues.
3. Go to **Authentication → Providers** and make sure **Email** is enabled (it is by default). This app uses passwordless magic-link login.
4. Go to **Project Settings → API** and copy:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3. Run it locally

```bash
npm install
cp .env.example .env.local
# paste your Supabase URL + anon key into .env.local
npm run dev
```

Open `http://localhost:3000`, enter your email, and click the magic link that arrives in your inbox.

### One-time: claim a venue

The seeded venues start with no owner, and the Restaurant and Intelligence views
only show orders and inventory for venues *you* own. Because the venues update
policy is `auth.uid() = owner_id`, an unowned venue can't be claimed from the app
itself — so after your first sign-in, open **SQL Editor** and run
[`supabase/claim-venue.sql`](supabase/claim-venue.sql) (set your email at the top
first). It assigns the venues to you and seeds a starting inventory.

## 4. Deploy to Vercel

**Option A — one-time manual deploy:**
1. Push this folder to a new GitHub repo.
2. On [vercel.com](https://vercel.com), click **Add New → Project**, import the repo.
3. In the import screen, add the two environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) from step 2.4 above.
4. Click **Deploy**. You'll get a live `*.vercel.app` URL.

**Option B — automatic CI/CD (recommended, already wired up):**
The included `.github/workflows/ci-cd.yml` lints, builds, and deploys to Vercel on every push to `main`. To activate it:
1. In your Vercel project, go to **Settings → General** and note the **Project ID** and **Org/Team ID**, and generate a **Personal Access Token** under Account Settings → Tokens.
2. In your GitHub repo, go to **Settings → Secrets and variables → Actions** and add:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID` (the Org/Team ID from step 1)
   - `VERCEL_PROJECT_ID` (the Project ID from step 1)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Push to `main` — GitHub Actions will lint, build, and deploy automatically. Check the **Actions** tab for progress.

A weekly + per-PR dependency security audit (`.github/workflows/security.yml`) runs alongside it.

## 5. How security actually works here

- **No secrets in the client.** The app only ever ships the Supabase *anon* public key to the browser — by design, this key can't read or write anything the database's Row Level Security policies don't explicitly allow.
- **Row Level Security (RLS) on every table**, defined in `supabase/schema.sql`:
  - Guests can only check themselves in and post as themselves — never on someone else's behalf.
  - Orders are visible to the guest who placed them and the owner of that venue only.
  - Inventory is visible and editable only by that venue's owner.
- **Auth is Supabase's managed auth** (magic-link email), not a hand-rolled login system.
- **HTTP security headers** (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, restrictive `Permissions-Policy`) are set in `next.config.js`.
- **`.env.local` is gitignored** — real credentials never get committed.
- **Automated dependency audits** run in CI so known-vulnerable packages get flagged before they ship.

## 6. Project structure

```
app/                Next.js App Router — layout, global styles, main page (3 views)
lib/supabase.ts       Supabase client (browser-safe, anon key only)
supabase/schema.sql   Full DB schema + RLS policies + seed data — run this in Supabase
supabase/claim-venue.sql  One-time: claim venues + seed inventory after first sign-in
.github/workflows/    CI (lint/build) + CD (Vercel deploy) + security audit
.env.example          Copy to .env.local and fill in your project's keys
eslint.config.mjs     ESLint 9 flat config (next/core-web-vitals)
```

## 7. Where to go next

This is a real, working v1 — not the full architecture. When you're ready to grow it:
- Split into microservices behind an event backbone (Kafka) once one service becomes a bottleneck.
- Add a warehouse (ClickHouse) once you want real historical analytics, not just live counts.
- Add an LLM layer (RAG over your own Supabase data) for the "ask your data" owner assistant and AI-personalized guest messaging.
- Move to a proper mobile app (React Native/Expo) once the web version has proven the loop.

