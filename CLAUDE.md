@AGENTS.md

# Groupy — Project Plan & Working Contract

> This file is the living contract for Groupy. **What is not here, is not built.**
> Source design doc: `GROUPY DESIGN DOCUMENT.docx` (Victor Juan Valencia, Draft v0.1).
> Where this file and the doc disagree, **this file wins** (it reflects locked decisions).

## What we're building

A web tool where a **teacher** creates one **template** for a group project (objectives,
task list, milestones, rubric) and shares a **code**. **Students join without signing up**,
form their own group, and **log their progress task by task** over the weeks. At the end,
Groupy **auto-generates a report** (individual contribution + group work + peer evaluation)
that **only the teacher can see**.

## Why

Teachers have no reliable way to know **who actually did the work** in multi-week group
projects. End-of-project peer surveys are a snapshot, not a record. Groupy gives continuous
free-rider visibility as a **companion artifact** to the real deliverable (it does **not**
replace the submission in v1).

## Locked decisions

| Point | Decision |
|-------|----------|
| Stack | **Next.js 16 + Supabase** (Flutter/FastAPI from doc §11 is discarded) |
| Teacher | **Supabase account** (email) — persists templates and reports |
| Students | **No sign-up** — join via code, identified by Supabase **Anonymous Auth** |
| Peer evaluation | **Core v1**, simple version (score + comment, no complex ranking) |
| Contribution tracking | **Manual** (tasks + check-ins = the GitHub-style lifecycle log) |
| Report delivery | **Web view only** (by link) |
| Hard rule | Teacher **cannot see in-progress work** — only the report after close |
| Target | **Real-class pilot** (gated on the non-engineering prerequisites below) |
| Teacher sign-in | **Email + password** (magic link / Google deferred) |
| Local demo mode | **Kept alongside** the cloud app — the zero-login `localStorage` prototype stays for demos |
| First cloud slice | **Cloud-save + shareable join code** (students anonymous), *before* teacher accounts |

### Why Anonymous Auth for students
Students need zero-friction entry (no email/password) but reliable attribution + working RLS.
Supabase Anonymous Auth creates a persistent per-device session; the student only declares
`display_name` + `email` as profile data on their `group_members` row. RLS then works via
`auth.uid()` for both roles — no parallel token system.

## Current state (updated 2026-07-03, Bloque/Tarea redesign shipped)

Two layers exist side by side:

1. **Local prototype — demo mode, kept (locked decision).** A Spanish, zero-login dashboard
   backed entirely by `localStorage` (`src/lib/data/`, seeded with dummy data; storage key
   bumped to `groupy:project:v2`, local identity in `groupy:me:v1`). Lives at `/dashboard`.
   **Central tabs: Personal, Organización (landing), Mapa** — calendar and board are
   secondary ("Más vistas" in the sidebar).
