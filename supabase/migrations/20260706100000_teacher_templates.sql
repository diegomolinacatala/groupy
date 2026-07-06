-- Groupy — teacher templates: the teacher role becomes real.
--
-- A TEMPLATE is a project without members: same `projects` + `tasks` rows
-- (blocks are milestone rows, flow fields included), flagged `is_template`,
-- owned by a REAL (non-anonymous) account. Its join_code is the CLASS code:
-- students enter one code, see the groups already spawned from it, join
-- theirs or create a new one — creating copies the template's tasks into a
-- fresh project whose `template_id` points back at the template.
--
-- This supersedes the unused `templates` / `template_items` tables from the
-- foundation migration (never written by any code path): one model, one
-- editor, one mapping layer.
--
-- ROLES after this migration:
--   Teacher (email+password account, is_anonymous = false)
--     ✅ own templates: full CRUD on the project row + its task rows
--     ✅ sees WHICH groups spawned from their templates + roster
--        (names + claimed flags, via get_teacher_overview — never emails)
--     ❌ live group work (tasks/checklists/statuses/log): NO policy, and
--        claim_member now refuses non-anonymous callers — a signed-in
--        teacher cannot occupy a student seat to peek.
--   Student (anonymous session)
--     ✅ everything inside their own group (unchanged)
--     ✅ template PREVIEW by code (title/dates/task count/groups roster)
--     ❌ template content (the task rows) until they spawn their own copy
--     ❌ creating templates (restrictive policy: is_template needs a real
--        account)

-- ---------------------------------------------------------------------------
-- 1. Retire the unused template tables; templates live in `projects` now.
-- ---------------------------------------------------------------------------

alter table projects drop constraint projects_template_id_fkey;
alter table tasks drop column template_item_id;
drop table template_items;
drop table templates;

alter table projects
  add column is_template boolean not null default false;

-- template_id now points at the template PROJECT the group was spawned from.
-- Deleting a template orphans its groups gracefully (they keep working).
alter table projects
  add constraint projects_template_id_fkey
  foreign key (template_id) references projects (id) on delete set null;

create index projects_template_id_idx on projects (template_id);

-- ---------------------------------------------------------------------------
-- 2. RLS. The teacher edits their template's rows through the SAME table
--    API the dashboard already uses — scoped hard to is_template projects,
--    so these policies grant NOTHING on live group work.
-- ---------------------------------------------------------------------------

-- Group ids of the caller's own templates (empty for anonymous users:
-- templates can only be owned by real accounts, see the restrictive policy).
create or replace function app.my_template_group_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select g.id
  from groups g
  join projects p on p.id = g.project_id
  where p.teacher_id = auth.uid() and p.is_template;
$$;

create policy groups_teacher_template_select on groups
  for select to authenticated
  using (id in (select app.my_template_group_ids()));

create policy tasks_teacher_template_all on tasks
  for all to authenticated
  using (group_id in (select app.my_template_group_ids()))
  with check (group_id in (select app.my_template_group_ids()));

-- Templates require a real account. Restrictive: ANDed with the permissive
-- projects policies, so an anonymous session (the student wizard path) can
-- keep inserting normal projects but can never mint an is_template row.
-- coalesce(…, true): a token without the claim is treated as anonymous.
create policy projects_template_needs_account on projects
  as restrictive for insert to authenticated
  with check (
    not is_template
    or coalesce((auth.jwt()->>'is_anonymous')::boolean, true) = false
  );

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------

-- Blank template: project (is_template) + implicit group + starting block.
-- The teacher renames/fills it in place from the editor, wizard-free.
create or replace function public.create_template()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_project_id uuid;
  v_group_id   uuid;
  v_join_code  text;
begin
  if v_uid is null
     or coalesce((auth.jwt()->>'is_anonymous')::boolean, true) then
    raise exception 'TEACHER_ACCOUNT_REQUIRED';
  end if;

  insert into projects (teacher_id, title, is_template, status)
  values (v_uid, 'Trabajo en grupo', true, 'active')
  returning id, join_code into v_project_id, v_join_code;

  insert into groups (project_id, name)
  values (v_project_id, 'Plantilla')
  returning id into v_group_id;

  -- The starting BLOQUE (a milestone row; description carries the mode),
  -- so the map's "at least one block" invariant holds from the first open.
  insert into tasks (group_id, title, description, type, status, sort_order)
  values (v_group_id, 'General', 'independent', 'milestone', 'todo', 0);

  return jsonb_build_object(
    'project_id', v_project_id,
    'group_id',   v_group_id,
    'join_code',  v_join_code
  );
