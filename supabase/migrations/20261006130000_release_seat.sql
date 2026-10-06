-- Groupy — changing devices: free a claimed seat so it can be claimed again.
--
-- A seat (group_members.auth_uid) binds ONE device's anonymous session. A
-- student who opens the project on another phone or laptop finds their name
-- marked "Ya dentro" and, until now, had no way back in.
--
-- release_member lets anyone already INSIDE the group — a teammate, or the
-- student themselves from the old device — clear a seat; the student then
-- taps their name on the new device (claim_member, unchanged). Outsiders who
-- merely hold the code still cannot take a claimed seat, and a signed-in
-- teacher can never be inside a group (claim_member refuses them), so they
-- can't release seats either.

create or replace function public.release_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_group uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select group_id into v_group from group_members where id = p_member_id;
  if v_group is null then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if not exists (
    select 1 from group_members
    where group_id = v_group and auth_uid = v_uid
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;

  update group_members set auth_uid = null where id = p_member_id;

  return jsonb_build_object('member_id', p_member_id);
end;
$$;

revoke execute on function public.release_member(uuid) from public, anon;
grant execute on function public.release_member(uuid) to authenticated;
