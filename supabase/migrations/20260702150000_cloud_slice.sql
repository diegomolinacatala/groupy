-- Groupy — cloud slice: first UI↔Supabase connection.
--
-- Closes the "known gaps" in CLAUDE.md for the one-project-one-implicit-group
-- slice: enrich `tasks` to carry everything a prototype "module" has, give
-- `groups` the project strengths, make `group_members` claimable (rows exist
-- BEFORE a person has a session — the "who are you?" screen), and add the
-- SECURITY DEFINER RPCs that solve the RLS chicken-and-egg: a user with no
-- membership yet cannot insert groups/group_members under the existing
-- policies, so creation and claiming must run as definer.
--
-- The hard rule is untouched: still NO teacher policy on live work tables.

-- ---------------------------------------------------------------------------
-- 1. Schema enrichment
-- ---------------------------------------------------------------------------

-- Assignment brief + start date. These live on `projects` (teacher-visible)
-- deliberately: they describe the assignment, not the group's live work.
alter table projects
  add column description text not null default '',
  add column start_date  date;

-- Strengths live on `groups`, NOT `projects`: a future real teacher can read
-- their own projects row, and strengths are the group's private self-portrait.
-- jsonb array of strings.
alter table groups
  add column strengths jsonb not null default '[]'::jsonb;

-- Everything a prototype module carries. `checklist` is a jsonb array of
-- {id, text, done} — private to its task, never queried across rows.
-- `assignees` supersedes the single-valued `assignee_member`: the prototype
-- allows several assignees per module. uuid[] (not jsonb) so the report can
-- still do `= any(assignees)` attribution queries.
alter table tasks
  add column type        item_type not null default 'task',
  add column description text not null default '',
  add column due_date    date,
  add column sort_order  int not null default 0,
  add column checklist   jsonb not null default '[]'::jsonb,
  add column assignees   uuid[] not null default '{}';

-- Member rows now exist before a person has a session: the wizard declares the
-- team, each person later claims their row via claim_member(). NULL = declared
-- but unclaimed. unique (group_id, auth_uid) still holds (NULLs never collide).
alter table group_members alter column auth_uid drop not null;

alter table group_members
  add column role      text not null default '',
  add column color_key text not null default '';

-- ---------------------------------------------------------------------------
-- 2. done_at bookkeeping — stamped on the todo→done transition, cleared when a
-- task is reopened, preserved while it stays done. Kept in the DB (not app
-- code) so no client can forge or lose completion timestamps.
-- ---------------------------------------------------------------------------

create or replace function public.tasks_set_done_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.done_at := now();
  elsif new.status <> 'done' then
    new.done_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_set_done_at
  before insert or update of status on tasks
  for each row execute function public.tasks_set_done_at();

-- ---------------------------------------------------------------------------
-- 3. Write policies the dashboard needs (all scoped to own group; teacher
--    still has zero access to live work).
-- ---------------------------------------------------------------------------

-- No real teacher exists in this slice (the anonymous creator's uid holds
-- teacher_id), so participants may edit the shared project meta. The column
-- grants in §4 stop anyone — including the creator — from touching
-- teacher_id / join_code through the API.
create policy projects_member_update on projects
  for update to authenticated
  using (id in (select app.current_project_ids()))
  with check (id in (select app.current_project_ids()));

create policy groups_member_update on groups
  for update to authenticated
  using (id in (select app.current_group_ids()))
  with check (id in (select app.current_group_ids()));

-- Peers may add teammates from the team view — but only UNCLAIMED rows
-- (auth_uid must be null): claiming an identity happens exclusively through
-- claim_member(), so nobody can insert a row pre-bound to someone's uid.
create policy group_members_insert_peer on group_members
  for insert to authenticated
  with check (
    group_id in (select app.current_group_ids())
    and auth_uid is null
  );

create policy group_members_update_peer on group_members
  for update to authenticated
  using (group_id in (select app.current_group_ids()))
  with check (group_id in (select app.current_group_ids()));

create policy group_members_delete_peer on group_members
  for delete to authenticated
  using (group_id in (select app.current_group_ids()));

-- ---------------------------------------------------------------------------
-- 4. Column-level grants — RLS rows say WHO may write, these say WHICH columns.
--    Together: a member can edit profile/meta fields but can never reassign an
--    identity (auth_uid), move rows across groups/projects, or mint join codes.
-- ---------------------------------------------------------------------------

revoke update on table projects from anon, authenticated;
grant  update (title, description, start_date, due_at, status)
  on table projects to authenticated;

revoke update on table groups from anon, authenticated;
grant  update (name, strengths) on table groups to authenticated;

revoke update on table group_members from anon, authenticated;
grant  update (display_name, email, role, color_key, is_coordinator)
  on table group_members to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPCs. SECURITY DEFINER bypasses RLS on purpose; each one authenticates
--    and validates hard because PostgREST exposes them to any session.
-- ---------------------------------------------------------------------------

