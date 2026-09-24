begin;

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
    starts_at = now(),
    ends_at = '2026-10-15 23:59:00+08'::timestamptz,
    status = 'open'
where title = 'Market Entry Challenge：瑞幸咖啡是否应该进入英国市场？';

update public.tasks
set is_featured = false
where title <> 'Market Entry Challenge：瑞幸咖啡是否应该进入英国市场？';

update public.tasks old_task
set status = 'archived'
where old_task.status = 'open'
  and old_task.title <> 'Market Entry Challenge：瑞幸咖啡是否应该进入英国市场？'
  and not exists (
    select 1
    from public.groups g
    join public.group_members gm on gm.group_id = g.id and gm.status = 'active'
    where g.task_id = old_task.id
  )
  and not exists (
    select 1
    from public.task_submissions ts
    where ts.task_id = old_task.id
  );

commit;

select title, category, level, group_size, starts_at, ends_at, status, is_featured
from public.tasks
where title = 'Market Entry Challenge：瑞幸咖啡是否应该进入英国市场？';
