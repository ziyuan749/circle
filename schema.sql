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
      and tablename in ('profiles', 'tasks', 'groups', 'group_members', 'messages', 'task_submissions', 'task_submission_contributors', 'promotion_invites', 'profile_endorsements', 'weekly_checkins', 'circle_requests')
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

update public.profiles set level = 3 where level > 3;
update public.tasks set level = 3 where level > 3;
update public.groups set level = 3 where level > 3;
update public.circle_requests set level = 3 where level > 3;
update public.promotion_invites set status = 'cancelled' where from_level > 3 or target_level > 3;
update public.task_submissions set award_rank = null, award_title = null where award_rank is not null and award_rank not between 1 and 3;

update public.profiles
set is_admin = true
where email = '18901528810@163.com';

alter table public.profiles drop constraint if exists profiles_level_check;
alter table public.profiles add constraint profiles_level_check check (level between 1 and 3);
alter table public.tasks drop constraint if exists tasks_level_check;
alter table public.tasks add constraint tasks_level_check check (level between 1 and 3);
alter table public.groups drop constraint if exists groups_level_check;
alter table public.groups add constraint groups_level_check check (level between 1 and 3);
alter table public.circle_requests drop constraint if exists circle_requests_level_check;
alter table public.circle_requests add constraint circle_requests_level_check check (level between 1 and 3);
alter table public.task_submissions drop constraint if exists task_submissions_award_rank_check;
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
  ) then
    raise exception '请先进入与当前申请路径和岗位匹配的 Starter Circle';
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

  if v_group_status not in ('active', 'full') then
    raise exception 'Circle 凑齐 3 人后才能开始周同步';
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
revoke execute on function public.is_group_member(uuid, uuid) from public, anon;
revoke execute on function public.is_task_participant(uuid, uuid) from public, anon;
revoke execute on function public.can_view_group(uuid, uuid) from public, anon;
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
using (public.can_view_group(messages.group_id, auth.uid()));