-- Creates project + implicit group + declared (unclaimed) members + tasks in
-- one transaction. The caller's anonymous uid becomes projects.teacher_id
-- (locked decision: temporary owner, maps onto a real teacher later). Client
-- supplies entity uuids so module→member assignee references survive as-is.
create or replace function public.create_project_with_group(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_title      text := left(trim(coalesce(payload->>'title', '')), 200);
  v_project_id uuid;
  v_group_id   uuid;
  v_join_code  text;
  v_member_ids uuid[];
  m jsonb;
  t jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_title = '' then
    raise exception 'TITLE_REQUIRED';
  end if;
  if jsonb_typeof(payload->'members') is distinct from 'array'
     or jsonb_array_length(payload->'members') < 1
     or jsonb_array_length(payload->'members') > 20 then
    raise exception 'MEMBERS_INVALID';
  end if;
  if jsonb_typeof(payload->'modules') is distinct from 'array'
     or jsonb_array_length(payload->'modules') > 300 then
    raise exception 'MODULES_INVALID';
  end if;

  insert into projects (teacher_id, title, description, start_date, due_at, status)
  values (
    v_uid,
    v_title,
    left(coalesce(payload->>'description', ''), 4000),
    nullif(payload->>'start_date', '')::date,
    nullif(payload->>'due_date', '')::date::timestamptz,
    'active'
  )
  returning id, join_code into v_project_id, v_join_code;

  insert into groups (project_id, name, strengths)
  values (
    v_project_id,
    v_title,
    case when jsonb_typeof(payload->'strengths') = 'array'
         then payload->'strengths' else '[]'::jsonb end
  )
  returning id into v_group_id;

  for m in select * from jsonb_array_elements(payload->'members') loop
    insert into group_members (id, group_id, display_name, email, role, color_key, is_coordinator)
    values (
      coalesce(nullif(m->>'id', '')::uuid, gen_random_uuid()),
      v_group_id,
      left(coalesce(nullif(trim(m->>'name'), ''), 'Miembro'), 100),
      left(coalesce(m->>'email', ''), 200),
      left(coalesce(m->>'role', ''), 100),
      left(coalesce(m->>'color_key', ''), 40),
      coalesce((m->>'is_coordinator')::boolean, false)
    );
  end loop;

  select array_agg(id) into v_member_ids
  from group_members where group_id = v_group_id;

  for t in select * from jsonb_array_elements(payload->'modules') loop
    insert into tasks (id, group_id, title, description, type, status,
                       due_date, sort_order, checklist, assignees)
    values (
      coalesce(nullif(t->>'id', '')::uuid, gen_random_uuid()),
      v_group_id,
      left(coalesce(nullif(trim(t->>'title'), ''), 'Tarea'), 200),
      left(coalesce(t->>'description', ''), 4000),
      coalesce(nullif(t->>'type', ''), 'task')::item_type,
      coalesce(nullif(t->>'status', ''), 'todo')::task_status,
      nullif(t->>'due_date', '')::date,
      coalesce((t->>'sort_order')::int, 0),
      case when jsonb_typeof(t->'checklist') = 'array'
           then t->'checklist' else '[]'::jsonb end,
      -- Assignee ids that don't belong to this group are dropped, not errors:
      -- the RPC runs as definer, so it must never write foreign references.
      (select coalesce(array_agg(a.val::uuid), '{}')
         from jsonb_array_elements_text(
           case when jsonb_typeof(t->'assignees') = 'array'
                then t->'assignees' else '[]'::jsonb end
         ) as a(val)
        where a.val::uuid = any (v_member_ids))
    );
  end loop;

  return jsonb_build_object(
    'project_id', v_project_id,
    'group_id',   v_group_id,
    'join_code',  v_join_code
  );
end;
$$;

-- The "who are you?" preview. Callable by `anon` too: it runs before the
-- visitor has any session. Exposes only what that screen needs — names and
-- claimed flags, never emails, never tasks.
create or replace function public.get_project_by_code(p_code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'project', jsonb_build_object(
      'id',          p.id,
      'title',       p.title,
      'description', p.description,
      'status',      p.status,
      'join_code',   p.join_code
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',             gm.id,
        'display_name',   gm.display_name,
        'role',           gm.role,
        'color_key',      gm.color_key,
        'is_coordinator', gm.is_coordinator,
        'claimed',        gm.auth_uid is not null,
        'is_self',        gm.auth_uid is not distinct from auth.uid()
                          and gm.auth_uid is not null
      ) order by gm.created_at)
      from group_members gm
      join groups g on g.id = gm.group_id
      where g.project_id = p.id
    ), '[]'::jsonb),
    'my_member_id', (
      select gm.id
      from group_members gm
      join groups g on g.id = gm.group_id
      where g.project_id = p.id and gm.auth_uid = auth.uid()
      limit 1
    )
  )
  from projects p
  where p.join_code = upper(trim(p_code));
$$;

-- Binds the caller's (anonymous) uid to a declared member row. Row lock + the
-- unique (group_id, auth_uid) constraint make double-claims race-safe.
create or replace function public.claim_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_row        group_members%rowtype;
  v_project_id uuid;
  v_join_code  text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_row from group_members where id = p_member_id for update;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if v_row.auth_uid = v_uid then
    null;  -- same device re-claiming its own row: idempotent success
  elsif v_row.auth_uid is not null then
    raise exception 'ALREADY_CLAIMED';
  elsif exists (
    select 1 from group_members
    where group_id = v_row.group_id and auth_uid = v_uid
  ) then
    raise exception 'ALREADY_MEMBER';
  else
    update group_members set auth_uid = v_uid where id = p_member_id;
  end if;

  select g.project_id into v_project_id from groups g where g.id = v_row.group_id;
  select p.join_code into v_join_code from projects p where p.id = v_project_id;

  return jsonb_build_object(
    'member_id',  v_row.id,
    'group_id',   v_row.group_id,
    'project_id', v_project_id,
    'join_code',  v_join_code
  );
end;
$$;

-- Function ACLs. Postgres grants EXECUTE to PUBLIC on new functions by
-- default — strip that, then grant deliberately: the preview is the only
-- RPC an unauthenticated visitor may call.
revoke execute on function public.create_project_with_group(jsonb) from public, anon;
revoke execute on function public.get_project_by_code(text)       from public;
revoke execute on function public.claim_member(uuid)               from public, anon;

grant execute on function public.create_project_with_group(jsonb) to authenticated;
grant execute on function public.get_project_by_code(text)        to anon, authenticated;
grant execute on function public.claim_member(uuid)                to authenticated;
