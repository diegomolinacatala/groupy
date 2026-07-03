-- Groupy — schema foundation
--
-- Mirrors the data model + RLS matrix in CLAUDE.md. The load-bearing rule this
-- whole product rests on: the teacher can NEVER read live group work
-- (groups / group_members / tasks / activity_log) — only the immutable report
-- after close. RLS is what enforces that; there is deliberately NO teacher
-- policy on those tables, and RLS default-denies.
--
-- Identity model:
--   • Teacher  = real auth.users account   → owns templates / projects (teacher_id = auth.uid())
--   • Student  = anonymous auth.users session → joined to a group_members row (auth_uid = auth.uid())

-- ---------------------------------------------------------------------------
-- Extensions & helper schema
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Private schema for RLS helper functions. NOT exposed via the API (config.toml
-- only exposes `public`), so these are internal to policies, never REST-callable.
create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type item_type      as enum ('task', 'milestone', 'objective');
create type project_status as enum ('active', 'in_review', 'closed');
create type task_status    as enum ('todo', 'in_progress', 'done');

-- ---------------------------------------------------------------------------
-- Join-code generator: short, human-typable, unambiguous (no 0/O/1/I/L).
-- 31^7 ≈ 27 billion combinations; unique constraints below catch collisions.
-- ---------------------------------------------------------------------------

create or replace function app.gen_join_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
           (floor(random() * 31)::int) + 1, 1),
    ''
  )
  from generate_series(1, 7);
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Teacher's reusable blueprint.
create table templates (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  objectives text not null default '',
  rubric     text not null default '',
  created_at timestamptz not null default now()
);

create table template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates (id) on delete cascade,
  type        item_type not null,
  title       text not null,
  sort_order  int not null default 0
);

-- A project instance spawned from a template; `join_code` is the shareable handle.
create table projects (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid references templates (id) on delete set null,
  teacher_id  uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  join_code   text not null unique default app.gen_join_code(),
  status      project_status not null default 'active',
  due_at      timestamptz,
  created_at  timestamptz not null default now()
);

create table groups (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects (id) on delete cascade,
  name              text not null,
  join_code         text not null unique default app.gen_join_code(),
  created_by_member uuid,  -- FK added after group_members exists (circular ref)
  created_at        timestamptz not null default now()
);

-- A student's identity within a group. auth_uid is their anonymous session.
create table group_members (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references groups (id) on delete cascade,
  auth_uid       uuid not null references auth.users (id) on delete cascade,
  display_name   text not null,
  email          text not null default '',
  is_coordinator boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (group_id, auth_uid)  -- one identity per person per group
);

alter table groups
  add constraint groups_created_by_member_fkey
  foreign key (created_by_member) references group_members (id) on delete set null;

create table tasks (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references groups (id) on delete cascade,
  template_item_id uuid references template_items (id) on delete set null,
  title            text not null,
  assignee_member  uuid references group_members (id) on delete set null,
  status           task_status not null default 'todo',
  done_at          timestamptz,
  created_at       timestamptz not null default now()
);

-- Manual check-ins — the GitHub-style lifecycle log. Append-only.
create table activity_log (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups (id) on delete cascade,
  actor_member uuid not null references group_members (id) on delete cascade,
  action       text not null,
  note         text not null default '',
  created_at   timestamptz not null default now()
);

create table peer_evaluations (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects (id) on delete cascade,
  group_id     uuid not null references groups (id) on delete cascade,
  rater_member uuid not null references group_members (id) on delete cascade,
  ratee_member uuid not null references group_members (id) on delete cascade,
  score        int not null check (score between 1 and 5),
  comment      text not null default '',
  created_at   timestamptz not null default now(),
  unique (rater_member, ratee_member)
);

-- Immutable snapshot generated at close — the teacher's only window into the work.
create table reports (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects (id) on delete cascade,
  group_id     uuid not null references groups (id) on delete cascade,
  generated_at timestamptz not null default now(),
  payload      jsonb not null,
  unique (project_id, group_id)
);

-- ---------------------------------------------------------------------------
-- Indexes for the FK lookups RLS leans on
-- ---------------------------------------------------------------------------

create index template_items_template_id_idx  on template_items (template_id);
create index projects_teacher_id_idx          on projects (teacher_id);
create index groups_project_id_idx            on groups (project_id);
create index group_members_group_id_idx       on group_members (group_id);
create index group_members_auth_uid_idx       on group_members (auth_uid);
create index tasks_group_id_idx               on tasks (group_id);
create index activity_log_group_id_idx        on activity_log (group_id);
create index peer_evaluations_group_id_idx    on peer_evaluations (group_id);
create index reports_project_id_idx           on reports (project_id);