2. **Cloud slice — LIVE end to end.** Create → share code → anonymous join → shared dashboard:
   - **Migrations pushed** (region `eu-west-1`): `20260702101232_schema_foundation.sql` (9 tables,
     full RLS matrix, `app.*` helpers) + `20260702150000_cloud_slice.sql`. The second one:
     enriches `tasks` (`type`, `description`, `due_date`, `sort_order`, `checklist` jsonb,
     `assignees uuid[]` — prototype allows multiple assignees; `assignee_member` is unused for now);
     puts `strengths` jsonb on **`groups`** (not `projects`, so a future teacher can't see them live);
     adds `projects.description` / `start_date`; makes `group_members.auth_uid` **nullable**
     (declared-but-unclaimed rows for the "who are you?" screen); adds member-scoped write policies
     **plus column-level grants** (nothing can write `auth_uid` / `join_code` / `teacher_id` via the
     API); a `done_at` trigger; and 3 `SECURITY DEFINER` RPCs: `create_project_with_group`,
     `get_project_by_code` (anon-callable preview: names + claimed flags, never emails),
     `claim_member` (binds the caller's anonymous uid to a member row).
   - **Data layer** `src/lib/data/cloud/`: Zod schemas (`schemas.ts`), row↔flat-`Project` mapping
     (`mapping.ts`, one project = one implicit group), Server Functions (`actions.ts`, expected
     errors as return values), server loader (`load.ts`), ordered fire-and-forget mirror
     (`mirror.ts`), `CloudProjectProvider`. `ProjectProvider` accepts an optional `cloud` binding —
     same reducer + UI in both modes; context exposes `mode` and `joinCode`.
   - **Routes/UI**: `/p/[code]` (server component → not-found / who-are-you / dashboard), homepage
     join-by-code + "volver a «título»" shortcut. The wizard saves at the final click (button busy
     state, no themed saving screen — `GeneratingScreen` was deleted) then claims the chosen member
     and pushes their strengths; save-locally fallback on error. Topbar shows a copy-link share chip
     in cloud mode.
   - **RLS validated behaviorally with dummy data**: 37/37 checks across creator / member /
     stranger / no-session (strangers get only the code preview; identities can't be hijacked).
   - **Anonymous sign-ins are enabled** in the hosted dashboard (prerequisite satisfied).
   - `database.types.ts` is still **hand-authored** (regenerating needs `npx supabase login`, or a
     local Docker daemon for `--db-url`); keep it in sync when migrating.

### Bloque/Tarea model — shipped 2026-07-03 (replaces the entrega/hito task-flow)

Tarea ≠ Bloque, everywhere. A **TAREA** (`ProjectModule`) is a small named box, optionally
typed (`docType`: W/PPT/XLS/PDF/</>/IMG letter chips via `DocTypeBadge`) and sized by
`importance` (1–10, edited by resizing — the number never shows). A **BLOQUE**
(`ProjectBlock`, new entity on `Project.blocks`) is a CONTAINER of tasks — never a node,
never drawn like a task. Every task lives in exactly one block (`blockId`, normalized on
load). Milestone/objective module types are gone; per-member `strengths` replaced the
project-level list. Engine: `src/lib/data/flow.ts` (pure), two SEPARATE lock mechanisms:

- **Candado (task→task)** — `dependsOn`; the ONLY thing rendered as a padlock. Cycles
  prevented at edit time (`wouldCreateCycle`). `blockingMembers()` drives the short
  "Diego está bloqueando" notice.
- **Orden de bloques** — each block is "En orden" (`sequence`) or "Independiente"
  (`independent`). A sequence block opens when every earlier sequence block is complete
  (all its tasks done; empty never holds the chain). Drawn as a → connector between
  diamonds — never as a padlock.
- Locks stay **soft** (UI-only guards; the reducer never forbids a status change).
- **Views** (all drag-first, dnd-kit): `PersonalView` — identity picker (local) or claimed
  member (cloud); "Disponibles" (open padlock, advance button, sortable) / "Bloqueadas"
  (closed padlock + who/what blocks); plus a **right rail** (lg+) with Entrega countdown
  + time bar, Tu avance, "Te esperan" (my tasks others wait on → opens the task) and
  quick actions (nueva tarea para mí, ver el mapa). `OrganizationView` (landing) — "Sin
  asignar" strip + one tinted column per member; drag to assign (single-owner); chips
  HUG their text (width = title), importance reads as font/padding scale, resized from
  a thickened bottom-left corner handle (a colored "wall", always faintly visible —
  drag left/down to grow). `MapView` (redesigned 2026-07-03) — a centered rail
  of **DIAMONDS**: the "En orden" chain first with → connectors, then a divider and
  the "Independiente" blocks grouped on the other side (never links of the chain);
  connectors fade out while a diamond is being dragged (they don't follow sortable
  transforms). Click = open, drag = reorder (committed against the rail order), drop
  a task on one = move it to that block, dashed diamond = add; exactly ONE block open
  below as a **corkboard** (`Corkboard.tsx`): free Mac-desktop positioning persisted
  as board fractions (`mapX`/`mapY`, null = zig-zag auto-layout in flow order — left,
  indented right, left…), low-opacity dot grid that swells while dragging and pulses
  on drop (hidden under `prefers-reduced-motion`), pick-up scale/tilt animation
  (`animate-pick`, also on Personal/Organización overlays). Tasks with a `dueDate`
  get a dashed vertical guide at their center (bottom → top) with name + date on top;
  it follows the task while dragging. Deps are measured-SVG
  arrows dragged from node ports (both directions: right = bloquea a, left = depende
  de) with **magnetic snapping**, valid-target highlighting, invalid dimming, marching
  dashed preview and a flash on connect; click-on-edge × removes. **Everyone can edit
  everything in the map** (cycles are the only hard rule). A "Mis tareas" scope fades
  other people's tasks to ghosts (local mode asks "¿quién eres?" first).
- **Task popup** (`TaskModal.tsx`, replaced the right SlideOver/`ModuleEditor` —
  clicking any task anywhere opens it): the task as a BIG center card — the
  protagonist (wide center column, xl title, width still scales with importance),
  "Depende de" column on the left, "Bloquea a" on the right (chips navigate the
  graph; the + pickers exclude cycles and render candidates as a loose pile of
  chips — owner tint, importance = size, stable slight rotation, no link icon),
  remaining options below as secondary (estado, fecha, bloque, tipo, importancia,
  responsables, descripción, checklist).
- **Wizard** (6 steps): título+objetivos → equipo → plazo → ¿quién eres? → tus fortalezas →
  tareas. Continue button carries a ↵ icon (no "o pulsa Enter" copy). Cloud save happens at
  the final click behind the button (create → claim → strengths → `/p/[code]`), landing on
  Organización. `WhoAreYouScreen` gained the personal-strengths step after claiming.
- **Cloud persistence of the new model** (no migration needed yet): a block is stored as a
  `tasks` row of `type='milestone'` (title = name, `sort_order` = order, **mode encoded in
  `description`**); `groups.strengths` jsonb now holds `{ [memberId]: string[] }` (legacy
  array tolerated on read; `setCloudMemberStrengths` merges server-side).
- **KNOWN GAP — cloud sync**: `tasks` still has **no `block_id` / `depends_on` /
  `importance` / `doc_type` / `map_x` / `map_y` columns**. Cloud reads default them
  (every task lands in the first block, corkboard auto-lays out) and edits to them are
  session-only. Next step: migration adding the columns (+ grants in the cloud-slice
  style), regenerate/hand-update `database.types.ts`, then flip `mapping.ts`
  readers/writers (`schemas.ts` already accepts the fields).

## Scope

**In (v1):**
- Teacher template: objectives, task list, milestones, rubric.
- Shareable join code; passwordless student entry.
- Group instance spawned from a template; students **self-organize** into groups.
- Manual tracking: task assignment + status + check-ins (lifecycle log).
- Simple peer evaluation at close.
- Auto-generated final report (individual + group + peer), web view.
- Hard rule: teacher sees the report only, never live work.

**Out (v1) — deferred to stretch:**
- Passive activity capture (doc edit history, file uploads).
- LMS integration (Moodle/PoliformaT, Canvas).
- Anomaly detection / automatic free-rider flagging.
- Password accounts / institutional SSO.
- Replacing the real submission.
- Secondary users (TAs, department admins, accreditation reporting).

## Main flow

```
Teacher creates template → gets share code
  → student joins by code, declares identity (name + email)
    → creates / joins a group
      → group works for weeks (assign tasks, mark status, log check-ins)
        → close: each student peer-evaluates teammates
          → Groupy generates the report
            → teacher opens it (in-progress work stays hidden)
```

## Data model

```
templates        (id, teacher_id→auth.users, title, objectives, rubric)
 └ template_items (id, template_id, type: task|milestone|objective, title, order)
projects          (id, template_id, teacher_id, join_code,
                   status: active|in_review|closed, due_at)
groups            (id, project_id, name, join_code, created_by_member)
 └ group_members  (id, group_id, auth_uid→auth.users(anon), display_name, email, is_coordinator)
tasks             (id, group_id, template_item_id?, title, assignee_member, status, done_at)
activity_log      (id, group_id, actor_member, action, note, created_at)   -- manual check-ins
peer_evaluations  (id, project_id, group_id, rater_member, ratee_member, score, comment)
reports           (id, project_id, group_id, generated_at, payload jsonb)  -- immutable snapshot
```

Teacher identity = `auth.users` (real account). Student identity = `auth.users` anonymous
session, joined to a `group_members` row. Report `payload` is an immutable snapshot at close.

## RLS matrix (enforces the hard rule)

| Table | Student (anon `auth.uid`) | Teacher (`auth.uid`) |
|-------|---------------------------|----------------------|
| templates / template_items | ❌ | ✅ own only |
| projects | ✅ where participating | ✅ own only |
| groups / group_members / tasks / activity_log | ✅ own group | ❌ **never live** |
| peer_evaluations | ✅ writes own | ❌ |
| reports | ✅ own group's | ✅ **only window into the work** |

## Server Actions (Next 16)

`createTemplate` · `createProject` · `joinByCode` · `createGroup` / `joinGroup` ·
`upsertTask` · `logCheckin` · `submitPeerEval` · `closeProject → generateReport` ·
`getReport`

## Success criteria (verifiable)

- Teacher creates a template in **< 5 min**.
- A group logs check-ins/tasks correctly attributed to each member across **≥ 2 distinct sessions**.
- At close, the report attributes each task correctly and includes peer scores.
- Teacher opens the report by link and **cannot access any in-progress data**.
- Flow validated end-to-end with **dummy data** first.

## Engineering roadmap

> Status 2026-07-02 (evening): **1–3 done** — the cloud slice shipped (anonymous auth,
> join-by-code, behavioral RLS validation). **Next:** teacher accounts (email+password) or
> the vertical slices in 5.

1. **Bootstrap** — ✅ Next 16 app, deps, `.env.local`, dev runs.
2. **Auth** — ✅ student **anonymous auth + join-by-code** live (`/p/[code]` claim flow).
   Teacher accounts (email+password) deferred to a later slice.
3. **Data** — ✅ two migrations pushed (schema foundation + cloud slice) + TS types.
   ✅ RLS **validated behaviorally with dummy data** (37 checks: creator/member/stranger/no-session).
4. **UI shell** — app layout, role-based nav, design tokens, base states. *(prototype UI already exists)*
5. **Verticals** — templates · projects/groups · tasks + check-ins · peer-eval.
6. **Dashboard** — teacher (projects + reports) / student (group, tasks, progress).
7. **Report** — individual + group aggregation (web view).
8. **Pilot hardening** — GDPR consent + retention (after ethics green light).

## Pilot prerequisites (non-engineering, run in parallel)

The real-class pilot is **blocked** on these, not on code:
- [ ] Sponsoring professor confirmed (name, course, semester) — doc §9, still open.
- [ ] GDPR consent flow drafted — names/emails/peer scores are personal data (§10).
- [ ] Ethics committee request (peer-ranking of real students) — `comite.etica@upv.es` (§9/§10).
- [ ] EU hosting decision (§10/§11).

Until ethics approval exists, all engineering validation uses **dummy data** — never real
class rosters or real student names.

## Conventions

- **This is not the Next.js you know** — Next 16.2.9 with breaking changes. Read
  `node_modules/next/dist/docs/` before writing routing/auth. The middleware entry point is
  `src/proxy.ts` (a `proxy()` function), not `middleware.ts`.
- Server-first: React Server Components + **Server Actions + Zod** for mutations. Minimal client state.
- Supabase: SQL migrations in `supabase/migrations`, RLS on every table, `supabase gen types` for types.
- Path alias `@/*` → `./src/*`. Tailwind v4, TypeScript strict.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable keys, not legacy anon).
