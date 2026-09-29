-- circle No-npm MVP schema
-- Safe to run in a fresh Supabase project.
-- If you have important existing data, back it up before running destructive changes.

begin;

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
      and tablename in ('profiles', 'tasks', 'groups', 'group_members', 'messages', 'group_read_states', 'task_submissions', 'task_submission_contributors', 'promotion_invites', 'profile_endorsements', 'weekly_checkins', 'circle_requests')
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
  target_region text default '不限地区',
  target_role text default 'Investment Banking',
  application_progress text default '材料准备中',
  intensity text default '正常推进',
  bio text default '',
  level int not null default 1,
  level_reset_at timestamptz,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null default 'General',
  level int not null default 1 check (level between 1 and 3),
  deliverable text not null default '提交一段小组结论、关键假设和下一步行动。',
  format_guide text not null default '建议格式：1. 结论摘要；2. 关键假设；3. 分析过程；4. 风险和下一步。提交链接可以是 Google Doc、Notion、PDF、Slides 或其他可访问材料。',
  score_max int not null default 100 check (score_max between 1 and 1000),
  group_size int not null default 6 check (group_size between 2 and 12),
  duration_days int not null default 7 check (duration_days between 1 and 60),
  is_featured boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
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
  status text not null default 'active' check (status in ('active', 'paused', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  paused_at timestamptz,
  pause_reason text not null default '',
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

create table if not exists public.group_read_states (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  submission_url text,
  submission_file_path text,
  submission_file_name text,
  submission_file_mime text,
  submission_file_size bigint,
  content text not null check (char_length(content) between 20 and 8000),
  score int not null default 0 check (score between 0 and 1000),
  award_rank int check (award_rank between 1 and 3),
  award_title text,
  created_at timestamptz not null default now(),
  unique(group_id)
);

create table if not exists public.task_submission_contributors (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.task_submissions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(submission_id, user_id)
);

create table if not exists public.promotion_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  from_level int not null check (from_level between 1 and 3),
  target_level int not null check (target_level between 1 and 3),
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
  group_id uuid references public.groups(id) on delete set null,
  tag text not null check (char_length(tag) between 2 and 40),
  note text default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique(endorser_id, target_id, tag)
);

create table if not exists public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  apps int not null default 0 check (apps between 0 and 500),
  networking int not null default 0 check (networking between 0 and 500),
  learning text not null default '' check (char_length(learning) <= 1000),
  blocker text not null default '' check (char_length(blocker) <= 1000),
  message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_id, user_id, week_start)
);

create table if not exists public.circle_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null check (char_length(topic) between 4 and 120),
  member_profile text not null default '' check (char_length(member_profile) <= 600),
  reason text not null check (char_length(reason) between 5 and 1000),
  cadence text not null default '每周同步 1 次' check (char_length(cadence) <= 80),
  ideal_size int not null default 6 check (ideal_size between 2 and 12),
  application_track text not null default 'Spring Week',
  target_region text not null default '不限地区',
  target_role text not null default 'Finance',
  level int not null default 1 check (level between 1 and 3),
  status text not null default 'pending' check (status in ('pending', 'approved', 'matched', 'declined', 'cancelled')),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks add column if not exists level int not null default 1 check (level between 1 and 3);
alter table public.tasks add column if not exists deliverable text not null default '提交一段小组结论、关键假设和下一步行动。';
alter table public.tasks add column if not exists format_guide text not null default '建议格式：1. 结论摘要；2. 关键假设；3. 分析过程；4. 风险和下一步。提交链接可以是 Google Doc、Notion、PDF、Slides 或其他可访问材料。';
alter table public.tasks add column if not exists score_max int not null default 100 check (score_max between 1 and 1000);
alter table public.tasks add column if not exists is_featured boolean not null default false;
alter table public.tasks add column if not exists starts_at timestamptz;
alter table public.tasks add column if not exists ends_at timestamptz;

alter table public.profiles add column if not exists application_track text default 'Spring Week';
alter table public.profiles add column if not exists target_region text default '不限地区';
alter table public.profiles alter column target_region set default '不限地区';
alter table public.profiles add column if not exists target_role text default 'Investment Banking';
alter table public.profiles add column if not exists application_progress text default '材料准备中';
alter table public.profiles add column if not exists intensity text default '正常推进';
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists level_reset_at timestamptz;

alter table public.messages add column if not exists message_type text not null default 'text' check (message_type in ('text', 'image', 'file'));
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_name text;
alter table public.messages add column if not exists media_mime text;
alter table public.messages add column if not exists media_size int;

alter table public.group_members add column if not exists paused_at timestamptz;
alter table public.group_members add column if not exists pause_reason text not null default '';
alter table public.group_members drop constraint if exists group_members_status_check;
update public.group_members
set status = 'left',
    left_at = coalesce(left_at, now())
where status is null
   or status not in ('active', 'paused', 'left', 'removed');
alter table public.group_members add constraint group_members_status_check check (status in ('active', 'paused', 'left', 'removed'));

alter table public.task_submissions add column if not exists task_id uuid references public.tasks(id) on delete cascade;
alter table public.task_submissions add column if not exists group_id uuid references public.groups(id) on delete cascade;
alter table public.task_submissions add column if not exists submitted_by uuid references public.profiles(id) on delete cascade;
alter table public.task_submissions add column if not exists title text;
alter table public.task_submissions add column if not exists submission_url text;
alter table public.task_submissions add column if not exists submission_file_path text;
alter table public.task_submissions add column if not exists submission_file_name text;
alter table public.task_submissions add column if not exists submission_file_mime text;
alter table public.task_submissions add column if not exists submission_file_size bigint;
alter table public.task_submissions add column if not exists content text;
alter table public.task_submissions add column if not exists score int not null default 0 check (score between 0 and 1000);
alter table public.task_submissions add column if not exists award_rank int check (award_rank between 1 and 3);
alter table public.task_submissions add column if not exists award_title text;
alter table public.task_submissions add column if not exists created_at timestamptz not null default now();

alter table public.promotion_invites add column if not exists inviter_id uuid references public.profiles(id) on delete cascade;
alter table public.promotion_invites add column if not exists invitee_id uuid references public.profiles(id) on delete cascade;
alter table public.promotion_invites add column if not exists group_id uuid references public.groups(id) on delete set null;
alter table public.promotion_invites add column if not exists from_level int check (from_level between 1 and 3);
alter table public.promotion_invites add column if not exists target_level int check (target_level between 1 and 3);
alter table public.promotion_invites add column if not exists reason text;
alter table public.promotion_invites add column if not exists status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled'));
alter table public.promotion_invites add column if not exists created_at timestamptz not null default now();
alter table public.promotion_invites add column if not exists resolved_at timestamptz;

alter table public.profile_endorsements add column if not exists endorser_id uuid references public.profiles(id) on delete cascade;
alter table public.profile_endorsements add column if not exists target_id uuid references public.profiles(id) on delete cascade;
alter table public.profile_endorsements add column if not exists group_id uuid references public.groups(id) on delete set null;
alter table public.profile_endorsements add column if not exists tag text;
alter table public.profile_endorsements add column if not exists note text default '';
alter table public.profile_endorsements add column if not exists created_at timestamptz not null default now();

alter table public.weekly_checkins add column if not exists group_id uuid references public.groups(id) on delete cascade;
alter table public.weekly_checkins add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.weekly_checkins add column if not exists week_start date;
alter table public.weekly_checkins add column if not exists apps int not null default 0 check (apps between 0 and 500);
alter table public.weekly_checkins add column if not exists networking int not null default 0 check (networking between 0 and 500);
alter table public.weekly_checkins add column if not exists learning text not null default '' check (char_length(learning) <= 1000);
alter table public.weekly_checkins add column if not exists blocker text not null default '' check (char_length(blocker) <= 1000);
alter table public.weekly_checkins add column if not exists message_id uuid references public.messages(id) on delete set null;
alter table public.weekly_checkins add column if not exists created_at timestamptz not null default now();
alter table public.weekly_checkins add column if not exists updated_at timestamptz not null default now();

alter table public.circle_requests add column if not exists requester_id uuid references public.profiles(id) on delete cascade;
alter table public.circle_requests add column if not exists topic text;
alter table public.circle_requests add column if not exists member_profile text not null default '';
alter table public.circle_requests add column if not exists reason text;
alter table public.circle_requests add column if not exists cadence text not null default '每周同步 1 次';
alter table public.circle_requests add column if not exists ideal_size int not null default 6 check (ideal_size between 2 and 12);
alter table public.circle_requests add column if not exists application_track text not null default 'Spring Week';
alter table public.circle_requests add column if not exists target_region text not null default '不限地区';
alter table public.circle_requests alter column target_region set default '不限地区';
alter table public.circle_requests add column if not exists target_role text not null default 'Finance';
alter table public.circle_requests alter column target_role set default 'Finance';
alter table public.circle_requests add column if not exists level int not null default 1 check (level between 1 and 3);
alter table public.circle_requests add column if not exists status text not null default 'pending' check (status in ('pending', 'approved', 'matched', 'declined', 'cancelled'));
alter table public.circle_requests add column if not exists admin_note text not null default '';
alter table public.circle_requests add column if not exists created_at timestamptz not null default now();
alter table public.circle_requests add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_level_check;
alter table public.tasks drop constraint if exists tasks_level_check;
alter table public.groups drop constraint if exists groups_level_check;
alter table public.circle_requests drop constraint if exists circle_requests_level_check;
alter table public.task_submissions drop constraint if exists task_submissions_award_rank_check;

update public.profiles
set level = greatest(1, least(3, coalesce(level, 1)))
where level is null or level not between 1 and 3;

