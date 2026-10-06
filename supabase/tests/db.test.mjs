// Groupy database tests — run with `npm run test:db`.
//
// Applies EVERY migration in supabase/migrations to an in-memory Postgres
// (PGlite, no Docker, no hosted project) with minimal Supabase stand-ins
// (auth.users, auth.uid(), auth.jwt(), anon/authenticated roles), then plays
// teacher / students / strangers against the RLS policies and RPCs.
// Run it before `supabase db push`: a failing migration or a broken guard
// shows up here instead of in production.

import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIG = path.join(HERE, '..', 'migrations');

const STUBS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, is_anonymous boolean not null default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra); }
};

await (async () => {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const f of fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(MIG, f), 'utf8').replace(/create extension if not exists pgcrypto;/g, '');
    try { await db.exec(sql); console.log('migrated', f); }
    catch (e) { console.log('MIGRATION FAILED', f, e.message); process.exit(1); }
  }

  const users = {};
  for (const [k, anon] of [['T', false], ['T2', false], ['S1', true], ['S2', true], ['S3', true]]) {
    const r = await db.query('insert into auth.users (email, is_anonymous) values ($1, $2) returning id', [k + '@x.test', anon]);
    users[k] = { id: r.rows[0].id, anon };
  }
  // Run SQL as a user (or as the anon role when who === null).
  const as = async (who, sql, params = []) => {
    await db.exec('reset role');
    if (who === null) {
      await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)");
      await db.exec('set role anon');
    } else {
      const u = users[who];
      await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
        [u.id, JSON.stringify({ sub: u.id, is_anonymous: u.anon })]);
      await db.exec('set role authenticated');
    }
    try { return { rows: (await db.query(sql, params)).rows }; }
    catch (e) { return { error: e.message }; }
    finally { await db.exec('reset role'); }
  };

  // 1. Teacher creates a template, adds two tasks.
  const tpl = (await as('T', 'select public.create_template() as r')).rows[0].r;
  ok('teacher creates template', !!tpl.join_code);
  let r = await as('T', "insert into tasks (group_id, title, type, status, sort_order) values ($1,'Investigar','task','todo',1),($1,'Redactar','task','todo',2) returning id", [tpl.group_id]);
  ok('teacher adds template tasks', r.rows?.length === 2, r.error);

  // 2. Student S1 spawns a group from the class code and claims "Ana".
  r = await as('S1', 'select public.create_group_from_template($1, $2::jsonb) as r',
    [tpl.join_code, JSON.stringify([{ name: 'Ana', color_key: 'indigo' }, { name: 'Beto', color_key: 'teal' }])]);
  ok('student spawns group', !!r.rows?.[0]?.r?.group_id, r.error);
  const spawn = r.rows[0].r;
  r = await as('S1', 'select public.claim_member($1) as r', [spawn.members[0].id]);
  ok('student claims seat', !r.error, r.error);

  // 3. Student works: marks a task done, assigns it.
  r = await as('S1', "update tasks set status='done', assignees=array[$2::uuid] where group_id=$1 and title='Investigar' returning id", [spawn.group_id, spawn.members[0].id]);
  ok('student edits own group task', r.rows?.length === 1, r.error);

  // 4. Before delivery the teacher sees no report and no live tasks.
  r = await as('T', 'select count(*)::int n from reports');
  ok('teacher sees no report before delivery', r.rows?.[0].n === 0, JSON.stringify(r));
  r = await as('T', 'select count(*)::int n from tasks where group_id=$1', [spawn.group_id]);
  ok('teacher cannot read live tasks (hard rule)', r.rows?.[0].n === 0, JSON.stringify(r));

  // 5. Guards.
  r = await as('S2', 'select public.submit_group_report($1)', [spawn.group_id]);
  ok('stranger cannot deliver', /NOT_A_MEMBER/.test(r.error || ''), JSON.stringify(r));
  r = await as('T', 'select public.submit_group_report($1)', [spawn.group_id]);
  ok('teacher cannot deliver', /NOT_A_MEMBER/.test(r.error || ''), JSON.stringify(r));
  r = await as(null, 'select public.submit_group_report($1)', [spawn.group_id]);
  ok('no-session (anon role) cannot call', /permission denied/.test(r.error || ''), JSON.stringify(r));

  // 6. Delivery.
  r = await as('S1', 'select public.submit_group_report($1) as r', [spawn.group_id]);
  ok('member delivers report', !!r.rows?.[0]?.r?.submitted_at, r.error);

  r = await as('T', 'select r.generated_at, r.payload, p.join_code from reports r join projects p on p.id = r.project_id');
  ok('teacher reads delivered report', r.rows?.length === 1, JSON.stringify(r).slice(0, 300));
  const payload = r.rows?.[0]?.payload;
  ok('payload has project/group/members/tasks',
    payload && payload.version === 1 && payload.project?.id && payload.group?.id && payload.members?.length === 2 && payload.tasks?.length >= 3,
    JSON.stringify(payload).slice(0, 200));
  ok('payload strips auth_uid', payload && payload.members.every((m) => !('auth_uid' in m)));
  ok('payload carries the done task', payload && payload.tasks.some((t) => t.title === 'Investigar' && t.status === 'done'));
  ok('teacher maps report to group code', r.rows?.[0]?.join_code === spawn.join_code);

  r = await as('S1', 'select status from projects where id = $1', [spawn.project_id]);
  ok('project status moves to in_review', r.rows?.[0]?.status === 'in_review', JSON.stringify(r));

  r = await as('T', 'select count(*)::int n from tasks where group_id=$1', [spawn.group_id]);
  ok('teacher still cannot read live tasks', r.rows?.[0].n === 0);

  // 7. Visibility of the report row.
  r = await as('S1', 'select count(*)::int n from reports');
  ok('member sees own report row', r.rows?.[0].n === 1, JSON.stringify(r));
  r = await as('S2', 'select count(*)::int n from reports');
  ok('stranger sees no report', r.rows?.[0].n === 0, JSON.stringify(r));
  r = await as('T2', 'select count(*)::int n from reports');
  ok('other teacher sees no report', r.rows?.[0].n === 0, JSON.stringify(r));

  // 8. Re-delivery upserts.
  r = await as('S1', 'select public.submit_group_report($1) as r', [spawn.group_id]);
  ok('re-delivery succeeds', !r.error, r.error);
  r = await as('T', 'select count(*)::int n from reports');
  ok('re-delivery keeps one row', r.rows?.[0].n === 1);

  // 9. Direct writes to reports stay impossible for students.
  r = await as('S1', "insert into reports (project_id, group_id, payload) values ($1,$2,'{}') returning id", [spawn.project_id, spawn.group_id]);
  ok('student cannot insert reports directly', !!r.error, JSON.stringify(r));
  r = await as('S1', "update reports set payload='{}' returning id");
  ok('student cannot tamper with delivered report', r.error ? true : r.rows.length === 0, JSON.stringify(r));

  // 10. Wizard project (no teacher) → NO_TEACHER.
  const wizardPayload = {
    title: 'Solo', description: '', startDate: null, dueDate: null,
    members: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Caro', email: '', role: '', colorKey: 'amber', isCoordinator: false }],
    blocks: [], modules: [],
  };
  r = await as('S3', 'select public.create_project_with_group($1::jsonb) as r', [JSON.stringify(wizardPayload)]);
  ok('wizard project created', !!r.rows?.[0]?.r, r.error);
  const wiz = r.rows?.[0]?.r;
  if (wiz) {
    const g = await db.query('select gm.id, gm.group_id from group_members gm join groups g on g.id=gm.group_id where g.project_id=$1', [wiz.project_id]);
    await as('S3', 'select public.claim_member($1)', [g.rows[0].id]);
    r = await as('S3', 'select public.submit_group_report($1)', [g.rows[0].group_id]);
    ok('wizard project cannot deliver (no teacher)', /NO_TEACHER/.test(r.error || ''), JSON.stringify(r));
  }

  // 11. Changing devices: release_member frees a seat for re-claiming.
  for (const [k, anon] of [['S1b', true]]) {
    const u = await db.query('insert into auth.users (email, is_anonymous) values ($1, $2) returning id', [k + '@x.test', anon]);
    users[k] = { id: u.rows[0].id, anon };
  }
  const ana = spawn.members[0].id;
  const beto = spawn.members[1].id;
  r = await as('S1b', 'select public.claim_member($1)', [ana]);
  ok('second device cannot take a claimed seat', /ALREADY_CLAIMED/.test(r.error || ''), JSON.stringify(r));
  r = await as('S2', 'select public.release_member($1)', [ana]);
  ok('outsider cannot release a seat', /NOT_A_MEMBER/.test(r.error || ''), JSON.stringify(r));
  r = await as('T', 'select public.release_member($1)', [ana]);
  ok('teacher cannot release a seat', /NOT_A_MEMBER/.test(r.error || ''), JSON.stringify(r));
  r = await as(null, 'select public.release_member($1)', [ana]);
  ok('no-session cannot release', /permission denied/.test(r.error || ''), JSON.stringify(r));
  r = await as('S1', 'select public.release_member($1) as r', [ana]);
  ok('member releases own seat', !r.error, r.error);
  r = await as('S1', 'select count(*)::int n from tasks where group_id=$1', [spawn.group_id]);
  ok('released device loses group access', r.rows?.[0].n === 0, JSON.stringify(r));
  r = await as('S1b', 'select public.claim_member($1)', [ana]);
  ok('new device claims the freed seat', !r.error, r.error);
  r = await as('S1b', 'select count(*)::int n from tasks where group_id=$1', [spawn.group_id]);
  ok('new device sees the group work', r.rows?.[0].n >= 3, JSON.stringify(r));
  // A teammate (now S1b as Ana) frees Beto's seat after S3 claims it.
  r = await as('S3', 'select public.claim_member($1)', [beto]);
  ok('teammate claims Beto', !r.error, r.error);
  r = await as('S1b', 'select public.release_member($1)', [beto]);
  ok('teammate can release another seat', !r.error, r.error);
  r = await as('S1b', "select (select auth_uid from group_members where id=$1) is null as freed", [beto]);
  ok('released seat is unclaimed', r.rows?.[0]?.freed === true, JSON.stringify(r));
  r = await as('S1', 'select public.release_member($1)', ['00000000-0000-4000-8000-000000000000']);
  ok('unknown member id is reported', /MEMBER_NOT_FOUND/.test(r.error || ''), JSON.stringify(r));

  // 12. Existing behaviour still intact.
  r = await as('T', 'select public.get_teacher_overview() as r');
  ok('teacher overview still works', Array.isArray(r.rows?.[0]?.r) && r.rows[0].r[0].groups.length === 1, JSON.stringify(r).slice(0, 200));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
