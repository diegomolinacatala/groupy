-- Groupy — task-flow columns: persist the Bloque/Tarea redesign.
--
-- Closes the KNOWN GAP in CLAUDE.md / mapping.ts: `tasks` had no columns for
-- the flow model (dependencies, block membership, importance, doc type, map
-- position), so cloud dashboards silently dropped them on every reload.
--
-- All of these are group-private task data → already covered by the existing
-- `tasks_member_all` policy, and still invisible to teachers (who have no
-- policy on `tasks` at all). No new grants needed: `tasks` keeps table-level
-- write access for members (unlike projects/groups, it has no protected
-- columns).

alter table tasks
  -- Direct task→task prerequisites (the padlock). uuid[] like `assignees`;
  -- arrays can't carry an FK, so dangling ids are tolerated and filtered on
  -- read — exactly the `assignees` contract.
  add column depends_on uuid[] not null default '{}',
  -- The BLOQUE this task lives in: the id of a `type='milestone'` row of the
  -- same group. Plain uuid ON PURPOSE (no FK): legacy projects synthesize
  -- their first block client-side, and the client normalizes unknown ids to
  -- the first block on load.
  add column block_id uuid,
  -- 1–10 and CONTINUOUS (the resize gesture commits fractions) — real, not int.
  add column importance real not null default 5
    check (importance between 1 and 10),
  add column doc_type text
    check (doc_type in ('doc', 'slides', 'sheet', 'pdf', 'code', 'image')),
  -- Free corkboard position as fractions of the board; null = auto-layout.
  add column map_x real check (map_x between 0 and 1),
  add column map_y real check (map_y between 0 and 1);

-- ---------------------------------------------------------------------------
-- create_project_with_group now persists the flow fields the wizard sends.
-- Two passes over payload->'modules': milestone (block) rows first, so task
-- rows can validate their block_id / depends_on against ids that really exist
-- in this payload — the RPC runs as definer and must never write references
-- it did not mint itself.
-- ---------------------------------------------------------------------------

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
  v_block_ids  uuid[] := '{}';
  v_task_ids   uuid[];
  v_row_id     uuid;
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

  -- Task ids declared in the payload: the only ids depends_on may point at.
  select coalesce(array_agg(nullif(value->>'id', '')::uuid), '{}')
    into v_task_ids
  from jsonb_array_elements(payload->'modules')
  where coalesce(nullif(value->>'type', ''), 'task') <> 'milestone'
    and nullif(value->>'id', '') is not null;

  -- Pass 1: BLOQUES (milestone rows). Flow fields don't apply to them.
  for t in
    select value from jsonb_array_elements(payload->'modules')
    where value->>'type' = 'milestone'
  loop
    insert into tasks (id, group_id, title, description, type, status,
                       due_date, sort_order, checklist, assignees)
    values (
      coalesce(nullif(t->>'id', '')::uuid, gen_random_uuid()),
      v_group_id,
      left(coalesce(nullif(trim(t->>'title'), ''), 'Bloque'), 200),
      left(coalesce(t->>'description', ''), 4000),
      'milestone',
      'todo',
      null,
      coalesce((t->>'sort_order')::int, 0),
      '[]'::jsonb,
      '{}'
    )
    returning id into v_row_id;
    v_block_ids := array_append(v_block_ids, v_row_id);
  end loop;

  -- Pass 2: TAREAS. References outside this payload are dropped, not errors.
  for t in
    select value from jsonb_array_elements(payload->'modules')
    where coalesce(nullif(value->>'type', ''), 'task') <> 'milestone'
  loop
    insert into tasks (id, group_id, title, description, type, status,
                       due_date, sort_order, checklist, assignees,
                       depends_on, block_id, importance, doc_type, map_x, map_y)
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
      (select coalesce(array_agg(a.val::uuid), '{}')
         from jsonb_array_elements_text(
           case when jsonb_typeof(t->'assignees') = 'array'
                then t->'assignees' else '[]'::jsonb end
         ) as a(val)
        where a.val::uuid = any (v_member_ids)),
      (select coalesce(array_agg(d.val::uuid), '{}')
         from jsonb_array_elements_text(
           case when jsonb_typeof(t->'depends_on') = 'array'
                then t->'depends_on' else '[]'::jsonb end
         ) as d(val)
        where d.val::uuid = any (v_task_ids)
          and d.val::uuid is distinct from nullif(t->>'id', '')::uuid),
      case when nullif(t->>'block_id', '')::uuid = any (v_block_ids)
           then (t->>'block_id')::uuid else null end,
      least(greatest(coalesce(nullif(t->>'importance', '')::real, 5), 1), 10),
      case when t->>'doc_type' in ('doc', 'slides', 'sheet', 'pdf', 'code', 'image')
           then t->>'doc_type' else null end,
      case when nullif(t->>'map_x', '') is null then null
           else least(greatest((t->>'map_x')::real, 0), 1) end,
      case when nullif(t->>'map_y', '') is null then null
           else least(greatest((t->>'map_y')::real, 0), 1) end
    );
  end loop;

  return jsonb_build_object(
    'project_id', v_project_id,
    'group_id',   v_group_id,
    'join_code',  v_join_code
  );
end;
$$;