update public.tasks
set level = greatest(1, least(3, coalesce(level, 1)))
where level is null or level not between 1 and 3;

update public.groups
set level = greatest(1, least(3, coalesce(level, 1)))
where level is null or level not between 1 and 3;

update public.circle_requests
set level = greatest(1, least(3, coalesce(level, 1)))
where level is null or level not between 1 and 3;
update public.promotion_invites set status = 'cancelled' where from_level > 3 or target_level > 3;
update public.task_submissions set award_rank = null, award_title = null where award_rank is not null and award_rank not between 1 and 3;

update public.profiles
set is_admin = true
where email = '18901528810@163.com';

alter table public.profiles add constraint profiles_level_check check (level between 1 and 3);
alter table public.tasks add constraint tasks_level_check check (level between 1 and 3);
alter table public.groups add constraint groups_level_check check (level between 1 and 3);
alter table public.circle_requests add constraint circle_requests_level_check check (level between 1 and 3);
alter table public.task_submissions add constraint task_submissions_award_rank_check check (award_rank between 1 and 3);

with duplicate_awards as (
  select
    id,
    row_number() over (
      partition by task_id, award_rank
      order by created_at desc, id
    ) as award_order
  from public.task_submissions
  where award_rank between 1 and 3
)
update public.task_submissions s
set award_rank = null,
    award_title = null
from duplicate_awards d
where s.id = d.id
  and d.award_order > 1;

create index if not exists idx_groups_task_id on public.groups(task_id);
create index if not exists idx_groups_type_status on public.groups(circle_type, status);
create index if not exists idx_group_members_user_status on public.group_members(user_id, status);
create index if not exists idx_group_members_group_status on public.group_members(group_id, status);
create index if not exists idx_messages_group_created on public.messages(group_id, created_at);
create index if not exists idx_messages_user_created on public.messages(user_id, created_at desc);
create index if not exists idx_group_read_states_user on public.group_read_states(user_id, updated_at desc);

insert into public.group_read_states (group_id, user_id, last_read_at, created_at, updated_at)
select gm.group_id, gm.user_id, now(), now(), now()
from public.group_members gm
where gm.status = 'active'
on conflict (group_id, user_id) do nothing;

create index if not exists idx_tasks_level_status on public.tasks(level, status);
create index if not exists idx_submissions_task_score on public.task_submissions(task_id, score desc, created_at asc);
create index if not exists idx_submissions_user_created on public.task_submissions(submitted_by, created_at desc);
create unique index if not exists idx_submissions_unique_task_award_rank on public.task_submissions(task_id, award_rank) where award_rank between 1 and 3;
create index if not exists idx_submission_contributors_user on public.task_submission_contributors(user_id, created_at desc);
create index if not exists idx_submission_contributors_submission on public.task_submission_contributors(submission_id);
create index if not exists idx_invites_invitee_status on public.promotion_invites(invitee_id, status, created_at desc);
create unique index if not exists idx_submissions_unique_group on public.task_submissions(group_id);
alter table public.promotion_invites
drop constraint if exists promotion_invites_inviter_id_invitee_id_target_level_status_key;
drop index if exists public.idx_invites_unique_pending;
create unique index idx_invites_unique_pending
on public.promotion_invites(inviter_id, invitee_id, target_level)
where status = 'pending';
create index if not exists idx_endorsements_target_created on public.profile_endorsements(target_id, created_at desc);
create index if not exists idx_endorsements_group_created on public.profile_endorsements(group_id, created_at desc);
create unique index if not exists idx_endorsements_unique_tag on public.profile_endorsements(endorser_id, target_id, tag);
create unique index if not exists idx_weekly_checkins_unique_week on public.weekly_checkins(group_id, user_id, week_start);
create index if not exists idx_weekly_checkins_group_week on public.weekly_checkins(group_id, week_start, updated_at desc);
create index if not exists idx_weekly_checkins_user_week on public.weekly_checkins(user_id, week_start desc);
create index if not exists idx_circle_requests_status_created on public.circle_requests(status, created_at desc);
create index if not exists idx_circle_requests_requester_created on public.circle_requests(requester_id, created_at desc);
drop index if exists idx_circle_requests_match;
create index idx_circle_requests_match on public.circle_requests(application_track, target_role, level, status);

insert into public.task_submission_contributors (submission_id, user_id)
select ts.id, gm.user_id
from public.task_submissions ts
join public.group_members gm on gm.group_id = ts.group_id and gm.status = 'active'
where not exists (
  select 1
  from public.task_submission_contributors existing
  where existing.submission_id = ts.id
)
on conflict (submission_id, user_id) do nothing;

insert into public.task_submission_contributors (submission_id, user_id)
select ts.id, ts.submitted_by
from public.task_submissions ts
where ts.submitted_by is not null
on conflict (submission_id, user_id) do nothing;

update public.profiles
set direction = target_role,
    updated_at = now()
where coalesce(target_role, '') <> ''
  and direction is distinct from target_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  52428800,
  null
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submission-files',
  'submission-files',
  false,
  52428800,
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

create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = p_user_id), false);
$$;

create or replace function public.my_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(auth.uid());
$$;

create or replace function public.protect_profile_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_context_changed := new.application_track is distinct from old.application_track
      or (case when lower(coalesce(new.target_role, '')) = 'consulting' or new.target_role = '咨询' then 'Consulting' else 'Finance' end)
        is distinct from
         (case when lower(coalesce(old.target_role, '')) = 'consulting' or old.target_role = '咨询' then 'Consulting' else 'Finance' end);

    if v_context_changed
      and auth.uid() is not null
      and coalesce(current_setting('app.profile_system_update', true), '') <> 'on' then
      new.level := 1;
      new.level_reset_at := now();
      update public.promotion_invites
      set status = 'cancelled', resolved_at = now()
      where (invitee_id = new.id or inviter_id = new.id)
        and status = 'pending';
    end if;
  end if;

  if auth.uid() is not null
    and coalesce(current_setting('app.profile_system_update', true), '') <> 'on' then
    if coalesce(new.application_track, '') not in ('Spring Week', 'Summer Internship') then
      raise exception '申请路径无效';
    end if;

    if coalesce(new.target_role, '') not in (
      'Investment Banking',
      'Consulting',
      'Asset Management',
      'Sales & Trading',
      'Equity Research',
      'General Finance'
    ) then
      raise exception '目标岗位无效';
    end if;

    if char_length(trim(coalesce(new.display_name, ''))) not between 1 and 40 then
      raise exception '昵称需要在 1 到 40 个字符之间';
    end if;

    if char_length(coalesce(new.bio, '')) > 500 then
      raise exception '一句话介绍不能超过 500 个字符';
    end if;

    if tg_op = 'INSERT' and coalesce(new.is_admin, false) then
      raise exception '管理员权限只能在 Supabase 后台设置';
    end if;

    if tg_op = 'UPDATE' and (
      new.id is distinct from old.id
      or new.email is distinct from old.email
      or (new.level is distinct from old.level and not (v_context_changed and new.level = 1))
      or new.is_admin is distinct from old.is_admin
      or new.created_at is distinct from old.created_at
    ) then
      raise exception '邮箱、层级和管理员权限只能由系统流程修改';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_admin_flag on public.profiles;
create trigger protect_profile_admin_flag
before insert or update on public.profiles
for each row execute function public.protect_profile_admin_flag();

create or replace function public.protect_paused_chat_seat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle_type text;
  v_old_status text;
begin
  if tg_op = 'UPDATE' then
    v_old_status := old.status;
  end if;

  if new.status = 'active'
    and (tg_op = 'INSERT' or v_old_status is distinct from 'active')
    and coalesce(current_setting('app.allow_starter_reactivation', true), '') <> 'on' then
    select g.circle_type into v_circle_type
    from public.groups g
    where g.id = new.group_id;

    if v_circle_type = 'exploration' and (
      (tg_op = 'UPDATE' and v_old_status = 'paused')
      or exists (
        select 1
        from public.group_members paused_membership
        join public.groups paused_group on paused_group.id = paused_membership.group_id
        where paused_membership.user_id = new.user_id
          and paused_membership.status = 'paused'
          and paused_membership.id <> new.id
          and paused_group.circle_type = 'exploration'
      )
    ) then
      raise exception '你的 Starter 席位已暂停，请先恢复匹配';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_paused_chat_seat on public.group_members;
create trigger protect_paused_chat_seat
before insert or update of status on public.group_members
for each row execute function public.protect_paused_chat_seat();

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

create or replace function public.is_task_participant(p_task_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = p_user_id
      and gm.status = 'active'
      and g.task_id = p_task_id
      and g.circle_type = 'task'
      and g.status in ('forming', 'active', 'full', 'completed')
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
        public.is_group_member(g.id, p_user_id)
        or public.is_admin(p_user_id)
        or (
          g.circle_type = 'exploration'
          and g.level < coalesce((select p.level from public.profiles p where p.id = p_user_id), 1)
        )
      )
  );
$$;

