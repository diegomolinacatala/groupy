-- Groupy — realtime sync: live multi-user dashboards.
--
-- 1. Publication: postgres_changes on the four tables the dashboard renders.
--    RLS keeps the hard rule intact — realtime delivers INSERT/UPDATE events
--    only when the subscriber's SELECT policy passes, so a teacher still
--    receives NOTHING from live work tables (they have no SELECT policy
--    there) and strangers receive nothing at all. DELETE events are the
--    exception (once the row is gone only its primary key is known): they
--    carry just `id`, which leaks nothing readable.
--
-- 2. tasks.last_origin — echo suppression for the editing tab. Every client
--    write stamps the writer's EPHEMERAL tab id (a uuid minted per mounted
--    dashboard); subscribers drop task events originating from their own tab
--    because their reducer already applied that edit optimistically. NOT an
--    audit field: overwritten on every write, meaningless across sessions.
--    `tasks` keeps table-level write grants (unlike projects/groups), so the
--    new column needs no extra grant.

alter table tasks
  add column last_origin uuid;

-- Hosted projects ship with an empty `supabase_realtime` publication, but
-- create it defensively — the migration must also work on a fresh local db.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

alter publication supabase_realtime
  add table tasks, group_members, groups, projects;
