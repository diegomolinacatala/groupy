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

## Current state (updated 2026-07-04 late, friction pass: wizard · identity · tab memory)

Two layers exist side by side:

1. **Local prototype — demo mode, kept (locked decision).** A Spanish, zero-login dashboard
   backed entirely by `localStorage` (`src/lib/data/`, seeded with dummy data; storage key
   bumped to `groupy:project:v2`, local identity in `groupy:me:v1`). Lives at `/dashboard`.
   **Central tabs: Principal (home), Organización, Mapa** — calendar and board are
   secondary ("Más vistas" in the sidebar). "Fortalezas" left the nav (see friction pass).
   **Tab memory** (`dashboard-ui.tsx`, per-scope: `"local"` or `p:<code>`): the active tab
   lives in sessionStorage (`groupy:view:<scope>`) so a **reload stays on the same tab**;
   a localStorage flag (`groupy:visited:<scope>`) makes **Organización the landing only the
   very first time** a project is opened on the device — every return lands on Principal.
   Read via `useSyncExternalStore` (SSR-safe); `viewReady` gates the shell behind
   `LoadingScreen` for the one frame before storage is read.
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
     join-by-code + "volver a «título»" shortcut. The wizard saves behind a full-screen
     `SavingScreen` (spinner + rotating copy, **min 2s**, stays up until the route loads — the
     user asked the loading screen back after "¿Qué hay que hacer?"); create → claim →
     `/p/[code]`; save-locally fallback on error. Topbar shows a copy-link share chip in cloud
     mode.
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
- **Views** (all drag-first, dnd-kit): `PersonalView` = the **Principal** tab, redesigned
  2026-07-04 as the project home: "Hola, {nombre}" greeting + one-line summary + compact
  Entrega card (countdown + time-gone bar); **"Ahora"** — the FIRST available task as a
  hero card (owner-tinted left edge, big Empezar/Marcar hecha button); **"A continuación"**
  — the rest, compact sortable rows (one SortableContext with the hero: drag anything to
  the top to make it the hero); "Bloqueadas" (ghost rows + who/what blocks); dedicated
  empty states (sin tareas → CTA a Organización + quick add; todo hecho). **Right rail**
  (lg+): Tu avance (big %), "Te esperan" (my tasks others wait on → opens the task),
  nueva tarea para mí, ver el mapa, "Repartir n sin asignar". Without an identity (local)
  the view is a one-click `IdentityGate`. `OrganizationView` — "Sin
  asignar" strip (+ a "Reiniciar reparto" button, shown only while something is
  assigned, that returns EVERY task to the strip after a confirm) + one tinted column
  per member; drag to assign (single-owner); chips HUG their text (width = title),
  importance reads as font/padding scale and is **continuous** (1–10, any fraction —
  `clampImportance` no longer rounds), resized from a thickened bottom-RIGHT corner
  handle (a colored "wall", always faintly visible — drag right/down to grow).
  `MapView` (redesigned 2026-07-03) — a centered rail
  of **DIAMONDS**: the "En orden" chain first with → connectors, then a divider and
  the "Independiente" blocks grouped on the other side (never links of the chain);
  connectors fade out while a diamond is being dragged (they don't follow sortable
  transforms). Click = open, drag = reorder (committed against the rail order), drop
  a task on one = move it to that block, dashed diamond = add; exactly ONE block open
  below as a **corkboard** (`Corkboard.tsx`): free Mac-desktop positioning persisted
  as board fractions (`mapX`/`mapY`, null = zig-zag auto-layout in flow order — left,
  indented right, left…; auto slots depend ONLY on the task's index in the block's
  full list + its id, so pinning one task never moves its neighbours), low-opacity
  dot grid that swells while dragging and pulses
  on drop (hidden under `prefers-reduced-motion`), pick-up scale/tilt animation
  (`animate-pick`, also on Personal/Organización overlays). Tasks with a `dueDate`
  get a dashed vertical guide at their center (bottom → top) with name + date on top;
  it follows the task while dragging. Deps are measured-SVG
  arrows dragged from node ports (both directions: right = bloquea a, left = depende
  de) with **magnetic snapping**, valid-target highlighting, invalid dimming, marching
  dashed preview and a flash on connect; click-on-edge × removes. Releasing a
  connection over a node NEVER opens its popup (ports stop click propagation and the
  corkboard swallows the click trailing a port drag for 300ms) — only a plain click
  opens a task. **Everyone can edit everything in the map** (cycles are the only hard
  rule). A "Mis tareas" scope fades other people's tasks to ghosts (local mode asks
  "¿quién eres?" first).