create or replace function public.can_view_group_content(
  p_group_id uuid,
  p_user_id uuid,
  p_created_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_group(p_group_id, p_user_id)
    or exists (
      select 1
      from public.group_members historical_membership
      where historical_membership.group_id = p_group_id
        and historical_membership.user_id = p_user_id
        and historical_membership.status = 'paused'
        and p_created_at <= historical_membership.paused_at
    );
$$;

create or replace function public.my_unread_group_counts()
returns table (
  group_id uuid,
  circle_type text,
  unread_count int,
  last_message_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    gm.group_id,
    g.circle_type,
    count(m.id) filter (
      where m.user_id <> v_user_id
        and m.created_at > coalesce(read_state.last_read_at, gm.joined_at)
    )::int as unread_count,
    max(m.created_at) filter (
      where m.user_id <> v_user_id
        and m.created_at > coalesce(read_state.last_read_at, gm.joined_at)
    ) as last_message_at
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  left join public.group_read_states read_state
    on read_state.group_id = gm.group_id
   and read_state.user_id = gm.user_id
  left join public.messages m on m.group_id = gm.group_id
  where gm.user_id = v_user_id
    and gm.status = 'active'
    and g.status in ('forming', 'active', 'full', 'completed')
  group by gm.group_id, g.circle_type, gm.joined_at, read_state.last_read_at
  having count(m.id) filter (
    where m.user_id <> v_user_id
      and m.created_at > coalesce(read_state.last_read_at, gm.joined_at)
  ) > 0
  order by max(m.created_at) filter (
    where m.user_id <> v_user_id
      and m.created_at > coalesce(read_state.last_read_at, gm.joined_at)
  ) desc nulls last;
end;
$$;

create or replace function public.mark_group_read(
  p_group_id uuid,
  p_read_through timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_joined_at timestamptz;
  v_read_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select gm.joined_at
  into v_joined_at
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = v_user_id
    and gm.status = 'active';

  if v_joined_at is null then
    raise exception '只有当前 Circle 成员可以更新已读位置';
  end if;

  v_read_at := greatest(v_joined_at, least(coalesce(p_read_through, now()), now()));

  insert into public.group_read_states (group_id, user_id, last_read_at, updated_at)
  values (p_group_id, v_user_id, v_read_at, now())
  on conflict (group_id, user_id)
  do update set
    last_read_at = greatest(public.group_read_states.last_read_at, excluded.last_read_at),
    updated_at = now();
end;
$$;

create or replace function public.admin_starter_memberships()
returns table (
  membership_id uuid,
  group_id uuid,
  group_name text,
  user_id uuid,
  display_name text,
  membership_status text,
  joined_at timestamptz,
  paused_at timestamptz,
  pause_reason text,
  last_checkin_at timestamptz,
  last_message_at timestamptz,
  needs_attention boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.is_admin(v_user_id) then
    raise exception '只有管理员可以查看 Starter 席位';
  end if;

  return query
  select
    gm.id,
    gm.group_id,
    g.name,
    gm.user_id,
    coalesce(p.display_name, '用户'),
    gm.status,
    gm.joined_at,
    gm.paused_at,
    gm.pause_reason,
    checkin.last_checkin_at,
    message.last_message_at,
    (
      gm.status = 'active'
      and gm.joined_at <= now() - interval '7 days'
      and (checkin.last_checkin_at is null or checkin.last_checkin_at < now() - interval '7 days')
    ) as needs_attention
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  join public.profiles p on p.id = gm.user_id
  left join lateral (
    select max(wc.updated_at) as last_checkin_at
    from public.weekly_checkins wc
    where wc.group_id = gm.group_id
      and wc.user_id = gm.user_id
  ) checkin on true
  left join lateral (
    select max(m.created_at) as last_message_at
    from public.messages m
    where m.group_id = gm.group_id
      and m.user_id = gm.user_id
  ) message on true
  where g.circle_type = 'exploration'
    and g.level = 1
    and p.level = 1
    and gm.status in ('active', 'paused')
  order by (
    gm.status = 'active'
    and gm.joined_at <= now() - interval '7 days'
    and (checkin.last_checkin_at is null or checkin.last_checkin_at < now() - interval '7 days')
  ) desc, gm.paused_at desc nulls last, gm.joined_at asc;
end;
$$;

create or replace function public.admin_set_starter_seat(
  p_membership_id uuid,
  p_paused boolean,
  p_reason text default '连续 7 天未完成周同步'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_membership public.group_members%rowtype;
  v_group public.groups%rowtype;
  v_profile_level int;
begin
  if v_admin_id is null or not public.is_admin(v_admin_id) then
    raise exception '只有管理员可以管理 Starter 席位';
  end if;

  select * into v_membership
  from public.group_members
  where id = p_membership_id;

  if not found then
    raise exception '没有找到这个成员席位';
  end if;

  select * into v_group from public.groups where id = v_membership.group_id;
  select level into v_profile_level from public.profiles where id = v_membership.user_id;

  if v_group.circle_type <> 'exploration' or v_group.level <> 1 or coalesce(v_profile_level, 1) <> 1 then
    raise exception '只能暂停 Starter 聊天 Circle 的席位';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('chat-user:' || v_membership.user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('chat-circle:' || coalesce(v_group.topic, '') || ':1', 0));

  select * into v_membership
  from public.group_members
  where id = p_membership_id
  for update;

  if p_paused then
    if v_membership.status <> 'active' then
      raise exception '这个席位当前不是活跃状态';
    end if;

    update public.group_members
    set status = 'paused',
        paused_at = now(),
        pause_reason = left(coalesce(nullif(trim(p_reason), ''), '连续 7 天未完成周同步'), 300),
        left_at = null
    where id = p_membership_id;
  else
    if v_membership.status <> 'paused' then
      raise exception '这个席位当前没有暂停';
    end if;

    if public.active_circle_count(v_membership.user_id, 'exploration') > 0 then
      raise exception '该用户已经加入了另一个聊天 Circle';
    end if;

    if v_group.status not in ('forming', 'active', 'full')
      or public.group_active_member_count(v_group.id) >= v_group.max_members then
      raise exception '原 Circle 已满或已结束，请让用户自己恢复匹配';
    end if;

    perform set_config('app.allow_starter_reactivation', 'on', true);

    update public.group_members
    set status = 'active',
        paused_at = null,
        pause_reason = '',
        left_at = null,
        joined_at = now()
    where id = p_membership_id;
  end if;

  perform public.refresh_group_status(v_group.id);
end;
$$;

create or replace function public.reactivate_starter_seat(p_membership_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.group_members%rowtype;
  v_group public.groups%rowtype;
  v_profile public.profiles%rowtype;
  v_expected_role text;
  v_expected_topic text;
  v_new_group_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('chat-user:' || v_user_id::text, 0));

  select * into v_membership
  from public.group_members
  where id = p_membership_id
    and user_id = v_user_id
    and status = 'paused'
  for update;

  if not found then
    raise exception '没有找到可恢复的 Starter 席位';
  end if;

  select * into v_group from public.groups where id = v_membership.group_id;
  select * into v_profile from public.profiles where id = v_user_id;

  if coalesce(v_profile.level, 1) <> 1 then
    raise exception '只有 Starter 席位可以通过此流程恢复';
  end if;

  if public.active_circle_count(v_user_id, 'exploration') > 0 then
    raise exception '你已经加入了一个聊天 Circle';
  end if;

  v_expected_role := case
    when lower(coalesce(v_profile.target_role, '')) = 'consulting' or v_profile.target_role = '咨询' then 'Consulting'
    else 'Finance'
  end;
  v_expected_topic := (
    case when v_profile.application_track = 'Summer Internship' then 'Summer' else 'Spring Week' end
    || ' ' || public.stage_label(1)
    || ' - ' || v_expected_role
    || ' Circle'
  );

  if v_group.circle_type = 'exploration'
    and v_group.level = 1
    and v_group.topic = v_expected_topic
    and v_group.status in ('forming', 'active', 'full')
    and public.group_active_member_count(v_group.id) < v_group.max_members then
    perform pg_advisory_xact_lock(hashtextextended('chat-circle:' || coalesce(v_group.topic, '') || ':1', 0));

    perform set_config('app.allow_starter_reactivation', 'on', true);

    update public.group_members
    set status = 'active',
        paused_at = null,
        pause_reason = '',
        left_at = null,
        joined_at = now()
    where id = p_membership_id;

    perform public.refresh_group_status(v_group.id);
    return v_group.id;
  end if;

  perform set_config('app.allow_starter_reactivation', 'on', true);

  update public.group_members
  set status = 'left',
      left_at = now(),
      paused_at = null
  where id = p_membership_id;

  select public.join_exploration_circle(v_expected_topic, 1) into v_new_group_id;
  return v_new_group_id;
end;
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
    else 'Competitive'
  end;
$$;

create or replace function public.challenge_label(p_level int)
returns text
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_level, 1)
    when 1 then '入门难度'
    when 2 then '进阶难度'
    else '高阶难度'
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

create or replace function public.refresh_group_status(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_max int;
  v_type text;
begin
  select public.group_active_member_count(g.id), g.max_members, g.circle_type
  into v_count, v_max, v_type
  from public.groups g
  where g.id = p_group_id;

  if v_type is null then
    return;
  end if;

  update public.groups
  set status = case
    when v_count >= v_max then 'full'
    when v_type = 'exploration' and v_count < 3 then 'forming'
    else 'active'
  end
  where id = p_group_id
    and status in ('forming', 'active', 'full');
end;
$$;

create or replace function public.can_view_submission(p_submission_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_submissions ts
    where ts.id = p_submission_id
      and (
        (
          ts.award_rank between 1 and 3
          and exists (
            select 1
            from public.tasks winner_task
            where winner_task.id = ts.task_id
              and (
                winner_task.status <> 'open'
                or (winner_task.ends_at is not null and winner_task.ends_at <= now())
              )
          )
        )
        or ts.submitted_by = p_user_id
        or exists (
          select 1
          from public.task_submission_contributors tsc
          where tsc.submission_id = ts.id
            and tsc.user_id = p_user_id
        )
        or public.is_group_member(ts.group_id, p_user_id)
        or (
          public.is_task_participant(ts.task_id, p_user_id)
          and exists (
            select 1
            from public.tasks t
            where t.id = ts.task_id
              and (t.status <> 'open' or (t.ends_at is not null and t.ends_at <= now()))
          )
        )
        or public.is_admin(p_user_id)
      )
  );
$$;

create or replace function public.peer_circle_weekly_leaderboard(p_group_id uuid)
returns table (
  user_id uuid,
  display_name text,
  group_id uuid,
  group_name text,
  apps int,
  networking int,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_topic text;
  v_level int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_group_member(p_group_id, v_user_id) then
    raise exception '只有当前聊天 Circle 成员可以查看同类周榜';
  end if;

  select g.topic, g.level
  into v_topic, v_level
  from public.groups g
  where g.id = p_group_id
    and g.circle_type = 'exploration';

  if v_topic is null then
    raise exception '聊天 Circle 不存在';
  end if;

  return query
  select
    wc.user_id,
    coalesce(p.display_name, '用户'),
    wc.group_id,
    g.name,
    wc.apps,
    wc.networking,
    wc.updated_at
  from public.weekly_checkins wc
  join public.groups g on g.id = wc.group_id
  left join public.profiles p on p.id = wc.user_id
  where g.circle_type = 'exploration'
    and g.topic = v_topic
    and g.level = v_level
    and g.status in ('forming', 'active', 'full')
    and wc.week_start = date_trunc('week', now() at time zone 'UTC')::date
  order by wc.updated_at desc;
end;
$$;

create or replace function public.refresh_challenge_lifecycle()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('challenge-schedule', 0));

  update public.tasks
  set status = 'closed',
      is_featured = false
  where status = 'open'
    and ends_at is not null
    and ends_at <= now();

  update public.groups g
  set status = 'completed'
  from public.tasks t
  where g.task_id = t.id
    and g.circle_type = 'task'
    and g.status in ('forming', 'active', 'full')
    and (
      t.status <> 'open'
      or (t.ends_at is not null and t.ends_at <= now())
    );
end;
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
  v_previous_group_id uuid;
  v_count int;
  v_max int;
  v_suffix int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialize joins per user so simultaneous requests cannot bypass the
  -- maximum of three active Challenge Circles.
  perform pg_advisory_xact_lock(hashtextextended('task-user:' || v_user_id::text, 0));
  perform pg_advisory_xact_lock_shared(hashtextextended('challenge-schedule', 0));

  select * into v_task
  from public.tasks
  where id = p_task_id
    and status = 'open'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now());

  if not found then
    raise exception 'Task not found or not open';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('task-circle:' || p_task_id::text, 0));

  if exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = v_user_id
      and gm.status = 'removed'
      and g.task_id = p_task_id
      and g.circle_type = 'task'
  ) then
    raise exception '你已被移出这场 Challenge，不能重新加入';
  end if;

  -- Already in a circle for this task and difficulty.
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

  -- A participant may return to the same team, but cannot enter a second
  -- team for the same round after leaving the first one.
  select g.id into v_previous_group_id
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  where gm.user_id = v_user_id
    and gm.status = 'left'
    and g.task_id = p_task_id
    and g.circle_type = 'task'
  order by gm.joined_at asc, gm.id asc
  limit 1;

  if v_previous_group_id is not null then
    select public.group_active_member_count(g.id), g.max_members
    into v_count, v_max
    from public.groups g
    where g.id = v_previous_group_id
      and g.status in ('forming', 'active', 'full');

    if v_count is null or v_count >= v_max then
      raise exception '你已参加这场 Challenge，原队伍已满或已结束，不能加入另一支队伍';
    end if;

    if public.active_circle_count(v_user_id, 'task') >= 3 then
      raise exception '你最多同时加入 3 个进行中的 Challenge Circle';
    end if;

    update public.group_members
    set status = 'active', left_at = null, joined_at = now()
    where group_id = v_previous_group_id
      and user_id = v_user_id;

    perform public.refresh_group_status(v_previous_group_id);
    return v_previous_group_id;
  end if;

  if public.active_circle_count(v_user_id, 'task') >= 3 then
    raise exception '你最多同时加入 3 个进行中的 Challenge Circle';
  end if;

  -- Find a not-full circle for the same task difficulty.
  select g.id into v_group_id
  from public.groups g
  where g.task_id = p_task_id
    and g.circle_type = 'task'
    and g.level = v_task.level
    and g.status in ('forming', 'active')
    and public.group_active_member_count(g.id) < g.max_members
    and not exists (
      select 1
      from public.task_submissions submitted
      where submitted.group_id = g.id
    )
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
      v_task.title || ' · ' || public.challenge_label(v_task.level) || ' Circle ' || v_suffix,
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
  v_profile public.profiles%rowtype;
  v_my_level int;
  v_expected_role text;
  v_expected_topic text;
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

  v_my_level := coalesce(v_profile.level, 1);
  v_level := coalesce(p_level, v_my_level);
  v_expected_role := case
    when lower(coalesce(v_profile.target_role, '')) = 'consulting' or v_profile.target_role = '咨询' then 'Consulting'
    else 'Finance'
  end;

  if coalesce(v_profile.application_track, '') in ('Spring Week', 'Summer Internship') then
    v_level := least(greatest(v_level, 1), 3);
    if v_level <> least(greatest(v_my_level, 1), 3) then
      raise exception '你只能加入自己当前申请层级的聊天 Circle';
    end if;
  elsif v_level <> v_my_level then
    raise exception '你只能加入自己当前阶段的聊天 Circle';
  end if;

  -- Serialize every chat-circle action for this user before locking a topic.
  perform pg_advisory_xact_lock(hashtextextended('chat-user:' || v_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('chat-circle:' || p_topic || ':' || v_level::text, 0));

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

  if exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = v_user_id
      and gm.status = 'paused'
      and g.circle_type = 'exploration'
  ) then
    raise exception '你的 Starter 席位已暂停，请先恢复匹配';
  end if;

  v_expected_topic := (
    case
      when coalesce(v_profile.application_track, '') = 'Summer Internship' then 'Summer'
      else 'Spring Week'
    end
    || ' ' || public.stage_label(v_level)
    || ' - ' || v_expected_role
    || ' Circle'
  );

  if p_topic is distinct from v_expected_topic then
    raise exception '你只能加入与自己的申请路径、层级和岗位大类一致的聊天 Circle';
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
    values (p_topic || ' · ' || public.stage_label(v_level) || ' Circle ' || v_suffix, 'exploration', p_topic, v_level, 6, 'forming')
    returning id into v_group_id;
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (v_group_id, v_user_id, 'member', 'active')
  on conflict (group_id, user_id)
  do update set status = 'active', left_at = null, joined_at = now();

  perform public.refresh_group_status(v_group_id);

  return v_group_id;
end;
$$;

create or replace function public.rematch_exploration_circle(p_topic text, p_level int default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('chat-user:' || v_user_id::text, 0));

  update public.group_members gm
  set status = 'left',
      left_at = now()
  from public.groups g
  where g.id = gm.group_id
    and gm.user_id = v_user_id
    and gm.status = 'active'
    and g.circle_type = 'exploration';

  update public.groups g
  set status = case
    when public.group_active_member_count(g.id) < 3 then 'forming'
    else 'active'
  end
  where g.circle_type = 'exploration'
    and g.status in ('active', 'full')
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = g.id
        and gm.user_id = v_user_id
        and gm.status = 'left'
        and gm.left_at = now()
    );

  select public.join_exploration_circle(p_topic, p_level)
  into v_group_id;

  return v_group_id;
end;
$$;

create or replace function public.approve_circle_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.circle_requests%rowtype;
  v_group_id uuid;
  v_count int;
  v_requester_level int;
  v_requester_track text;
  v_requester_role text;
  v_expected_topic text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_admin(v_user_id) then
    raise exception '只有管理员可以通过建群申请';
  end if;

  select *
  into v_request
  from public.circle_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception '建群申请不存在';
  end if;

  if v_request.status not in ('pending', 'approved') then
    raise exception '这个申请已经处理过了';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('chat-user:' || v_request.requester_id::text, 0));

  select level, application_track,
    case when lower(coalesce(target_role, '')) = 'consulting' or target_role = '咨询' then 'Consulting' else 'Finance' end
  into v_requester_level, v_requester_track, v_requester_role
  from public.profiles
  where id = v_request.requester_id;

  if v_requester_level is null then
    raise exception '申请人资料不存在';
  end if;

  if v_request.level <> v_requester_level then
    raise exception '建群申请层级和申请人当前层级不一致';
  end if;

  v_expected_topic := (
    case when coalesce(v_requester_track, '') = 'Summer Internship' then 'Summer' else 'Spring Week' end
    || ' ' || public.stage_label(v_requester_level)
    || ' - ' || v_requester_role
    || ' Circle'
  );

  if v_request.topic is distinct from v_expected_topic then
    raise exception '建群申请必须与申请人的路径、层级和岗位大类一致';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('chat-circle:' || v_request.topic || ':' || v_request.level::text, 0));

  select g.id
  into v_group_id
  from public.groups g
  where g.circle_type = 'exploration'
    and g.topic = v_request.topic
    and g.level = v_request.level
    and g.status in ('forming', 'active')
    and public.group_active_member_count(g.id) < g.max_members
  order by public.group_active_member_count(g.id) desc, g.created_at asc
  limit 1;

  if v_group_id is null then
    insert into public.groups (name, circle_type, topic, level, max_members, status)
    values (
      v_request.topic || ' · ' || public.stage_label(v_request.level) || ' Circle',
      'exploration',
      v_request.topic,
      v_request.level,
      6,
      'forming'
    )
    returning id into v_group_id;
  end if;

  update public.group_members gm
  set status = 'left',
      left_at = now()
  from public.groups g
  where g.id = gm.group_id
    and gm.user_id = v_request.requester_id
    and gm.status = 'active'
    and g.circle_type = 'exploration'
    and gm.group_id <> v_group_id;

  update public.groups g
  set status = case
    when public.group_active_member_count(g.id) < 3 then 'forming'
    else 'active'
  end
  where g.circle_type = 'exploration'
    and g.status in ('active', 'full')
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = g.id
        and gm.user_id = v_request.requester_id
        and gm.status = 'left'
        and gm.left_at = now()
    );

  insert into public.group_members (group_id, user_id, role, status)
  values (v_group_id, v_request.requester_id, 'host', 'active')
  on conflict (group_id, user_id)
  do update set role = 'host', status = 'active', left_at = null, joined_at = now();

  perform public.refresh_group_status(v_group_id);

  update public.circle_requests
  set status = 'matched',
      admin_note = '已创建或匹配到聊天 Circle',
      updated_at = now()
  where id = p_request_id;

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
  v_week_start date := date_trunc('week', now() at time zone 'UTC')::date;
  v_expected_role text;
  v_expected_topic text;
  v_sync_weeks int := 0;
  v_current_syncs int := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('profile-level:' || v_user_id::text, 0));

  select * into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if coalesce(v_profile.application_track, '') not in ('Spring Week', 'Summer Internship') then
    raise exception 'Ready 解锁只用于 Spring Week 和 Summer Internship';
  end if;

  if coalesce(v_profile.level, 1) <> 1 then
    raise exception '你当前已经不是 Starter';
  end if;

  if public.active_circle_count(v_user_id, 'exploration') < 1 then
    raise exception '先加入一个长期聊天 Circle，再解锁 Ready';
  end if;

  v_expected_role := case
    when lower(coalesce(v_profile.target_role, '')) = 'consulting' or v_profile.target_role = '咨询' then 'Consulting'
    else 'Finance'
  end;
  v_expected_topic := (
    case when v_profile.application_track = 'Summer Internship' then 'Summer' else 'Spring Week' end
    || ' ' || public.stage_label(1)
    || ' - ' || v_expected_role
    || ' Circle'
  );

  if not exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = v_user_id
      and gm.status = 'active'
      and g.circle_type = 'exploration'
      and g.level = 1
      and g.topic = v_expected_topic
      and public.group_active_member_count(g.id) >= 3
  ) then
    raise exception 'Starter Circle 至少有 3 名活跃成员后才能解锁 Ready';
  end if;

  if coalesce(v_profile.target_role, '') = ''
    or coalesce(v_profile.application_progress, '') = ''
    or coalesce(v_profile.intensity, '') = '' then
    raise exception '请先补全申请画像';
  end if;

  select count(distinct wc.week_start)::int
  into v_sync_weeks
  from public.weekly_checkins wc
  join public.groups g on g.id = wc.group_id
  where wc.user_id = v_user_id
    and g.circle_type = 'exploration'
    and g.level = 1
    and g.topic = v_expected_topic
    and wc.week_start in (v_week_start, v_week_start - 7)
    and (v_profile.level_reset_at is null or wc.updated_at > v_profile.level_reset_at);

  select count(*)::int
  into v_current_syncs
  from public.weekly_checkins wc
  join public.groups g on g.id = wc.group_id
  where wc.user_id = v_user_id
    and g.circle_type = 'exploration'
    and g.level = 1
    and g.topic = v_expected_topic
    and wc.week_start = v_week_start
    and (v_profile.level_reset_at is null or wc.updated_at > v_profile.level_reset_at);

  if v_current_syncs < 1 then
    raise exception '本周完成一次周同步后才能解锁 Ready';
  end if;

  if v_sync_weeks < 2 then
    raise exception '至少连续两周同步后才能解锁 Ready';
  end if;

  perform set_config('app.profile_system_update', 'on', true);

  update public.profiles
  set level = 2,
      updated_at = now()
  where id = v_user_id
    and level = 1;

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
  v_circle_type text;
  v_task_id uuid;
  v_topic text;
  v_level int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select g.circle_type, g.task_id, g.topic, g.level
  into v_circle_type, v_task_id, v_topic, v_level
  from public.groups g
  where g.id = p_group_id;

  if v_circle_type is null then
    raise exception 'Circle 不存在';
  end if;

  -- Use the same lock order as the corresponding join flow. This keeps the
  -- final member count and Circle status correct when joins/leaves overlap.
  if v_circle_type = 'exploration' then
    perform pg_advisory_xact_lock(hashtextextended('chat-user:' || v_user_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended('chat-circle:' || coalesce(v_topic, '') || ':' || v_level::text, 0));
  elsif v_task_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('task-user:' || v_user_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended('task-circle:' || v_task_id::text, 0));
  end if;

  update public.group_members
  set status = 'left', left_at = now()
  where group_id = p_group_id
    and user_id = v_user_id
    and status = 'active';

  if not found then
    raise exception '你已经不在这个 Circle 里';
  end if;

  perform public.refresh_group_status(p_group_id);
end;
$$;

drop function if exists public.submit_task_result(uuid, text, text, text);

create or replace function public.submit_task_result(
  p_group_id uuid,
  p_title text,
  p_content text,
  p_submission_url text default null,
  p_file_path text default null,
  p_file_name text default null,
  p_file_mime text default null,
  p_file_size bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_task_id uuid;
  v_submission_id uuid;
  v_task_open boolean := false;
  v_is_new_submission boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_group_member(p_group_id, v_user_id) then
    raise exception '只有 Circle 成员可以提交 Challenge 结果';
  end if;

  select g.task_id
  into v_task_id
  from public.groups g
  where g.id = p_group_id
    and g.circle_type = 'task'
    and g.status in ('forming', 'active', 'full');

  if v_task_id is null then
    raise exception '这个 Challenge Circle 已结束或不可用';
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('challenge-schedule', 0));

  select (
    t.status = 'open'
    and (t.starts_at is null or t.starts_at <= now())
    and (t.ends_at is null or t.ends_at > now())
  )
  into v_task_open
  from public.tasks t
  where t.id = v_task_id;

  if not coalesce(v_task_open, false) then
    raise exception 'Challenge 已截止，不能继续提交或修改成果';
  end if;

  if char_length(trim(coalesce(p_title, ''))) not between 3 and 160 then
    raise exception '成果标题需要在 3 到 160 个字符之间';
  end if;

  if char_length(trim(coalesce(p_content, ''))) not between 20 and 8000 then
    raise exception '提交说明需要在 20 到 8000 个字符之间';
  end if;

  if nullif(trim(coalesce(p_submission_url, '')), '') is null
     and nullif(trim(coalesce(p_file_path, '')), '') is null then
    raise exception '请上传成果文件，或填写外部链接';
  end if;

  if nullif(trim(coalesce(p_submission_url, '')), '') is not null
     and trim(p_submission_url) !~* '^https?://[^[:space:]]+$' then
    raise exception '成果链接必须是 http 或 https 地址';
  end if;

  if nullif(trim(coalesce(p_file_path, '')), '') is not null
     and (coalesce(p_file_size, -1) < 0 or p_file_size > 52428800) then
    raise exception '成果文件大小无效，单个文件不能超过 50MB';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('task-submit:' || p_group_id::text, 0));

  if nullif(trim(coalesce(p_file_path, '')), '') is not null
    and p_file_path not like p_group_id::text || '/' || v_user_id::text || '/%'
    and not exists (
      select 1
      from public.task_submissions ts
      where ts.group_id = p_group_id
        and ts.submission_file_path = p_file_path
    )
  then
    raise exception '成果文件路径无效';
  end if;

  if nullif(trim(coalesce(p_file_path, '')), '') is not null
    and not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'submission-files'
        and o.name = p_file_path
    )
  then
    raise exception '成果文件不存在，请重新上传后提交';
  end if;

  if exists (
    select 1
    from public.task_submissions ts
    where ts.group_id = p_group_id
      and ts.award_rank is not null
  ) then
    raise exception '已获奖作品不能修改';
  end if;

  select not exists (
    select 1 from public.task_submissions ts where ts.group_id = p_group_id
  ) into v_is_new_submission;

  if not v_is_new_submission and not exists (
    select 1
    from public.task_submission_contributors contributor
    join public.task_submissions existing on existing.id = contributor.submission_id
    where existing.group_id = p_group_id
      and contributor.user_id = v_user_id
  ) then
    raise exception '这份成果已锁定首次提交时的小队成员，后加入的成员不能覆盖作品';
  end if;

  insert into public.task_submissions (
    task_id,
    group_id,
    submitted_by,
    title,
    submission_url,
    submission_file_path,
    submission_file_name,
    submission_file_mime,
    submission_file_size,
    content,
    score
  )
  values (
    v_task_id,
    p_group_id,
    v_user_id,
    trim(p_title),
    nullif(trim(p_submission_url), ''),
    nullif(p_file_path, ''),
    nullif(p_file_name, ''),
    nullif(p_file_mime, ''),
    p_file_size,
    trim(p_content),
    0
  )
  on conflict (group_id)
  do update set
    title = excluded.title,
    submission_url = excluded.submission_url,
    submission_file_path = excluded.submission_file_path,
    submission_file_name = excluded.submission_file_name,
    submission_file_mime = excluded.submission_file_mime,
    submission_file_size = excluded.submission_file_size,
    content = excluded.content,
    created_at = now()
  returning id into v_submission_id;

  -- Freeze the credited team when the work is first submitted. Later edits do not
  -- silently add newcomers or remove people who helped before leaving the Circle.
  if v_is_new_submission then
    insert into public.task_submission_contributors (submission_id, user_id)
    select v_submission_id, gm.user_id
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.status = 'active'
    on conflict (submission_id, user_id) do nothing;
  end if;

  return v_submission_id;