create policy "messages_insert_members"
on public.messages for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_group_member(messages.group_id, auth.uid())
  and exists (
    select 1 from public.groups g
    where g.id = messages.group_id
      and (g.circle_type = 'task' or g.status in ('active', 'full'))
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

create policy "weekly_checkins_select_visible"
on public.weekly_checkins for select
to authenticated
using (public.can_view_group(weekly_checkins.group_id, auth.uid()));

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
  and public.can_view_group((storage.foldername(name))[1]::uuid, auth.uid())
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
      and (g.circle_type = 'task' or g.status in ('active', 'full'))
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
    'Consulting Sprint Challenge：为伦敦咖啡连锁设计增长和利润改善方案',
    '你们是一支咨询团队，客户是一家在伦敦有 8 家门店的精品咖啡连锁。最近午后客流下降、外卖利润偏低、学生客群增长停滞。请先估算市场和核心客群，再提出能在 30 天内测试的增长与利润改善方案。',
    '咨询实践',
    1,
    '提交一份 5-7 页 consulting mini-deck，包含 market sizing、问题树、核心假设、unit economics、3 个增长动作、30 天实验和成功指标。',
    100,
    4,
    7,
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
    '请从用户分层、留存、内容供给、Challenge 激励、邀请机制和商业化角度评估 circle 类产品。',
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
    '假设你要在一所大学启动 circle，请设计种子用户、首批 Circle、Challenge 机制、邀请路径和留存动作。',
    '社区增长',
    5,
    '提交一份校园冷启动计划，包含种子用户、首批 Challenge、邀请机制和 30 天增长节奏。',
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

insert into public.tasks (title, description, category, level, deliverable, score_max, group_size, duration_days, status)
select * from (values
  (
    'Business Sense Challenge：拆解一家校园附近的消费品牌',
    '选择一个你熟悉的消费品牌，从用户、产品、价格、渠道和增长方式解释它为什么成立，并指出一个可测试的增长机会。',
    'Business Sense',
    1,
    '提交一页品牌拆解 memo，包含核心用户、产品定位、渠道、增长逻辑和一个改进实验。',
    100,
    4,
    5,
    'open'
  ),
  (
    'Consulting Sprint Challenge：为伦敦咖啡连锁设计增长和利润改善方案',
    '你们是一支咨询团队，客户是一家在伦敦有 8 家门店的精品咖啡连锁。最近午后客流下降、外卖利润偏低、学生客群增长停滞。请先估算市场和核心客群，再提出能在 30 天内测试的增长与利润改善方案。',
    'Consulting Case',
    1,
    '提交一份 5-7 页 consulting mini-deck，包含 market sizing、问题树、核心假设、unit economics、3 个增长动作、30 天实验和成功指标。',
    100,
    4,
    7,
    'open'
  ),
  (
    'Company Teardown Challenge：为什么 Duolingo 能增长',
    '拆解 Duolingo 的用户增长、产品循环、变现方式和护城河，并判断它的增长是否可持续。',
    'Business Sense',
    1,
    '提交一份 company teardown，包含增长飞轮、商业模式、风险和你的判断。',
    100,
    4,
    5,
    'open'
  ),
  (
    'Consulting Challenge：为茶饮品牌设计英国市场进入方案',
    '假设一家中国茶饮品牌要进入英国，请设计目标客群、城市选择、门店策略、定价和前三个月测试计划。',
    'Consulting Project',
    2,
    '提交一份市场进入方案，包含目标客群、城市优先级、渠道、定价和 90 天行动计划。',
    100,
    5,
    7,
    'open'
  ),
  (
    'Equity Research Challenge：写一页消费公司 stock pitch',
    '选择一家消费公司，用一页纸说明投资观点、增长驱动、估值、风险和催化剂。',
    'Equity Research',
    2,
    '提交一页 stock pitch，包含观点、驱动、估值、风险和催化剂。',
    100,
    5,
    7,
    'open'
  ),
  (
    'AI Product Challenge：给 AI 求职工具做竞品分析',
    '选择 3 个 AI 求职或面试工具，从目标用户、核心功能、定价、获客渠道和差异化切入点分析。',
    'AI Product',
    2,
    '提交一份竞品分析，包含竞品矩阵、用户痛点、差异化机会和 MVP 建议。',
    100,
    5,
    7,
    'open'
  ),
  (
    'Investment Memo Challenge：分析一家高增长公司的 upside/downside',
    '选择一家高增长上市公司，写出 bull case、bear case、关键假设、估值隐含预期和你们的小组结论。',
    'Investment Memo',
    3,
    '提交一份 investment memo，包含 bull case、bear case、关键假设、估值和结论。',
    100,
    6,
    7,
    'open'
  ),
  (
    'Consulting Project Challenge：降低一家餐饮连锁的外卖亏损',
    '用咨询项目方式拆解外卖亏损来源，并提出能在 60 天内测试的改善方案。',
    'Consulting Project',
    3,
    '提交一份利润改善方案，包含问题树、关键假设、数据需求和 60 天实验。',
    100,
    6,
    7,
    'open'
  ),
  (
    'Deal Analysis Challenge：评估一笔奢侈品并购是否合理',
    '选择一笔奢侈品或消费行业并购，从战略逻辑、协同、估值、整合风险和回报角度判断是否值得做。',
    'Deal Analysis',
    3,
    '提交一份 deal memo，包含交易逻辑、估值、协同、主要风险和投资判断。',
    100,
    6,
    7,
    'open'
  ),
  (
    'GTM Challenge：为一家 SaaS 公司设计中小企业获客方案',
    '假设产品面向中小企业财务团队，请设计 ICP、渠道组合、销售漏斗、定价实验和前三个月执行计划。',
    'GTM Strategy',
    3,
    '提交一份 GTM 方案，包含 ICP、渠道、销售漏斗、定价假设和 90 天实验。',
    100,
    6,
    7,
    'open'
  ),
  (
    'Sector Pitch Challenge：写一份半导体行业三页 pitch deck',
    '选择半导体产业链中的一个细分方向，整理行业结构、关键公司、核心驱动和投资机会。',
    'Sector Research',
    3,
    '提交一份三页 pitch deck，包含行业地图、核心驱动、推荐标的和风险。',
    100,
    6,
    7,
    'open'
  ),
  (
    'M&A Challenge：为一家上市公司设计资本配置方案',
    '选择一家上市公司，判断它未来更应该回购、分红、并购、加大资本开支还是降杠杆，并解释原因。',
    'M&A / Capital Allocation',
    3,
    '提交一份资本配置 memo，包含现状诊断、可选方案、推荐动作、风险和预期效果。',
    100,
    6,
    7,
    'open'
  ),
  (
    'Venture Challenge：设计 AI 面试教练商业化路径',
    '假设你负责一个 AI 面试教练产品，请设计从免费工具到付费订阅的转化路径和定价策略。',
    'AI Product / Venture',
    3,
    '提交一份商业化方案，包含用户分层、付费触发点、定价、留存和关键指标。',
    100,
    6,
    7,
    'open'
  ),
  (
    'Community Growth Challenge：设计校内求职社群冷启动',
    '假设你要在一所大学启动 circle，请设计种子用户、首批 Circle、挑战机制、邀请路径和留存动作。',
    'Community Growth',
    3,
    '提交一份校园冷启动计划，包含种子用户、首批 Challenge、邀请机制和 30 天增长节奏。',
    100,
    6,
    7,
    'open'
  ),
  (
    'Product Strategy Challenge：评估 circle 的增长飞轮',
    '从用户分层、留存、内容供给、Challenge 激励、邀请机制和商业化角度评估 circle 类产品。',
    'Product Strategy',
    3,
    '提交一份产品战略 memo，包含核心飞轮、关键风险、北极星指标和 90 天实验计划。',
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
  ('Consulting Sprint Challenge：为伦敦咖啡连锁设计增长和利润改善方案', 1, '提交一份 5-7 页 consulting mini-deck，包含 market sizing、问题树、核心假设、unit economics、3 个增长动作、30 天实验和成功指标。'),
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
  ('设计一个投行申请者的 networking 系统', 3, '提交一份 networking operating system，包含目标分层、触达模板、跟进节奏和转化指标。'),
  ('为一家 SaaS 公司设计中小企业获客方案', 3, '提交一份 GTM 方案，包含 ICP、渠道、销售漏斗、定价假设和 90 天实验。'),
  ('写一份半导体行业三页 pitch deck', 3, '提交一份三页 pitch deck，包含行业地图、核心驱动、推荐标的和风险。'),
  ('评估一个求职社交产品的增长飞轮', 3, '提交一份产品战略 memo，包含核心飞轮、关键风险、北极星指标和 90 天实验计划。'),
  ('设计一个 AI 面试教练的商业化路径', 3, '提交一份商业化方案，包含用户分层、付费触发点、定价、留存和关键指标。'),
  ('评估一家上市公司的资本配置质量', 3, '提交一份资本配置 memo，包含历史行为、管理层判断、ROIC 变化和投资结论。'),
  ('设计一个校内求职社群的冷启动计划', 3, '提交一份校园冷启动计划，包含种子用户、首批 Challenge、邀请机制和 30 天增长节奏。')
) as v(title, level, deliverable)
where public.tasks.title = v.title;

update public.tasks
set level = 3
where level > 3;

update public.profiles
set level = 3,
    updated_at = now()
where application_track = 'Spring Week'
  and level > 3;

update public.tasks
set format_guide = '建议格式：1. 一句话结论；2. 背景和目标；3. 核心分析；4. 可执行方案；5. 风险和下一步。提交链接可以是 Google Doc、Notion、PDF、Slides 或其他公开可访问材料。'
where format_guide is null
   or format_guide = ''
   or format_guide = '建议格式：1. 结论摘要；2. 关键假设；3. 分析过程；4. 风险和下一步。提交链接可以是 Google Doc、Notion、PDF、Slides 或其他可访问材料。';

update public.tasks
set title = 'Consulting Sprint Challenge：为伦敦咖啡连锁设计增长和利润改善方案',
    description = '你们是一支咨询团队，客户是一家在伦敦有 8 家门店的精品咖啡连锁。最近午后客流下降、外卖利润偏低、学生客群增长停滞。请先估算市场和核心客群，再提出能在 30 天内测试的增长与利润改善方案。',
    category = 'Consulting Case',
    deliverable = '提交一份 5-7 页 consulting mini-deck，包含 market sizing、问题树、核心假设、unit economics、3 个增长动作、30 天实验和成功指标。',
    format_guide = '建议格式：1. Executive summary；2. Market sizing 和客群拆分；3. 问题树和关键假设；4. 门店 / 外卖 unit economics；5. 三个增长或利润改善动作；6. 30 天测试计划；7. KPI、风险和下一步。',
    duration_days = 7,
    group_size = 4,
    status = 'open'
where title in (
  '模拟咨询 Case：估算伦敦一年卖出多少杯咖啡',
  'Market Sizing Challenge：估算伦敦一年卖出多少杯咖啡'
);

update public.tasks
set status = 'archived'
where title in (
  '改写一份 Spring Week 简历 bullet',
  '制定一周海外实习申请冲刺计划',
  '整理一份校友 networking 地图',
  '比较英国、香港、美国金融申请路径',
  '模拟 HireVue：讲一个 leadership 故事',
  'Spring Week 申请 tracker 搭建',
  'Spring Week HireVue 高频题训练',
  'Summer IB technical 第一轮自测',
  'Summer Consulting case partner 训练',
  'Summer referral 冲刺计划',
  '模拟投行面试：如何解释 DCF',
  '搭建一个投行 technical 面试题库',
  '设计一个实习申请 tracker',
  '设计一个投行申请者的 networking 系统'
)
and starts_at is null
and ends_at is null;

update public.tasks
set status = case
  when title in (
    'Consulting Sprint Challenge：为伦敦咖啡连锁设计增长和利润改善方案',
    'Investment Memo Challenge：分析一家高增长公司的 upside/downside'
  ) then 'open'
  else 'archived'
end
where status in ('open', 'archived')
  and starts_at is null
  and ends_at is null;

update public.tasks
set is_featured = title in (
      'Consulting Sprint Challenge：为伦敦咖啡连锁设计增长和利润改善方案',
      'Investment Memo Challenge：分析一家高增长公司的 upside/downside'
    ),
    starts_at = case
      when title in (
        'Consulting Sprint Challenge：为伦敦咖啡连锁设计增长和利润改善方案',
        'Investment Memo Challenge：分析一家高增长公司的 upside/downside'
      ) then date_trunc('week', now())
      else starts_at
    end,
    ends_at = case
      when title in (
        'Consulting Sprint Challenge：为伦敦咖啡连锁设计增长和利润改善方案',
        'Investment Memo Challenge：分析一家高增长公司的 upside/downside'
      ) then date_trunc('week', now()) + interval '7 days'
      else ends_at
    end
where starts_at is null
  and ends_at is null;

with ranked_duplicates as (
  select
    t.id,
    row_number() over (
      partition by t.title
      order by
        (select count(*) from public.task_submissions ts where ts.task_id = t.id) desc,
        (select count(*) from public.groups g where g.task_id = t.id) desc,
        t.created_at asc,
        t.id
    ) as duplicate_rank
  from public.tasks t
)
update public.tasks t
set status = 'archived',
    is_featured = false
from ranked_duplicates d
where t.id = d.id
  and d.duplicate_rank > 1;

update public.groups g
set level = t.level
from public.tasks t
where g.task_id = t.id
  and g.circle_type = 'task';

update public.groups
set level = 3
where circle_type = 'task'
  and level > 3;

select public.refresh_challenge_lifecycle();

-- Current pilot Challenge. Keep one featured competition visible while preserving
-- any older Challenge that already has active participants.
insert into public.tasks (
  title, description, category, level, deliverable, format_guide,
  score_max, group_size, duration_days, is_featured, starts_at, ends_at, status
)
select
  'Market Entry Challenge：瑞幸咖啡是否应该进入英国市场？',
  E'项目背景\n假设时间为 2027 年。瑞幸通过数字化点单、高频新品、优惠定价和小型取餐店快速扩张，并已开始进入中国以外的市场。英国的咖啡消费习惯成熟，但 Starbucks、Costa、Pret、Blank Street 和大量独立咖啡店已经占据了不同价格带和消费场景。\n\n管理层问题\n请作为瑞幸的市场进入项目组，判断英国是否值得进入。如果进入，请明确目标用户、首发城市、门店形式、价格定位和 90 天试点计划；如果不建议进入，说明关键原因和重新评估的触发条件。',
  'Market Entry',
  2,
  '提交一份 6 页以内的市场进入 deck（PPT 或 PDF），必须包含明确结论、简化单店经济模型和 90 天试点计划。Excel 模型可作为可选附件。',
  E'建议结构\n1. Executive summary：明确回答进入、暂缓或放弃，并列出三个核心理由。\n2. 市场与用户：分析英国咖啡市场、消费场景和最值得切入的目标用户。\n3. 竞争与定位：比较 Starbucks、Costa、Pret、Blank Street 和独立咖啡店，说明瑞幸的差异化。\n4. 进入模式：选择首发城市、自营或合作、堂食或取餐店、价格和获客方式。\n5. 单店经济模型：估算客单价、每日订单、租金、人工、原材料和盈亏平衡点。\n6. 风险与试点：提出 90 天试点、成功指标、主要风险和终止条件。\n\n提交规则\n所有关键数字需注明来源或假设；可以使用 AI，但团队需对数据和结论负责。\n\n评选原则\n证据是否可靠、逻辑是否清晰、方案是否可执行、财务判断是否合理。截止后只公布第一名、第二名和第三名。',
  100,
  4,
  22,
  true,
  now(),
  '2026-10-15 23:59:00+08'::timestamptz,
  'open'
where not exists (
  select 1
  from public.tasks
  where title = 'Market Entry Challenge：瑞幸咖啡是否应该进入英国市场？'
);

update public.tasks
set description = E'项目背景\n假设时间为 2027 年。瑞幸通过数字化点单、高频新品、优惠定价和小型取餐店快速扩张，并已开始进入中国以外的市场。英国的咖啡消费习惯成熟，但 Starbucks、Costa、Pret、Blank Street 和大量独立咖啡店已经占据了不同价格带和消费场景。\n\n管理层问题\n请作为瑞幸的市场进入项目组，判断英国是否值得进入。如果进入，请明确目标用户、首发城市、门店形式、价格定位和 90 天试点计划；如果不建议进入，说明关键原因和重新评估的触发条件。',
    category = 'Market Entry',
    level = 2,
    deliverable = '提交一份 6 页以内的市场进入 deck（PPT 或 PDF），必须包含明确结论、简化单店经济模型和 90 天试点计划。Excel 模型可作为可选附件。',
    format_guide = E'建议结构\n1. Executive summary：明确回答进入、暂缓或放弃，并列出三个核心理由。\n2. 市场与用户：分析英国咖啡市场、消费场景和最值得切入的目标用户。\n3. 竞争与定位：比较 Starbucks、Costa、Pret、Blank Street 和独立咖啡店，说明瑞幸的差异化。\n4. 进入模式：选择首发城市、自营或合作、堂食或取餐店、价格和获客方式。\n5. 单店经济模型：估算客单价、每日订单、租金、人工、原材料和盈亏平衡点。\n6. 风险与试点：提出 90 天试点、成功指标、主要风险和终止条件。\n\n提交规则\n所有关键数字需注明来源或假设；可以使用 AI，但团队需对数据和结论负责。\n\n评选原则\n证据是否可靠、逻辑是否清晰、方案是否可执行、财务判断是否合理。截止后只公布第一名、第二名和第三名。',
    score_max = 100,
    group_size = 4,
    duration_days = 22,
    is_featured = true,
    starts_at = coalesce(starts_at, now()),
    ends_at = '2026-10-15 23:59:00+08'::timestamptz,
    status = 'open'
where title = 'Market Entry Challenge：瑞幸咖啡是否应该进入英国市场？';

update public.tasks
set is_featured = title = 'Market Entry Challenge：瑞幸咖啡是否应该进入英国市场？'
where status = 'open';

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
set level = 3,
    name = replace(replace(name, 'Peer Lead', 'Competitive'), 'Mentor', 'Competitive')
where circle_type = 'exploration'
  and (topic ilike 'Spring Week%' or topic ilike 'Summer%')
  and level > 3;

-- Region is no longer part of chat matching. Keep the old profile column only for compatibility.
update public.groups
set topic = regexp_replace(topic, ' - (英国|美国|香港|新加坡) ', ' - '),
    name = regexp_replace(name, ' - (英国|美国|香港|新加坡) ', ' - ')
where circle_type = 'exploration'
  and (
    topic ~ ' - (英国|美国|香港|新加坡) '
    or name ~ ' - (英国|美国|香港|新加坡) '
  );

update public.groups
set topic = regexp_replace(
      topic,
      '(Investment Banking|Asset Management|Sales & Trading|Equity Research|General Finance)( Circle)',
      'Finance\2',
      'g'
    ),
    name = regexp_replace(
      name,
      '(Investment Banking|Asset Management|Sales & Trading|Equity Research|General Finance)( Circle)',
      'Finance\2',
      'g'
    )
where circle_type = 'exploration'
  and (
    topic ~ '(Investment Banking|Asset Management|Sales & Trading|Equity Research|General Finance) Circle'
    or name ~ '(Investment Banking|Asset Management|Sales & Trading|Equity Research|General Finance) Circle'
  );

update public.circle_requests
set topic = regexp_replace(topic, ' - (英国|美国|香港|新加坡) ', ' - '),
    target_region = '不限地区',
    updated_at = now()
where target_region <> '不限地区'
   or topic ~ ' - (英国|美国|香港|新加坡) ';

update public.circle_requests
set topic = regexp_replace(
      topic,
      '(Investment Banking|Asset Management|Sales & Trading|Equity Research|General Finance)( Circle)',
      'Finance\2',
      'g'
    ),
    target_role = case when lower(target_role) = 'consulting' then 'Consulting' else 'Finance' end,
    updated_at = now()
where target_role not in ('Finance', 'Consulting')
   or topic ~ '(Investment Banking|Asset Management|Sales & Trading|Equity Research|General Finance) Circle';

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
    ' L4 Circle', ' · Competitive Circle'
  ),
  ' L5 Circle', ' · Competitive Circle'
)
where name ~ ' L[1-5] Circle';

