/* global supabase */

const config = window.APP_CONFIG || {};
const app = document.getElementById("app");

let db = null;
let session = null;
let user = null;
let profile = null;
let activeChatCircle = null;
let refreshTimer = null;

const stageLabels = {
  1: "Starter",
  2: "Ready",
  3: "Competitive",
  4: "Peer Lead",
  5: "Mentor"
};

const stageDescriptions = {
  1: "刚开始准备，重点是 CV、tracker、基础 networking 和 behavioral story。",
  2: "材料基本成型，开始稳定投递、coffee chat、HireVue 和 technical 高频题。",
  3: "已有相关经历或高质量成果，重点冲 referral、mock interview 和深度 technical。",
  4: "能带动小队复盘、评审成果、推荐表现好的成员进入更强小队。",
  5: "已拿到 offer 或有明确相关经验，适合做观察、点评和任务评审。"
};

const applicationTracks = ["Spring Week", "Summer Internship"];
const targetRegions = ["英国", "香港", "美国", "新加坡", "不限地区"];
const targetRoles = ["Investment Banking", "Consulting", "Asset Management", "Sales & Trading", "Equity Research", "General Finance"];
const applicationProgress = ["刚开始了解", "材料准备中", "投递中", "HireVue / Online Test", "面试中", "等结果 / 复盘"];
const intensityLevels = ["轻度准备", "正常推进", "高强度冲刺"];

function profileValue(currentProfile, key, fallback) {
  return currentProfile?.[key] || fallback;
}

function applicationSummary(currentProfile = profile) {
  const track = profileValue(currentProfile, "application_track", "Spring Week");
  const role = profileValue(currentProfile, "target_role", currentProfile?.direction || "Investment Banking");
  const region = profileValue(currentProfile, "target_region", "英国");
  return `${track} · ${region} · ${role}`;
}

function progressSummary(currentProfile = profile) {
  return `${profileValue(currentProfile, "application_progress", "材料准备中")} · ${profileValue(currentProfile, "intensity", "正常推进")}`;
}

function matchTags(currentProfile = profile) {
  return [
    profileValue(currentProfile, "application_track", "Spring Week"),
    profileValue(currentProfile, "target_region", "英国"),
    profileValue(currentProfile, "target_role", "Investment Banking"),
    profileValue(currentProfile, "application_progress", "材料准备中"),
    profileValue(currentProfile, "intensity", "正常推进")
  ];
}

function chatTopicsForProfile(currentProfile) {
  const track = profileValue(currentProfile, "application_track", "Spring Week");
  const role = profileValue(currentProfile, "target_role", "Investment Banking");
  const region = profileValue(currentProfile, "target_region", "英国");
  const progress = profileValue(currentProfile, "application_progress", "材料准备中");
  const intensity = profileValue(currentProfile, "intensity", "正常推进");
  const currentLevel = Number(currentProfile?.level || 1);
  const prefix = `${region} ${role}`;
  if (track === "Spring Week") {
    return [
      [`Spring Week ${prefix} 起步 Circle`, `适合${progress}的同学：建立 tracker、改 CV、拆岗位、确认本周申请节奏。`],
      [`Spring Week ${prefix} CV / HireVue Circle`, `围绕 CV bullet、HireVue 故事、网申节奏和 ${intensity} 的每周目标互相推进。`],
      [`Spring Week ${prefix} 投递冲刺 Circle`, "适合已经开始投递的人：同步 deadline、复盘 HireVue、互相检查申请材料。"]
    ];
  }
  if (currentLevel === 1) {
    return [
      [`Summer Starter - ${prefix} Circle`, `适合${progress}、${intensity}的 Summer 申请者：补 CV、tracker、technical 入门和 networking 节奏。`],
      [`Summer Starter - CV / Behavioral Circle`, "先把材料和 behavioral story 打牢，再进入更高强度的 technical / case 小队。"],
      [`Summer Starter - Networking Circle`, "从校友地图、cold message、coffee chat 复盘开始，把行动量拉起来。"]
    ];
  }
  if (currentLevel === 2) {
    return [
      [`Summer Ready - ${prefix} Circle`, "材料基本成型，围绕 technical/case、coffee chat、HireVue 和申请节奏推进。"],
      [`Summer Ready - ${region} Networking Circle`, "每周固定触达、复盘 coffee chat、整理 referral 机会。"],
      [`Summer Ready - Interview Drill Circle`, "用 mock、错题、复盘和同伴追问，把面试表达稳定下来。"]
    ];
  }
  if (currentLevel === 3) {
    return [
      [`Summer Competitive - ${prefix} Circle`, "适合有相关经历或成果的人：深度 mock、referral、superday 和高质量输出。"],
      [`Summer Competitive - Deal / Case Review Circle`, "用更完整的 technical、case、stock pitch 或项目 memo 拉开差距。"],
      [`Summer Competitive - Offer Sprint Circle`, "集中处理最后一轮、superday、follow-up 和 offer conversion。"]
    ];
  }
  return [
    ["Peer Lead / Mentor Circle", "适合带过项目、拿过 offer 或有相关实习的人：评审成果、观察小队、推荐升级。"],
    ["Spring / Summer Mentor Office", "集中处理候选人的卡点、周报、任务评审和升级建议。"],
    ["Offer Holder Reflection Circle", "复盘申请路径、面试经验和可复用的训练任务。"]
  ];
}

function okConfig() {
  return config.SUPABASE_URL && config.SUPABASE_PUBLISHABLE_KEY;
}