end;
$$;

create or replace function public.set_submission_rank(p_submission_id uuid, p_rank int default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_task_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_admin(v_user_id) then
    raise exception '只有管理员可以设置 Challenge 名次';
  end if;

  if p_rank is not null and p_rank not between 1 and 3 then
    raise exception '名次只能是第 1、2、3 名';
  end if;

  select task_id into v_task_id
  from public.task_submissions
  where id = p_submission_id;

  if v_task_id is null then
    raise exception '提交不存在';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('task-rank:' || v_task_id::text, 0));

  perform 1
  from public.task_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception '提交不存在';
  end if;

  if p_rank is not null and exists (
    select 1
    from public.tasks t
    where t.id = v_task_id
      and t.status = 'open'
      and (t.ends_at is null or t.ends_at > now())
  ) then
    raise exception 'Challenge 截止后才能设置名次';
  end if;

  if p_rank is not null then
    update public.task_submissions
    set award_rank = null,
        award_title = null
    where task_id = v_task_id
      and award_rank = p_rank
      and id <> p_submission_id;
  end if;

  update public.task_submissions
  set award_rank = p_rank,
      award_title = null
  where id = p_submission_id;
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
  v_inviter_track text;
  v_inviter_role text;
  v_invitee_level int;
  v_invitee_track text;
  v_invitee_role text;
  v_group_level int;
  v_group_type text;
  v_group_topic text;
  v_expected_topic text;
  v_invite_id uuid;