end;
$$;

-- Spawns a group from a template: copies the assignment (title, brief,
-- dates) and every task/block row — fresh uuids, block/dependency references
-- remapped, statuses and checklist ticks reset, nothing assigned. Members
-- are declared unclaimed (the who-are-you screen binds identities later).
-- Caller may be anonymous — that IS the student. The new project belongs to
-- the template's teacher and points back via template_id.
create or replace function public.create_group_from_template(
  p_code text,
  p_members jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_tpl       projects%rowtype;
  v_tpl_group uuid;
  v_project_id uuid;
  v_group_id   uuid;
  v_join_code  text;
  v_members    jsonb := '[]'::jsonb;
  v_member_id  uuid;
  m jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_tpl
  from projects
  where join_code = upper(trim(p_code)) and is_template;
  if not found then
    raise exception 'TEMPLATE_NOT_FOUND';
  end if;

  if jsonb_typeof(p_members) is distinct from 'array'
     or jsonb_array_length(p_members) < 1
     or jsonb_array_length(p_members) > 20 then
    raise exception 'MEMBERS_INVALID';
  end if;

  select g.id into v_tpl_group
  from groups g
  where g.project_id = v_tpl.id
  order by g.created_at
  limit 1;
  if v_tpl_group is null then
    raise exception 'TEMPLATE_EMPTY';
  end if;

  insert into projects (template_id, teacher_id, title, description,
                        start_date, due_at, status)
  values (v_tpl.id, v_tpl.teacher_id, v_tpl.title, v_tpl.description,
          v_tpl.start_date, v_tpl.due_at, 'active')
  returning id, join_code into v_project_id, v_join_code;

  insert into groups (project_id, name)
  values (v_project_id, v_tpl.title)
  returning id into v_group_id;

  for m in select * from jsonb_array_elements(p_members) loop
    insert into group_members (group_id, display_name, color_key)
    values (
      v_group_id,
      left(coalesce(nullif(trim(m->>'name'), ''), 'Miembro'), 100),
      left(coalesce(m->>'color_key', ''), 40)
    )
    returning id into v_member_id;
    v_members := v_members || jsonb_build_object(
      'id', v_member_id,
      'name', left(coalesce(nullif(trim(m->>'name'), ''), 'Miembro'), 100)
    );
  end loop;

  -- Copy every template row in one statement. The CTE mints one new id per
  -- source row and is referenced three times (rows, deps, block) — volatile
  -- gen_random_uuid() forces materialization, so all three see the SAME map.
  with map as (
    select t.id as old_id, gen_random_uuid() as new_id
    from tasks t
    where t.group_id = v_tpl_group
  )
  insert into tasks (id, group_id, title, description, type, status,
                     due_date, sort_order, checklist, assignees,
                     depends_on, block_id, importance, doc_type, map_x, map_y)
  select
    m2.new_id,
    v_group_id,
    t.title,
    t.description,
    t.type,
    'todo',
    t.due_date,
    t.sort_order,
    -- Checklist steps travel, their ticks don't.
    (select coalesce(jsonb_agg(
       case when jsonb_typeof(item) = 'object'
            then jsonb_set(item, '{done}', 'false'::jsonb)
            else item end), '[]'::jsonb)
     from jsonb_array_elements(t.checklist) item),
    '{}',
    (select coalesce(array_agg(dm.new_id), '{}')
     from unnest(t.depends_on) dep
     join map dm on dm.old_id = dep),
    (select bm.new_id from map bm where bm.old_id = t.block_id),
    t.importance,
    t.doc_type,
    t.map_x,
    t.map_y
  from tasks t
  join map m2 on m2.old_id = t.id
  where t.group_id = v_tpl_group;

  return jsonb_build_object(
    'project_id', v_project_id,
    'group_id',   v_group_id,
    'join_code',  v_join_code,
    'members',    v_members
  );
end;
$$;

-- The teacher's home: their templates + which groups spawned from each,
-- with roster (names + claimed). DELIBERATELY narrow — no emails, no task
-- statuses, no progress: the hard rule ("no live work") in function form.
-- Returns null for anonymous / signed-out callers.
create or replace function public.get_teacher_overview()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when auth.uid() is null
         or coalesce((auth.jwt()->>'is_anonymous')::boolean, true)
    then null
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',          p.id,
        'title',       p.title,
        'description', p.description,
        'join_code',   p.join_code,
        'start_date',  p.start_date,
        'due_date',    p.due_at::date,
        'created_at',  p.created_at,
        'task_count', (
          select count(*)
          from tasks t
          join groups g on g.id = t.group_id
          where g.project_id = p.id and t.type <> 'milestone'
        ),
        'groups', coalesce((
          select jsonb_agg(jsonb_build_object(
            'join_code',  sp.join_code,
            'created_at', sp.created_at,
            'members', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'display_name', gm.display_name,
                'color_key',    gm.color_key,
                'claimed',      gm.auth_uid is not null
              ) order by gm.created_at, gm.id), '[]'::jsonb)
              from group_members gm
              join groups g2 on g2.id = gm.group_id
              where g2.project_id = sp.id
            )
          ) order by sp.created_at desc)
          from projects sp
          where sp.template_id = p.id and not sp.is_template
        ), '[]'::jsonb)
      ) order by p.created_at desc)
      from projects p
      where p.teacher_id = auth.uid() and p.is_template
    ), '[]'::jsonb)
  end;