-- ---------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER → bypass RLS, avoiding the classic
-- "policy queries the same table it protects" infinite-recursion trap).
-- ---------------------------------------------------------------------------

-- Group ids the current user participates in.
create or replace function app.current_group_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select group_id from group_members where auth_uid = auth.uid();
$$;

-- Project ids the current user participates in (via any of their groups).
create or replace function app.current_project_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select distinct g.project_id
  from group_members gm
  join groups g on g.id = gm.group_id
  where gm.auth_uid = auth.uid();
$$;

-- group_member ids owned by the current user (their identities across groups).
create or replace function app.current_member_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from group_members where auth_uid = auth.uid();
$$;

grant usage on schema app to authenticated, anon;
grant execute on all functions in schema app to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table (default-deny until a policy grants access)
-- ---------------------------------------------------------------------------

alter table templates        enable row level security;
alter table template_items   enable row level security;
alter table projects         enable row level security;
alter table groups           enable row level security;
alter table group_members    enable row level security;
alter table tasks            enable row level security;
alter table activity_log     enable row level security;
alter table peer_evaluations enable row level security;
alter table reports          enable row level security;

-- ---------------------------------------------------------------------------
-- Policies — mirror the RLS matrix in CLAUDE.md.
--   templates / template_items : student ❌   · teacher ✅ own
--   projects                   : student ✅ participating · teacher ✅ own
--   groups/members/tasks/log   : student ✅ own group · teacher ❌ NEVER live
--   peer_evaluations           : student writes own · teacher ❌
--   reports                    : student ✅ own group's · teacher ✅ own project
-- ---------------------------------------------------------------------------

-- templates — teacher owns, full CRUD. Students have no policy → no access.
create policy templates_teacher_all on templates
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy template_items_teacher_all on template_items
  for all to authenticated
  using (template_id in (select id from templates where teacher_id = auth.uid()))
  with check (template_id in (select id from templates where teacher_id = auth.uid()));

-- projects — teacher CRUD own; student read-only where participating.
create policy projects_teacher_all on projects
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy projects_student_select on projects
  for select to authenticated
  using (id in (select app.current_project_ids()));

-- groups — student sees own; a participant may create a group in their project.
-- NO teacher policy: teacher cannot read live groups.
create policy groups_member_select on groups
  for select to authenticated
  using (id in (select app.current_group_ids()));

create policy groups_member_insert on groups
  for insert to authenticated
  with check (project_id in (select app.current_project_ids()));

-- group_members — sees members of own groups. (Joining itself happens via a
-- SECURITY DEFINER join RPC in the Auth phase; a member may edit their own row.)
create policy group_members_select on group_members
  for select to authenticated
  using (group_id in (select app.current_group_ids()));

create policy group_members_update_own on group_members
  for update to authenticated
  using (auth_uid = auth.uid())
  with check (auth_uid = auth.uid());

-- tasks — full CRUD for participants of the owning group. No teacher policy.
create policy tasks_member_all on tasks
  for all to authenticated
  using (group_id in (select app.current_group_ids()))
  with check (group_id in (select app.current_group_ids()));

-- activity_log — append + read within own group; no update/delete (immutable).
create policy activity_log_member_select on activity_log
  for select to authenticated
  using (group_id in (select app.current_group_ids()));

create policy activity_log_member_insert on activity_log
  for insert to authenticated
  with check (
    group_id in (select app.current_group_ids())
    and actor_member in (select app.current_member_ids())
  );

-- peer_evaluations — a student writes/reads only their own ratings. Teacher ❌.
create policy peer_evaluations_rater_select on peer_evaluations
  for select to authenticated
  using (rater_member in (select app.current_member_ids()));

create policy peer_evaluations_rater_insert on peer_evaluations
  for insert to authenticated
  with check (
    rater_member in (select app.current_member_ids())
    and group_id in (select app.current_group_ids())
  );

-- reports — the one table both roles read: teacher for own projects,
-- student for own group's report. Writes happen via closeProject (service role).
create policy reports_teacher_select on reports
  for select to authenticated
  using (project_id in (select id from projects where teacher_id = auth.uid()));

create policy reports_student_select on reports
  for select to authenticated
  using (group_id in (select app.current_group_ids()));