begin
  if v_inviter_id is null then
    raise exception 'Not authenticated';
  end if;

  select level, application_track,
    case when lower(coalesce(target_role, '')) = 'consulting' or target_role = '咨询' then 'Consulting' else 'Finance' end
  into v_inviter_level, v_inviter_track, v_inviter_role
  from public.profiles
  where id = v_inviter_id;

  select level, application_track,
    case when lower(coalesce(target_role, '')) = 'consulting' or target_role = '咨询' then 'Consulting' else 'Finance' end
  into v_invitee_level, v_invitee_track, v_invitee_role
  from public.profiles
  where id = p_invitee_id;

  if v_invitee_level is null then
    raise exception 'Invitee not found';
  end if;

  if v_inviter_level <> 3 or v_invitee_level <> 2 then
    raise exception '升级邀请只用于 Ready 到 Competitive；Starter 通过连续两周同步自行解锁 Ready';
  end if;

  if v_inviter_track is distinct from v_invitee_track
     or v_inviter_role is distinct from v_invitee_role then
    raise exception '只能邀请同一申请路径和岗位大类的候选人升级';
  end if;

  select circle_type, level, topic
  into v_group_type, v_group_level, v_group_topic
  from public.groups
  where id = p_group_id;

  if v_group_type is null then
    raise exception 'Circle not found';
  end if;

  if v_group_type <> 'exploration' then
    raise exception '升级邀请只能基于聊天 Circle 发出';
  end if;

  if v_group_level <> v_invitee_level then
    raise exception '只能基于候选人当前阶段的聊天 Circle 发出升级邀请';
  end if;

  v_expected_topic := (
    case when coalesce(v_invitee_track, '') = 'Summer Internship' then 'Summer' else 'Spring Week' end
    || ' ' || public.stage_label(v_invitee_level)
    || ' - ' || v_invitee_role
    || ' Circle'
  );

  if v_group_topic is distinct from v_expected_topic then
    raise exception '只能基于候选人当前申请路径所在的聊天 Circle 发出邀请';
  end if;

  if not public.is_group_member(p_group_id, p_invitee_id) then
    raise exception '候选人必须是这个聊天 Circle 的成员';
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
    3,
    p_reason,
    'pending'
  )
  on conflict (inviter_id, invitee_id, target_level) where status = 'pending'
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
  v_user_track text;
  v_user_role text;
  v_user_level int;
  v_inviter_track text;
  v_inviter_role text;
  v_inviter_level int;
  v_target_level int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('profile-level:' || v_user_id::text, 0));

  select * into v_invite
  from public.promotion_invites
  where id = p_invite_id
    and invitee_id = v_user_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if p_accept then
    if v_invite.from_level <> 2 or v_invite.target_level <> 3 then
      raise exception '旧升级邀请已失效；Starter 通过周同步解锁 Ready，邀请只用于 Ready 到 Competitive';
    end if;

    select level, application_track,
      case when lower(coalesce(target_role, '')) = 'consulting' or target_role = '咨询' then 'Consulting' else 'Finance' end
    into v_user_level, v_user_track, v_user_role
    from public.profiles
    where id = v_user_id
    for update;

    select level, application_track,
      case when lower(coalesce(target_role, '')) = 'consulting' or target_role = '咨询' then 'Consulting' else 'Finance' end
    into v_inviter_level, v_inviter_track, v_inviter_role
    from public.profiles
    where id = v_invite.inviter_id;

    if v_user_level is distinct from v_invite.from_level
       or v_inviter_level is distinct from v_invite.target_level
       or v_user_track is distinct from v_inviter_track
       or v_user_role is distinct from v_inviter_role then
      raise exception '邀请已因双方阶段或申请方向变化而失效';
    end if;

    v_target_level := case
      when coalesce(v_user_track, '') in ('Spring Week', 'Summer Internship') then least(v_invite.target_level, 3)
      else v_invite.target_level
    end;

    perform set_config('app.profile_system_update', 'on', true);

    update public.profiles
    set level = case
          when coalesce(v_user_track, '') in ('Spring Week', 'Summer Internship') then least(greatest(level, v_target_level), 3)
          else greatest(level, v_target_level)
        end,
        updated_at = now()
    where id = v_user_id;
  end if;

  update public.promotion_invites
  set status = case when p_accept then 'accepted' else 'declined' end,
      resolved_at = now()
  where id = p_invite_id;

  if p_accept then
    update public.promotion_invites
    set status = 'cancelled',
        resolved_at = now()
    where invitee_id = v_user_id
      and status = 'pending'
      and id <> p_invite_id;
  end if;
