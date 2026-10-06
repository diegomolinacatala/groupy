-- Groupy — report delivery: a group hands its Informe to the teacher.
--
-- Until now the teacher saw only rosters; the report lived in the students'
-- dashboard (print-to-PDF). This closes the loop without bending the hard
-- rule: the teacher still never reads LIVE work — only a snapshot the group
-- itself decides to deliver, frozen at that moment.
--
-- The snapshot is built HERE, from the rows, never from a client payload: the
-- report claims "generado automáticamente, sin intervención manual sobre los
-- datos", and a SECURITY DEFINER copy of the real rows is what makes that
-- true. The app renders it with the same mapping + report engine as the
-- dashboard (rowsToProject → buildReport).
--
-- Reading needs nothing new: the foundation already has
--   reports_teacher_select  (project_id in the teacher's own projects — every
--                            group spawned from their template carries their
--                            teacher_id)
--   reports_student_select  (the group's own report)
-- and `unique (project_id, group_id)` — so a delivery is an upsert: a group
-- may deliver again (e.g. after fixing something) and the latest one wins.

create or replace function public.submit_group_report(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_member_id uuid;
  v_group     groups%rowtype;
  v_project   projects%rowtype;
  v_at        timestamptz := now();
  v_payload   jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Only a claimed member of THIS group may deliver its report. (A teacher
  -- can never be one: claim_member refuses non-anonymous sessions.)
  select gm.id into v_member_id
  from group_members gm
  where gm.group_id = p_group_id and gm.auth_uid = v_uid
  order by gm.created_at
  limit 1;
  if v_member_id is null then
    raise exception 'NOT_A_MEMBER';
  end if;

  select * into v_group from groups where id = p_group_id;
  select * into v_project from projects where id = v_group.project_id;

  -- Only groups spawned from a class code have a teacher to deliver to.
  -- Wizard projects store their (anonymous) creator in teacher_id, so the
  -- owner must be a REAL account, not merely present.
  if v_project.is_template
     or not exists (
       select 1 from auth.users u
       where u.id = v_project.teacher_id
         and not coalesce(u.is_anonymous, false)
     ) then
    raise exception 'NO_TEACHER';
  end if;

  -- The group's status badge reflects the delivery ("En revisión") — set
  -- before the snapshot so the delivered cover says so too.
  if v_project.status = 'active' then
    update projects set status = 'in_review' where id = v_project.id;
    v_project.status := 'in_review';
  end if;

  v_payload := jsonb_build_object(
    'version',      1,
    'submitted_by', v_member_id,
    'project',      to_jsonb(v_project),
    'group',        to_jsonb(v_group),
    -- auth_uid is a device binding, not report data.
    'members', coalesce((
      select jsonb_agg(to_jsonb(gm) - 'auth_uid' order by gm.created_at, gm.id)
      from group_members gm
      where gm.group_id = p_group_id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.sort_order, t.created_at)
      from tasks t
      where t.group_id = p_group_id
    ), '[]'::jsonb)
  );

  insert into reports (project_id, group_id, generated_at, payload)
  values (v_project.id, p_group_id, v_at, v_payload)
  on conflict (project_id, group_id)
  do update set payload = excluded.payload,
                generated_at = excluded.generated_at;

  return jsonb_build_object('submitted_at', v_at);
end;
$$;

revoke execute on function public.submit_group_report(uuid) from public, anon;
grant execute on function public.submit_group_report(uuid) to authenticated;