$$;

-- Code lookup now discriminates: a GROUP code keeps the who-are-you preview,
-- a TEMPLATE (class) code returns the assignment card + spawned groups with
-- roster + where the caller already belongs. Same exposure rules as before:
-- names and claimed flags only — never emails, never task rows.
create or replace function public.get_project_by_code(p_code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p.is_template then jsonb_build_object(
      'kind', 'template',
      'template', jsonb_build_object(
        'id',          p.id,
        'title',       p.title,
        'description', p.description,
        'join_code',   p.join_code,
        'start_date',  p.start_date,
        'due_date',    p.due_at::date,
        'task_count', (
          select count(*)
          from tasks t
          join groups g on g.id = t.group_id
          where g.project_id = p.id and t.type <> 'milestone'
        )
      ),
      'is_owner', p.teacher_id = auth.uid()
        and coalesce((auth.jwt()->>'is_anonymous')::boolean, true) = false,
      'groups', coalesce((
        select jsonb_agg(jsonb_build_object(
          'join_code',  sp.join_code,
          'created_at', sp.created_at,
          'members', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'display_name', gm.display_name,
              'color_key',    gm.color_key,
              'claimed',      gm.auth_uid is not null
            ) order by gm.created_at, gm.id), '[]'::jsonb)
            from group_members gm
            join groups g2 on g2.id = gm.group_id
            where g2.project_id = sp.id
          )
        ) order by sp.created_at)
        from projects sp
        where sp.template_id = p.id and not sp.is_template
      ), '[]'::jsonb),
      'my_group_code', (
        select sp.join_code
        from projects sp
        join groups g3 on g3.project_id = sp.id
        join group_members gm2 on gm2.group_id = g3.id
        where sp.template_id = p.id
          and not sp.is_template
          and gm2.auth_uid = auth.uid()
        order by gm2.created_at desc
        limit 1
      )
    )
    else jsonb_build_object(
      'kind', 'group',
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
  end
  from projects p
  where p.join_code = upper(trim(p_code));
$$;

-- claim_member: unchanged mechanics + ONE new guard — non-anonymous callers
-- are refused. A student seat binds an anonymous device; a signed-in teacher
-- claiming one would grant them member-level reads over live work, so the
-- hard rule now holds against the teacher's own curiosity too.
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
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, true) = false then
    raise exception 'TEACHER_CANNOT_CLAIM';
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

-- ---------------------------------------------------------------------------
-- 4. Function ACLs — strip the default PUBLIC execute, grant deliberately.
--    (create_group_from_template runs under the caller's fresh anonymous
--    session, so `authenticated` is the right audience for it too.)
-- ---------------------------------------------------------------------------

revoke execute on function public.create_template()                          from public, anon;
revoke execute on function public.create_group_from_template(text, jsonb)    from public, anon;
revoke execute on function public.get_teacher_overview()                     from public, anon;

grant execute on function public.create_template()                       to authenticated;
grant execute on function public.create_group_from_template(text, jsonb) to authenticated;
grant execute on function public.get_teacher_overview()                  to authenticated;
