# Handoff prompt — first cloud slice (copy into a new Claude Code chat)

---

We're building **Groupy** (Next.js 16 + Supabase). Please read `CLAUDE.md` first — especially the
**"Current state (updated 2026-07-02)"** and **"Known gaps to resolve when connecting"** sections.
That's the source of truth for what's already done.

**Where we are:** the Supabase database is live (schema + RLS pushed to the remote project). The app,
however, still runs 100% on `localStorage` and does not touch Supabase yet. Your job is to wire up the
**first cloud slice**.

## Goal of this slice

Make a project **save to Supabase and be shareable by a code/link**, with people identified via
**anonymous auth** (no signup). **Do NOT build teacher accounts yet** — that's a later slice.

Concretely, the end-to-end demo I want to work:

1. From the existing setup flow, a user creates a project → it's saved to Supabase → they get a short
   **share code** (e.g. `AF3322F`) and a link like `/p/AF3322F`.
2. Someone else opens `/p/AF3322F` (or types the code into a box on the homepage) → sees a
   **"who are you?" screen** → picks themselves from the member list (or adds themselves) → lands on the
   dashboard, now reading/writing the **cloud** project.
3. Edits (tasks, members, statuses) **persist to Supabase** and show up when the link is reopened on
   another device.

## Decisions already locked (don't re-ask these)

- **First slice = cloud-save + shareable code only.** No teacher login in this slice.
- **Students/creators are anonymous** (Supabase Anonymous Auth). The anonymous **creator's `auth.uid`
  fills `projects.teacher_id`** as the temporary owner (maps to a real teacher later).
- **Keep the local `localStorage` demo mode alongside** the cloud version — don't delete it. The existing
  zero-login dashboard stays as a "demo mode"; the cloud version is a parallel path.
- Teacher sign-in, when built later, will be **email + password**.

## Known gaps you must handle (details in CLAUDE.md)

- **One project = one implicit group** for now (prototype is flat; DB is normalized
  `projects → groups → group_members / tasks`). Map members → `group_members`, modules → `tasks`.
- **`tasks` is thinner than the prototype's `modules`** — you'll need a **follow-up migration** to add
  `type`, `due_date`, `description`, `sort_order`, plus a decision on storing `checklist` and project
  `strengths`. Write it as a new file in `supabase/migrations/` (don't edit the existing migration).
- **Enable Anonymous sign-ins** in the Supabase dashboard (Auth → Providers) — prerequisite. Remind me
  to toggle this; you can't do it from code.
- **Joining by code needs a `SECURITY DEFINER` RPC** (`join_by_code`), because a student isn't a
  participant yet when they first resolve the code, so normal RLS SELECT won't let them read the project.

## Before you write code, confirm these specifics with me

1. **Route shape** — `/p/[code]` for the cloud project, and keep `/dashboard` as the local demo? Or a
   different split (e.g. `/demo` vs `/p/[code]`)?
2. **Checklist + strengths storage** — jsonb columns on the row, or separate child tables?
3. **Where "create cloud project" lives** — reuse the existing setup wizard, or a separate "create &
   share" action?
4. **Group creation** — for this slice, auto-create the single implicit group on project creation
   (recommended), or expose groups in the UI?

## Constraints (from CLAUDE.md / house rules)

- **This is Next.js 16, not the version you know.** Read `node_modules/next/dist/docs/` before writing
  routing/auth. Middleware entry point is `src/proxy.ts` (a `proxy()` function), not `middleware.ts`.
- Server-first: **Server Actions + Zod** for mutations; minimal client state.
- All data access goes through the store layer (`src/lib/data/`) — add a Supabase-backed implementation,
  don't scatter `supabase.from(...)` calls across components.
- RLS on every table; **validate the "teacher never sees live work" rule behaviorally with dummy data**
  before trusting it.
- Path alias `@/*` → `./src/*`. Tailwind v4. TypeScript strict.
- Migrations: new files in `supabase/migrations`; push with
  `npx supabase db push --db-url "postgresql://postgres.<ref>:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"`
  (direct `db.<ref>.supabase.co` host is IPv6-only; use the pooler). Ask me for the DB password when needed.
- After schema changes, regenerate types: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
  (needs `npx supabase login` first).

Start by confirming the 4 specifics above, then propose a short plan before coding.