function h(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function time(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function messageDay(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return "今天";
  if (sameDay(date, yesterday)) return "昨天";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function messageClock(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function routePath() {
  const raw = location.hash.replace(/^#/, "") || "/home";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function go(path) {
  location.hash = path;
}

function level(value = 1) {
  return stageLabels[Number(value || 1)] || "Starter";
}

function stageDetail(value = 1) {
  return stageDescriptions[Number(value || 1)] || stageDescriptions[1];
}

function isApplicationTask(task) {
  const text = `${task.title || ""} ${task.description || ""} ${task.category || ""}`;
  return /Spring|Summer|HireVue|CV|简历|投行|咨询|Case|case|technical|面试|networking|coffee chat|申请|tracker|stock pitch|DCF|market sizing|behavioral|referral|superday/i.test(text);
}

function taskRelevanceScore(task, currentProfile = profile) {
  const text = `${task.title || ""} ${task.description || ""} ${task.category || ""}`.toLowerCase();
  let score = 0;
  const track = profileValue(currentProfile, "application_track", "").toLowerCase();
  const role = profileValue(currentProfile, "target_role", "").toLowerCase();
  const progress = profileValue(currentProfile, "application_progress", "").toLowerCase();
  if (track && text.includes(track.toLowerCase().split(" ")[0])) score += 4;
  if (role.includes("bank") && /投行|ib|dcf|technical|valuation|m&a/i.test(text)) score += 4;
  if (role.includes("consult") && /咨询|case|market sizing|profitability/i.test(text)) score += 4;
  if (/投递|hirevue|online|面试|interview/.test(progress) && /HireVue|面试|technical|case|mock|online/i.test(text)) score += 3;
  if (/材料|开始/.test(progress) && /CV|简历|tracker|networking map|申请 tracker/i.test(text)) score += 3;
  return score;
}

function suggestedActions(currentProfile = profile, checkin = null, submissions = []) {
  const progress = profileValue(currentProfile, "application_progress", "材料准备中");
  const role = profileValue(currentProfile, "target_role", "Investment Banking");
  const actions = [];
  if (!checkin) actions.push("先完成本周同步，让小队知道你的申请数、networking 数和卡点。");
  if (/刚开始|材料/.test(progress)) actions.push("今天先把 CV / tracker / 目标公司清单推进到可被别人 review 的状态。");
  if (/投递|HireVue|Online/.test(progress)) actions.push("今天至少复盘 1 个 HireVue / online test 题，发到 Circle 里让别人追问。");
  if (/面试/.test(progress)) actions.push(role.includes("Consulting") ? "安排 1 次 case partner 训练，并把复盘写成任务成果。" : "安排 1 次 technical mock，并整理错题。");
  if (!submissions.length) actions.push("本周完成 1 个任务成果，让主页开始沉淀可展示信号。");
  actions.push("找 1 个成员互看材料，或者给别人一条具体反馈。");
  return actions.slice(0, 4);
}

function renderProfileChips(currentProfile = profile) {
  return matchTags(currentProfile).map(tag => `<span>${h(tag)}</span>`).join("");
}

const businessSenseDeck = [
  {
    roles: ["Investment Banking", "Asset Management", "Equity Research", "Sales & Trading", "General Finance"],
    label: "市场观察",
    title: "降息预期会怎样影响银行股估值？",
    brief: "关注净息差、贷款需求、坏账预期、交易收入和估值倍数，而不是只说“降息利好股市”。",
    angles: ["净息差是否被压缩", "信贷需求是否恢复", "坏账压力是否下降", "市场交易和财富管理收入是否改善"],
    prompt: "大家用 3 分钟拆一下：如果英国进入降息周期，银行股到底是利好还是利空？分别从 NIM、贷款需求、坏账和估值说。"
  },
  {
    roles: ["Investment Banking", "Equity Research", "Asset Management", "General Finance"],
    label: "公司分析",
    title: "一家消费公司提价后，利润一定会变好吗？",
    brief: "提价可能提升毛利率，也可能损害销量、复购和品牌心智。要看价格弹性和渠道结构。",
    angles: ["销量下滑幅度", "毛利率提升幅度", "竞品是否跟涨", "渠道库存和促销压力"],
    prompt: "如果一个消费品牌涨价 10%，你会看哪些指标判断它是不是成功提价？"
  },
  {
    roles: ["Consulting", "General Finance"],
    label: "Case Sense",
    title: "外卖平台为什么 GMV 增长但利润不一定增长？",
    brief: "GMV 是交易额，不等于收入，更不等于利润。补贴、骑手成本、广告变现和商家佣金都会影响利润。",
    angles: ["take rate", "补贴率", "履约成本", "广告和会员收入"],
    prompt: "一个外卖平台 GMV 增长 20%，但利润下降，你会怎么拆原因树？"
  },
  {
    roles: ["Consulting", "Investment Banking", "General Finance"],
    label: "行业判断",
    title: "为什么同样是 AI 公司，有些像软件，有些像服务？",
    brief: "关键看毛利率、交付方式、客户定制化、数据/模型复用程度，以及收入是否随人力线性增长。",
    angles: ["毛利率", "实施周期", "客户定制化", "模型和数据复用"],
    prompt: "判断一家 AI 公司更像 SaaS 还是咨询服务，你会问哪 4 个问题？"
  },
  {
    roles: ["Investment Banking", "Asset Management", "Equity Research"],
    label: "估值直觉",
    title: "高增长公司为什么也可能估值太贵？",
    brief: "增长不是估值护身符。要看增长持续性、利润率终局、再投资需求和市场已经 price in 了多少。",
    angles: ["增长可持续性", "终局利润率", "现金流转换", "估值隐含增长"],
    prompt: "如果一家公司收入年增 40%，你怎么判断它是不是已经太贵了？"
  },
  {
    roles: ["Consulting", "General Finance"],
    label: "商业模式",
    title: "订阅制为什么不一定比一次性销售更好？",
    brief: "订阅制看似稳定，但要看 CAC、churn、续费率、使用频率和服务成本。",
    angles: ["CAC 回收期", "churn", "ARPU", "服务成本"],
    prompt: "一个教育产品从一次性收费改成订阅制，你会看哪些指标判断是否成功？"
  }
];

function businessSenseCards(currentProfile = profile) {
  const role = profileValue(currentProfile, "target_role", "Investment Banking");
  const matching = businessSenseDeck.filter(card => card.roles.includes(role) || card.roles.includes("General Finance"));
  return (matching.length ? matching : businessSenseDeck).slice(0, 4);
}

function renderBusinessSenseFeed(currentProfile = profile) {
  return businessSenseCards(currentProfile).map(card => `
    <article class="sense-card">
      <div class="sense-label">${h(card.label)}</div>
      <h3>${h(card.title)}</h3>
      <p>${h(card.brief)}</p>
      <div class="sense-angles">
        ${card.angles.map(angle => `<span>${h(angle)}</span>`).join("")}
      </div>
      <button class="prompt-chip sense-discuss" type="button" data-prompt="${h(card.prompt)}">发到群里讨论</button>
    </article>
  `).join("");
}

function circleBrief(messages, checkins, members) {
  const todayCount = messages.filter(msg => isSameLocalDay(msg.created_at)).length;
  const activeToday = new Set(messages.filter(msg => isSameLocalDay(msg.created_at)).map(msg => msg.user_id)).size;
  const syncedUsers = new Set(checkins.map(item => item.userId)).size;
  const top = checkins[0];
  const brief = [];
  if (!messages.length) {
    brief.push(["冷启动", "还没有讨论记录，适合先发一个具体问题，比如让大家报本周申请目标。"]);
  } else if (todayCount < 5) {
    brief.push(["需要点火", "今天消息偏少，可以用右侧 Business Sense 卡片或快捷问题发起一个 5 分钟讨论。"]);
  } else {
    brief.push(["讨论活跃", `今天已有 ${todayCount} 条消息，${activeToday} 位成员参与，可以请一个人总结当前结论。`]);
  }
  if (syncedUsers < Math.max(2, Math.ceil((members?.length || 6) / 2))) {
    brief.push(["同步不足", `本周只有 ${syncedUsers} 人同步进展，建议先提醒未同步成员补申请数和卡点。`]);
  } else {
    brief.push(["节奏稳定", `本周已有 ${syncedUsers} 人同步进展，可以开始比较卡点并分配互助对象。`]);
  }
  if (top) brief.push(["当前领跑", `${top.name} 暂时领先：${top.apps} 个申请、${top.networking} 次 networking。`]);
  return brief.slice(0, 3);
}

function renderCircleBrief(messages, checkins, members) {
  return circleBrief(messages, checkins, members).map(([label, text]) => `
    <div class="brief-item">
      <span>${h(label)}</span>
      <p>${h(text)}</p>
    </div>
  `).join("");
}

function applicationRadarCards(currentProfile = profile) {
  const track = profileValue(currentProfile, "application_track", "Spring Week");
  const progress = profileValue(currentProfile, "application_progress", "材料准备中");
  const role = profileValue(currentProfile, "target_role", "Investment Banking");
  const month = new Date().getMonth() + 1;
  const cards = [];
  if (track === "Spring Week") {
    cards.push({
      label: "现在重点",
      title: month <= 8 ? "7-8 月先抢准备窗口" : "进入开放期，尽早投递",
      text: month <= 8
        ? "先把 CV、tracker、目标公司清单和 HireVue 故事准备好。9 月开放后再准备会很赶。"
        : "Spring Week 很多岗位 rolling basis，开放后越早投越好。每天都要查 tracker。",
      prompt: "大家各自发一下自己的 Spring Week tracker：目标公司、deadline、当前状态、下一步。"
    });
    cards.push({
      label: "讨论主题",
      title: progress.includes("HireVue") ? "HireVue 故事要能被追问" : "CV bullet 先做到可被别人 review",
      text: "Spring Week 早期不用过度细分方向，先把材料、节奏和表达练起来。",
      prompt: "今天每个人发 1 条最想改的 CV bullet，其他人只给一个具体修改建议。"
    });
  } else {
    cards.push({
      label: "现在重点",
      title: role.includes("Consulting") ? "Summer Consulting 要固定 case 节奏" : "Summer 金融要同时推 networking 和 technical",
      text: role.includes("Consulting")
        ? "每周至少一次 case partner 训练，复盘结构、计算和 fit story。"
        : "不要只刷 technical，也要固定 coffee chat 和 referral 记录。强的人通常两条线一起推。",
      prompt: role.includes("Consulting")
        ? "这周谁可以约一次 case partner？发一下你想练的 case 类型和空闲时间。"
        : "大家发一下本周 networking 目标：准备联系几个人、目标 team 是什么、最卡的一步是什么？"
    });
    cards.push({
      label: "升级信号",
      title: "能稳定帮助别人，比单纯申请数更重要",
      text: "Ready 到 Competitive 的关键不是自称更强，而是能输出成果、复盘错误、给别人具体反馈。",
      prompt: "这周每个人给别人一条具体反馈：CV、technical、case 或 networking message 都可以。"
    });
  }
  return cards;
}

function renderApplicationRadar(currentProfile = profile) {
  return applicationRadarCards(currentProfile).map(card => `
    <article class="radar-card">
      <span>${h(card.label)}</span>
      <h3>${h(card.title)}</h3>
      <p>${h(card.text)}</p>
      <button class="prompt-chip" type="button" data-prompt="${h(card.prompt)}">发起这个动作</button>
    </article>
  `).join("");
}

function circleTypeName(type) {
  return type === "task" ? "任务 Circle" : "聊天 Circle";
}

function notice(text, type = "") {
  return `<div class="notice ${type}">${h(text)}</div>`;
}

function nav(path, label) {
  const current = routePath();
  const active = current === path || (path !== "/home" && current.startsWith(path));
  return `<a class="nav-item ${active ? "active" : ""}" href="#${path}">${label}</a>`;
}

function chatHomePath() {
  return activeChatCircle?.id ? `/group/${activeChatCircle.id}` : "/chat";
}

function juniorLevel() {
  return Math.max(1, Number(profile?.level || 1) - 1);
}

function layout(content, options = {}) {
  const logged = Boolean(user);
  app.innerHTML = `
    <div class="app-frame ${options.full ? "full" : ""}">
      ${options.hideNav ? "" : `
        <header class="topbar">
          <a class="brand" href="#/home">circle</a>
          <nav class="main-nav">
            ${logged ? nav("/home", "今日") : ""}
            ${logged ? `<a class="nav-item ${routePath().startsWith("/chat") || routePath().startsWith("/group") || routePath().startsWith("/observe") ? "active" : ""}" href="#/chat">聊天 Circle</a>` : ""}
            ${logged ? nav("/tasks", "任务") : ""}
            ${logged ? nav("/showcase", "成果") : ""}
            ${logged ? nav("/profile", "主页") : ""}
            ${logged ? `<button class="ghost-btn" id="logoutBtn" type="button">退出</button>` : nav("/login", "登录")}
          </nav>
        </header>
      `}
      <main class="${options.full ? "full-main" : "page"}">${content}</main>
    </div>
  `;
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
}

async function init() {
  if (!okConfig()) {
    app.innerHTML = `<main class="page">${notice("还没有配置 Supabase。请先填写 config.js。", "error")}</main>`;
    return;
  }
  db = supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
  const { data } = await db.auth.getSession();
  session = data.session;
  user = session?.user || null;
  if (user) {
    await ensureProfile();
    await syncActiveChatCircle();
  }
  db.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;
    user = nextSession?.user || null;
    profile = null;
    activeChatCircle = null;
    if (user) {
      await ensureProfile();
      await syncActiveChatCircle();
    }
    renderRoute();
  });
  renderRoute();
}

async function ensureProfile() {
  const { data, error } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (data) {
    profile = data;
    return data;
  }
  const payload = {
    id: user.id,
    email: user.email,
    display_name: user.email?.split("@")[0] || "新用户",
    stage: "Freshman",
    direction: "未设置方向",
    bio: ""
  };
  const inserted = await db.from("profiles").insert(payload).select("*").single();
  if (inserted.error) throw inserted.error;
  profile = inserted.data;
  return profile;
}

async function requireUser() {
  if (!user) {
    go("/login");
    return false;
  }
  if (!profile) await ensureProfile();
  return true;
}

async function syncActiveChatCircle() {
  if (!user) {
    activeChatCircle = null;
    return null;
  }
  const { data, error } = await db
    .from("group_members")
    .select("groups:group_id (id, name, topic, level, circle_type, status)")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error) {
    activeChatCircle = null;
    return null;
  }
  activeChatCircle = (data || []).find(row => row.groups?.circle_type === "exploration")?.groups || null;
  return activeChatCircle;
}

async function memberships() {
  const { data, error } = await db
    .from("group_members")
    .select(`
      id,
      joined_at,
      groups:group_id (
        id,
        name,
        circle_type,
        topic,
        level,
        max_members,
        status,
        task:task_id (id, title, category, level, duration_days, deliverable)
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function pendingInvites() {
  const { data, error } = await db
    .from("promotion_invites")
    .select("id, from_level, target_level, reason, created_at, inviter:inviter_id (display_name)")
    .eq("invitee_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return [];
  return data || [];
}

async function mySubmissions(limit = 20) {
  const { data, error } = await db
    .from("task_submissions")
    .select("id, title, submission_url, content, created_at, tasks:task_id (title, category, level), groups:group_id (id, name)")
    .eq("submitted_by", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

async function taskSubmissions(taskId) {
  const { data, error } = await db
    .from("task_submissions")
    .select("id, title, content, submission_url, created_at, groups:group_id (id, name, level), profiles:submitted_by (display_name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data || [];
}

async function recentGroupMessages(groupId, limit = 250) {
  if (!groupId) return [];
  const { data, error } = await db
    .from("messages")
    .select("id, content, created_at, user_id, profiles:user_id (display_name)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return [];
  return data || [];
}

async function showcaseSubmissions() {
  const { data, error } = await db
    .from("task_submissions")
    .select(`
      id,
      title,
      content,
      submission_url,
      created_at,
      tasks:task_id (title, category, level),
      groups:group_id (id, name, level),
      profiles:submitted_by (id, display_name, direction, stage, level)
    `)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return [];
  return data || [];
}

async function profileEndorsements(profileId) {
  const { data, error } = await db
    .from("profile_endorsements")
    .select("id, tag, note, created_at, endorser:endorser_id (display_name, level)")
    .eq("target_id", profileId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return data || [];
}

async function juniorChatCircles() {
  if (!profile || Number(profile.level || 1) <= 1) return [];
  const targetLevel = juniorLevel();
  const { data, error } = await db
    .from("groups")
    .select("id, name, topic, level, circle_type, max_members, status, created_at")
    .eq("circle_type", "exploration")
    .eq("level", targetLevel)
    .in("status", ["forming", "active", "full"])
    .order("created_at", { ascending: false });
  if (error) return [];

  const rows = [];
  for (const group of data || []) {
    const { count } = await db
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_id", group.id)
      .eq("status", "active");
    rows.push({ ...group, member_count: count || 0 });
  }
  return rows;
}

async function renderRoute() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  try {
    const path = routePath();
    if (path === "/" || path === "/home") return pageHome();
    if (path === "/login") return pageLogin();
    if (path === "/chat") return pageChatLobby();
    if (path === "/observe") return pageJuniorObserve();
    if (path === "/tasks") return pageTasks();
    if (path === "/showcase") return pageShowcase();
    if (path === "/mine") return go("/home");
    if (path === "/profile") return pageProfile(user?.id);
    if (path.startsWith("/profile/")) return pageProfile(path.split("/")[2]);
    if (path === "/onboarding") return pageOnboarding();
    if (path.startsWith("/group/")) return pageGroup(path.split("/")[2]);
    if (path.startsWith("/work/")) return pageWorkbench(path.split("/")[2]);
    return pageHome();
  } catch (err) {
    console.error(err);
    layout(`<section class="panel">${notice(err.message || String(err), "error")}</section>`);
  }
}

async function pageLogin() {
  if (user) return go("/home");
  layout(`
    <section class="login-grid">
      <div class="login-copy">
        <p class="eyebrow">spring week & summer squads</p>
        <h1>Spring Week 和 Summer 申请者的目标小队。</h1>
        <p>circle 先专注海外中国留学生的 Spring Week 和 Summer 申请，用 6 人小圈、周进度、任务成果和 Mentor 观察，把散乱求职焦虑变成持续行动。</p>
        <div class="rule-strip">
          <span>6 人小圈</span>
          <span>阶段接近</span>
          <span>同阶段任务</span>
          <span>成果上主页</span>
        </div>
      </div>
      <form class="panel form-card" id="loginForm">
        <h2>登录 circle</h2>
        <label>邮箱<input name="email" type="email" required placeholder="you@example.com"></label>
        <label>密码<input name="password" type="password" required placeholder="至少 6 位"></label>
        <div class="button-row">
          <button class="primary-btn" type="submit">登录</button>
          <button class="secondary-btn" id="signupBtn" type="button">注册</button>
        </div>
        <div id="loginMsg"></div>
      </form>
    </section>
  `);

  const form = document.getElementById("loginForm");
  const msg = document.getElementById("loginMsg");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(form);
    msg.innerHTML = "登录中...";
    const { error } = await db.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password"))
    });
    if (error) msg.innerHTML = notice(error.message, "error");
    else go("/home");
  });
  document.getElementById("signupBtn").addEventListener("click", async () => {
    const fd = new FormData(form);
    msg.innerHTML = "注册中...";
    const { error } = await db.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password"))
    });
    msg.innerHTML = error ? notice(error.message, "error") : notice("注册成功。若开启邮箱确认，请先去邮箱确认。", "success");
  });
}

async function logout() {
  await db.auth.signOut();
  go("/login");
}

async function pageHome() {
  if (!(await requireUser())) return;
  const [mine, invites, subs, juniorCircles] = await Promise.all([memberships(), pendingInvites(), mySubmissions(5), juniorChatCircles()]);
  const chat = mine.find(m => m.groups?.circle_type === "exploration")?.groups;
  const taskCircles = mine.filter(m => m.groups?.circle_type === "task");
  const chatMessages = chat ? await recentGroupMessages(chat.id) : [];
  const checkins = weeklyCheckins(chatMessages);
  const myCheckin = latestCheckinForUser(checkins);
  const nextActions = suggestedActions(profile, myCheckin, subs);

  layout(`
    <section class="hero-panel">
      <div>
        <p class="eyebrow">你的申请阶段</p>
        <h1>${level(profile.level)} · ${h(profile.direction || "未设置方向")}</h1>
        <p>${h(profile.bio || stageDetail(profile.level))}</p>
      </div>
      <div class="hero-actions">
        <a class="primary-btn" href="#${chatHomePath()}">${chat ? "进入聊天 Circle" : "选择聊天 Circle"}</a>
        ${Number(profile.level || 1) > 1 ? `<a class="secondary-btn" href="#/observe">观察 ${level(juniorLevel())}</a>` : ""}
        <a class="secondary-btn" href="#/tasks">看同阶段任务</a>
      </div>
    </section>

    <section class="action-hub panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">today command center</p>
          <h2>今日申请行动台</h2>
        </div>
        <a class="text-btn" href="#/onboarding">调整画像</a>
      </div>
      <div class="hub-grid">
        <article class="hub-card">
          <strong>申请画像</strong>
          <div class="profile-chip-grid">${renderProfileChips(profile)}</div>
          <p>${h(applicationSummary(profile))}</p>
          <p>${h(progressSummary(profile))}</p>
        </article>
        <article class="hub-card">
          <strong>本周同步</strong>
          <div class="mini-stats inline-stats">
            <div><strong>${myCheckin?.apps ?? 0}</strong><span>申请</span></div>
            <div><strong>${myCheckin?.networking ?? 0}</strong><span>Networking</span></div>
          </div>
          <p>${myCheckin ? `已同步：${time(myCheckin.createdAt)}` : "这周还没有同步进展，先让小队知道你在哪里。"}</p>
          <a class="secondary-btn" href="#${chatHomePath()}">${myCheckin ? "更新周同步" : "去同步"}</a>
        </article>
        <article class="hub-card">
          <strong>下一步建议</strong>
          <ul class="todo-stack">
            ${nextActions.map(item => `<li>${h(item)}</li>`).join("")}
          </ul>
        </article>
      </div>
    </section>

    <section class="metrics">
      <div><strong>${chat ? "1" : "0"}</strong><span>长期聊天 Circle</span></div>
      <div><strong>${taskCircles.length}</strong><span>进行中任务 Circle</span></div>
      <div><strong>${subs.length}</strong><span>主页成果</span></div>
      <div><strong>${Number(profile.level || 1) > 1 ? juniorCircles.length : invites.length}</strong><span>${Number(profile.level || 1) > 1 ? "可观察候选小队" : "阶段升级邀请"}</span></div>
    </section>

    <section class="two-col">
      <div class="panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">long-term circle</p>
            <h2>聊天 Circle</h2>
          </div>
          <a class="text-btn" href="#${chatHomePath()}">${chat ? "进入" : "选择"}</a>
        </div>
        ${chat ? circleCard(chat, "这是你唯一的长期目标小队。建议持续同步进展、互相提醒节奏，而不是频繁切换。") : `
          <p class="muted">你还没有聊天 Circle。每个人只能加入一个，保证小队成员目标集中、关系稳定。</p>
        `}
      </div>
      <div class="panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">task circles</p>
            <h2>同阶段任务</h2>
          </div>
          <a class="text-btn" href="#/tasks">进入</a>
        </div>
        ${taskCircles.slice(0, 3).map(m => circleCard(m.groups, m.groups.task?.title || "")).join("") || `<p class="muted">当前没有进行中的任务 Circle。</p>`}
      </div>
    </section>

    ${Number(profile.level || 1) > 1 ? `
      <section class="panel" style="margin-top:16px">
        <div class="section-head">
          <div>
            <p class="eyebrow">mentor view</p>
            <h2>观察上一阶段候选人</h2>
          </div>
          <a class="text-btn" href="#/observe">查看全部</a>
        </div>
        <p class="muted">你当前是 ${level(profile.level)}，可以查看 ${level(juniorLevel())} 小队的真实讨论和周进展，并给持续输出、行动力强的成员发阶段升级邀请。</p>
        <div class="list">
          ${juniorCircles.slice(0, 3).map(group => observeCircleCard(group)).join("") || `<p class="muted">上一阶段还没有活跃聊天 Circle。</p>`}
        </div>
      </section>
    ` : ""}

    ${invites.length ? `
      <section class="panel">
        <div class="section-head"><h2>升级邀请</h2></div>
        <div class="list">
          ${invites.map(invite => `
            <article class="list-item">
              <span class="pill good">${level(invite.from_level)} → ${level(invite.target_level)}</span>
              <h3>${h(invite.inviter?.display_name || "Peer Lead / Mentor")} 邀请你进入下一阶段</h3>
              <p>${h(invite.reason)}</p>
              <div class="button-row">
                <button class="primary-btn resolveInvite" data-id="${invite.id}" data-accept="true">接受</button>
                <button class="secondary-btn resolveInvite" data-id="${invite.id}" data-accept="false">暂不</button>
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    ` : ""}
  `);
  bindInviteButtons();
}

function circleCard(group, detail = "") {
  return `
    <article class="mini-card">
      <div class="pill-row">
        <span class="pill ${group.circle_type === "task" ? "dark" : "warm"}">${circleTypeName(group.circle_type)}</span>
        <span class="pill good">${level(group.level)}</span>
        <span class="pill">${h(group.status)}</span>
      </div>
      <h3>${h(group.name)}</h3>
      <p>${h(detail || group.topic || "")}</p>
      <div class="button-row">
        <a class="secondary-btn" href="#/group/${group.id}">进入讨论</a>
        ${group.circle_type === "task" ? `<a class="secondary-btn" href="#/work/${group.id}">提交成果</a>` : ""}
      </div>
    </article>
  `;
}

function observeCircleCard(group) {
  return `
    <article class="mini-card observe-card">
      <div class="pill-row">
        <span class="pill warm">候选小队</span>
        <span class="pill good">${level(group.level)}</span>
        <span class="pill">${group.member_count || 0}/${group.max_members}</span>
      </div>
      <h3>${h(group.name)}</h3>
      <p>${h(group.topic || "上一阶段聊天 Circle")}</p>
      <div class="button-row">
        <a class="secondary-btn" href="#/group/${group.id}">只读观察</a>
      </div>
    </article>
  `;
}

function renderChatMessages(messages) {
  if (!messages.length) return `<p class="empty">还没有消息。发第一条开始讨论。</p>`;
  let lastDay = "";
  return messages.map(msg => {
    const day = messageDay(msg.created_at);
    const divider = day !== lastDay ? `<div class="day-divider"><span>${h(day)}</span></div>` : "";
    lastDay = day;
    return `
      ${divider}
      <div class="bubble-line ${msg.user_id === user.id ? "mine" : ""}">
        <div class="chat-avatar">${h((msg.profiles?.display_name || "C").slice(0, 1))}</div>
        <div class="bubble-wrap">
          <div class="bubble-meta">
            <span>${h(msg.profiles?.display_name || "用户")}</span>
            <span>${messageClock(msg.created_at)}</span>
          </div>
          <div class="bubble">${h(msg.content)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function isSameLocalDay(value, date = new Date()) {
  const item = new Date(value);
  return item.getFullYear() === date.getFullYear() &&
    item.getMonth() === date.getMonth() &&
    item.getDate() === date.getDate();
}

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function weeklyCheckins(messages) {
  const weekStart = startOfWeek();
  return messages
    .filter(msg => msg.content?.includes("【周同步】") && new Date(msg.created_at) >= weekStart)
    .map(msg => {
      const apps = Number(msg.content.match(/申请[:：]\s*(\d+)/)?.[1] || 0);
      const networking = Number(msg.content.match(/Networking[:：]\s*(\d+)/i)?.[1] || 0);
      const score = apps * 2 + networking;
      return {
        id: msg.id,
        userId: msg.user_id,
        name: msg.profiles?.display_name || "用户",
        apps,
        networking,
        score,
        createdAt: msg.created_at
      };
    })
    .sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt));
}

function renderWeeklyRank(checkins) {
  if (!checkins.length) return `<p class="muted compact-muted">这周还没有人同步进度。第一个同步的人会出现在这里。</p>`;
  const latestByUser = new Map();
  checkins.forEach(item => {
    if (!latestByUser.has(item.userId)) latestByUser.set(item.userId, item);
  });
  return [...latestByUser.values()].slice(0, 5).map((item, index) => `
    <div class="rank-row">
      <b>#${index + 1}</b>
      <span>${h(item.name)}</span>
      <em>${item.apps} 申请 · ${item.networking} networking</em>
    </div>
  `).join("");
}

function latestCheckinForUser(checkins, userId = user?.id) {
  return checkins.find(item => item.userId === userId) || null;
}

function defaultActions(group) {
  if (group.circle_type === "task") {
    return ["确认分工", "补一条关键假设", "整理交付链接", "请一个成员 review"];
  }
  return ["同步今日申请数", "找 1 个材料让别人看", "发 1 个 networking 目标", "复盘一个卡点"];
}

function actionStorageKey(groupId) {
  return `circle-actions:${user?.id || "anon"}:${groupId}:${new Date().toISOString().slice(0, 10)}`;
}

function readActions(groupId, group) {
  const saved = localStorage.getItem(actionStorageKey(groupId));
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      localStorage.removeItem(actionStorageKey(groupId));
    }
  }
  return defaultActions(group).map(text => ({ text, done: false }));
}

function renderActionList(groupId, group) {
  return readActions(groupId, group).map((item, index) => `
    <label class="action-item">
      <input type="checkbox" data-action-index="${index}" ${item.done ? "checked" : ""}>
      <span>${h(item.text)}</span>
    </label>
  `).join("");
}

async function pageChatLobby() {
  if (!(await requireUser())) return;
  const mine = await memberships();
  const juniorCircles = await juniorChatCircles();
  const chat = mine.find(m => m.groups?.circle_type === "exploration")?.groups;
  const topics = chatTopicsForProfile(profile);

  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">one active application squad</p>
        <h1>聊天 Circle 广场</h1>
        <p>这里展示与你当前申请阶段匹配的长期小队。你现在是 ${level(profile.level)}，每个人同时只能加入 1 个聊天 Circle，避免同时混在很多群里失去行动力。</p>
      </div>
    </section>

    <section class="panel match-panel">
      <div>
        <p class="eyebrow">smart match basis</p>
        <h2>${h(applicationSummary(profile))}</h2>
        <p class="muted">${h(progressSummary(profile))}。系统会优先推荐目标、阶段和行动强度接近的小队。</p>
      </div>
      <div class="profile-chip-grid">${renderProfileChips(profile)}</div>
    </section>

    ${chat ? notice(`你已经有自己的长期目标小队：「${chat.name}」。入口放在「今日」页，这里继续作为广场展示。`) : ""}

    ${Number(profile.level || 1) > 1 ? `
      <section class="panel" style="margin-top:16px">
        <div class="section-head">
          <div>
            <p class="eyebrow">mentor view</p>
            <h2>观察 ${level(juniorLevel())} 小队</h2>
          </div>
          <a class="text-btn" href="#/observe">查看全部</a>
        </div>
        <p class="muted">这里不是让不同阶段混聊，而是让 Peer Lead / Mentor 观察真实讨论、周进展和任务输出，再邀请高质量成员升级。</p>
        <div class="card-grid compact-grid">
          ${juniorCircles.slice(0, 2).map(group => observeCircleCard(group)).join("") || `<p class="muted">上一阶段还没有活跃聊天 Circle。</p>`}
        </div>
      </section>
    ` : ""}

    <section class="card-grid">
      ${topics.map(([topic, desc]) => `
        <article class="panel topic-card">
          <div class="pill-row">
            <span class="pill warm">聊天 Circle</span>
            <span class="pill good">${level(profile.level)}</span>
            <span class="pill">最多 6 人</span>
          </div>
          <h2>${h(topic)}</h2>
          <p>${h(desc)}</p>
          <div class="match-note">匹配原因：${h(profileValue(profile, "application_track", "Spring Week"))} · ${h(profileValue(profile, "target_region", "英国"))} · ${h(profileValue(profile, "intensity", "正常推进"))}</div>
          <button class="primary-btn joinChat" data-topic="${h(topic)}" ${chat ? "disabled" : ""}>${chat ? "已有目标小队" : "加入这个 Circle"}</button>
        </article>
      `).join("")}
    </section>
  `);

  document.querySelectorAll(".joinChat").forEach(button => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "加入中...";
      const { data, error } = await db.rpc("join_exploration_circle", {
        p_topic: button.dataset.topic,
        p_level: profile.level
      });
      if (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = "加入";
      } else {
        await syncActiveChatCircle();
        go("/home");
      }
    });
  });
}

async function pageJuniorObserve() {
  if (!(await requireUser())) return;
  if (Number(profile.level || 1) <= 1) {
    layout(`
      <section class="hero-panel compact-hero">
        <div>
          <p class="eyebrow">mentor view</p>
          <h1>Starter 暂时没有上一阶段可观察</h1>
          <p>先加入自己的 Spring / Summer 小队，持续同步进展、完成任务成果，等待 Peer Lead 或 Mentor 邀请你升级。</p>
        </div>
        <a class="primary-btn" href="#${chatHomePath()}">回到聊天 Circle</a>
      </section>
    `);
    return;
  }

  const groups = await juniorChatCircles();
  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">mentor view</p>
        <h1>观察 ${level(juniorLevel())} 小队</h1>
        <p>你当前是 ${level(profile.level)}。你可以查看上一阶段小队的聊天记录和周进展，但不能直接参与聊天；如果看到行动力、表达和输出质量都不错的人，可以发升级邀请。</p>
      </div>
      <a class="secondary-btn" href="#${chatHomePath()}">进入当前聊天 Circle</a>
    </section>
    <section class="card-grid">
      ${groups.map(group => observeCircleCard(group)).join("") || `
        <div class="panel">
          <h2>还没有可观察的小队</h2>
          <p class="muted">等 ${level(juniorLevel())} 用户加入聊天 Circle 后，这里会出现可观察列表。</p>
        </div>
      `}
    </section>
  `);
}

async function pageTasks() {
  if (!(await requireUser())) return;
  const mine = await memberships();
  const joinedTaskIds = new Set(
    mine
      .filter(m => m.groups?.circle_type === "task" && m.groups?.task?.id)
      .map(m => m.groups.task.id)
  );
  const { data: tasks, error } = await db
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .eq("level", profile.level)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const visibleTasks = (tasks || [])
    .filter(isApplicationTask)
    .sort((a, b) => taskRelevanceScore(b, profile) - taskRelevanceScore(a, profile));
  const cards = [];
  for (const task of visibleTasks) {
    const alreadyJoined = joinedTaskIds.has(task.id);
    const relevance = taskRelevanceScore(task, profile);
    const [submissions, groupCount] = await Promise.all([
      taskSubmissions(task.id),
      db.from("groups").select("id", { count: "exact", head: true }).eq("task_id", task.id)
    ]);
    cards.push(`
      <article class="panel task-card">
        <div class="pill-row">
          <span class="pill dark">任务 Circle</span>
          <span class="pill good">${level(task.level)}</span>
          <span class="pill">${h(task.category)}</span>
          <span class="pill">${task.group_size} 人/组</span>
          ${relevance >= 4 ? `<span class="pill warm">推荐</span>` : ""}
        </div>
        <h2>${h(task.title)}</h2>
        <p>${h(task.description)}</p>
        <div class="deliverable">
          <strong>交付物</strong>
          <span>${h(task.deliverable)}</span>
        </div>
        <div class="leaderboard">
          ${(submissions || []).slice(0, 3).map((sub, index) => `
            <div><b>#${index + 1}</b><span>${h(sub.groups?.name || "Circle")}</span><em>${time(sub.created_at)}</em></div>
          `).join("") || `<p class="muted">还没有提交，先组队抢第一个成果。</p>`}
        </div>
        <div class="button-row">
          <button class="primary-btn joinTask" data-id="${task.id}" ${alreadyJoined ? "disabled" : ""}>${alreadyJoined ? "已加入，去今日进入" : "加入同阶段任务"}</button>
          <span class="muted">${groupCount.count || 0} 个 Circle</span>
        </div>
      </article>
    `);
  }

  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">spring & summer tasks</p>
        <h1>${level(profile.level)} 任务 Circle 广场</h1>
        <p>这里展示你当前申请阶段可以加入的任务型 Circle。Spring Week 任务偏材料和节奏，Summer 任务偏 technical、networking、mock 和成果输出。</p>
      </div>
    </section>
    <section class="card-grid">
      ${cards.join("") || `<div class="panel">${notice("当前阶段还没有开放任务。可以先在聊天 Circle 里同步进展，等待新任务或升级邀请。")}</div>`}
    </section>
  `);

  document.querySelectorAll(".joinTask").forEach(button => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "加入中...";
      const { data, error } = await db.rpc("join_task_circle", { p_task_id: button.dataset.id });
      if (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = "加入同阶段任务";
      } else {
        go("/home");
      }
    });
  });
}

