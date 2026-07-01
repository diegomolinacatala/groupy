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

### Why Anonymous Auth for students
Students need zero-friction entry (no email/password) but reliable attribution + working RLS.
Supabase Anonymous Auth creates a persistent per-device session; the student only declares
`display_name` + `email` as profile data on their `group_members` row. RLS then works via
`auth.uid()` for both roles — no parallel token system.

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

1. **Bootstrap** — `npm install`, `.env.local`, run dev, read Next 16 internal docs.
2. **Auth** — teacher account + student anonymous auth + join-by-code + `proxy.ts`.
3. **Data** — migrations + RLS (matrix above) + generated TS types. Validate with **dummy data**.
4. **UI shell** — app layout, role-based nav, design tokens, base states.
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