end;
$$;

create or replace function public.endorse_profile(
  p_target_id uuid,
  p_tag text,
  p_note text default '',
  p_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endorser_id uuid := auth.uid();
  v_endorser_level int;
  v_endorser_track text;
  v_endorser_role text;
  v_target_level int;
  v_target_track text;
  v_target_role text;
  v_group_level int;
  v_group_type text;
  v_group_topic text;
  v_expected_topic text;
  v_endorsement_id uuid;
begin
  if v_endorser_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_endorser_id = p_target_id then
    raise exception '不能给自己添加推荐标签';
  end if;

  select level, application_track,
    case when lower(coalesce(target_role, '')) = 'consulting' or target_role = '咨询' then 'Consulting' else 'Finance' end
  into v_endorser_level, v_endorser_track, v_endorser_role
  from public.profiles
  where id = v_endorser_id;

  select level, application_track,
    case when lower(coalesce(target_role, '')) = 'consulting' or target_role = '咨询' then 'Consulting' else 'Finance' end
  into v_target_level, v_target_track, v_target_role
  from public.profiles
  where id = p_target_id;

  if v_target_level is null then
    raise exception 'Target profile not found';
  end if;

  if not public.is_admin(v_endorser_id) then
    if v_endorser_level <> v_target_level + 1 then
      raise exception '只有高一阶段用户可以给候选人添加推荐标签';
    end if;

    if v_endorser_track is distinct from v_target_track
       or v_endorser_role is distinct from v_target_role then
      raise exception '只能评价同一申请路径和岗位大类的候选人';
    end if;

    if p_group_id is null then
      raise exception '推荐标签必须基于一个聊天 Circle';
    end if;

    select circle_type, level, topic
    into v_group_type, v_group_level, v_group_topic
    from public.groups
    where id = p_group_id;

    if v_group_type <> 'exploration' then
      raise exception '推荐标签只能基于聊天 Circle';
    end if;

    if v_group_level <> v_target_level then
      raise exception '只能基于候选人当前阶段的聊天 Circle 添加推荐标签';
    end if;

    v_expected_topic := (
      case when coalesce(v_target_track, '') = 'Summer Internship' then 'Summer' else 'Spring Week' end
      || ' ' || public.stage_label(v_target_level)
      || ' - ' || v_target_role
      || ' Circle'
    );

    if v_group_topic is distinct from v_expected_topic then
      raise exception '只能基于候选人当前申请路径所在的聊天 Circle 添加标签';
    end if;

    if not public.is_group_member(p_group_id, p_target_id) then
      raise exception '候选人必须是这个聊天 Circle 的成员';
    end if;

    if not public.can_view_group(p_group_id, v_endorser_id) then
      raise exception '你没有权限基于这个 Circle 添加推荐标签';
    end if;
  end if;

  insert into public.profile_endorsements (endorser_id, target_id, group_id, tag, note)
  values (v_endorser_id, p_target_id, p_group_id, trim(p_tag), coalesce(trim(p_note), ''))
  on conflict (endorser_id, target_id, tag)
  do update set group_id = excluded.group_id, note = excluded.note, created_at = now()
  returning id into v_endorsement_id;

  return v_endorsement_id;
end;
$$;

create or replace function public.upsert_weekly_checkin(
  p_group_id uuid,
  p_apps int,
  p_networking int,
  p_learning text,
  p_blocker text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_week_start date := date_trunc('week', now() at time zone 'UTC')::date;
  v_checkin_id uuid;
  v_message_id uuid;
  v_content text;
  v_group_type text;
  v_group_status text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_group_member(p_group_id, v_user_id) then
    raise exception '只有 Circle 成员可以同步进度';
  end if;

  select circle_type, status into v_group_type, v_group_status
  from public.groups
  where id = p_group_id;

  if v_group_type <> 'exploration' then
    raise exception '周同步只用于长期聊天 Circle';
  end if;

  if v_group_status not in ('forming', 'active', 'full') then
    raise exception '这个 Circle 当前不能同步进度';
  end if;

  insert into public.weekly_checkins (
    group_id,
    user_id,
    week_start,
    apps,
    networking,
    learning,
    blocker
  )
  values (
    p_group_id,
    v_user_id,
    v_week_start,
    greatest(0, least(coalesce(p_apps, 0), 500)),
    greatest(0, least(coalesce(p_networking, 0), 500)),
    left(coalesce(nullif(trim(p_learning), ''), '还没写'), 1000),
    left(coalesce(nullif(trim(p_blocker), ''), '暂时没有'), 1000)
  )
  on conflict (group_id, user_id, week_start)
  do update set
    apps = excluded.apps,
    networking = excluded.networking,
    learning = excluded.learning,
    blocker = excluded.blocker,
    updated_at = now()
  returning id into v_checkin_id;

  v_content := concat(
    '【周同步】', E'\n',
    '类型：更新本周进度', E'\n',
    '申请：', greatest(0, least(coalesce(p_apps, 0), 500)), E'\n',
    'Networking：', greatest(0, least(coalesce(p_networking, 0), 500)), E'\n',
    '学到了什么：', left(coalesce(nullif(trim(p_learning), ''), '还没写'), 1000), E'\n',
    '卡点：', left(coalesce(nullif(trim(p_blocker), ''), '暂时没有'), 1000)
  );

  select message_id into v_message_id
  from public.weekly_checkins
  where id = v_checkin_id;

  if v_message_id is null then
    insert into public.messages (group_id, user_id, content, message_type)
    values (p_group_id, v_user_id, v_content, 'text')
    returning id into v_message_id;

    update public.weekly_checkins
    set message_id = v_message_id
    where id = v_checkin_id;
  else
    update public.messages
    set content = v_content
    where id = v_message_id
      and group_id = p_group_id
      and user_id = v_user_id;
  end if;

  return v_checkin_id;
end;
$$;

create or replace function public.create_challenge_round(
  p_title text,
  p_description text,
  p_category text,
  p_level int,
  p_deliverable text,
  p_format_guide text,
  p_group_size int,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_task_id uuid;
begin
  if v_user_id is null or not public.is_admin(v_user_id) then
    raise exception '只有管理员可以发布 Challenge';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('challenge-schedule', 0));

  if char_length(trim(coalesce(p_title, ''))) < 4 then
    raise exception 'Challenge 标题至少 4 个字';
  end if;
  if char_length(trim(coalesce(p_description, ''))) < 20 then
    raise exception 'Challenge 背景至少 20 个字';
  end if;
  if char_length(trim(coalesce(p_deliverable, ''))) < 5
     or char_length(trim(coalesce(p_format_guide, ''))) < 5 then
    raise exception '请填写清楚交付物和格式要求';
  end if;
  if p_level not between 1 and 3 then
    raise exception '难度只能是入门、进阶或高阶';
  end if;
  if p_group_size not between 2 and 12 then
    raise exception '每组人数必须在 2 到 12 人之间';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception '开始和截止时间无效';
  end if;
  if p_ends_at <= now() then
    raise exception '截止时间必须晚于当前时间';
  end if;
  if p_ends_at > p_starts_at + interval '60 days' then
    raise exception '单个 Challenge 最长为 60 天';
  end if;

  if exists (
    select 1
    from public.tasks t
    where t.status = 'open'
      and lower(trim(t.title)) = lower(trim(p_title))
      and coalesce(t.ends_at, 'infinity'::timestamptz) > p_starts_at
      and coalesce(t.starts_at, '-infinity'::timestamptz) < p_ends_at
  ) then
    raise exception '同名 Challenge 已有重叠赛期';
  end if;

  if (
    select count(*)
    from public.tasks t
    where t.status = 'open'
      and coalesce(t.ends_at, 'infinity'::timestamptz) > p_starts_at
      and coalesce(t.starts_at, '-infinity'::timestamptz) < p_ends_at
  ) >= 2 then
    raise exception '同一时间最多开放 2 个 Challenge，请先结束现有赛期或调整时间';
  end if;

  insert into public.tasks (
    title, description, category, level, deliverable, format_guide,
    group_size, duration_days, is_featured, starts_at, ends_at, status
  ) values (
    trim(p_title), trim(p_description), coalesce(nullif(trim(p_category), ''), 'General'),
    p_level, trim(p_deliverable), trim(p_format_guide), p_group_size,
    greatest(1, least(60, ceil(extract(epoch from (p_ends_at - p_starts_at)) / 86400.0)::int)),
    true, p_starts_at, p_ends_at,
    'open'
  ) returning id into v_task_id;

  return v_task_id;
end;
$$;

create or replace function public.set_challenge_status(p_task_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.is_admin(v_user_id) then
    raise exception '只有管理员可以管理 Challenge';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('challenge-schedule', 0));

  if p_status not in ('closed', 'archived') then
    raise exception 'Challenge 状态无效';
  end if;

  update public.tasks
  set status = p_status,
      is_featured = false
  where id = p_task_id;

  if not found then
    raise exception 'Challenge 不存在';
  end if;

  if p_status in ('closed', 'archived') then
    update public.groups
    set status = 'completed'
    where task_id = p_task_id
      and circle_type = 'task'
      and status in ('forming', 'active', 'full');
  end if;
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.messages enable row level security;
alter table public.group_read_states enable row level security;
alter table public.task_submissions enable row level security;
alter table public.task_submission_contributors enable row level security;
alter table public.promotion_invites enable row level security;
alter table public.profile_endorsements enable row level security;
alter table public.weekly_checkins enable row level security;
alter table public.circle_requests enable row level security;

revoke all privileges on table public.profiles from anon, authenticated;
grant select (
  id,
  display_name,
  stage,
  direction,
  application_track,
  target_region,
  target_role,
  application_progress,
  intensity,
  bio,
  level,
  level_reset_at,
  created_at,
  updated_at
) on public.profiles to authenticated;

-- Functions are executable by PUBLIC by default in PostgreSQL. Remove anonymous
-- access explicitly, then expose only the helpers and actions used by RLS/app flows.
revoke execute on function public.my_level() from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.my_is_admin() from public, anon;
revoke execute on function public.protect_profile_admin_flag() from public, anon, authenticated;
revoke execute on function public.protect_paused_chat_seat() from public, anon, authenticated;
revoke execute on function public.is_group_member(uuid, uuid) from public, anon;
revoke execute on function public.is_task_participant(uuid, uuid) from public, anon;
revoke execute on function public.can_view_group(uuid, uuid) from public, anon;
revoke execute on function public.can_view_group_content(uuid, uuid, timestamptz) from public, anon;
revoke execute on function public.my_unread_group_counts() from public, anon;
revoke execute on function public.mark_group_read(uuid, timestamptz) from public, anon;
revoke execute on function public.admin_starter_memberships() from public, anon;
revoke execute on function public.admin_set_starter_seat(uuid, boolean, text) from public, anon;
revoke execute on function public.reactivate_starter_seat(uuid) from public, anon;
revoke execute on function public.active_circle_count(uuid, text) from public, anon, authenticated;
revoke execute on function public.stage_label(int) from public, anon, authenticated;
revoke execute on function public.challenge_label(int) from public, anon, authenticated;
revoke execute on function public.group_active_member_count(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_group_status(uuid) from public, anon, authenticated;
revoke execute on function public.can_view_submission(uuid, uuid) from public, anon;
revoke execute on function public.peer_circle_weekly_leaderboard(uuid) from public, anon;
revoke execute on function public.refresh_challenge_lifecycle() from public, anon;
revoke execute on function public.join_task_circle(uuid) from public, anon;
revoke execute on function public.join_exploration_circle(text, int) from public, anon;
revoke execute on function public.rematch_exploration_circle(text, int) from public, anon;
revoke execute on function public.approve_circle_request(uuid) from public, anon;
revoke execute on function public.unlock_ready_stage() from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.submit_task_result(uuid, text, text, text, text, text, text, bigint) from public, anon;
revoke execute on function public.set_submission_rank(uuid, int) from public, anon;
revoke execute on function public.invite_to_next_level(uuid, uuid, text) from public, anon;
revoke execute on function public.resolve_promotion_invite(uuid, boolean) from public, anon;
revoke execute on function public.endorse_profile(uuid, text, text, uuid) from public, anon;
revoke execute on function public.upsert_weekly_checkin(uuid, int, int, text, text) from public, anon;
revoke execute on function public.create_challenge_round(text, text, text, int, text, text, int, timestamptz, timestamptz) from public, anon;
revoke execute on function public.set_challenge_status(uuid, text) from public, anon;

grant execute on function public.my_level() to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.my_is_admin() to authenticated;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.is_task_participant(uuid, uuid) to authenticated;
grant execute on function public.can_view_group(uuid, uuid) to authenticated;
grant execute on function public.can_view_group_content(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.my_unread_group_counts() to authenticated;
grant execute on function public.mark_group_read(uuid, timestamptz) to authenticated;
grant execute on function public.admin_starter_memberships() to authenticated;
grant execute on function public.admin_set_starter_seat(uuid, boolean, text) to authenticated;
grant execute on function public.reactivate_starter_seat(uuid) to authenticated;
grant execute on function public.can_view_submission(uuid, uuid) to authenticated;
grant execute on function public.refresh_challenge_lifecycle() to authenticated;
grant execute on function public.join_task_circle(uuid) to authenticated;
grant execute on function public.join_exploration_circle(text, int) to authenticated;
grant execute on function public.rematch_exploration_circle(text, int) to authenticated;
grant execute on function public.approve_circle_request(uuid) to authenticated;
grant execute on function public.unlock_ready_stage() to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.set_submission_rank(uuid, int) to authenticated;
grant execute on function public.submit_task_result(uuid, text, text, text, text, text, text, bigint) to authenticated;
grant execute on function public.peer_circle_weekly_leaderboard(uuid) to authenticated;
grant execute on function public.invite_to_next_level(uuid, uuid, text) to authenticated;
grant execute on function public.resolve_promotion_invite(uuid, boolean) to authenticated;
grant execute on function public.endorse_profile(uuid, text, text, uuid) to authenticated;
grant execute on function public.upsert_weekly_checkin(uuid, int, int, text, text) to authenticated;
grant execute on function public.create_challenge_round(text, text, text, int, text, text, int, timestamptz, timestamptz) to authenticated;
grant execute on function public.set_challenge_status(uuid, text) to authenticated;
grant select on table public.task_submission_contributors to authenticated;
revoke all privileges on table public.group_read_states from public, anon, authenticated;
grant select on table public.group_read_states to authenticated;
revoke insert, update, delete on table public.tasks from anon, authenticated;
revoke insert, update, delete on table public.groups from anon, authenticated;
revoke insert, update, delete on table public.group_members from anon, authenticated;
revoke insert, update, delete on table public.task_submissions from anon, authenticated;
revoke insert, update, delete on table public.task_submission_contributors from anon, authenticated;
revoke insert, update, delete on table public.promotion_invites from anon, authenticated;
revoke insert, update, delete on table public.profile_endorsements from anon, authenticated;
revoke insert, update, delete on table public.weekly_checkins from anon, authenticated;
grant insert (
  id,
  email,
  display_name,
  stage,
  direction,
  application_track,
  target_region,
  target_role,
  application_progress,
  intensity,
  bio
) on public.profiles to authenticated;
grant update (
  display_name,
  stage,
  direction,
  application_track,
  target_region,
  target_role,
  application_progress,
  intensity,
  bio
) on public.profiles to authenticated;

drop policy if exists "chat_media_select_visible" on storage.objects;
drop policy if exists "chat_media_insert_members" on storage.objects;
drop policy if exists "chat_media_delete_own" on storage.objects;
drop policy if exists "submission_files_select_visible" on storage.objects;
drop policy if exists "submission_files_insert_members" on storage.objects;
drop policy if exists "submission_files_delete_own" on storage.objects;

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
using (public.can_view_group_content(messages.group_id, auth.uid(), messages.created_at));

create policy "messages_insert_members"
on public.messages for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_group_member(messages.group_id, auth.uid())
  and exists (
    select 1 from public.groups g
    where g.id = messages.group_id
      and (g.circle_type = 'task' or g.status in ('forming', 'active', 'full'))
  )
  and (
    (messages.message_type = 'text' and messages.media_path is null and messages.media_url is null)
    or (
      messages.message_type in ('image', 'file')
      and messages.media_url is null
      and messages.media_path like messages.group_id::text || '/' || auth.uid()::text || '/%'
      and exists (
        select 1 from storage.objects o
        where o.bucket_id = 'chat-media'
          and o.name = messages.media_path
      )
    )
  )
);

create policy "group_read_states_select_self"
on public.group_read_states for select
to authenticated
using (user_id = auth.uid());

create policy "weekly_checkins_select_visible"
on public.weekly_checkins for select
to authenticated
using (public.can_view_group_content(weekly_checkins.group_id, auth.uid(), weekly_checkins.updated_at));

create policy "weekly_checkins_insert_self"
on public.weekly_checkins for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_group_member(weekly_checkins.group_id, auth.uid())
);

create policy "weekly_checkins_update_self"
on public.weekly_checkins for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_group_member(weekly_checkins.group_id, auth.uid())
)
with check (
  user_id = auth.uid()
  and public.is_group_member(weekly_checkins.group_id, auth.uid())
);

create policy "circle_requests_select_own_or_lead"
on public.circle_requests for select
to authenticated
using (
  requester_id = auth.uid()
  or public.is_admin(auth.uid())
);

create policy "circle_requests_insert_self"
on public.circle_requests for insert
to authenticated
with check (
  requester_id = auth.uid()
  and status = 'pending'
);

create policy "circle_requests_update_own_pending"
on public.circle_requests for update
to authenticated
using (
  requester_id = auth.uid()
  and status = 'pending'
)
with check (
  requester_id = auth.uid()
  and status in ('pending', 'cancelled')
);

create policy "circle_requests_update_operator"
on public.circle_requests for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "chat_media_select_visible"
on storage.objects for select
to authenticated
using (
  bucket_id = 'chat-media'
  and public.can_view_group_content(
    (storage.foldername(name))[1]::uuid,
    auth.uid(),
    storage.objects.created_at
  )
);

create policy "chat_media_insert_members"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and public.is_group_member((storage.foldername(name))[1]::uuid, auth.uid())
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1 from public.groups g
    where g.id = (storage.foldername(name))[1]::uuid
      and (g.circle_type = 'task' or g.status in ('forming', 'active', 'full'))
  )
);

