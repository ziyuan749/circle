-- circle No-npm MVP schema
-- Safe to run in a fresh Supabase project.
-- If you have important existing data, back it up before running destructive changes.

create extension if not exists pgcrypto;

-- Drop old policies first so repeated runs are easier.
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'tasks', 'groups', 'group_members', 'messages', 'task_submissions', 'promotion_invites', 'profile_endorsements')
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  stage text default '未设置阶段',
  direction text default '未设置方向',
  application_track text default 'Spring Week',
  target_region text default '英国',
  target_role text default 'Investment Banking',
  application_progress text default '材料准备中',
  intensity text default '正常推进',
  bio text default '',
  level int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null default 'General',
  level int not null default 1 check (level between 1 and 5),
  deliverable text not null default '提交一段小组结论、关键假设和下一步行动。',
  format_guide text not null default '建议格式：1. 结论摘要；2. 关键假设；3. 分析过程；4. 风险和下一步。提交链接可以是 Google Doc、Notion、PDF、Slides 或其他可访问材料。',
  score_max int not null default 100 check (score_max between 1 and 1000),
  group_size int not null default 6 check (group_size between 2 and 12),
  duration_days int not null default 7 check (duration_days between 1 and 60),
  status text not null default 'open' check (status in ('draft', 'open', 'closed', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  name text not null,
  circle_type text not null default 'task' check (circle_type in ('task', 'exploration')),
  topic text,
  level int not null default 1,
  max_members int not null default 6 check (max_members between 2 and 20),
  status text not null default 'active' check (status in ('forming', 'active', 'full', 'completed', 'archived', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'host', 'observer', 'admin')),
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique(group_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 5000),
  message_type text not null default 'text' check (message_type in ('text', 'image', 'file')),
  media_url text,
  media_path text,
  media_name text,
  media_mime text,
  media_size int,
  created_at timestamptz not null default now()
);

create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  submission_url text,
  content text not null check (char_length(content) between 20 and 8000),
  score int not null default 0 check (score between 0 and 1000),
  created_at timestamptz not null default now(),
  unique(group_id)
);

create table if not exists public.promotion_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  from_level int not null check (from_level between 1 and 5),
  target_level int not null check (target_level between 1 and 5),
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(inviter_id, invitee_id, target_level, status)
);

create table if not exists public.profile_endorsements (
  id uuid primary key default gen_random_uuid(),
  endorser_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  tag text not null check (char_length(tag) between 2 and 40),
  note text default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique(endorser_id, target_id, tag)
);

alter table public.tasks add column if not exists level int not null default 1 check (level between 1 and 5);
alter table public.tasks add column if not exists deliverable text not null default '提交一段小组结论、关键假设和下一步行动。';
alter table public.tasks add column if not exists format_guide text not null default '建议格式：1. 结论摘要；2. 关键假设；3. 分析过程；4. 风险和下一步。提交链接可以是 Google Doc、Notion、PDF、Slides 或其他可访问材料。';
alter table public.tasks add column if not exists score_max int not null default 100 check (score_max between 1 and 1000);

alter table public.profiles add column if not exists application_track text default 'Spring Week';
alter table public.profiles add column if not exists target_region text default '英国';
alter table public.profiles add column if not exists target_role text default 'Investment Banking';
alter table public.profiles add column if not exists application_progress text default '材料准备中';
alter table public.profiles add column if not exists intensity text default '正常推进';

alter table public.messages add column if not exists message_type text not null default 'text' check (message_type in ('text', 'image', 'file'));
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_name text;
alter table public.messages add column if not exists media_mime text;
alter table public.messages add column if not exists media_size int;

alter table public.task_submissions add column if not exists task_id uuid references public.tasks(id) on delete cascade;
alter table public.task_submissions add column if not exists group_id uuid references public.groups(id) on delete cascade;
alter table public.task_submissions add column if not exists submitted_by uuid references public.profiles(id) on delete cascade;
alter table public.task_submissions add column if not exists title text;
alter table public.task_submissions add column if not exists submission_url text;
alter table public.task_submissions add column if not exists content text;
alter table public.task_submissions add column if not exists score int not null default 0 check (score between 0 and 1000);
alter table public.task_submissions add column if not exists created_at timestamptz not null default now();

alter table public.promotion_invites add column if not exists inviter_id uuid references public.profiles(id) on delete cascade;
alter table public.promotion_invites add column if not exists invitee_id uuid references public.profiles(id) on delete cascade;
alter table public.promotion_invites add column if not exists group_id uuid references public.groups(id) on delete set null;
alter table public.promotion_invites add column if not exists from_level int check (from_level between 1 and 5);
alter table public.promotion_invites add column if not exists target_level int check (target_level between 1 and 5);
alter table public.promotion_invites add column if not exists reason text;
alter table public.promotion_invites add column if not exists status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled'));
alter table public.promotion_invites add column if not exists created_at timestamptz not null default now();
alter table public.promotion_invites add column if not exists resolved_at timestamptz;