function submissionCard(sub, index = null) {
  return `
    <article class="list-item result-card">
      <div class="pill-row">
        ${index === null ? "" : `<span class="pill dark">#${index + 1}</span>`}
        <span class="pill good">${level(sub.tasks?.level || sub.groups?.level || 1)}</span>
        <span class="pill">${h(sub.tasks?.category || "任务成果")}</span>
      </div>
      <h3>${h(sub.title)}</h3>
      <p>${h(sub.tasks?.title || "任务")} · ${h(sub.groups?.name || "Circle")} · ${time(sub.created_at)}</p>
      <p>${h(sub.content || "").slice(0, 180)}${String(sub.content || "").length > 180 ? "..." : ""}</p>
      <div class="button-row">
        ${sub.submission_url ? `<a class="secondary-btn" href="${h(sub.submission_url)}" target="_blank" rel="noreferrer">打开成果</a>` : ""}
        ${sub.profiles?.id ? `<a class="text-btn" href="#/profile/${sub.profiles.id}">看成员主页</a>` : ""}
      </div>
    </article>
  `;
}

async function pageShowcase() {
  if (!(await requireUser())) return;
  const submissions = await showcaseSubmissions();
  const categories = [...new Set(submissions.map(s => s.tasks?.category).filter(Boolean))];
  const levelBuckets = [1, 2, 3, 4, 5].map(lv => ({
    level: lv,
    count: submissions.filter(s => Number(s.tasks?.level || s.groups?.level || 1) === lv).length
  }));
  const circleCounts = new Map();
  submissions.forEach(sub => {
    const id = sub.groups?.id || sub.groups?.name;
    if (!id) return;
    const prev = circleCounts.get(id) || { name: sub.groups?.name || "Circle", level: sub.groups?.level || sub.tasks?.level, count: 0 };
    prev.count += 1;
    circleCounts.set(id, prev);
  });
  const topCircles = [...circleCounts.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">public proof</p>
        <h1>成果广场</h1>
        <p>任务 Circle 产生的成果会沉淀在这里，变成可展示、可比较、可传播的职业信号。它不只记录你聊了什么，更记录你真正做出了什么。</p>
      </div>
      <a class="primary-btn" href="#/tasks">去做任务</a>
    </section>

    <section class="metrics">
      <div><strong>${submissions.length}</strong><span>公开成果</span></div>
      <div><strong>${categories.length}</strong><span>任务方向</span></div>
      <div><strong>${topCircles.length}</strong><span>活跃 Circle</span></div>
      <div><strong>${submissions.filter(s => s.submission_url).length}</strong><span>带链接成果</span></div>
    </section>

    <section class="two-col wide-left">
      <div class="panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">latest results</p>
            <h2>最新成果</h2>
          </div>
        </div>
        <div class="list">
          ${submissions.slice(0, 12).map((sub, index) => submissionCard(sub, index)).join("") || `<p class="muted">还没有任务成果。完成任务提交后会出现在这里。</p>`}
        </div>
      </div>

      <aside class="panel">
        <h2>Circle 排行榜</h2>
        <div class="leaderboard tall">
          ${topCircles.map((circle, index) => `
            <div>
              <b>#${index + 1}</b>
              <span>${h(circle.name)} · ${level(circle.level)}</span>
              <em>${circle.count} 个成果</em>
            </div>
          `).join("") || `<p class="muted">还没有可排名的 Circle。</p>`}
        </div>

        <h2 style="margin-top:22px">阶段分布</h2>
        <div class="level-bars">
          ${levelBuckets.map(bucket => `
            <div>
              <span>${level(bucket.level)}</span>
              <b style="width:${Math.max(8, bucket.count * 18)}px"></b>
              <em>${bucket.count}</em>
            </div>
          `).join("")}
        </div>
      </aside>
    </section>
  `);
}