create policy "chat_media_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'chat-media'
  and public.is_group_member((storage.foldername(name))[1]::uuid, auth.uid())
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "submission_files_select_visible"
on storage.objects for select
to authenticated
using (
  bucket_id = 'submission-files'
  and exists (
    select 1
    from public.task_submissions ts
    where ts.group_id = (storage.foldername(name))[1]::uuid
      and ts.submission_file_path = storage.objects.name
      and public.can_view_submission(ts.id, auth.uid())
  )
);

create policy "submission_files_insert_members"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'submission-files'
  and public.is_group_member((storage.foldername(name))[1]::uuid, auth.uid())
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.groups g
    join public.tasks t on t.id = g.task_id
    where g.id = (storage.foldername(name))[1]::uuid
      and g.circle_type = 'task'
      and t.status = 'open'
      and (t.starts_at is null or t.starts_at <= now())
      and (t.ends_at is null or t.ends_at > now())
  )
);

create policy "submission_files_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'submission-files'
  and public.is_group_member((storage.foldername(name))[1]::uuid, auth.uid())
  and not exists (
    select 1
    from public.task_submissions ts
    where ts.submission_file_path = storage.objects.name
  )
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or exists (
      select 1
      from public.task_submissions ts
      where ts.group_id = (storage.foldername(name))[1]::uuid
    )
  )
);