alter table public.profile_endorsements add column if not exists endorser_id uuid references public.profiles(id) on delete cascade;
alter table public.profile_endorsements add column if not exists target_id uuid references public.profiles(id) on delete cascade;
alter table public.profile_endorsements add column if not exists tag text;
alter table public.profile_endorsements add column if not exists note text default '';
alter table public.profile_endorsements add column if not exists created_at timestamptz not null default now();

create index if not exists idx_groups_task_id on public.groups(task_id);
create index if not exists idx_groups_type_status on public.groups(circle_type, status);
create index if not exists idx_group_members_user_status on public.group_members(user_id, status);
create index if not exists idx_group_members_group_status on public.group_members(group_id, status);
create index if not exists idx_messages_group_created on public.messages(group_id, created_at);
create index if not exists idx_messages_user_created on public.messages(user_id, created_at desc);
create index if not exists idx_tasks_level_status on public.tasks(level, status);
create index if not exists idx_submissions_task_score on public.task_submissions(task_id, score desc, created_at asc);
create index if not exists idx_submissions_user_created on public.task_submissions(submitted_by, created_at desc);
create index if not exists idx_invites_invitee_status on public.promotion_invites(invitee_id, status, created_at desc);
create unique index if not exists idx_submissions_unique_group on public.task_submissions(group_id);
create unique index if not exists idx_invites_unique_pending on public.promotion_invites(inviter_id, invitee_id, target_level, status);
create index if not exists idx_endorsements_target_created on public.profile_endorsements(target_id, created_at desc);
create unique index if not exists idx_endorsements_unique_tag on public.profile_endorsements(endorser_id, target_id, tag);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  10485760,
  null
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = null;

-- Helper functions. security definer avoids RLS infinite recursion.
create or replace function public.my_level()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.level from public.profiles p where p.id = auth.uid()), 1);
$$;

create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status = 'active'
  );
$$;

create or replace function public.can_view_group(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        g.level <= public.my_level()
        or public.is_group_member(g.id, p_user_id)
      )
  );
$$;

create or replace function public.active_circle_count(p_user_id uuid, p_circle_type text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  where gm.user_id = p_user_id
    and gm.status = 'active'
    and g.circle_type = p_circle_type
    and g.status in ('forming', 'active', 'full');
$$;

create or replace function public.stage_label(p_level int)
returns text
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_level, 1)
    when 1 then 'Starter'
    when 2 then 'Ready'
    when 3 then 'Competitive'
    when 4 then 'Peer Lead'
    when 5 then 'Mentor'
    else 'Starter'
  end;
$$;