async function pageProfile(profileId) {
  if (!(await requireUser())) return;
  const targetId = profileId || user.id;
  const isSelf = targetId === user.id;
  const { data: targetProfile, error: profileError } = await db
    .from("profiles")
    .select("*")
    .eq("id", targetId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!targetProfile) {
    layout(`<section class="panel">${notice("没有找到这个用户。", "error")}</section>`);
    return;
  }
  const [mine, subs, invites, endorsements] = await Promise.all([
    isSelf ? memberships() : Promise.resolve([]),
    isSelf ? mySubmissions() : db
      .from("task_submissions")
      .select("id, title, submission_url, content, created_at, tasks:task_id (title, category, level), groups:group_id (id, name)")
      .eq("submitted_by", targetId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => data || []),
    isSelf ? pendingInvites() : Promise.resolve([]),
    profileEndorsements(targetId)
  ]);
  const { count: messageCount } = await db.from("messages").select("id", { count: "exact", head: true }).eq("user_id", targetId);
  const tagCounts = endorsements.reduce((acc, item) => {
    acc[item.tag] = (acc[item.tag] || 0) + 1;
    return acc;
  }, {});
  layout(`
    <section class="profile-head panel">
      <div class="avatar-large">${h((targetProfile.display_name || targetProfile.email || "C").slice(0, 1))}</div>
      <div>
        <p class="eyebrow">public profile</p>
        <h1>${h(targetProfile.display_name || "未命名用户")}</h1>
        <p>${level(targetProfile.level)} · ${h(targetProfile.stage)} · ${h(targetProfile.direction)}</p>
        <p>${h(targetProfile.bio || "还没有填写介绍。")}</p>
        <div class="profile-chip-grid inline-profile-chips">${renderProfileChips(targetProfile)}</div>
        <div class="button-row">
          ${isSelf ? `<a class="secondary-btn" href="#/onboarding">编辑资料</a>` : ""}
          <a class="secondary-btn" href="#/showcase">成果广场</a>
        </div>
      </div>
    </section>
    <section class="metrics">
      <div><strong>${isSelf ? mine.length : "-"}</strong><span>Circle</span></div>
      <div><strong>${messageCount || 0}</strong><span>发言</span></div>
      <div><strong>${subs.length}</strong><span>成果</span></div>
      <div><strong>${endorsements.length}</strong><span>推荐标签</span></div>
    </section>
    <section class="panel">
      <div class="section-head"><h2>Mentor 推荐标签</h2></div>
      <div class="tag-cloud">
        ${Object.keys(tagCounts).map(tag => `<span>${h(tag)} × ${tagCounts[tag]}</span>`).join("") || `<p class="muted">还没有收到 Mentor 推荐。被观察、完成任务、输出高质量讨论后会逐渐积累。</p>`}
      </div>
      ${endorsements.length ? `
        <div class="list" style="margin-top:14px">
          ${endorsements.slice(0, 6).map(item => `
            <article class="mini-card">
              <div class="pill-row">
                <span class="pill good">${h(item.tag)}</span>
                <span class="pill">${level(item.endorser?.level || 1)}</span>
              </div>
              <p>${h(item.note || "Mentor 推荐")}</p>
              <p class="muted">${h(item.endorser?.display_name || "Mentor")} · ${time(item.created_at)}</p>
            </article>
          `).join("")}
        </div>
      ` : ""}
    </section>
    <section class="panel">
      <div class="section-head"><h2>成果墙</h2></div>
      <div class="list">
        ${subs.map(sub => `
          <article class="list-item">
            <span class="pill good">${level(sub.tasks?.level)}</span>
            <h3>${h(sub.title)}</h3>
            <p>${h(sub.tasks?.title || "任务")} · ${time(sub.created_at)}</p>
            ${sub.submission_url ? `<a class="text-btn" href="${h(sub.submission_url)}" target="_blank" rel="noreferrer">打开成果链接</a>` : ""}
          </article>
        `).join("") || `<p class="muted">还没有成果。完成任务 Circle 后会自动展示在这里。</p>`}
      </div>
    </section>
  `);
}