create policy "submissions_select_visible"
on public.task_submissions for select
to authenticated
using (
  (
    award_rank between 1 and 3
    and exists (
      select 1
      from public.tasks winner_task
      where winner_task.id = task_submissions.task_id
        and (
          winner_task.status <> 'open'
          or (winner_task.ends_at is not null and winner_task.ends_at <= now())
        )
    )
  )
  or submitted_by = auth.uid()
  or exists (
    select 1
    from public.task_submission_contributors tsc
    where tsc.submission_id = task_submissions.id
      and tsc.user_id = auth.uid()
  )
  or public.is_group_member(task_submissions.group_id, auth.uid())
  or (
    public.is_task_participant(task_submissions.task_id, auth.uid())
    and exists (
      select 1
      from public.tasks t
      where t.id = task_submissions.task_id
        and (t.status <> 'open' or (t.ends_at is not null and t.ends_at <= now()))
    )
  )
  or public.is_admin(auth.uid())
);

create policy "submissions_insert_members"
on public.task_submissions for insert
to authenticated
with check (
  submitted_by = auth.uid()
  and public.is_group_member(task_submissions.group_id, auth.uid())
  and exists (
    select 1
    from public.groups g
    join public.tasks t on t.id = g.task_id
    where g.id = task_submissions.group_id
      and g.circle_type = 'task'
      and t.id = task_submissions.task_id
      and t.status = 'open'
      and (t.starts_at is null or t.starts_at <= now())
      and (t.ends_at is null or t.ends_at > now())
  )
);

create policy "submissions_update_members"
on public.task_submissions for update
to authenticated
using (
  public.is_group_member(task_submissions.group_id, auth.uid())
  and task_submissions.award_rank is null
  and exists (
    select 1
    from public.groups g
    join public.tasks t on t.id = g.task_id
    where g.id = task_submissions.group_id
      and g.circle_type = 'task'
      and t.id = task_submissions.task_id
      and t.status = 'open'
      and (t.starts_at is null or t.starts_at <= now())
      and (t.ends_at is null or t.ends_at > now())
  )
)
with check (
  submitted_by = auth.uid()
  and award_rank is null
  and exists (
    select 1
    from public.groups g
    join public.tasks t on t.id = g.task_id
    where g.id = task_submissions.group_id
      and g.circle_type = 'task'
      and t.id = task_submissions.task_id
      and t.status = 'open'
      and (t.starts_at is null or t.starts_at <= now())
      and (t.ends_at is null or t.ends_at > now())
  )
);

create policy "submissions_update_operator"
on public.task_submissions for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "submission_contributors_select_visible"
on public.task_submission_contributors for select
to authenticated
using (public.can_view_submission(submission_id, auth.uid()));

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

-- Production starts without demo users, demo Circles or seeded Challenges.
-- Create real Challenge rounds from the operator console.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end;
$$;

update public.groups g
set status = case
  when public.group_active_member_count(g.id) >= g.max_members then 'full'
  when public.group_active_member_count(g.id) < 3 then 'forming'
  else 'active'
end
where g.circle_type = 'exploration'
  and g.status in ('forming', 'active', 'full');

update public.promotion_invites
set status = 'cancelled', resolved_at = now()
where status = 'pending'
  and (from_level <> 2 or target_level <> 3);

select public.refresh_challenge_lifecycle();

notify pgrst, 'reload schema';

commit;
