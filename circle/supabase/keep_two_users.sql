begin;

do $$
declare
  v_buffett_id uuid;
  v_huajia_id uuid;
  v_demo_ids uuid[] := array[
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid,
    '00000000-0000-4000-8000-000000000004'::uuid,
    '00000000-0000-4000-8000-000000000005'::uuid
  ];
begin
  select id into v_buffett_id
  from public.profiles
  where display_name = '巴菲特'
    and not (id = any(v_demo_ids));

  if v_buffett_id is null then
    raise exception '没有找到真实用户“巴菲特”，操作已取消';
  end if;

  if (
    select count(*)
    from public.profiles
    where display_name = '巴菲特'
      and not (id = any(v_demo_ids))
  ) <> 1 then
    raise exception '真实用户“巴菲特”不唯一，操作已取消';
  end if;

  select id into v_huajia_id
  from public.profiles
  where display_name in ('喇货', '华嘉')
    and not (id = any(v_demo_ids));

  if v_huajia_id is null then
    raise exception '没有找到真实用户“喇货/华嘉”，操作已取消';
  end if;

  if (
    select count(*)
    from public.profiles
    where display_name in ('喇货', '华嘉')
      and not (id = any(v_demo_ids))
  ) <> 1 then
    raise exception '真实用户“喇货/华嘉”不唯一，操作已取消';
  end if;

  update public.profiles
  set display_name = '华嘉',
      updated_at = now()
  where id = v_huajia_id;

  -- Removing auth users cascades through profiles and user-owned app data.
  delete from auth.users
  where id not in (v_buffett_id, v_huajia_id);
end;
$$;

-- Remove the fixed demo teams and any groups left completely empty afterward.
delete from public.groups
where id in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000104',
  '00000000-0000-4000-8000-000000000105'
);

delete from public.groups g
where not exists (
  select 1
  from public.group_members gm
  where gm.group_id = g.id
);

commit;

select id, display_name
from public.profiles
order by display_name;