- **Task popup** (`TaskModal.tsx`, replaced the right SlideOver/`ModuleEditor` —
  clicking any task anywhere opens it): the task as a **compact** center card
  (~300px base — it was 430 and ate the row; width still scales with importance,
  title autofocuses when empty so "+ Tarea" is type-and-Enter),
  "Depende de" column on the left, "Bloquea a" on the right (chips navigate the
  graph; the + pickers exclude cycles and render candidates as a loose pile of
  chips — owner tint, importance = size, stable slight rotation, no link icon),
  and below the graph TWO columns: details on the left (estado, fecha, bloque, tipo,
  importancia, responsables, descripción), the **checklist as the protagonist on the
  right** — its own surface card with an n/m counter, progress bar and the add box.
- **Wizard** (4 steps since the friction pass): equipo → plazo → ¿quién eres? → tareas.
  NO title question — projects start as `DEFAULT_PROJECT_TITLE` ("Trabajo en grupo",
  renamed in place from the topbar) — and NO strengths step. "¿Quién eres?" advances on
  the click itself (`onPick` sets selfIndex + step together; a patch-then-next pair would
  read a stale validity check), so that step has no Continue button. Cloud save happens
  behind the full-screen `SavingScreen` (create → claim → `/p/[code]`), landing on
  Organización. `WhoAreYouScreen` is now ONE click: tap your name → claim → "Entrando
  como…" spinner → `router.refresh()` swaps in the dashboard (no strengths step).
- **Cloud persistence of the new model**: a block is stored as a `tasks` row of
  `type='milestone'` (title = name, `sort_order` = order, **mode encoded in
  `description`**); `groups.strengths` jsonb now holds `{ [memberId]: string[] }` (legacy
  array tolerated on read; `setCloudMemberStrengths` merges server-side).
- **Cloud sync of the flow model — CLOSED in code 2026-07-04** (was the KNOWN GAP):
  migration `20260704120000_task_flow_columns.sql` adds `depends_on uuid[]` /
  `block_id uuid` (plain, NO FK — legacy projects synthesize their first block
  client-side) / `importance real` (continuous, check 1–10) / `doc_type` / `map_x` /
  `map_y` to `tasks`, and re-creates `create_project_with_group` to persist them from
  the wizard payload (milestone rows inserted first; refs outside the payload dropped,
  never errors). `mapping.ts` reads/writes all of them (dangling deps/blockIds
  normalized on read), `database.types.ts` hand-updated. Also fixed a **silent
  sync-killer**: `projectModuleSchema.createdAt` needed `z.iso.datetime({ offset:
  true })` — Supabase returns `+00:00` timestamps (not `Z`), so every edit to a
  cloud-LOADED task failed Zod and the mirror dropped it (that's why assignments
  "disappeared on reload"). **Migration pushed and verified behaviorally 2026-07-04**:
  wizard create with the new columns, task upsert with a title edit, and reload-read
  all round-trip against the hosted DB (test projects `R88U2TB` / `4ATLB3S` are junk
  dummy data, safe to delete).

### Friction pass — 2026-07-04 (wizard, users, tab memory)

- **Strengths are OUT of the UI for now** (user call, will return later): wizard step,
  who-are-you step and the "Fortalezas" nav entry are gone. The data model, cloud sync
  (`groups.strengths`, `setCloudMemberStrengths`) and `StrengthsView.tsx` (unrouted)
  stay intact for the re-add.
- **Coordinator is gone from the UI** (no crown in Equipo, no "coordina" copy in the
  wizard; seed/plan write `isCoordinator: false`). The field stays in the model and DB
  rows for compatibility — do not build on it.
- **Identity system**: an `IdentityChip` in the topbar always shows who you are
  (avatar + first name; accent "¿Quién eres?" state when unpicked in local). Its popover
  lists the team with "Tú" marked; **local mode switches identity with one click**
  (demo affordance), **cloud mode is fixed** ("Tu identidad queda vinculada a este
  dispositivo" — `claim_member` refuses a second row per uid) and says so. The chip
  replaced the topbar AvatarStack; "Ver el equipo" lives inside the popover.
- **Type-right-away**: `InlineText` gained `autoFocus` (TaskModal title uses it when the
  title is empty → "+ Tarea" anywhere is click → type → Enter), and `InlineAddTask`
  focuses its input on mount (attribute + effect).
- Verification note: React commits (onBlur/onKeyDown) do NOT fire from synthetic
  `dispatchEvent` in this stack — drive real interactions (preview_fill/click) when
  testing, or you'll chase phantom "sync" bugs.

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