create or replace function public.group_active_member_count(p_group_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.status = 'active';
$$;

create or replace function public.join_task_circle(p_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_group_id uuid;
  v_existing_group_id uuid;
  v_count int;
  v_suffix int;
  v_user_level int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id and status = 'open';

  if not found then
    raise exception 'Task not found or not open';
  end if;

  select public.my_level() into v_user_level;
  if v_task.level <> v_user_level then
    raise exception '这个任务属于 % 阶段，你当前是 %，只能加入同阶段任务', public.stage_label(v_task.level), public.stage_label(v_user_level);
  end if;

  -- Already in a circle for this task and level.
  select g.id into v_existing_group_id
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  where gm.user_id = v_user_id
    and gm.status = 'active'
    and g.task_id = p_task_id
    and g.circle_type = 'task'
    and g.level = v_task.level
    and g.status in ('forming', 'active', 'full')
  limit 1;

  if v_existing_group_id is not null then
    return v_existing_group_id;
  end if;

  if public.active_circle_count(v_user_id, 'task') >= 3 then
    raise exception '你最多同时加入 3 个进行中的任务型 Circle';
  end if;

  -- Find a not-full circle at the same task level.
  select g.id into v_group_id
  from public.groups g
  where g.task_id = p_task_id
    and g.circle_type = 'task'
    and g.level = v_task.level
    and g.status in ('forming', 'active')
    and public.group_active_member_count(g.id) < g.max_members
  order by public.group_active_member_count(g.id) desc, g.created_at asc
  limit 1;

  if v_group_id is null then
    select count(*) + 1 into v_suffix
    from public.groups
    where task_id = p_task_id
      and circle_type = 'task'
      and level = v_task.level;

    insert into public.groups (task_id, name, circle_type, topic, level, max_members, status)
    values (
      p_task_id,
      v_task.title || ' · ' || public.stage_label(v_task.level) || ' Circle ' || v_suffix,
      'task',
      v_task.title,
      v_task.level,
      v_task.group_size,
      'active'
    )
    returning id into v_group_id;
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (v_group_id, v_user_id, 'member', 'active')
  on conflict (group_id, user_id)
  do update set status = 'active', left_at = null, joined_at = now();

  select public.group_active_member_count(v_group_id) into v_count;
  if v_count >= (select max_members from public.groups where id = v_group_id) then
    update public.groups set status = 'full' where id = v_group_id;
  end if;

  return v_group_id;
end;
$$;

create or replace function public.join_exploration_circle(p_topic text, p_level int default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_existing_group_id uuid;
  v_count int;
  v_suffix int;
  v_level int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_level := coalesce(p_level, public.my_level());
  if v_level <> public.my_level() then
    raise exception '你只能加入自己当前阶段的聊天 Circle';
  end if;

  -- Only one active exploration circle at a time, across all levels.
  select g.id into v_existing_group_id
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  where gm.user_id = v_user_id
    and gm.status = 'active'
    and g.circle_type = 'exploration'
    and g.status in ('forming', 'active', 'full')
  limit 1;

  if v_existing_group_id is not null then
    return v_existing_group_id;
  end if;

  select g.id into v_group_id
  from public.groups g
  where g.circle_type = 'exploration'
    and g.topic = p_topic
    and g.level = v_level
    and g.status in ('forming', 'active')
    and public.group_active_member_count(g.id) < g.max_members
  order by public.group_active_member_count(g.id) desc, g.created_at asc
  limit 1;

  if v_group_id is null then
    select count(*) + 1 into v_suffix
    from public.groups
    where circle_type = 'exploration'
      and topic = p_topic
      and level = v_level;

    insert into public.groups (name, circle_type, topic, level, max_members, status)
    values (p_topic || ' · ' || public.stage_label(v_level) || ' Circle ' || v_suffix, 'exploration', p_topic, v_level, 6, 'active')
    returning id into v_group_id;
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (v_group_id, v_user_id, 'member', 'active')
  on conflict (group_id, user_id)
  do update set status = 'active', left_at = null, joined_at = now();

  select public.group_active_member_count(v_group_id) into v_count;
  if v_count >= (select max_members from public.groups where id = v_group_id) then
    update public.groups set status = 'full' where id = v_group_id;
  end if;

  return v_group_id;
end;
$$;

create or replace function public.unlock_ready_stage()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_week_start timestamptz := date_trunc('week', now());
  v_sync_weeks int := 0;
  v_current_syncs int := 0;
  v_max_apps int := 0;
  v_max_networking int := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  if coalesce(v_profile.application_track, '') <> 'Summer Internship' then
    raise exception 'Ready 解锁只用于 Summer Internship，Spring Week 暂时不需要细分阶段';
  end if;

  if coalesce(v_profile.level, 1) <> 1 then
    raise exception '你当前已经不是 Starter';
  end if;

  if public.active_circle_count(v_user_id, 'exploration') < 1 then
    raise exception '先加入一个长期聊天 Circle，再解锁 Ready';
  end if;

  if coalesce(v_profile.target_region, '') = ''
    or coalesce(v_profile.target_role, '') = ''
    or coalesce(v_profile.application_progress, '') = ''
    or coalesce(v_profile.intensity, '') = '' then
    raise exception '请先补全申请画像';
  end if;

  select count(distinct date_trunc('week', m.created_at))::int
  into v_sync_weeks
  from public.messages m
  join public.groups g on g.id = m.group_id
  join public.group_members gm on gm.group_id = g.id
    and gm.user_id = v_user_id
    and gm.status = 'active'
  where m.user_id = v_user_id
    and g.circle_type = 'exploration'
    and m.content like '%【周同步】%'
    and m.created_at >= now() - interval '28 days';

  select
    count(*)::int,
    coalesce(max(coalesce(nullif(substring(m.content from '申请[:：][[:space:]]*([0-9]+)'), ''), '0')::int), 0),
    coalesce(max(coalesce(nullif(substring(m.content from 'Networking[:：][[:space:]]*([0-9]+)'), ''), '0')::int), 0)
  into v_current_syncs, v_max_apps, v_max_networking
  from public.messages m
  join public.groups g on g.id = m.group_id
  join public.group_members gm on gm.group_id = g.id
    and gm.user_id = v_user_id
    and gm.status = 'active'
  where m.user_id = v_user_id
    and g.circle_type = 'exploration'
    and m.content like '%【周同步】%'
    and m.created_at >= v_week_start;

  if v_current_syncs < 1 then
    raise exception '本周完成一次周同步后才能解锁 Ready';
  end if;

  if v_sync_weeks < 2 and v_max_apps < 5 and v_max_networking < 3 then
    raise exception '需要连续两周同步，或本周达到 5 个申请 / 3 次 networking 后解锁 Ready';
  end if;

  update public.profiles
  set level = 2,
      updated_at = now()
  where id = v_user_id
    and level = 1;

  update public.group_members gm
  set status = 'left',
      left_at = now()
  from public.groups g
  where g.id = gm.group_id
    and gm.user_id = v_user_id
    and gm.status = 'active'
    and g.circle_type = 'exploration'
    and g.level < 2;

  update public.groups g
  set status = 'active'
  where g.circle_type = 'exploration'
    and g.status = 'full'
    and public.group_active_member_count(g.id) < g.max_members;

  return true;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count int;
  v_max int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.group_members
  set status = 'left', left_at = now()
  where group_id = p_group_id
    and user_id = v_user_id
    and status = 'active';

  select public.group_active_member_count(p_group_id), max_members
  into v_count, v_max
  from public.groups
  where id = p_group_id;

  if v_count < v_max and (select status from public.groups where id = p_group_id) = 'full' then
    update public.groups set status = 'active' where id = p_group_id;
  end if;
end;
$$;

create or replace function public.submit_task_result(
  p_group_id uuid,
  p_title text,
  p_content text,
  p_submission_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_task_id uuid;
  v_level int;
  v_submission_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_group_member(p_group_id, v_user_id) then
    raise exception '只有 Circle 成员可以提交任务结果';
  end if;

  select g.task_id, g.level
  into v_task_id, v_level
  from public.groups g
  where g.id = p_group_id
    and g.circle_type = 'task';

  if v_task_id is null then
    raise exception '这个 Circle 不是任务 Circle';
  end if;

  if v_level <> public.my_level() then
    raise exception '只能提交自己当前阶段的任务';
  end if;

  insert into public.task_submissions (task_id, group_id, submitted_by, title, submission_url, content, score)
  values (v_task_id, p_group_id, v_user_id, p_title, nullif(p_submission_url, ''), p_content, 0)
  on conflict (group_id)
  do update set
    submitted_by = excluded.submitted_by,
    title = excluded.title,
    submission_url = excluded.submission_url,
    content = excluded.content,
    created_at = now()
  returning id into v_submission_id;

  return v_submission_id;
end;
$$;

create or replace function public.invite_to_next_level(
  p_invitee_id uuid,
  p_group_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter_id uuid := auth.uid();
  v_inviter_level int;
  v_invitee_level int;
  v_invite_id uuid;
begin
  if v_inviter_id is null then
    raise exception 'Not authenticated';
  end if;

  select level into v_inviter_level from public.profiles where id = v_inviter_id;
  select level into v_invitee_level from public.profiles where id = p_invitee_id;

  if v_invitee_level is null then
    raise exception 'Invitee not found';
  end if;

  if v_inviter_level <= v_invitee_level then
    raise exception '只有更高阶段用户可以邀请候选人升级';
  end if;

  if v_invitee_level >= 5 then
    raise exception '对方已经在最高阶段';
  end if;

  if not public.can_view_group(p_group_id, v_inviter_id) then
    raise exception '你没有权限基于这个 Circle 发出邀请';
  end if;

  insert into public.promotion_invites (
    inviter_id,
    invitee_id,
    group_id,
    from_level,
    target_level,
    reason,
    status
  )
  values (
    v_inviter_id,
    p_invitee_id,
    p_group_id,
    v_invitee_level,
    v_invitee_level + 1,
    p_reason,
    'pending'
  )
  on conflict (inviter_id, invitee_id, target_level, status)
  do update set reason = excluded.reason, group_id = excluded.group_id, created_at = now()
  returning id into v_invite_id;

  return v_invite_id;
end;
$$;

create or replace function public.resolve_promotion_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.promotion_invites%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.promotion_invites
  where id = p_invite_id
    and invitee_id = v_user_id
    and status = 'pending';

  if not found then
    raise exception 'Invite not found';
  end if;

  update public.promotion_invites
  set status = case when p_accept then 'accepted' else 'declined' end,
      resolved_at = now()
  where id = p_invite_id;

  if p_accept then
    update public.profiles
    set level = greatest(level, v_invite.target_level),
        updated_at = now()
    where id = v_user_id;

    update public.group_members gm
    set status = 'left',
        left_at = now()
    from public.groups g
    where g.id = gm.group_id
      and gm.user_id = v_user_id
      and gm.status = 'active'
      and g.circle_type = 'exploration'
      and g.level < v_invite.target_level;

    update public.groups g
    set status = 'active'
    where g.circle_type = 'exploration'
      and g.status = 'full'
      and public.group_active_member_count(g.id) < g.max_members;
  end if;
end;
$$;

create or replace function public.endorse_profile(
  p_target_id uuid,
  p_tag text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endorser_id uuid := auth.uid();
  v_endorser_level int;
  v_target_level int;
  v_endorsement_id uuid;
begin
  if v_endorser_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_endorser_id = p_target_id then
    raise exception '不能给自己添加推荐标签';
  end if;

  select level into v_endorser_level from public.profiles where id = v_endorser_id;
  select level into v_target_level from public.profiles where id = p_target_id;

  if v_target_level is null then
    raise exception 'Target profile not found';
  end if;

  if v_endorser_level <= v_target_level then
    raise exception '只有更高阶段用户可以给候选人添加推荐标签';
  end if;

  insert into public.profile_endorsements (endorser_id, target_id, tag, note)
  values (v_endorser_id, p_target_id, trim(p_tag), coalesce(trim(p_note), ''))
  on conflict (endorser_id, target_id, tag)
  do update set note = excluded.note, created_at = now()
  returning id into v_endorsement_id;

  return v_endorsement_id;
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.messages enable row level security;
alter table public.task_submissions enable row level security;
alter table public.promotion_invites enable row level security;
alter table public.profile_endorsements enable row level security;

drop policy if exists "chat_media_select_visible" on storage.objects;
drop policy if exists "chat_media_insert_members" on storage.objects;

create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

create policy "profiles_insert_self"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "tasks_select_open"
on public.tasks for select
to authenticated
using (status in ('open', 'closed', 'archived'));

create policy "groups_select_visible"
on public.groups for select
to authenticated
using (
  circle_type = 'task'
  or level <= public.my_level()
  or public.is_group_member(groups.id, auth.uid())
);

create policy "group_members_select_visible"
on public.group_members for select
to authenticated
using (public.can_view_group(group_members.group_id, auth.uid()));

create policy "messages_select_visible"
on public.messages for select
to authenticated
using (public.can_view_group(messages.group_id, auth.uid()));

create policy "messages_insert_members"
on public.messages for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_group_member(messages.group_id, auth.uid())
);

create policy "chat_media_select_visible"
on storage.objects for select
to authenticated
using (
  bucket_id = 'chat-media'
  and public.can_view_group((storage.foldername(name))[1]::uuid, auth.uid())
);

create policy "chat_media_insert_members"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and public.is_group_member((storage.foldername(name))[1]::uuid, auth.uid())
);

create policy "submissions_select_visible"
on public.task_submissions for select
to authenticated
using (true);

create policy "submissions_insert_members"
on public.task_submissions for insert
to authenticated
with check (
  submitted_by = auth.uid()
  and public.is_group_member(task_submissions.group_id, auth.uid())
);

create policy "submissions_update_members"
on public.task_submissions for update
to authenticated
using (public.is_group_member(task_submissions.group_id, auth.uid()))
with check (submitted_by = auth.uid());

create policy "invites_select_related"
on public.promotion_invites for select
to authenticated
using (
  inviter_id = auth.uid()
  or invitee_id = auth.uid()
  or public.can_view_group(promotion_invites.group_id, auth.uid())
);

create policy "endorsements_select_authenticated"
on public.profile_endorsements for select
to authenticated
using (true);

-- Seed tasks. This is idempotent by title.
insert into public.tasks (title, description, category, level, deliverable, score_max, group_size, duration_days, status)
select * from (values
  (
    '分析新易盛未来五年的投资价值',
    '请围绕收入增长、ASP、毛利率、客户集中度、AI CAPEX、估值隐含预期讨论 bull case 和 bear case。',
    '股票分析',
    3,
    '提交一份 investment memo，包含 bull case、bear case、关键假设和估值隐含预期。',
    100,
    6,
    7,
    'open'
  ),
  (
    '分析泡泡玛特是否还有十倍空间',
    '请围绕 IP 生命周期、海外增长、渠道扩张、消费者动机、估值隐含假设讨论。',
    '股票分析',
    3,
    '提交一份股票 pitch，说明核心驱动、主要风险和你们的结论。',
    100,
    6,
    7,
    'open'
  ),
  (
    '为一家中国茶饮品牌设计英国市场进入策略',
    '假设你是咨询顾问，请讨论目标客群、选址、定价、供应链、营销和前三个月开店计划。',
    '咨询实践',
    2,
    '提交一份市场进入方案，包含目标客群、选址逻辑、定价和前三个月行动计划。',
    100,
    5,
    5,
    'open'
  ),
  (
    '帮一家 AI 教育产品找到第一批用户',
    '假设产品面向大学生求职训练，请设计冷启动路径、首批用户画像、渠道、转化和留存机制。',
    'AI 产品 / 创业',
    2,
    '提交一份冷启动方案，包含首批用户画像、渠道、转化路径和留存机制。',
    100,
    5,
    5,
    'open'
  ),
  (
    '模拟投行面试：如何解释 DCF',
    '请小组互相模拟面试，讨论 DCF 的核心逻辑、关键假设、常见追问和简洁表达。',
    '投行面试',
    1,
    '提交一份面试回答框架，包含 60 秒版本、关键假设和常见追问。',
    100,
    4,
    3,
    'open'
  ),
  (
    '模拟咨询 Case：估算伦敦一年卖出多少杯咖啡',
    '请拆解 market sizing 逻辑，讨论人群、频次、渠道、价格和 sanity check。',
    '咨询实践',
    1,
    '提交一份 market sizing 拆解，包含公式、核心假设和 sanity check。',
    100,
    4,
    3,
    'open'
  ),
  (
    '改写一份 Spring Week 简历 bullet',
    '请每位成员提供 2-3 条经历 bullet，小组互相修改，重点提升动词、量化结果和求职方向匹配度。',
    '申请材料',
    1,
    '提交一份 before/after 简历 bullet 对照，说明修改逻辑和最终版本。',
    100,
    4,
    3,
    'open'
  ),
  (
    '制定一周海外实习申请冲刺计划',
    '请每位成员列出目标地区、目标岗位、本周申请数量、networking 数量和需要补的能力，小组互相检查是否现实。',
    '求职策略',
    1,
    '提交一份一周申请冲刺计划，包含岗位清单、每日行动、networking 目标和复盘方式。',
    100,
    4,
    3,
    'open'
  ),
  (
    '整理一份校友 networking 地图',
    '请围绕目标地区和目标岗位，整理校友、学长学姐、社团和公司员工触达名单，并设计第一封消息。',
    '求职策略',
    2,
    '提交一份 networking 地图，包含目标人群分层、触达优先级、私信模板和跟进节奏。',
    100,
    5,
    5,
    'open'
  ),
  (
    '比较英国、香港、美国金融申请路径',
    '请比较三个地区在招聘时间线、签证/身份、target school、networking、面试和岗位数量上的差异。',
    '求职策略',
    3,
    '提交一份地区申请策略 memo，包含英港美路径对比、个人适配判断和未来 30 天行动。',
    100,
    6,
    7,
    'open'
  ),
  (
    '模拟 HireVue：讲一个 leadership 故事',
    '请用 STAR 框架准备一个 leadership 故事，小组互相追问并打磨到 90 秒以内。',
    '投行面试',
    1,
    '提交一份 90 秒 behavioral answer，包含 STAR 结构和可能追问。',
    100,
    4,
    3,
    'open'
  ),
  (
    'Spring Week 申请 tracker 搭建',
    '请整理目标银行、岗位、截止日期、申请状态、HireVue 状态和复盘字段，小组互相检查是否覆盖完整。',
    'Spring Week',
    1,
    '提交一份 Spring Week tracker 模板，包含目标公司、截止日期、当前状态、下一步动作和复盘字段。',
    100,
    4,
    3,
    'open'
  ),
  (
    'Spring Week HireVue 高频题训练',
    '请每位成员选择 2 道 behavioral 高频题，用 90 秒回答并让小组追问。',
    'Spring Week',
    1,
    '提交一份 HireVue 回答包，包含 2 个 STAR 故事、90 秒版本和小组反馈。',
    100,
    4,
    3,
    'open'
  ),
  (
    'Summer IB technical 第一轮自测',
    '请围绕 accounting、valuation、DCF 和 M&A 各整理 3 道问题，小组互相模拟第一轮面试。',
    'Summer 投行',
    2,
    '提交一份 technical 自测记录，包含至少 12 道题、回答框架、错题和下一步复习计划。',
    100,
    5,
    5,
    'open'
  ),
  (
    'Summer Consulting case partner 训练',
    '请两两配对完成一个 profitability 或 market entry case，并记录结构、假设、计算和反馈。',
    'Summer 咨询',
    2,
    '提交一份 case 训练复盘，包含题目、结构图、关键计算、反馈和下一次训练目标。',
    100,
    5,
    5,
    'open'
  ),
  (
    'Summer referral 冲刺计划',
    '请围绕目标公司列出 20 个可触达人选，设计首封消息、跟进节奏和 referral 转化记录方式。',
    'Summer Networking',
    3,
    '提交一份 referral 冲刺计划，包含目标名单、触达模板、跟进节奏、记录字段和一周目标。',
    100,
    6,
    7,
    'open'
  ),
  (
    '拆解一个你喜欢的消费品牌',
    '请选择一个消费品牌，从用户、产品、渠道、定价和增长方式拆解它为什么成立。',
    '商业分析',
    1,
    '提交一份品牌拆解 memo，包含用户画像、产品定位、渠道和增长逻辑。',
    100,
    4,
    4,
    'open'
  ),
  (
    '设计一个投行申请者的 networking 系统',
    '请围绕目标名单、触达话术、跟进节奏、信息记录和 referral 转化设计一个可执行系统。',
    '求职策略',
    4,
    '提交一份 networking operating system，包含目标分层、触达模板、跟进节奏和转化指标。',
    100,
    6,
    7,
    'open'
  ),
  (
    '为一家 SaaS 公司设计中小企业获客方案',
    '假设产品面向中小企业财务团队，请设计目标客群、渠道组合、销售漏斗、定价实验和前三个月执行计划。',
    '产品增长',
    4,
    '提交一份 GTM 方案，包含 ICP、渠道、销售漏斗、定价假设和 90 天实验。',
    100,
    6,
    7,
    'open'
  ),
  (
    '写一份半导体行业三页 pitch deck',
    '请选择半导体产业链中的一个细分方向，整理行业结构、关键公司、核心驱动和投资机会。',
    '股票分析',
    4,
    '提交一份三页 pitch deck，包含行业地图、核心驱动、推荐标的和风险。',
    100,
    6,
    7,
    'open'
  ),
  (
    '评估一个求职社交产品的增长飞轮',
    '请从用户分层、留存、内容供给、任务激励、邀请机制和商业化角度评估 circle 类产品。',
    '产品战略',
    5,
    '提交一份产品战略 memo，包含核心飞轮、关键风险、北极星指标和 90 天实验计划。',
    100,
    6,
    7,
    'open'
  ),
  (
    '设计一个 AI 面试教练的商业化路径',
    '假设你负责一个 AI 面试教练产品，请设计从免费工具到付费订阅的转化路径和定价策略。',
    'AI 产品 / 创业',
    5,
    '提交一份商业化方案，包含用户分层、付费触发点、定价、留存和关键指标。',
    100,
    6,
    7,
    'open'
  ),
  (
    '评估一家上市公司的资本配置质量',
    '请选择一家公司，分析它过去五年的资本开支、回购、并购、分红和 ROIC 变化。',
    '股票分析',
    5,
    '提交一份资本配置 memo，包含历史行为、管理层判断、ROIC 变化和投资结论。',
    100,
    6,
    7,
    'open'
  ),
  (
    '设计一个校内求职社群的冷启动计划',
    '假设你要在一所大学启动 circle，请设计种子用户、首批 Circle、任务机制、邀请路径和留存动作。',
    '社区增长',
    5,
    '提交一份校园冷启动计划，包含种子用户、首批任务、邀请机制和 30 天增长节奏。',
    100,
    6,
    7,
    'open'
  ),
  (
    '为一家精品咖啡连锁设计门店扩张模型',
    '请围绕选址、单店模型、客单价、复购、人员成本和现金回收期搭建扩张判断框架。',
    '咨询实践',
    2,
    '提交一份门店扩张模型框架，包含关键假设、单店经济性和扩张节奏建议。',
    100,
    5,
    5,
    'open'
  ),
  (
    '给一家 AI 求职工具做竞品分析',
    '请选择 3 个竞品，从目标用户、核心功能、定价、获客渠道和差异化切入点分析。',
    'AI 产品 / 创业',
    2,
    '提交一份竞品分析，包含竞品矩阵、差异化机会和 MVP 功能建议。',
    100,
    5,
    5,
    'open'
  ),
  (
    '搭建一个投行 technical 面试题库',
    '请整理估值、会计、并购、杠杆收购四类常见问题，并给出简洁回答框架。',
    '投行面试',
    2,
    '提交一份 technical 题库，包含至少 12 个问题、回答框架和常见追问。',
    100,
    5,
    5,
    'open'
  ),
  (
    '写一份消费公司 one-page stock pitch',
    '选择一家消费公司，用一页纸说明投资观点、增长驱动、估值、风险和催化剂。',
    '股票分析',
    2,
    '提交一页 stock pitch，包含观点、驱动、估值、风险和催化剂。',
    100,
    5,
    5,
    'open'
  ),
  (
    '分析一家奢侈品公司的中国增长风险',
    '请围绕宏观消费、品牌势能、渠道、价格带和竞争格局分析一家奢侈品公司的中国风险。',
    '股票分析',
    3,
    '提交一份风险分析 memo，包含核心风险、证据、反方观点和监测指标。',
    100,
    6,
    7,
    'open'
  ),
  (
    '为一家跨境电商设计欧洲市场进入方案',
    '请讨论目标国家、品类选择、物流、渠道、定价、合规和前三个月测试计划。',
    '咨询实践',
    3,
    '提交一份欧洲市场进入方案，包含国家选择、渠道、物流、合规和测试计划。',
    100,
    6,
    7,
    'open'
  ),
  (
    '设计一个实习申请 tracker',
    '请设计一个能让用户管理申请、networking、面试和复盘的 tracker 结构。',
    '求职策略',
    3,
    '提交一份申请 tracker 模板，包含字段设计、使用流程和复盘机制。',
    100,
    6,
    5,
    'open'
  ),
  (
    '模拟咨询项目：降低一家餐饮连锁的外卖亏损',
    '请用咨询项目方式拆解外卖亏损来源，并提出能在 60 天内测试的改善方案。',
    '咨询实践',
    3,
    '提交一份利润改善方案，包含问题树、关键假设、数据需求和 60 天实验。',
    100,
    6,
    7,
    'open'
  )
) as v(title, description, category, level, deliverable, score_max, group_size, duration_days, status)
where not exists (
  select 1 from public.tasks t where t.title = v.title
);

update public.tasks
set level = v.level,
    deliverable = v.deliverable,
    score_max = 100
from (values
  ('分析新易盛未来五年的投资价值', 3, '提交一份 investment memo，包含 bull case、bear case、关键假设和估值隐含预期。'),
  ('分析泡泡玛特是否还有十倍空间', 3, '提交一份股票 pitch，说明核心驱动、主要风险和你们的结论。'),
  ('为一家中国茶饮品牌设计英国市场进入策略', 2, '提交一份市场进入方案，包含目标客群、选址逻辑、定价和前三个月行动计划。'),
  ('帮一家 AI 教育产品找到第一批用户', 2, '提交一份冷启动方案，包含首批用户画像、渠道、转化路径和留存机制。'),
  ('模拟投行面试：如何解释 DCF', 1, '提交一份面试回答框架，包含 60 秒版本、关键假设和常见追问。'),
  ('模拟咨询 Case：估算伦敦一年卖出多少杯咖啡', 1, '提交一份 market sizing 拆解，包含公式、核心假设和 sanity check。'),
  ('改写一份 Spring Week 简历 bullet', 1, '提交一份 before/after 简历 bullet 对照，说明修改逻辑和最终版本。'),
  ('制定一周海外实习申请冲刺计划', 1, '提交一份一周申请冲刺计划，包含岗位清单、每日行动、networking 目标和复盘方式。'),
  ('Spring Week 申请 tracker 搭建', 1, '提交一份 Spring Week tracker 模板，包含目标公司、截止日期、当前状态、下一步动作和复盘字段。'),
  ('Spring Week HireVue 高频题训练', 1, '提交一份 HireVue 回答包，包含 2 个 STAR 故事、90 秒版本和小组反馈。'),
  ('整理一份校友 networking 地图', 2, '提交一份 networking 地图，包含目标人群分层、触达优先级、私信模板和跟进节奏。'),
  ('Summer IB technical 第一轮自测', 2, '提交一份 technical 自测记录，包含至少 12 道题、回答框架、错题和下一步复习计划。'),
  ('Summer Consulting case partner 训练', 2, '提交一份 case 训练复盘，包含题目、结构图、关键计算、反馈和下一次训练目标。'),
  ('比较英国、香港、美国金融申请路径', 3, '提交一份地区申请策略 memo，包含英港美路径对比、个人适配判断和未来 30 天行动。'),
  ('Summer referral 冲刺计划', 3, '提交一份 referral 冲刺计划，包含目标名单、触达模板、跟进节奏、记录字段和一周目标。'),
  ('模拟 HireVue：讲一个 leadership 故事', 1, '提交一份 90 秒 behavioral answer，包含 STAR 结构和可能追问。'),
  ('拆解一个你喜欢的消费品牌', 1, '提交一份品牌拆解 memo，包含用户画像、产品定位、渠道和增长逻辑。'),
  ('为一家精品咖啡连锁设计门店扩张模型', 2, '提交一份门店扩张模型框架，包含关键假设、单店经济性和扩张节奏建议。'),
  ('给一家 AI 求职工具做竞品分析', 2, '提交一份竞品分析，包含竞品矩阵、差异化机会和 MVP 功能建议。'),
  ('搭建一个投行 technical 面试题库', 2, '提交一份 technical 题库，包含至少 12 个问题、回答框架和常见追问。'),
  ('写一份消费公司 one-page stock pitch', 2, '提交一页 stock pitch，包含观点、驱动、估值、风险和催化剂。'),
  ('分析一家奢侈品公司的中国增长风险', 3, '提交一份风险分析 memo，包含核心风险、证据、反方观点和监测指标。'),
  ('为一家跨境电商设计欧洲市场进入方案', 3, '提交一份欧洲市场进入方案，包含国家选择、渠道、物流、合规和测试计划。'),
  ('设计一个实习申请 tracker', 3, '提交一份申请 tracker 模板，包含字段设计、使用流程和复盘机制。'),
  ('模拟咨询项目：降低一家餐饮连锁的外卖亏损', 3, '提交一份利润改善方案，包含问题树、关键假设、数据需求和 60 天实验。'),
  ('设计一个投行申请者的 networking 系统', 4, '提交一份 networking operating system，包含目标分层、触达模板、跟进节奏和转化指标。'),
  ('为一家 SaaS 公司设计中小企业获客方案', 4, '提交一份 GTM 方案，包含 ICP、渠道、销售漏斗、定价假设和 90 天实验。'),
  ('写一份半导体行业三页 pitch deck', 4, '提交一份三页 pitch deck，包含行业地图、核心驱动、推荐标的和风险。'),
  ('评估一个求职社交产品的增长飞轮', 5, '提交一份产品战略 memo，包含核心飞轮、关键风险、北极星指标和 90 天实验计划。'),
  ('设计一个 AI 面试教练的商业化路径', 5, '提交一份商业化方案，包含用户分层、付费触发点、定价、留存和关键指标。'),
  ('评估一家上市公司的资本配置质量', 5, '提交一份资本配置 memo，包含历史行为、管理层判断、ROIC 变化和投资结论。'),
  ('设计一个校内求职社群的冷启动计划', 5, '提交一份校园冷启动计划，包含种子用户、首批任务、邀请机制和 30 天增长节奏。')
) as v(title, level, deliverable)
where public.tasks.title = v.title;

update public.tasks
set format_guide = '建议格式：1. 一句话结论；2. 背景和目标；3. 核心分析；4. 可执行方案；5. 风险和下一步。提交链接可以是 Google Doc、Notion、PDF、Slides 或其他公开可访问材料。'
where format_guide is null
   or format_guide = ''
   or format_guide = '建议格式：1. 结论摘要；2. 关键假设；3. 分析过程；4. 风险和下一步。提交链接可以是 Google Doc、Notion、PDF、Slides 或其他可访问材料。';

update public.groups g
set level = t.level
from public.tasks t
where g.task_id = t.id
  and g.circle_type = 'task';

update public.groups g
set level = coalesce(member_levels.level, g.level)
from (
  select gm.group_id, min(p.level) as level
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.status = 'active'
  group by gm.group_id
) member_levels
where g.id = member_levels.group_id
  and g.circle_type = 'exploration';

update public.groups
set name = replace(
  replace(
    replace(
      replace(
        replace(name, ' L1 Circle', ' · Starter Circle'),
        ' L2 Circle', ' · Ready Circle'
      ),
      ' L3 Circle', ' · Competitive Circle'
    ),
    ' L4 Circle', ' · Peer Lead Circle'
  ),
  ' L5 Circle', ' · Mentor Circle'
)
where name ~ ' L[1-5] Circle';