async function pageOnboarding() {
  if (!(await requireUser())) return;
  layout(`
    <section class="panel form-wrap">
      <p class="eyebrow">profile setup</p>
      <h1>编辑个人主页</h1>
      <form id="profileForm" class="form-card flat">
        <label>昵称<input name="display_name" value="${h(profile.display_name || "")}"></label>
        <div class="form-grid">
          <label>年级 / 身份
            <select name="stage">
              ${["Freshman", "Sophomore", "Junior", "Master", "Working", "Other"].map(stage => `<option ${profile.stage === stage ? "selected" : ""}>${stage}</option>`).join("")}
            </select>
          </label>
          <label>申请路径
            <select name="application_track">
              ${applicationTracks.map(item => `<option ${profileValue(profile, "application_track", "Spring Week") === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </label>
          <label>目标地区
            <select name="target_region">
              ${targetRegions.map(item => `<option ${profileValue(profile, "target_region", "英国") === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </label>
          <label>目标岗位
            <select name="target_role">
              ${targetRoles.map(item => `<option ${profileValue(profile, "target_role", "Investment Banking") === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </label>
          <label>当前进度
            <select name="application_progress">
              ${applicationProgress.map(item => `<option ${profileValue(profile, "application_progress", "材料准备中") === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </label>
          <label>准备强度
            <select name="intensity">
              ${intensityLevels.map(item => `<option ${profileValue(profile, "intensity", "正常推进") === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </label>
        </div>
        <label>申请目标<input name="direction" value="${h(profile.direction || "")}" placeholder="Spring Week IB / Summer Consulting / Summer AM"></label>
        <label>一句话介绍<textarea name="bio" rows="5" placeholder="你的目标地区、目标岗位、当前进度，以及你希望小队怎么帮你推进。">${h(profile.bio || "")}</textarea></label>
        <button class="primary-btn" type="submit">保存</button>
        <div id="profileMsg"></div>
      </form>
    </section>
  `);
  document.getElementById("profileForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      display_name: String(fd.get("display_name") || "").trim(),
      stage: String(fd.get("stage") || ""),
      direction: String(fd.get("direction") || "").trim(),
      bio: String(fd.get("bio") || "").trim(),
      application_track: String(fd.get("application_track") || ""),
      target_region: String(fd.get("target_region") || ""),
      target_role: String(fd.get("target_role") || ""),
      application_progress: String(fd.get("application_progress") || ""),
      intensity: String(fd.get("intensity") || "")
    };
    let { data, error } = await db.from("profiles").update(payload).eq("id", user.id).select("*").single();
    if (error && /column|schema|cache/i.test(error.message || "")) {
      const legacyPayload = {
        display_name: payload.display_name,
        stage: payload.stage,
        direction: payload.direction,
        bio: payload.bio
      };
      const retry = await db.from("profiles").update(legacyPayload).eq("id", user.id).select("*").single();
      data = retry.data;
      error = retry.error || { message: "资料已保存，但申请画像字段需要先重新运行 Supabase SQL 才能持久保存。" };
    }
    document.getElementById("profileMsg").innerHTML = error ? notice(error.message, "error") : notice("已保存", "success");
    if (data) profile = data;
  });
}

async function pageWorkbench(groupId) {
  if (!(await requireUser())) return;
  const { data: group, error } = await db.from("groups").select("*, task:task_id (*)").eq("id", groupId).single();
  if (error) throw error;
  if (group.circle_type !== "task") return go(`/group/${groupId}`);

  const [subs, members] = await Promise.all([
    taskSubmissions(group.task_id),
    db.from("group_members").select("user_id").eq("group_id", groupId).eq("status", "active")
  ]);
  const isMember = (members.data || []).some(m => m.user_id === user.id);
  const existing = subs.find(sub => sub.groups?.id === groupId);

  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <div class="pill-row"><span class="pill dark">任务工作台</span><span class="pill good">${level(group.level)}</span></div>
        <h1>${h(group.task?.title || group.name)}</h1>
        <p>${h(group.task?.description || "")}</p>
      </div>
      <a class="secondary-btn" href="#/group/${groupId}">返回讨论</a>
    </section>
    <section class="two-col wide-left">
      <div class="panel">
        <h2>${existing ? "更新成果" : "提交成果"}</h2>
        <div class="deliverable"><strong>交付物</strong><span>${h(group.task?.deliverable || "")}</span></div>
        <div class="deliverable"><strong>交付格式</strong><span>${h(group.task?.format_guide || "结论摘要、关键假设、分析过程、风险与下一步。提交链接可以是 Google Doc、Notion、PDF 或 Slides。")}</span></div>
        ${isMember ? `
          <form class="form-card flat" id="submitForm">
            <label>成果标题<input name="title" required value="${h(existing?.title || "")}" placeholder="例如：英国茶饮市场进入方案"></label>
            <label>提交链接<input name="url" type="url" value="${h(existing?.submission_url || "")}" placeholder="https://docs.google.com/..."></label>
            <label>提交说明<textarea name="content" required rows="9" placeholder="写清楚核心结论、分工和链接里的内容。">${h(existing?.content || "")}</textarea></label>
            <button class="primary-btn" type="submit">提交</button>
            <div id="submitMsg"></div>
          </form>
        ` : notice("你可以查看同阶段提交墙，但不是这个 Circle 成员，不能提交。")}
      </div>
      <aside class="panel">
        <h2>同阶段提交墙</h2>
        <div class="leaderboard tall">
          ${subs.map((sub, index) => `
            <div>
              <b>#${index + 1}</b>
              <span>${h(sub.groups?.name || "Circle")}</span>
              <em>${time(sub.created_at)}</em>
            </div>
          `).join("") || `<p class="muted">还没有提交。</p>`}
        </div>
      </aside>
    </section>
    ${subs.length ? `
      <section class="panel">
        <h2>提交详情</h2>
        <div class="list">
          ${subs.map((sub, index) => `
            <article class="list-item">
              <span class="pill dark">#${index + 1}</span>
              <h3>${h(sub.title)}</h3>
              <p>${h(sub.groups?.name || "Circle")} · ${h(sub.profiles?.display_name || "提交者")} · ${time(sub.created_at)}</p>
              ${sub.submission_url ? `<a class="text-btn" href="${h(sub.submission_url)}" target="_blank" rel="noreferrer">打开提交链接</a>` : ""}
              <p>${h(sub.content)}</p>
            </article>
          `).join("")}
        </div>
      </section>
    ` : ""}
  `);

  const form = document.getElementById("submitForm");
  if (form) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const { error: submitError } = await db.rpc("submit_task_result", {
        p_group_id: groupId,
        p_title: String(fd.get("title") || "").trim(),
        p_content: String(fd.get("content") || "").trim(),
        p_submission_url: String(fd.get("url") || "").trim()
      });
      document.getElementById("submitMsg").innerHTML = submitError ? notice(submitError.message, "error") : notice("已提交，成果墙已更新。", "success");
      if (!submitError) setTimeout(() => pageWorkbench(groupId), 500);
    });
  }
}

async function pageGroup(groupId) {
  if (!(await requireUser())) return;
  const { data: group, error } = await db.from("groups").select("*, task:task_id (*)").eq("id", groupId).single();
  if (error) throw error;

  async function readMembers() {
    const { data, error: memberError } = await db
      .from("group_members")
      .select("user_id, role, joined_at, profiles:user_id (display_name, level, direction, stage)")
      .eq("group_id", groupId)
      .eq("status", "active")
      .order("joined_at", { ascending: true });
    if (memberError) throw memberError;
    return data || [];
  }

  async function readMessages() {
    const { data, error: msgError } = await db
      .from("messages")
      .select("id, content, created_at, user_id, profiles:user_id (display_name)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(250);
    if (msgError) throw msgError;
    return data || [];
  }

  async function paint(force = false) {
    if (routePath() !== `/group/${groupId}`) return;
    if (!force && document.activeElement?.matches?.("#messageInput, #weeklyForm input, #weeklyForm textarea")) return;
    const currentScroll = document.getElementById("chatScroll");
    const openMenu = document.getElementById("chatMenu");
    if (!force && openMenu && !openMenu.hidden) return;
    if (!force && currentScroll) {
      const distanceFromBottom = currentScroll.scrollHeight - currentScroll.scrollTop - currentScroll.clientHeight;
      if (distanceFromBottom > 120) return;
    }
    const [members, messages] = await Promise.all([readMembers(), readMessages()]);
    const isMember = members.some(m => m.user_id === user.id);
    const isLowerObservedChat = !isMember && group.circle_type === "exploration" && Number(group.level || 1) < Number(profile.level || 1);
    const topic = group.circle_type === "task" ? group.task?.title : group.topic;
    const activeNames = members.slice(0, 4).map(m => m.profiles?.display_name || "用户").join("、");
    const todayMessages = messages.filter(msg => isSameLocalDay(msg.created_at)).length;
    const activeToday = new Set(messages.filter(msg => isSameLocalDay(msg.created_at)).map(msg => msg.user_id)).size;
    const checkins = weeklyCheckins(messages);
    const myCheckedIn = checkins.some(item => item.userId === user.id);
    const latestMessage = messages[messages.length - 1];
    layout(`
      <section class="chat-workspace">
        <aside class="chat-side">
          <a href="${isLowerObservedChat ? "#/observe" : "#/home"}" class="side-back">‹ 返回</a>
          <div class="side-card main-side-card">
            <div class="pill-row">
              <span class="pill ${group.circle_type === "task" ? "dark" : "warm"}">${circleTypeName(group.circle_type)}</span>
              <span class="pill good">${level(group.level)}</span>
              ${isLowerObservedChat ? `<span class="pill">只读观察</span>` : ""}
            </div>
            <h2>${h(group.name)}</h2>
            <p>${h(topic || "Circle")}</p>
          </div>

          <div class="side-card">
            <div class="side-title">
              <strong>成员</strong>
              <span>${members.length}/${group.max_members}</span>
            </div>
            <div class="side-members">
              ${members.map(m => `
                <a href="#/profile/${m.user_id}">
                  <span class="side-avatar">${h((m.profiles?.display_name || "C").slice(0, 1))}</span>
                  <span>
                    <strong>${h(m.profiles?.display_name || "用户")}</strong>
                    <em>${level(m.profiles?.level)} · ${h(m.profiles?.direction || "")}</em>
                  </span>
                </a>
              `).join("")}
            </div>
          </div>

          <div class="side-card">
            <div class="side-title"><strong>今日状态</strong><span>${todayMessages} 条消息</span></div>
            <div class="mini-stats">
              <div><strong>${activeToday}</strong><span>今日活跃</span></div>
              <div><strong>${checkins.length}</strong><span>周同步</span></div>
            </div>
            <p>${latestMessage ? `最近：${h((latestMessage.profiles?.display_name || "成员"))} 在 ${messageClock(latestMessage.created_at)} 更新。` : "还没有讨论，先发一条进展开始。"} </p>
          </div>

          <div class="side-card">
            <div class="side-title"><strong>上下文</strong></div>
            <p>
              ${isLowerObservedChat
              ? `你正在观察 ${level(group.level)} 讨论，可以给优秀成员推荐标签或邀请升级。`
              : group.circle_type === "task"
              ? `任务交付：${h(group.task?.deliverable || "提交小组成果。")}`
              : "长期聊天 Circle，适合持续复盘和沉淀关系。"}
            </p>
            <div class="side-actions">
              ${group.circle_type === "task" ? `<a class="secondary-btn" href="#/work/${groupId}">任务工作台</a>` : ""}
              <button class="secondary-btn" id="sideToggleMembers" type="button">${isLowerObservedChat ? "推荐 / 升级成员" : "查看成员"}</button>
            </div>
          </div>
        </aside>

        <div class="wechat">
          <header class="chat-top">
            <a href="${isLowerObservedChat ? "#/observe" : "#/home"}" class="back-link mobile-chat-back">‹</a>
            <div>
              <h1>${h(group.name)}</h1>
              <p>${members.length}/${group.max_members} · ${h(activeNames || topic || "")}</p>
            </div>
            <button class="icon-btn" id="moreBtn" type="button">•••</button>
          </header>
          <div class="chat-menu" id="chatMenu" hidden>
            <div class="pill-row">
              <span class="pill ${group.circle_type === "task" ? "dark" : "warm"}">${circleTypeName(group.circle_type)}</span>
              <span class="pill good">${level(group.level)}</span>
              ${isLowerObservedChat ? `<span class="pill">只读观察</span>` : ""}
            </div>
            <div class="chat-menu-context">
              ${isLowerObservedChat
              ? `你正在只读观察 ${level(group.level)} 讨论。可以展开成员，给表现好的候选人添加推荐标签或发升级邀请。`
              : group.circle_type === "task"
              ? `任务交付：${h(group.task?.deliverable || "提交小组成果。")}`
              : "这是长期聊天 Circle。建议稳定参与、持续复盘，不鼓励频繁退出换圈。"}
            </div>
            ${group.circle_type === "task" ? `<a href="#/work/${groupId}">任务工作台</a>` : ""}
            <button id="toggleMembers" type="button">展开成员与升级邀请</button>
            ${isMember ? `<button id="leaveGroup" class="danger" type="button">${group.circle_type === "task" ? "退出任务 Circle" : "退出长期聊天 Circle"}</button>` : ""}
          </div>
          ${group.circle_type === "task" ? `<div class="task-shortcut"><a href="#/work/${groupId}">任务工作台</a></div>` : ""}
          <div class="member-drawer" id="memberDrawer" hidden>
            ${members.map(m => `
              <article>
                <div><strong>${h(m.profiles?.display_name || "用户")}</strong><span>${level(m.profiles?.level)} · ${h(m.profiles?.direction || "")}</span></div>
                ${profile.level > (m.profiles?.level || 1) && m.user_id !== user.id ? `
                  <div class="button-row">
                    <button class="secondary-btn endorseUser" data-user="${m.user_id}">推荐标签</button>
                    <button class="secondary-btn inviteUp" data-user="${m.user_id}">邀请升级</button>
                    <a class="text-btn" href="#/profile/${m.user_id}">主页</a>
                  </div>
                ` : `<a class="text-btn" href="#/profile/${m.user_id}">主页</a>`}
              </article>
            `).join("")}
          </div>
          <div class="chat-scroll" id="chatScroll">
            ${renderChatMessages(messages)}
          </div>
          <footer class="composer">
            ${isMember ? `
              <form id="messageForm">
                <div class="composer-tools">
                  <span>${h(group.circle_type === "task" ? "任务讨论" : "群聊")}</span>
                  <span id="charCount">0/5000</span>
                </div>
                <div class="composer-row">
                  <button class="tool-btn voice-icon" type="button" aria-label="语音"></button>
                  <textarea id="messageInput" name="content" rows="1" maxlength="5000" placeholder="输入消息..."></textarea>
                  <button class="tool-btn plus-icon" type="button" aria-label="更多"></button>
                  <button class="send-btn" id="sendBtn" type="submit" disabled>发送</button>
                </div>
              </form>
            ` : notice("你能查看这个 Circle，但不是成员，不能发言。")}
          </footer>
        </div>

        <aside class="chat-feed">
          <div class="feed-card">
            <div class="side-title">
              <strong>AI 小队简报</strong>
              <span>规则生成</span>
            </div>
            <div class="brief-list">
              ${renderCircleBrief(messages, checkins, members)}
            </div>
          </div>

          <div class="feed-card">
            <div class="side-title">
              <strong>申请节点雷达</strong>
              <span>${h(profileValue(profile, "application_track", "Spring Week"))}</span>
            </div>
            <div class="radar-list">
              ${renderApplicationRadar(profile)}
            </div>
          </div>

          <div class="feed-card">
            <div class="side-title">
              <strong>${group.circle_type === "task" ? "任务看板" : isLowerObservedChat ? "观察看板" : "本周进度"}</strong>
              <span>${level(group.level)}</span>
            </div>
            ${group.circle_type === "task" ? `
              <p>${h(group.task?.description || "围绕任务推进讨论。")}</p>
              <div class="feed-block">
                <strong>交付物</strong>
                <p>${h(group.task?.deliverable || "提交小组成果。")}</p>
              </div>
              <a class="primary-btn" href="#/work/${groupId}">打开任务工作台</a>
            ` : isLowerObservedChat ? `
              <p>你可以一边看候选小队的真实讨论，一边判断谁值得被推荐或升级。</p>
              <div class="feed-block">
                <strong>观察重点</strong>
                <p>看谁能提出清晰问题、推动讨论、总结结论、给出有依据的判断。</p>
              </div>
            ` : `
              <p>这个 Circle 是长期目标小队。每周同步一次进展，大家更容易知道谁在行动、谁需要帮助。</p>
              <div class="rank-list">${renderWeeklyRank(checkins)}</div>
              ${myCheckedIn ? `<div class="notice success slim-notice">你这周已经同步过，可以继续更新新进展。</div>` : ""}
              ${isMember ? `
                <form class="weekly-form" id="weeklyForm">
                  <div class="mini-grid">
                    <label>申请<input name="apps" type="number" min="0" max="200" value="0"></label>
                    <label>Networking<input name="networking" type="number" min="0" max="200" value="0"></label>
                  </div>
                  <label>学到了什么<textarea name="learning" rows="2" maxlength="300" placeholder="例如：改了 CV bullet，练了 DCF，发现一个目标 team"></textarea></label>
                  <label>现在卡在哪里<textarea name="blocker" rows="2" maxlength="300" placeholder="例如：不知道怎么 cold message，HireVue 故事不够顺"></textarea></label>
                  <button class="primary-btn" type="submit">同步本周进度</button>
                </form>
              ` : ""}
              <div class="feed-block">
                <strong>Weekly Star 规则</strong>
                <p>暂时按申请数 ×2 + networking 数排序。之后可以加上任务成果、互助次数和 Mentor 推荐。</p>
              </div>
            `}
          </div>

          ${isMember && !isLowerObservedChat ? `
            <div class="feed-card">
              <div class="side-title"><strong>今日行动</strong><span>本机保存</span></div>
              <div class="action-list" id="actionList">
                ${renderActionList(groupId, group)}
              </div>
            </div>
          ` : ""}

          <div class="feed-card sense-feed-card">
            <div class="side-title">
              <strong>Business Sense</strong>
              <span>${h(profileValue(profile, "target_role", "Finance"))}</span>
            </div>
            <p>每天刷一点商业判断。看到有意思的问题，可以直接发到群里让小队一起拆。</p>
            <div class="sense-feed">
              ${renderBusinessSenseFeed(profile)}
            </div>
          </div>

          <div class="feed-card">
            <div class="side-title"><strong>快捷问题</strong></div>
            <div class="prompt-list">
              ${[
                "今天你最需要别人帮你看什么？",
                "这周最重要的一个申请动作是什么？",
                "有没有一个面试问题你想练？",
                "谁可以总结一下刚才讨论的结论？"
              ].map(text => `<button class="prompt-chip" type="button" data-prompt="${h(text)}">${h(text)}</button>`).join("")}
            </div>
          </div>
        </aside>
      </section>
    `, { full: true, hideNav: true });

    const scroll = document.getElementById("chatScroll");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    const more = document.getElementById("moreBtn");
    const menu = document.getElementById("chatMenu");
    if (more && menu) more.addEventListener("click", () => menu.hidden = !menu.hidden);
    const toggle = document.getElementById("toggleMembers");
    const sideToggle = document.getElementById("sideToggleMembers");
    const drawer = document.getElementById("memberDrawer");
    if (toggle && drawer) toggle.addEventListener("click", () => drawer.hidden = !drawer.hidden);
    if (sideToggle && drawer) sideToggle.addEventListener("click", () => drawer.hidden = !drawer.hidden);
    document.querySelectorAll(".prompt-chip").forEach(button => {
      button.addEventListener("click", () => {
        const input = document.getElementById("messageInput");
        if (!input) return;
        input.value = button.dataset.prompt || "";
        input.focus();
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });

    const actionList = document.getElementById("actionList");
    if (actionList) {
      actionList.addEventListener("change", e => {
        const box = e.target;
        if (!box.matches?.("[data-action-index]")) return;
        const actions = readActions(groupId, group);
        const index = Number(box.dataset.actionIndex);
        if (actions[index]) {
          actions[index].done = box.checked;
          localStorage.setItem(actionStorageKey(groupId), JSON.stringify(actions));
        }
      });
    }

    const weeklyForm = document.getElementById("weeklyForm");
    if (weeklyForm) {
      weeklyForm.addEventListener("submit", async e => {
        e.preventDefault();
        const fd = new FormData(weeklyForm);
        const apps = Math.max(0, Number(fd.get("apps") || 0));
        const networking = Math.max(0, Number(fd.get("networking") || 0));
        const learning = String(fd.get("learning") || "").trim() || "还没写";
        const blocker = String(fd.get("blocker") || "").trim() || "暂时没有";
        const content = [
          "【周同步】",
          `申请：${apps}`,
          `Networking：${networking}`,
          `学到了什么：${learning}`,
          `卡点：${blocker}`
        ].join("\n");
        const submitBtn = weeklyForm.querySelector("button");
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "同步中";
        }
        const { error: weeklyError } = await db.from("messages").insert({ group_id: groupId, user_id: user.id, content });
        if (weeklyError) {
          alert(weeklyError.message);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "同步本周进度";
          }
          return;
        }
        await paint(true);
      });
    }

    document.querySelectorAll(".inviteUp").forEach(button => {
      button.addEventListener("click", async () => {
        const reason = prompt("写一句邀请理由。对方接受后会进入上一层。");
        if (!reason) return;
        const { error: inviteError } = await db.rpc("invite_to_next_level", {
          p_invitee_id: button.dataset.user,
          p_group_id: groupId,
          p_reason: reason
        });
        alert(inviteError ? inviteError.message : "已发出升级邀请");
      });
    });

    document.querySelectorAll(".endorseUser").forEach(button => {
      button.addEventListener("click", async () => {
        const tag = prompt("选择或输入一个推荐标签，例如：分析能力强 / 表达清楚 / 推进能力强 / 建模能力强 / 适合咨询");
        if (!tag) return;
        const note = prompt("写一句推荐理由，会展示在对方主页。") || "";
        const { error: endorseError } = await db.rpc("endorse_profile", {
          p_target_id: button.dataset.user,
          p_tag: tag.trim(),
          p_note: note.trim()
        });
        alert(endorseError ? endorseError.message : "已添加推荐标签");
      });
    });

    const leave = document.getElementById("leaveGroup");
    if (leave) {
      leave.addEventListener("click", async () => {
        const copy = group.circle_type === "exploration"
          ? "聊天 Circle 是长期关系圈，退出后会中断当前关系。确定退出吗？"
          : "确定退出这个任务 Circle 吗？";
        if (!confirm(copy)) return;
        const { error: leaveError } = await db.rpc("leave_group", { p_group_id: groupId });
        if (leaveError) alert(leaveError.message);
        else {
          await syncActiveChatCircle();
          go("/home");
        }
      });
    }

    const form = document.getElementById("messageForm");
    if (form) {
      const textarea = document.getElementById("messageInput");
      const sendBtn = document.getElementById("sendBtn");
      const charCount = document.getElementById("charCount");
      const syncComposer = () => {
        const value = textarea.value;
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
        const hasText = value.trim().length > 0;
        if (sendBtn) sendBtn.disabled = !hasText;
        if (charCount) charCount.textContent = `${value.length}/5000`;
      };
      const send = async () => {
        const content = String(new FormData(form).get("content") || "").trim();
        if (!content) return;
        const previous = textarea.value;
        textarea.value = "";
        syncComposer();
        if (sendBtn) {
          sendBtn.disabled = true;
          sendBtn.textContent = "发送中";
        }
        const { error: sendError } = await db.from("messages").insert({ group_id: groupId, user_id: user.id, content });
        if (sendError) {
          textarea.value = previous;
          syncComposer();
          if (sendBtn) sendBtn.textContent = "发送";
          alert(sendError.message);
        }
        else {
          form.reset();
          syncComposer();
          await paint(true);
        }
      };
      form.addEventListener("submit", async e => {
        e.preventDefault();
        await send();
      });
      textarea.addEventListener("input", syncComposer);
      textarea.addEventListener("keydown", async e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          await send();
        }
      });
      syncComposer();
    }
  }

  await paint(true);
  refreshTimer = setInterval(() => paint(false), 6000);
}

function bindInviteButtons() {
  document.querySelectorAll(".resolveInvite").forEach(button => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const { error } = await db.rpc("resolve_promotion_invite", {
        p_invite_id: button.dataset.id,
        p_accept: button.dataset.accept === "true"
      });
      if (error) alert(error.message);
      profile = null;
      await ensureProfile();
      await syncActiveChatCircle();
      pageHome();
    });
  });
}

window.addEventListener("hashchange", renderRoute);
init();