update public.groups
set name = replace(
  replace(
    replace(
      replace(
        replace(name, 'Starter Circle', '入门难度 Circle'),
        'Ready Circle', '进阶难度 Circle'
      ),
      'Competitive Circle', '高阶难度 Circle'
    ),
    'Peer Lead Circle', '高阶难度 Circle'
  ),
  'Mentor Circle', '高阶难度 Circle'
)
where circle_type = 'task';

update public.groups
set name = replace(replace(name, '专家难度 Circle', '高阶难度 Circle'), '开放命题 Circle', '高阶难度 Circle')
where circle_type = 'task';

-- Remove the old showcase demo accounts, teams and submissions. Deleting the
-- groups first cascades to their submissions and contributor records.
delete from public.groups
where id in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000104',
  '00000000-0000-4000-8000-000000000105'
);

delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005'
);

/* Retained only as migration history. Do not recreate virtual showcase data.
-- Demo production-like data for the showcase page.
-- These rows live in Supabase tables, so the app reads them as real submissions instead of frontend-only examples.
insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'circle.demo.buffett@163.com', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"巴菲特"}', now() - interval '8 days', now() - interval '8 days'),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'circle.demo.lahuo@163.com', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"喇货"}', now() - interval '7 days', now() - interval '7 days'),
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'circle.demo.kong@163.com', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"孔子恒"}', now() - interval '6 days', now() - interval '6 days'),
  ('00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'circle.demo.zhou@163.com', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"周同学"}', now() - interval '5 days', now() - interval '5 days'),
  ('00000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'circle.demo.senior@163.com', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"高阶同学"}', now() - interval '4 days', now() - interval '4 days')
on conflict (id) do nothing;

insert into public.profiles (
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
  bio,
  level,
  created_at,
  updated_at
)
values
  ('00000000-0000-4000-8000-000000000001', 'circle.demo.buffett@163.com', '巴菲特', 'Competitive', 'Equity Research', 'Summer Internship', '英国', 'Equity Research', '投递中', '高强度冲刺', '模拟用户：专注股票研究和投资 memo。', 3, now() - interval '8 days', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000002', 'circle.demo.lahuo@163.com', '喇货', 'Ready', 'Consulting', 'Summer Internship', '英国', 'Consulting', '投递中', '高强度冲刺', '模拟用户：专注咨询 case 和市场进入策略。', 2, now() - interval '7 days', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000003', 'circle.demo.kong@163.com', '孔子恒', 'Starter', 'Business Sense', 'Spring Week', '英国', 'Investment Banking', '材料准备中', '正常推进', '模拟用户：正在准备 Spring Week 和 business sense。', 1, now() - interval '6 days', now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000004', 'circle.demo.zhou@163.com', '周同学', 'Ready', 'AI Product', 'Summer Internship', '英国', 'General Finance', '投递中', '正常推进', '模拟用户：关注 AI 产品和求职工具。', 2, now() - interval '5 days', now() - interval '4 days'),
  ('00000000-0000-4000-8000-000000000005', 'circle.demo.senior@163.com', '高阶同学', 'Competitive', 'Investment Research', 'Summer Internship', '英国', 'Equity Research', '面试中', '高强度冲刺', '模拟用户：Competitive，负责高质量研究输出。', 3, now() - interval '4 days', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.groups (id, task_id, name, circle_type, topic, level, max_members, status, created_at)
values
  ('00000000-0000-4000-8000-000000000101', (select id from public.tasks where title = '分析泡泡玛特是否还有十倍空间' limit 1), '泡泡玛特十倍空间 · 高阶难度 Circle', 'task', '分析泡泡玛特是否还有十倍空间', 3, 6, 'active', now() - interval '7 days'),
  ('00000000-0000-4000-8000-000000000102', (select id from public.tasks where title = '为一家中国茶饮品牌设计英国市场进入策略' limit 1), '英国茶饮进入策略 · 进阶难度 Circle', 'task', '为一家中国茶饮品牌设计英国市场进入策略', 2, 5, 'active', now() - interval '6 days'),
  ('00000000-0000-4000-8000-000000000103', (select id from public.tasks where title = 'Consulting Sprint Challenge：为伦敦咖啡连锁设计增长和利润改善方案' limit 1), '伦敦咖啡增长利润改善 · 入门难度 Circle', 'task', 'Consulting Sprint Challenge：为伦敦咖啡连锁设计增长和利润改善方案', 1, 4, 'active', now() - interval '5 days'),
  ('00000000-0000-4000-8000-000000000104', (select id from public.tasks where title = '帮一家 AI 教育产品找到第一批用户' limit 1), 'AI 教育产品冷启动 · 进阶难度 Circle', 'task', '帮一家 AI 教育产品找到第一批用户', 2, 5, 'active', now() - interval '4 days'),
  ('00000000-0000-4000-8000-000000000105', (select id from public.tasks where title = '写一份半导体行业三页 pitch deck' limit 1), '半导体行业 Pitch Deck · 高阶难度 Circle', 'task', '写一份半导体行业三页 pitch deck', 3, 6, 'active', now() - interval '3 days')
on conflict (id) do nothing;

insert into public.group_members (group_id, user_id, role, status, joined_at)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'member', 'active', now() - interval '7 days'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000002', 'member', 'active', now() - interval '6 days'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000003', 'member', 'active', now() - interval '5 days'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000004', 'member', 'active', now() - interval '4 days'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000005', 'host', 'active', now() - interval '3 days')
on conflict (group_id, user_id) do nothing;

insert into public.task_submissions (task_id, group_id, submitted_by, title, submission_url, content, score, award_rank, award_title, created_at)
values
  (
    (select id from public.tasks where title = '分析泡泡玛特是否还有十倍空间' limit 1),
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    '泡泡玛特是否还有十倍空间 stock pitch',
    'https://docs.google.com/document/d/demo-popmart-stock-pitch',
    '我们认为泡泡玛特继续增长的关键不只是门店扩张，而是 IP 生命周期管理、海外市场复制能力和高毛利新品类延展。小队拆解了 bull case、bear case、估值隐含预期和三个需要持续跟踪的风险指标。',
    0,
    1,
    null,
    now() - interval '1 day'
  ),
  (
    (select id from public.tasks where title = '为一家中国茶饮品牌设计英国市场进入策略' limit 1),
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000002',
    '英国茶饮品牌前三个月进入方案',
    'https://www.notion.so/demo-uk-bubble-tea-market-entry',
    '我们建议先从伦敦学生和亚洲办公室人群切入，用快闪店验证 SKU、价格带和复购，再决定正式门店位置。交付包含城市排序、选址逻辑、菜单假设、营销渠道和 90 天测试计划。',
    0,
    2,
    null,
    now() - interval '2 days'
  ),
  (
    (select id from public.tasks where title = 'Consulting Sprint Challenge：为伦敦咖啡连锁设计增长和利润改善方案' limit 1),
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000003',
    '伦敦咖啡连锁增长和利润改善 mini-deck',
    'https://docs.google.com/presentation/d/demo-london-coffee-growth-profit',
    '我们先估算伦敦精品咖啡核心客群，再拆出午后客流下降、外卖毛利偏低和学生客群增长停滞三个问题。最终方案包含会员午后组合、办公室团购、外卖菜单重构三个动作，并给出 30 天实验、KPI 和 unit economics 测算。',
    0,
    null,
    null,
    now() - interval '3 days'
  ),
  (
    (select id from public.tasks where title = '帮一家 AI 教育产品找到第一批用户' limit 1),
    '00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000004',
    'AI 教育产品第一批用户冷启动',
    'https://www.notion.so/demo-ai-education-cold-start',
    '小队把目标用户拆成求职焦虑高、愿意尝试工具、缺少同伴反馈的学生，并设计了校园 ambassador、免费 mock、作品展示和 referral loop 四个冷启动动作。',
    0,
    null,
    null,
    now() - interval '4 days'
  ),
  (
    (select id from public.tasks where title = '写一份半导体行业三页 pitch deck' limit 1),
    '00000000-0000-4000-8000-000000000105',
    '00000000-0000-4000-8000-000000000005',
    '半导体设备行业三页 pitch deck',
    'https://docs.google.com/presentation/d/demo-semiconductor-sector-pitch',
    '我们从先进制程、国产替代、资本开支周期和客户集中度四个角度拆解半导体设备行业，并给出一个推荐标的、两个风险指标和一个反方观点。',
    0,
    1,
    null,
    now() - interval '5 days'
  )
on conflict (group_id) do nothing;

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
*/

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
