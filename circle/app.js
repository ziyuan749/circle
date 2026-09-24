/* global supabase */

const config = window.APP_CONFIG || {};
const app = document.getElementById("app");
const profileFields = "id, display_name, stage, direction, application_track, target_role, application_progress, intensity, bio, level, created_at, updated_at";

let db = null;
let session = null;
let user = null;
let profile = null;
let activeChatCircle = null;
let refreshTimer = null;
let cleanupCurrentPage = null;
let routeRenderToken = 0;
let authStateVersion = 0;

const stageLabels = {
  1: "Starter",
  2: "Ready",
  3: "Competitive"
};

const stageDescriptions = {
  1: "默认进入阶段，先把申请画像、周同步、材料和 networking 节奏跑起来。",
  2: "Summer 申请中已经开始稳定行动的人，适合更高频讨论投递、coffee chat 和面试准备。",
  3: "通过邀请确认的强候选人，重点交流 referral、mock interview、technical / case 和高质量复盘。"
};

const challengeDifficultyLabels = {
  1: "入门难度",
  2: "进阶难度",
  3: "高阶难度"
};

const applicationTracks = ["Spring Week", "Summer Internship"];
const targetRoles = ["Investment Banking", "Consulting", "Asset Management", "Sales & Trading", "Equity Research", "General Finance"];
const chatCircleRoles = ["Finance", "Consulting"];
const applicationProgress = ["刚开始了解", "材料准备中", "投递中", "HireVue / Online Test", "面试中", "等结果 / 复盘"];
const intensityLevels = ["轻度准备", "正常推进", "高强度冲刺"];

function canonicalChatRole(role) {
  const value = String(role || "").trim();
  return /^consulting$/i.test(value) || value === "咨询" ? "Consulting" : "Finance";
}

function normalizedChatTopic(value) {
  return String(value || "")
    .replace(/ - (英国|美国|香港|新加坡) /g, " - ")
    .replace(/(Investment Banking|Asset Management|Sales & Trading|Equity Research|General Finance)(?= Circle)/g, "Finance");
}

function circleDisplayName(group) {
  if (group?.circle_type !== "exploration") return String(group?.name || "");
  const name = normalizedChatTopic(group.name);
  const match = name.match(/^(Spring Week|Summer) (Starter|Ready|Competitive) - (Finance|Consulting) Circle(?: · (?:Starter|Ready|Competitive) Circle (\d+))?$/);
  if (!match) return name;
  return `${match[1]} · ${match[3]}${match[4] ? ` · Circle ${match[4]}` : ""}`;
}

function profileValue(currentProfile, key, fallback) {
  return currentProfile?.[key] || fallback;
}

function profileNeedsOnboarding(currentProfile = profile) {
  if (!currentProfile) return true;
  const direction = String(currentProfile.direction || "").trim();
  return !String(currentProfile.display_name || "").trim()
    || !direction
    || direction === "未设置方向"
    || !profileValue(currentProfile, "application_track", "")
    || !profileValue(currentProfile, "target_role", "")
    || !profileValue(currentProfile, "application_progress", "")
    || !profileValue(currentProfile, "intensity", "");
}

function chatCircleLevel(currentProfile = profile) {
  const currentLevel = Number(currentProfile?.level || 1);
  return ["Spring Week", "Summer Internship"].includes(profileValue(currentProfile, "application_track", "Spring Week"))
    ? Math.min(3, Math.max(1, currentLevel))
    : currentLevel;
}

function applicationSummary(currentProfile = profile) {
  const track = profileValue(currentProfile, "application_track", "Spring Week");
  const role = profileValue(currentProfile, "target_role", currentProfile?.direction || "Investment Banking");
  return `${track} · ${role}`;
}

function progressSummary(currentProfile = profile) {
  return `${profileValue(currentProfile, "application_progress", "材料准备中")} · ${profileValue(currentProfile, "intensity", "正常推进")}`;
}

function matchTags(currentProfile = profile) {
  return [
    profileValue(currentProfile, "application_track", "Spring Week"),
    profileValue(currentProfile, "target_role", "Investment Banking"),
    profileValue(currentProfile, "application_progress", "材料准备中"),
    profileValue(currentProfile, "intensity", "正常推进")
  ];
}

function chatTopicsForProfile(currentProfile) {
  const track = profileValue(currentProfile, "application_track", "Spring Week");
  const role = canonicalChatRole(profileValue(currentProfile, "target_role", "Investment Banking"));
  const topicLevel = chatCircleLevel(currentProfile);
  const roleDescriptions = {
    "Finance": "金融申请小队，覆盖投行、资管、Sales & Trading、Equity Research 等方向，重点交流申请节奏、technical、市场观点和 networking。",
    "Consulting": "咨询申请小队，重点聊 case practice、fit interview、office 选择、company event 和 referral。"
  };
  const combinations = chatCircleRoles.map(item => ({
    role: item,
    level: topicLevel,
    recommended: item === role,
    topic: track === "Spring Week"
      ? `Spring Week ${level(topicLevel)} - ${item} Circle`
      : `Summer ${level(topicLevel)} - ${item} Circle`,
    desc: track === "Spring Week"
      ? `Spring Week 保留 Starter / Ready / Competitive 三层，并按岗位大类分入口。${roleDescriptions[item]}`
      : `Summer 保留 Starter / Ready / Competitive 三层，并按岗位大类分入口。${roleDescriptions[item]}`
  }));
  const sorted = combinations.sort((a, b) =>
    Number(b.recommended) - Number(a.recommended) ||
    Number(b.role === role) - Number(a.role === role)
  );
  if (track === "Spring Week") {
    return sorted;
  }
  return sorted;
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

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
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
  const stage = Math.min(3, Math.max(1, Number(value || 1)));
  return stageLabels[stage] || "Starter";
}

function challengeDifficulty(value = 1) {
  const difficulty = Math.min(3, Math.max(1, Number(value || 1)));
  return challengeDifficultyLabels[difficulty] || "入门难度";
}

function stageDetail(value = 1) {
  const stage = Math.min(3, Math.max(1, Number(value || 1)));
  return stageDescriptions[stage] || stageDescriptions[1];
}

function isChallengeTask(task) {
  const text = `${task.title || ""} ${task.description || ""} ${task.category || ""}`;
  return /Challenge|挑战|比赛|竞赛|模拟|Case|case|market sizing|股票|stock|pitch|memo|investment|equity|咨询|商业分析|行业|估值|M&A|DCF|AI|产品|增长|GTM|strategy|战略|研究|teardown|拆解/i.test(text);
}

function taskRelevanceScore(task, currentProfile = profile) {
  const text = `${task.title || ""} ${task.description || ""} ${task.category || ""}`.toLowerCase();
  let score = 0;
  const role = profileValue(currentProfile, "target_role", "").toLowerCase();
  if (role.includes("bank") && /投行|ib|dcf|valuation|m&a|deal|估值|并购/i.test(text)) score += 5;
  if (role.includes("consult") && /咨询|case|market sizing|profitability|market entry|战略/i.test(text)) score += 5;
  if (role.includes("asset") && /股票|stock|equity|investment|memo|pitch|投资/i.test(text)) score += 5;
  if (role.includes("research") && /股票|equity|research|行业|公司|memo|pitch/i.test(text)) score += 5;
  if (/ai|产品|增长|gtm|商业化|创业/i.test(text)) score += 2;
  return score;
}

function weeklyMainChallenges(tasks) {
  const now = Date.now();
  const active = (tasks || []).filter(task => {
    if (!isChallengeTask(task) || task.status !== "open") return false;
    if (task.starts_at && new Date(task.starts_at).getTime() > now) return false;
    if (task.ends_at && new Date(task.ends_at).getTime() <= now) return false;
    return true;
  });
  const featured = active.filter(task => task.is_featured);
  const seen = new Set();
  return (featured.length ? featured : active)
    .filter(task => {
      const key = String(task.title || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2);
}

function challengeDeadline(task) {
  if (!task?.ends_at) return "截止时间待公布";
  return `截止 ${new Date(task.ends_at).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function applicationTimeline(currentProfile = profile, date = new Date()) {
  const track = profileValue(currentProfile, "application_track", "Spring Week");
  const role = profileValue(currentProfile, "target_role", "Investment Banking");
  const month = date.getMonth() + 1;
  const isConsulting = /consult/i.test(role);
  const isFinance = /bank|asset|trading|equity|finance/i.test(role);

  if (track === "Spring Week") {
    if (month <= 2) return {
      phase: "interview",
      label: "Spring Week 面试 / offer 复盘期",
      targetApps: 1,
      targetNetworking: 2,
      actions: ["优先处理在线测试、HireVue 和面试复盘，把每次失败原因写进 tracker。", "联系已经进流程或拿到 offer 的同学，补齐你不知道的题型和时间线。"]
    };
    if (month <= 4) return {
      phase: "reflection",
      label: "Spring Week 项目参与 / 经验沉淀期",
      targetApps: 0,
      targetNetworking: 2,
      actions: ["把 insight day / spring week 学到的 desk、业务和面试经验沉淀到主页。", "开始反推 Summer 需要补的经历、technical 和 networking 缺口。"]
    };
    if (month <= 7) return {
      phase: "prep",
      label: "Spring Week 提前准备期",
      targetApps: 0,
      targetNetworking: 3,
      actions: ["先整理 20 家目标公司和往年开放时间，把 CV、tracker 和 3 个 STAR 故事准备好。", "每周找 2-3 个高年级同学聊申请路径，提前知道哪些流程最容易卡住。"]
    };
    if (month === 8) return {
      phase: "warmup",
      label: "Spring Week 申请预热期",
      targetApps: 2,
      targetNetworking: 3,
      actions: ["本周把目标公司 deadline 日历建好，优先完成最早开放公司的申请材料。", "把 CV 发到 Circle 里做一轮 peer review，再定最终投递版本。"]
    };
    if (month <= 11) return {
      phase: "applications",
      label: "Spring Week 集中投递期",
      targetApps: 5,
      targetNetworking: 3,
      actions: ["现在应该按 rolling basis 推进投递，先投开放早、竞争强、流程长的公司。", "每投完一家公司就记录题目、状态和下一步，避免申请季后半段失控。"]
    };
    return {
      phase: "assessment",
      label: "Spring Week 测试 / HireVue 期",
      targetApps: 2,
      targetNetworking: 2,
      actions: ["重点处理已经进入流程的 online test、HireVue 和 behavioral 题库。", "把失败或卡住的题目发到 Circle，让同伴追问和复盘。"]
    };
  }

  if (isConsulting) {
    if (month <= 3) return {
      phase: "early",
      label: "Summer Consulting 早期准备 / 部分开放期",
      targetApps: 1,
      targetNetworking: 3,
      actions: ["先确认目标咨询公司的官网开放时间，不同 office 和学校 deadline 可能差很多。", "开始固定 case 训练节奏，每次 mock 后写清楚结构、计算和表达问题。"]
    };
    if (month <= 6) return {
      phase: "applications",
      label: "Summer Consulting 开放 / 准备期",
      targetApps: 3,
      targetNetworking: 3,
      actions: ["咨询 internship 常见春夏开放或截止，现在要把公司、office、deadline 和测试类型整理成 tracker。", "每周至少约 2 次 case，沉淀常见 market sizing、profitability、market entry 框架。"]
    };
    if (month <= 8) return {
      phase: "deadline",
      label: "Summer Consulting deadline 冲刺期",
      targetApps: 4,
      targetNetworking: 3,
      actions: ["现在要优先处理 deadline 靠前、需要 cover letter 或 referral 的咨询公司。", "边投递边 case，不要等拿到面试再开始练。"]
    };
    return {
      phase: "assessment",
      label: "Summer Consulting 补投 / 面试期",
      targetApps: 2,
      targetNetworking: 3,
      actions: ["重点从新增投递转向 case interview、fit interview 和已投公司流程推进。", "如果主线公司已经关闭，补充 boutique consulting、strategy team 和 off-cycle 机会。"]
    };
  }

  if (isFinance) {
    if (month <= 2) return {
      phase: "interview",
      label: "Summer 金融终面 / offer 期",
      targetApps: 1,
      targetNetworking: 2,
      actions: ["优先处理 superday、technical mock 和 follow-up，不要再把精力平均分给所有公司。", "把每轮 technical / behavioral 问题整理成错题库。"]
    };
    if (month <= 6) return {
      phase: "prep",
      label: "Summer 金融提前准备期",
      targetApps: 0,
      targetNetworking: 4,
      actions: ["现在重点是 CV、deal awareness、technical 基础和 alumni networking，而不是盲目海投。", "本周建立目标银行清单，并给每家公司标注 team、开放时间和联系人。"]
    };
    if (month <= 8) return {
      phase: "warmup",
      label: "Summer 金融申请预热期",
      targetApps: 3,
      targetNetworking: 4,
      actions: ["很多金融 Summer 会在夏末开始滚动开放，现在要把 CV、tracker 和 technical 第一轮准备到可投状态。", "优先联系目标 team 的校友，拿到流程信息和可能的 referral。"]
    };
    if (month <= 10) return {
      phase: "applications",
      label: "Summer 金融集中投递期",
      targetApps: 6,
      targetNetworking: 3,
      actions: ["现在应该按 rolling basis 快速投递，开放早的银行不要拖到 deadline 前。", "每周集中复盘 HireVue / online test / technical 错题，别只记录投递数量。"]
    };
    return {
      phase: "assessment",
      label: "Summer 金融测试 / 面试期",
      targetApps: 2,
      targetNetworking: 2,
      actions: ["重点从新增投递切到流程推进：online test、HireVue、technical mock 和 superday 准备。", "把每家公司的流程状态发到 Circle，找人针对最接近的面试做 mock。"]
    };
  }

  return {
    phase: "prep",
    label: "申请准备期",
    targetApps: 2,
    targetNetworking: 2,
    actions: ["先整理目标公司、开放时间和能力缺口，再决定本周要投递还是补材料。", "在 Circle 里同步你的方向，让同伴帮你判断最该优先补哪一块。"]
  };
}

function suggestedActions(currentProfile = profile, checkin = null, submissions = []) {
  const progress = profileValue(currentProfile, "application_progress", "材料准备中");
  const role = profileValue(currentProfile, "target_role", "Investment Banking");
  const timeline = applicationTimeline(currentProfile);
  const apps = Number(checkin?.apps || 0);
  const networking = Number(checkin?.networking || 0);
  const actions = [];
  const add = text => {
    if (text && !actions.includes(text)) actions.push(text);
  };

  if (!checkin) add(`先做本周同步：当前是「${timeline.label}」，让小队知道你的申请数、networking 数和卡点。`);
  timeline.actions.forEach(add);

  if (timeline.targetApps > 0 && apps < timeline.targetApps) {
    add(`本周申请数还偏低，建议至少推进到 ${timeline.targetApps} 个高匹配机会。`);
  }
  if (networking < timeline.targetNetworking) {
    add(`本周 networking 还可以加速，建议至少触达 ${timeline.targetNetworking} 个人，并记录反馈。`);
  }

  if (/刚开始|材料/.test(progress)) add("今天先把 CV / tracker / 目标公司清单推进到可被别人 review 的状态。");
  if (/投递|HireVue|Online/.test(progress)) add("今天至少复盘 1 个 HireVue / online test 题，发到 Circle 里让别人追问。");
  if (/面试/.test(progress)) add(role.includes("Consulting") ? "安排 1 次 case partner 训练，并把复盘沉淀成 Challenge 作品。" : "安排 1 次 technical mock，并整理错题。");
  if (!submissions.length) add("本周完成 1 个和目标方向相关的 Challenge 作品，让主页开始沉淀可展示信号。");
  add("找 1 个成员互看材料，或者给别人一条具体反馈。");
  return actions.slice(0, 4);
}

function renderProfileChips(currentProfile = profile) {
  return matchTags(currentProfile).map(tag => `<span>${h(tag)}</span>`).join("");
}

function circleTypeName(type) {
  return type === "task" ? "Challenge Circle" : "聊天 Circle";
}

function circleLevelLabel(group) {
  return group?.circle_type === "task" ? challengeDifficulty(group.level) : level(group?.level);
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

function canOperateAdmin() {
  return Boolean(profile?.is_admin);
}

async function myAdminFlag() {
  const { data, error } = await db.rpc("my_is_admin");
  if (!error) return Boolean(data);
  const fallback = await db.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  return Boolean(fallback.data?.is_admin);
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
            ${logged ? nav("/tasks", "挑战") : ""}
            ${logged ? nav("/showcase", "成果") : ""}
            ${logged ? nav("/profile", "主页") : ""}
            ${logged && canOperateAdmin() ? nav("/admin", "后台") : ""}
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
  try {
    db = supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    session = data.session;
    user = session?.user || null;
    if (user) {
      await ensureProfile();
      await syncActiveChatCircle();
    }
    db.auth.onAuthStateChange((_event, nextSession) => {
      const nextUser = nextSession?.user || null;
      if (user?.id === nextUser?.id) {
        session = nextSession;
        user = nextUser;
        return;
      }
      const version = ++authStateVersion;
      setTimeout(async () => {
        try {
          if (version !== authStateVersion) return;
          session = nextSession;
          user = nextUser;
          profile = null;
          activeChatCircle = null;
          if (user) {
            await ensureProfile();
            if (version !== authStateVersion) return;
            await syncActiveChatCircle();
          }
          if (version !== authStateVersion) return;
          await renderRoute();
        } catch (error) {
          console.error(error);
          layout(`<section class="panel">${notice(error.message || "登录状态加载失败，请刷新页面。", "error")}</section>`);
        }
      }, 0);
    });
    await renderRoute();
  } catch (error) {
    console.error(error);
    layout(`<section class="panel">${notice(error.message || "Circle 加载失败，请检查网络后刷新。", "error")}</section>`);
  }
}

async function ensureProfile() {
  const { data, error } = await db.from("profiles").select(profileFields).eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (data) {
    const resetResult = await db.from("profiles").select("level_reset_at").eq("id", user.id).maybeSingle();
    profile = { ...data, level_reset_at: resetResult.error ? null : resetResult.data?.level_reset_at, is_admin: await myAdminFlag() };
    return profile;
  }
  const payload = {
    id: user.id,
    email: user.email,
    display_name: (user.email?.split("@")[0] || "新用户").slice(0, 40),
    stage: "Freshman",
    direction: "未设置方向",
    bio: ""
  };
  const inserted = await db.from("profiles").insert(payload).select(profileFields).single();
  if (inserted.error) throw inserted.error;
  profile = { ...inserted.data, level_reset_at: null, is_admin: await myAdminFlag() };
  return profile;
}

async function requireUser() {
  if (!user) {
    go("/login");
    return false;
  }
  if (!profile) await ensureProfile();
  if (routePath() !== "/onboarding" && profileNeedsOnboarding(profile)) {
    go("/onboarding");
    return false;
  }
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
  return (data || []).filter(row => ["forming", "active", "full"].includes(row.groups?.status));
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
  return profileSubmissions(user.id, limit);
}

async function profileSubmissionCount(profileId) {
  const contributionResult = await db
    .from("task_submission_contributors")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profileId);
  if (!contributionResult.error) return contributionResult.count || 0;

  const fallback = await db
    .from("task_submissions")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by", profileId);
  return fallback.error ? 0 : fallback.count || 0;
}

async function attachSubmissionContributors(submissions) {
  const rows = submissions || [];
  if (!rows.length) return rows;
  const { data, error } = await db
    .from("task_submission_contributors")
    .select("submission_id, user_id, profiles:user_id (id, display_name, direction, target_role, stage, level)")
    .in("submission_id", rows.map(item => item.id));
  const withContributors = error
    ? rows.map(item => ({
      ...item,
      contributors: item.profiles ? [item.profiles] : []
    }))
    : rows.map(item => ({
      ...item,
      contributors: (data || [])
        .filter(contributor => contributor.submission_id === item.id)
        .map(contributor => contributor.profiles)
        .filter(Boolean)
    }));
  await Promise.all(withContributors.map(async item => {
    if (!item.submission_file_path) return;
    const { data: signed } = await db.storage.from("submission-files").createSignedUrl(item.submission_file_path, 60 * 60);
    if (signed?.signedUrl) item.submission_file_url = signed.signedUrl;
  }));
  return withContributors;
}

async function profileSubmissions(profileId, limit = 20) {
  const contributionResult = await db
    .from("task_submission_contributors")
    .select("submission_id")
    .eq("user_id", profileId);
  const ids = (contributionResult.data || []).map(item => item.submission_id);
  const runQuery = includeFile => {
    let query = db
      .from("task_submissions")
      .select(`id, title, submission_url, content, award_rank, created_at, ${includeFile ? "submission_file_path, submission_file_name, submission_file_mime, submission_file_size," : ""} tasks:task_id (title, category, level), groups:group_id (id, name)`)
      .order("created_at", { ascending: false })
      .limit(limit);
    return !contributionResult.error && ids.length
      ? query.in("id", ids)
      : query.eq("submitted_by", profileId);
  };
  let { data, error } = await runQuery(true);
  if (error && /submission_file_/i.test(error.message || "")) {
    const fallback = await runQuery(false);
    data = fallback.data;
    error = fallback.error;
  }
  if (error) return [];
  return attachSubmissionContributors((data || []).filter(sub => !isDemoSubmission(sub)));
}

async function taskSubmissions(taskId) {
  let { data, error } = await db
    .from("task_submissions")
    .select("id, title, content, submission_url, submission_file_path, submission_file_name, submission_file_mime, submission_file_size, score, award_rank, award_title, created_at, groups:group_id (id, name, level), profiles:submitted_by (id, display_name, direction, target_role, stage, level)")
    .eq("task_id", taskId)
    .order("award_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error && /award_rank|award_title|submission_file_|column/i.test(error.message || "")) {
    const fallback = await db
      .from("task_submissions")
      .select("id, title, content, submission_url, score, created_at, groups:group_id (id, name, level), profiles:submitted_by (display_name)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }
  if (error) return [];
  return attachSubmissionContributors((data || []).filter(sub => !isDemoSubmission(sub)));
}

async function recentGroupMessages(groupId, limit = 250) {
  if (!groupId) return [];
  const { data, error } = await db
    .from("messages")
    .select("id, content, created_at, user_id, profiles:user_id (display_name)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []).reverse();
}

async function showcaseSubmissions() {
  let { data, error } = await db
    .from("task_submissions")
    .select(`
      id,
      title,
      content,
      submission_url,
      submission_file_path,
      submission_file_name,
      submission_file_mime,
      submission_file_size,
      score,
      award_rank,
      award_title,
      created_at,
      tasks:task_id (id, title, category, level),
      groups:group_id (id, name, level),
      profiles:submitted_by (id, display_name, direction, stage, level)
    `)
    .not("award_rank", "is", null)
    .lte("award_rank", 3)
    .order("award_rank", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(40);
  if (error && /submission_file_/i.test(error.message || "")) {
    const fallback = await db
      .from("task_submissions")
      .select("id, title, content, submission_url, score, award_rank, award_title, created_at, tasks:task_id (id, title, category, level), groups:group_id (id, name, level), profiles:submitted_by (id, display_name, direction, stage, level)")
      .not("award_rank", "is", null)
      .lte("award_rank", 3)
      .order("award_rank", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(40);
    data = fallback.data;
    error = fallback.error;
  }
  if (error) return [];
  return attachSubmissionContributors((data || []).filter(sub => !isDemoSubmission(sub)));
}

async function adminChallenges() {
  const { data, error } = await db
    .from("tasks")
    .select("id, title, category, level, group_size, starts_at, ends_at, status, is_featured, created_at")
    .in("status", ["open", "closed"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return data || [];
}

async function adminSubmissions() {
  let { data, error } = await db
    .from("task_submissions")
    .select("id, title, content, submission_url, submission_file_path, submission_file_name, submission_file_mime, submission_file_size, award_rank, created_at, tasks:task_id (id, title, category, level, status, ends_at), groups:group_id (id, name), profiles:submitted_by (id, display_name, direction, target_role, stage, level)")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error && /submission_file_/i.test(error.message || "")) {
    const fallback = await db
      .from("task_submissions")
      .select("id, title, content, submission_url, award_rank, created_at, tasks:task_id (id, title, category, level, status, ends_at), groups:group_id (id, name), profiles:submitted_by (id, display_name, direction, target_role, stage, level)")
      .order("created_at", { ascending: false })
      .limit(80);
    data = fallback.data;
    error = fallback.error;
  }
  if (error) return [];
  return attachSubmissionContributors((data || []).filter(sub => !isDemoSubmission(sub)));
}

function groupSubmissionsByTask(submissions) {
  const grouped = new Map();
  submissions.forEach(sub => {
    const key = sub.tasks?.id || sub.tasks?.title || "unknown";
    const prev = grouped.get(key) || {
      id: key,
      title: sub.tasks?.title || "Challenge",
      category: sub.tasks?.category || "Challenge",
      level: sub.tasks?.level || sub.groups?.level || 1,
      status: sub.tasks?.status || "open",
      ends_at: sub.tasks?.ends_at || null,
      submissions: []
    };
    prev.submissions.push(sub);
    grouped.set(key, prev);
  });
  return [...grouped.values()].map(item => ({
    ...item,
    submissions: item.submissions.sort((a, b) => Number(a.award_rank || 99) - Number(b.award_rank || 99))
  }));
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
    if (group.id === activeChatCircle?.id) continue;
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
  const token = ++routeRenderToken;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (cleanupCurrentPage) {
    cleanupCurrentPage();
    cleanupCurrentPage = null;
  }
  try {
    const path = routePath();
    if (path === "/" || path === "/home") return await pageHome(token);
    if (path === "/login") return await pageLogin(token);
    if (path === "/chat") return await pageChatLobby(token);
    if (path === "/observe") return await pageJuniorObserve(token);
    if (path === "/tasks") return await pageTasks(token);
    if (path === "/showcase") return await pageShowcase(token);
    if (path === "/admin") return await pageAdmin(token);
    if (path === "/mine") return go("/home");
    if (path === "/profile") return await pageProfile(user?.id, token);
    if (path.startsWith("/profile/")) return await pageProfile(path.split("/")[2], token);
    if (path === "/onboarding") return await pageOnboarding(token);
    if (path.startsWith("/group/")) return await pageGroup(path.split("/")[2], token);
    if (path.startsWith("/work/")) return await pageWorkbench(path.split("/")[2], token);
    return await pageHome(token);
  } catch (err) {
    console.error(err);
    if (token !== routeRenderToken) return;
    layout(`<section class="panel">${notice(err.message || String(err), "error")}</section>`);
  }
}

async function pageLogin(token = routeRenderToken) {
  if (user) return go("/home");
  if (token !== routeRenderToken) return;
  layout(`
    <section class="login-grid">
      <div class="login-copy">
        <p class="eyebrow">spring week & summer squads</p>
        <h1>Spring Week 和 Summer 申请者的目标小队。</h1>
        <p>circle 先专注海外中国留学生的 Spring Week 和 Summer 申请，用 6 人小圈、周进度、Challenge 作品和高层级观察，把散乱求职焦虑变成持续行动。</p>
        <div class="rule-strip">
          <span>6 人小圈</span>
          <span>阶段接近</span>
          <span>组队挑战</span>
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
    else msg.innerHTML = notice("登录成功，正在加载你的 Circle。", "success");
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
  const { error } = await db.auth.signOut();
  if (error) {
    alert(error.message);
    return;
  }
  authStateVersion += 1;
  session = null;
  user = null;
  profile = null;
  activeChatCircle = null;
  go("/login");
}

async function pageHome(token = routeRenderToken) {
  if (!(await requireUser())) return;
  await db.rpc("refresh_challenge_lifecycle");
  const [mine, invites, subs, juniorCircles, submissionCount] = await Promise.all([
    memberships(),
    pendingInvites(),
    mySubmissions(5),
    juniorChatCircles(),
    profileSubmissionCount(user.id)
  ]);
  const chat = mine.find(m => m.groups?.circle_type === "exploration")?.groups;
  const taskCircles = mine.filter(m => m.groups?.circle_type === "task");
  const chatMessages = chat ? await recentGroupMessages(chat.id) : [];
  const storedUserCheckins = chat ? await weeklyCheckinsForUser(user.id) : null;
  const checkins = chat
    ? (await weeklyCheckinsForGroup(chat.id) || weeklyCheckins(chatMessages))
    : [];
  const myCheckin = latestCheckinForUser(checkins);
  const timeline = applicationTimeline(profile);
  const chatForming = chat?.status === "forming";
  let nextActions = suggestedActions(profile, myCheckin, subs);
  if (!chat) {
    nextActions = [
      "先加入一个目标相近的聊天 Circle，凑齐 3 人后再开始周同步。",
      ...nextActions.filter(item => !item.startsWith("先做本周同步"))
    ];
  } else if (chatForming) {
    nextActions = [
      "聊天小队还在匹配成员。凑齐 3 人后会自动开放聊天和周同步。",
      ...nextActions.filter(item => !item.startsWith("先做本周同步"))
    ];
  }
  const readyUnlock = readyEligibility(profile, chatMessages, chat, storedUserCheckins);
  const currentChatLevel = Number(chat?.level || 0);
  const availableChatLevel = chatCircleLevel(profile);
  const higherCircleAvailable = Boolean(chat && currentChatLevel < availableChatLevel);
  if (token !== routeRenderToken) return;

  layout(`
    <section class="hero-panel">
      <div>
        <p class="eyebrow">你的申请阶段</p>
        <h1>${level(profile.level)} · ${h(profileValue(profile, "target_role", profile.direction || "未设置方向"))}</h1>
        <p>${h(profile.bio || stageDetail(profile.level))}</p>
      </div>
      <div class="hero-actions">
        <a class="primary-btn" href="#${chatHomePath()}">${chat ? "进入聊天 Circle" : "选择聊天 Circle"}</a>
        ${chat && Number(profile.level || 1) > 1 ? `<a class="secondary-btn" href="#/observe">观察 ${level(juniorLevel())}</a>` : ""}
        ${chat ? `<a class="secondary-btn" href="#/tasks">看挑战赛</a>` : ""}
      </div>
    </section>

    ${higherCircleAvailable ? `
      <section class="notice rematch-notice">
        <div>
          <strong>${level(availableChatLevel)} Circle 已开放</strong>
          <p>升级只改变了你的个人标签，原来的 ${level(currentChatLevel)} Circle 会继续保留。你可以留下维持现有关系，也可以主动选择进入新的 ${level(availableChatLevel)} Circle。</p>
        </div>
        <a class="secondary-btn" href="#/chat">查看新层级 Circle</a>
      </section>
    ` : ""}

    ${chat ? "" : `
      <section class="panel action-hub">
        <div class="section-head">
          <div>
            <p class="eyebrow">first step</p>
            <h2>先加入一个长期聊天 Circle</h2>
          </div>
          <a class="primary-btn" href="#/chat">选择聊天 Circle</a>
        </div>
        <p class="muted">circle 的核心不是刷很多群，而是先进入一个目标接近的 6 人小队。加入后，你会在这里同步每周进展、进入同类榜单，再参加 Challenge 沉淀成果。</p>
      </section>
    `}

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
          <p>${!chat ? "先加入聊天 Circle，凑齐成员后这里会开放周同步。" : chatForming ? "正在等待组队，凑齐 3 人后开始每周同步。" : myCheckin ? `已同步：${time(myCheckin.createdAt)}` : "这周还没有同步进展，先让小队知道你在哪里。"}</p>
          <a class="secondary-btn" href="#${chatHomePath()}">${!chat ? "选择聊天 Circle" : chatForming ? "查看组队进度" : myCheckin ? "更新周同步" : "去同步"}</a>
        </article>
        <article class="hub-card">
          <strong>申请时间线建议</strong>
          <p class="muted">根据申请路径、岗位和当前月份生成。</p>
          <p class="muted">${h(timeline.label)} · 本周目标 ${timeline.targetApps} 申请 / ${timeline.targetNetworking} networking</p>
          <ul class="todo-stack">
            ${nextActions.map(item => `<li>${h(item)}</li>`).join("")}
          </ul>
        </article>
      </div>
    </section>

    ${renderReadyUnlockCard(readyUnlock)}

    <section class="metrics">
      <div><strong>${chat ? "1" : "0"}</strong><span>长期聊天 Circle</span></div>
      <div><strong>${taskCircles.length}</strong><span>进行中 Challenge</span></div>
      <div><strong>${submissionCount}</strong><span>主页成果</span></div>
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
            <p class="eyebrow">challenge circles</p>
            <h2>挑战赛</h2>
          </div>
          <a class="text-btn" href="#/tasks">进入</a>
        </div>
        ${taskCircles.slice(0, 3).map(m => circleCard(m.groups, m.groups.task?.title || "")).join("") || `<p class="muted">当前没有进行中的 Challenge Circle。</p>`}
      </div>
    </section>

    ${Number(profile.level || 1) > 1 ? `
      <section class="panel" style="margin-top:16px">
        <div class="section-head">
          <div>
            <p class="eyebrow">observer view</p>
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
              <h3>${h(invite.inviter?.display_name || "高一层成员")} 邀请你进入下一阶段</h3>
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
  bindReadyUnlockButton();
  bindInviteButtons();
}

function circleCard(group, detail = "") {
  return `
    <article class="mini-card">
      <div class="pill-row">
        <span class="pill ${group.circle_type === "task" ? "dark" : "warm"}">${circleTypeName(group.circle_type)}</span>
        <span class="pill good">${circleLevelLabel(group)}</span>
        <span class="pill">${h(group.status)}</span>
      </div>
      <h3>${h(circleDisplayName(group))}</h3>
      <p>${h(detail || group.topic || "")}</p>
      <div class="button-row">
        <a class="secondary-btn" href="#/group/${group.id}">${group.circle_type === "exploration" && group.status === "forming" ? "查看组队进度" : "进入讨论"}</a>
        ${group.circle_type === "task" ? `<a class="primary-btn" href="#/work/${group.id}">打开工作台 / 提交作品</a>` : ""}
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
      <h3>${h(circleDisplayName(group))}</h3>
      <p>${h(normalizedChatTopic(group.topic) || "上一阶段聊天 Circle")}</p>
      <div class="button-row">
        <a class="secondary-btn" href="#/group/${group.id}">只读观察</a>
      </div>
    </article>
  `;
}

function renderChatMessages(messages) {
  if (!messages.length) return `
    <div class="chat-empty">
      <div class="chat-empty-mark">C</div>
      <strong>还没有消息</strong>
      <span>说点什么，开始今天的讨论。</span>
    </div>
  `;
  let lastDay = "";
  return messages.map(msg => {
    const day = messageDay(msg.created_at);
    const divider = day !== lastDay ? `<div class="day-divider"><span>${h(day)}</span></div>` : "";
    lastDay = day;
    return `${divider}${renderChatBubble(msg)}`;
  }).join("");
}

function renderChatBubble(msg) {
  const isImage = msg.message_type === "image";
  const isFile = msg.message_type === "file";
  const isText = !isImage && !isFile;
  return `
    <div class="bubble-line ${msg.user_id === user.id ? "mine" : ""}" data-message-id="${h(msg.id || "")}">
      <div class="chat-avatar">${h((msg.profiles?.display_name || "C").slice(0, 1))}</div>
      <div class="bubble-wrap">
        <div class="bubble-meta">
          <span>${h(msg.profiles?.display_name || "用户")}</span>
          <span>${messageClock(msg.created_at)}</span>
        </div>
        <div class="bubble ${isImage ? "media-bubble" : ""} ${isText ? "text-bubble" : ""}">
          ${isImage && msg.media_url ? `
            <a href="${h(msg.media_url)}" target="_blank" rel="noreferrer">
              <img class="chat-image" src="${h(msg.media_url)}" alt="${h(msg.media_name || "聊天图片")}">
            </a>
            ${msg.content && msg.content !== msg.media_name ? `<p>${h(msg.content)}</p>` : ""}
          ` : isFile && msg.media_url ? `
            <a class="file-card" href="${h(msg.media_url)}" target="_blank" rel="noreferrer">
              <span class="file-icon">FILE</span>
              <span>
                <strong>${h(msg.media_name || msg.content || "文件")}</strong>
                <em>${formatFileSize(msg.media_size)} · ${h(msg.media_mime || "文件")}</em>
              </span>
            </a>
            ${msg.content && msg.content !== msg.media_name ? `<p>${h(msg.content)}</p>` : ""}
          ` : `<span class="bubble-text">${h(msg.content)}</span>`}
        </div>
      </div>
    </div>
  `;
}

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (!bytes) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

function isSameLocalDay(value, date = new Date()) {
  const item = new Date(value);
  return item.getFullYear() === date.getFullYear() &&
    item.getMonth() === date.getMonth() &&
    item.getDate() === date.getDate();
}

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getUTCDay() || 7;
  copy.setUTCHours(0, 0, 0, 0);
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy;
}

function weeklyCheckins(messages) {
  const weekStart = startOfWeek();
  return parsedCheckins(messages, weekStart);
}

function checkinWeekKey(value) {
  return utcDateKey(startOfWeek(new Date(value)));
}

function utcDateKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsedCheckins(messages, fromDate = null) {
  return messages
    .filter(msg => msg.content?.includes("【周同步】") && (!fromDate || new Date(msg.created_at) >= fromDate))
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
        createdAt: msg.created_at,
        weekKey: checkinWeekKey(msg.created_at)
      };
    })
    .sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt));
}

function readyEligibility(currentProfile, messages, chat, storedCheckins = null) {
  const show = ["Spring Week", "Summer Internship"].includes(profileValue(currentProfile, "application_track", "Spring Week")) &&
    Number(currentProfile?.level || 1) === 1;
  if (!show) return { show: false, eligible: false, checks: [] };

  const profileComplete = [
    "application_track",
    "target_role",
    "application_progress",
    "intensity"
  ].every(key => String(currentProfile?.[key] || "").trim());
  const expectedTopic = chatTopicsForProfile(currentProfile).find(item => item.recommended)?.topic || "";
  const resetAt = currentProfile?.level_reset_at ? new Date(currentProfile.level_reset_at).getTime() : 0;
  const sinceReset = item => new Date(item.createdAt).getTime() > resetAt;
  const fallbackCheckins = parsedCheckins(messages).filter(item => item.userId === user?.id && sinceReset(item));
  const myCheckins = storedCheckins
    ? storedCheckins.filter(item =>
        normalizedChatTopic(item.groupTopic) === expectedTopic && Number(item.groupLevel || 1) === 1 && sinceReset(item))
    : fallbackCheckins;
  const currentWeek = checkinWeekKey(new Date());
  const previousWeek = utcDateKey(new Date(startOfWeek(new Date()).getTime() - 7 * 24 * 60 * 60 * 1000));
  const currentWeekCheckins = myCheckins.filter(item => item.weekKey === currentWeek);
  const currentCheckin = currentWeekCheckins[0] || null;
  const completedWeeks = new Set(myCheckins.map(item => item.weekKey));
  const steadySync = completedWeeks.has(currentWeek) && completedWeeks.has(previousWeek);
  const hasChat = Boolean(
    chat
    && Number(chat.level || 1) === 1
    && normalizedChatTopic(chat.topic) === expectedTopic
  );

  const checks = [
    { ok: hasChat, text: "已经加入一个长期聊天 Circle" },
    { ok: profileComplete, text: "申请画像完整：岗位、进度和强度清楚" },
    { ok: Boolean(currentCheckin), text: "本周完成一次周同步" },
    { ok: steadySync, text: "至少连续两周同步，证明行动节奏稳定" }
  ];

  return {
    show,
    eligible: checks.every(item => item.ok),
    checks,
    currentCheckin,
    distinctWeeks: completedWeeks.size
  };
}

function renderReadyUnlockCard(eligibility) {
  if (!eligibility?.show) return "";
  return `
    <section class="panel unlock-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">application stage</p>
          <h2>Ready 解锁</h2>
        </div>
        <span class="pill good">Starter → Ready</span>
      </div>
      <p class="muted">Starter 连续两周同步后可以解锁 Ready。升级只改变个人标签，不会退出当前 Circle；新的 Ready Circle 会同时开放，由你决定是否切换。</p>
      <div class="unlock-checks">
        ${eligibility.checks.map(item => `
          <div class="${item.ok ? "done" : ""}">
            <b>${item.ok ? "✓" : "·"}</b>
            <span>${h(item.text)}</span>
          </div>
        `).join("")}
      </div>
      <div class="button-row">
        ${eligibility.eligible
          ? `<button class="primary-btn" id="unlockReadyBtn" type="button">解锁 Ready</button>`
          : `<a class="secondary-btn" href="#${activeChatCircle?.id ? chatHomePath() : "/chat"}">继续完成条件</a>`}
        <span class="muted">Ready → Competitive 仍由更高层级成员邀请确认，接受邀请也不会自动换群。</span>
      </div>
    </section>
  `;
}

function latestCheckinsByUser(checkins) {
  const latestByUser = new Map();
  checkins.forEach(item => {
    if (!latestByUser.has(item.userId)) latestByUser.set(item.userId, item);
  });
  return [...latestByUser.values()];
}

function renderWeeklyRank(checkins) {
  const rows = latestCheckinsByUser(checkins);
  if (!rows.length) return `<p class="muted compact-muted">这周还没有人同步进度。第一个同步的人会出现在这里。</p>`;
  return `
    <div class="rank-tabs">
      <section><h3>申请最多</h3>${renderMetricRank(rows, "apps")}</section>
      <section><h3>Networking 最多</h3>${renderMetricRank(rows, "networking")}</section>
    </div>
  `;
}

function renderMetricRank(rows, metric) {
  const sorted = [...rows].sort((a, b) => Number(b[metric] || 0) - Number(a[metric] || 0) || new Date(b.createdAt) - new Date(a.createdAt));
  if (!sorted.length) return `<p class="muted compact-muted">还没有周同步。</p>`;
  return sorted.slice(0, 5).map((item, index) => `
    <div class="rank-row">
      <b>#${index + 1}</b>
      <span>${h(item.name)}</span>
      <em>${Number(item[metric] || 0)} ${metric === "apps" ? "申请" : "networking"}</em>
    </div>
  `).join("");
}

function latestCheckinForUser(checkins, userId = user?.id) {
  return checkins.find(item => item.userId === userId) || null;
}

function normalizeCheckin(row) {
  const apps = Number(row.apps || 0);
  const networking = Number(row.networking || 0);
  return {
    id: row.id,
    groupId: row.group_id,
    groupTopic: row.groups?.topic || "",
    groupLevel: Number(row.groups?.level || 0),
    userId: row.user_id,
    name: row.profiles?.display_name || "用户",
    apps,
    networking,
    learning: row.learning || "",
    blocker: row.blocker || "",
    score: apps * 2 + networking,
    weekKey: row.week_start,
    createdAt: row.updated_at || row.created_at
  };
}

async function weeklyCheckinsForGroup(groupId, weekStart = checkinWeekKey(new Date())) {
  const { data, error } = await db
    .from("weekly_checkins")
    .select("id, group_id, user_id, week_start, apps, networking, learning, blocker, created_at, updated_at, profiles:user_id (display_name)")
    .eq("group_id", groupId)
    .eq("week_start", weekStart)
    .order("updated_at", { ascending: false });
  if (error) return null;
  return (data || []).map(normalizeCheckin);
}

async function weeklyCheckinsForUser(userId = user?.id) {
  if (!userId) return null;
  const minWeek = utcDateKey(new Date(startOfWeek(new Date()).getTime() - 28 * 24 * 60 * 60 * 1000));
  const { data, error } = await db
    .from("weekly_checkins")
    .select("id, group_id, user_id, week_start, apps, networking, learning, blocker, created_at, updated_at, profiles:user_id (display_name), groups:group_id (topic, level, circle_type)")
    .eq("user_id", userId)
    .gte("week_start", minWeek)
    .order("week_start", { ascending: false });
  if (error) return null;
  return (data || []).map(normalizeCheckin);
}

async function peerCircleLeague(group) {
  if (!group || group.circle_type !== "exploration") return { checkins: [], groups: [], memberTotal: 0 };
  const { data: rankedRows, error: rankedError } = await db.rpc("peer_circle_weekly_leaderboard", {
    p_group_id: group.id
  });
  if (!rankedError) {
    return {
      checkins: (rankedRows || []).map(row => ({
        userId: row.user_id,
        name: row.display_name || "用户",
        groupId: row.group_id,
        groupName: row.group_name,
        apps: Number(row.apps || 0),
        networking: Number(row.networking || 0),
        createdAt: row.updated_at
      })),
      groups: [],
      memberTotal: 0
    };
  }
  const { data: groups, error } = await db
    .from("groups")
    .select("id, name, topic, level, max_members")
    .eq("circle_type", "exploration")
    .eq("topic", group.topic)
    .eq("level", group.level)
    .in("status", ["forming", "active", "full"])
    .limit(20);
  if (error) return { checkins: [], groups: [], memberTotal: 0 };
  const peerGroups = groups || [];
  const groupIds = peerGroups.map(item => item.id);
  let allCheckins = [];
  if (groupIds.length) {
    const { data: checkinRows, error: checkinError } = await db
      .from("weekly_checkins")
      .select("id, group_id, user_id, week_start, apps, networking, learning, blocker, created_at, updated_at, profiles:user_id (display_name)")
      .in("group_id", groupIds)
      .eq("week_start", checkinWeekKey(new Date()))
      .order("updated_at", { ascending: false });
    if (!checkinError) {
      allCheckins = (checkinRows || []).map(row => ({
        ...normalizeCheckin(row),
        groupName: peerGroups.find(item => item.id === row.group_id)?.name
      }));
    } else {
      const messageSets = await Promise.all(peerGroups.map(item => recentGroupMessages(item.id, 250)));
      allCheckins = messageSets.flatMap((messages, index) =>
        weeklyCheckins(messages).map(checkin => ({
          ...checkin,
          groupId: peerGroups[index]?.id,
          groupName: peerGroups[index]?.name
        }))
      );
    }
  }
  return {
    checkins: latestCheckinsByUser(allCheckins),
    groups: peerGroups,
    memberTotal: peerGroups.reduce((sum, item) => sum + Number(item.max_members || 0), 0)
  };
}

function renderPeerLeague(league, currentGroup) {
  const checkins = league?.checkins || [];
  return `
    <div class="rank-tabs">
      <section>
        <h3>申请最多</h3>
        ${renderMetricRank(checkins, "apps")}
      </section>
      <section>
        <h3>Networking 最多</h3>
        ${renderMetricRank(checkins, "networking")}
      </section>
    </div>
  `;
}

async function pageChatLobby(token = routeRenderToken) {
  if (!(await requireUser())) return;
  const currentProfile = profile;
  const mine = await memberships();
  const juniorCircles = await juniorChatCircles();
  const chat = mine.find(m => m.groups?.circle_type === "exploration")?.groups;
  const topics = chatTopicsForProfile(currentProfile);
  const chatLevel = chatCircleLevel(currentProfile);
  const recommendedTopic = topics.find(item => item.recommended)?.topic || topics[0]?.topic;
  const needsRematch = Boolean(chat && recommendedTopic && normalizedChatTopic(chat.topic) !== recommendedTopic);
  const higherCircleAvailable = Boolean(chat && Number(chat.level || 1) < chatLevel);
  const rematchLabel = higherCircleAvailable ? `选择进入 ${level(chatLevel)} Circle` : "按当前画像重新匹配";
  if (token !== routeRenderToken) return;

  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">one active application squad</p>
        <h1>聊天 Circle 广场</h1>
        <p>这里根据申请路径、聊天层级和 Finance / Consulting 两个方向匹配长期小队。你现在匹配 ${level(chatLevel)}，每个人同时只能加入 1 个聊天 Circle。</p>
      </div>
    </section>

    <section class="panel match-panel">
      <div>
        <p class="eyebrow">smart match basis</p>
        <h2>${h(applicationSummary(currentProfile))}</h2>
        <p class="muted">${h(progressSummary(currentProfile))}。你的具体目标仍保留在个人画像中，但聊天匹配只分 Finance 和 Consulting；Investment Banking、Asset Management、Sales & Trading、Equity Research 等金融方向统一进入 Finance Circle。</p>
      </div>
      <div class="profile-chip-grid">${renderProfileChips(currentProfile)}</div>
    </section>

    ${chat ? notice(`你已经有自己的长期目标小队：「${circleDisplayName(chat)}」。入口放在「今日」页，这里继续作为广场展示。`) : ""}
    ${needsRematch ? `
      <section class="notice rematch-notice">
        <div>
          <strong>${higherCircleAvailable ? `${level(chatLevel)} Circle 已向你开放` : "当前小队和最新申请画像不一致"}</strong>
          <p>${higherCircleAvailable
            ? `你已经升级，但仍保留在原来的 ${level(chat.level)} Circle。你可以继续留下，也可以主动进入「${h(recommendedTopic)}」。`
            : `你现在更适合「${h(recommendedTopic)}」。重新匹配会退出当前长期小队，请只在目标确实改变时使用。`}</p>
        </div>
        <button class="secondary-btn" id="rematchChat" type="button">${h(rematchLabel)}</button>
      </section>
    ` : ""}

    ${Number(currentProfile?.level || 1) > 1 ? `
      <section class="panel" style="margin-top:16px">
        <div class="section-head">
          <div>
            <p class="eyebrow">observer view</p>
            <h2>观察 ${level(juniorLevel())} 小队</h2>
          </div>
          <a class="text-btn" href="#/observe">查看全部</a>
        </div>
        <p class="muted">这里不是让不同阶段混聊，而是让高一层成员观察真实讨论、周进展和 Challenge 作品，再邀请高质量成员升级。</p>
        <div class="card-grid compact-grid">
          ${juniorCircles.slice(0, 2).map(group => observeCircleCard(group)).join("") || `<p class="muted">上一阶段还没有活跃聊天 Circle。</p>`}
        </div>
      </section>
    ` : ""}

    <section class="card-grid">
      ${topics.map(item => `
        <article class="panel topic-card">
          <div class="pill-row">
            <span class="pill warm">聊天 Circle</span>
            <span class="pill good">${level(item.level || chatLevel)}</span>
            <span class="pill">${h(item.role)}</span>
            ${item.recommended ? `<span class="pill dark">推荐</span>` : ""}
            <span class="pill">最多 6 人</span>
          </div>
          <h2>${h(item.topic)}</h2>
          <p>${h(item.desc)}</p>
          <div class="match-note">组队依据：${h(profileValue(currentProfile, "application_track", "Spring Week"))} · ${level(item.level || chatLevel)} · ${h(item.role)}</div>
          ${item.recommended
            ? `<button class="primary-btn joinChat" data-topic="${h(item.topic)}" data-level="${Number(item.level || chatLevel)}" ${chat ? "disabled" : ""}>${chat ? "已有目标小队" : "加入这个 Circle"}</button>`
            : `<a class="secondary-btn" href="#/onboarding">修改目标岗位后加入</a>`}
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
        p_level: Number(button.dataset.level || chatLevel)
      });
      if (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = "加入";
      } else {
        await syncActiveChatCircle();
        go(`/group/${data}`);
      }
    });
  });

  const rematchButton = document.getElementById("rematchChat");
  if (rematchButton) {
    rematchButton.addEventListener("click", async () => {
      const confirmation = higherCircleAvailable
        ? `进入 ${level(chatLevel)} Circle 后会离开当前 ${level(chat.level)} Circle。确定切换吗？`
        : "重新匹配会退出当前长期聊天 Circle，并进入与最新画像一致的小队。确定继续吗？";
      if (!confirm(confirmation)) return;
      rematchButton.disabled = true;
      rematchButton.textContent = "切换中...";
      const { data, error } = await db.rpc("rematch_exploration_circle", {
        p_topic: recommendedTopic,
        p_level: chatLevel
      });
      if (error) {
        alert(error.message);
        rematchButton.disabled = false;
        rematchButton.textContent = rematchLabel;
        return;
      }
      await syncActiveChatCircle();
      go(`/group/${data}`);
    });
  }

}

async function pageJuniorObserve(token = routeRenderToken) {
  if (!(await requireUser())) return;
  if (Number(profile.level || 1) <= 1) {
    if (token !== routeRenderToken) return;
    layout(`
      <section class="hero-panel compact-hero">
        <div>
          <p class="eyebrow">observer view</p>
          <h1>Starter 暂时没有上一阶段可观察</h1>
          <p>先加入自己的 Spring / Summer 小队，持续同步进展、完成 Challenge 作品，等待高一层成员邀请你升级。</p>
        </div>
        <a class="primary-btn" href="#${chatHomePath()}">回到聊天 Circle</a>
      </section>
    `);
    return;
  }

  const groups = await juniorChatCircles();
  if (token !== routeRenderToken) return;
  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">observer view</p>
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

async function pageTasks(token = routeRenderToken) {
  if (!(await requireUser())) return;
  await db.rpc("refresh_challenge_lifecycle");
  const mine = await memberships();
  const joinedTaskGroups = new Map(
    mine
      .filter(m => m.groups?.circle_type === "task" && m.groups?.task?.id)
      .map(m => [m.groups.task.id, m.groups.id])
  );
  const { data: tasks, error } = await db
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const visibleTasks = weeklyMainChallenges(tasks)
    .sort((a, b) =>
      taskRelevanceScore(b, profile) - taskRelevanceScore(a, profile) ||
      Number(a.level || 1) - Number(b.level || 1)
    );
  if (token !== routeRenderToken) return;
  const cards = [];
  for (const task of visibleTasks) {
    const joinedGroupId = joinedTaskGroups.get(task.id);
    const alreadyJoined = Boolean(joinedGroupId);
    const relevance = taskRelevanceScore(task, profile);
    const [submissions, groupCount] = await Promise.all([
      taskSubmissions(task.id),
      db.from("groups").select("id", { count: "exact", head: true })
        .eq("task_id", task.id)
        .in("status", ["forming", "active", "full"])
    ]);
    const rankedSubmissions = (submissions || []).filter(sub => Number(sub.award_rank || 0) > 0).slice(0, 3);
    cards.push(`
      <article class="panel task-card">
        <div class="pill-row">
          <span class="pill dark">本周主赛</span>
          <span class="pill warm">全站同题</span>
          <span class="pill good">${challengeDifficulty(task.level)}</span>
          <span class="pill">${h(task.category)}</span>
          <span class="pill">${task.group_size} 人/组</span>
          ${relevance >= 5 ? `<span class="pill warm">适合你</span>` : ""}
        </div>
        <h2>${h(task.title)}</h2>
        <p class="challenge-description">${h(task.description)}</p>
        <div class="deliverable">
          <strong>比赛交付物</strong>
          <span>${h(task.deliverable)}</span>
        </div>
        <details class="challenge-framework">
          <summary>查看完整项目框架</summary>
          <p>${h(task.format_guide || "1. 市场与用户；2. 竞争与定位；3. 可执行方案；4. 财务判断；5. 风险和下一步。")}</p>
        </details>
        <p class="muted">${h(challengeDeadline(task))}</p>
        <div class="leaderboard">
          ${rankedSubmissions.map(sub => `
            <div><b>第 ${sub.award_rank} 名</b><span>${h(sub.groups?.name || "Circle")}</span><em>${time(sub.created_at)}</em></div>
          `).join("") || `<p class="muted">还没有评选结果，先组队提交作品。</p>`}
        </div>
        <div class="button-row">
          ${alreadyJoined
            ? `<a class="primary-btn" href="#/work/${joinedGroupId}">打开工作台</a>`
            : `<button class="primary-btn joinTask" data-id="${task.id}">组队参赛</button>`}
          <span class="muted">${groupCount.count || 0} 支队伍</span>
        </div>
      </article>
    `);
  }
  if (token !== routeRenderToken) return;

  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">challenge arena</p>
        <h1>本周 Challenge 主赛</h1>
        <p>每周只开放少数几个全站主赛，所有 Spring、Summer 和纯参赛用户都做同一道题。系统会自动把报名者分成多个小组，最后统一展示前三名作品。</p>
      </div>
    </section>
    <section class="metrics">
      <div><strong>${visibleTasks.length}</strong><span>本周主赛</span></div>
      <div><strong>${visibleTasks.reduce((sum, task) => sum + Number(task.group_size || 0), 0)}</strong><span>每轮首批席位</span></div>
      <div><strong>全站</strong><span>同题参赛</span></div>
      <div><strong>前三名</strong><span>进入成果广场</span></div>
    </section>
    <section class="card-grid">
      ${cards.join("") || `<div class="panel">${notice("当前没有开放中的 Challenge。")}${canOperateAdmin() ? `<a class="primary-btn" href="#/admin">去后台发布新赛期</a>` : `<p class="muted">新赛期发布后会出现在这里。</p>`}</div>`}
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
        button.textContent = "组队参赛";
      } else {
        go(`/work/${data}`);
      }
    });
  });
}

function isDemoSubmission(sub) {
  return /^00000000-0000-4000-8000-00000000000[1-5]$/.test(sub.profiles?.id || "")
    || /\/demo-[^/]+/i.test(safeExternalUrl(sub.submission_url));
}

function submissionCard(sub, index = null) {
  const rankLabel = sub.award_rank ? `第 ${sub.award_rank} 名` : "";
  const contributorNames = (sub.contributors || []).map(item => item.display_name).filter(Boolean);
  return `
    <article class="list-item result-card">
      <div class="pill-row">
        ${rankLabel ? `<span class="pill dark">${rankLabel}</span>` : index === null ? "" : `<span class="pill dark">第 ${index + 1} 名</span>`}
        <span class="pill good">${challengeDifficulty(sub.tasks?.level || sub.groups?.level || 1)}</span>
        <span class="pill">${h(sub.tasks?.category || "Challenge 成果")}</span>
      </div>
      <h3>${h(sub.title)}</h3>
      <p>${h(sub.groups?.name || "Circle")} · ${h(sub.tasks?.title || "Challenge")} · ${time(sub.created_at)}</p>
      <p class="muted">小组成员：${h(contributorNames.join("、") || sub.profiles?.display_name || "成员")}</p>
      <p>${h(sub.content || "").slice(0, 180)}${String(sub.content || "").length > 180 ? "..." : ""}</p>
      <div class="button-row submission-actions">
        ${renderSubmissionLinks(sub, "secondary-btn")}
        ${sub.groups?.id ? `<a class="text-btn" href="#/work/${sub.groups.id}">查看成果详情</a>` : ""}
      </div>
    </article>
  `;
}

function renderSubmissionLinks(sub, className = "text-btn") {
  const links = [];
  const fileUrl = safeExternalUrl(sub.submission_file_url);
  const externalUrl = safeExternalUrl(sub.submission_url);
  if (fileUrl) {
    const fileName = sub.submission_file_name || "成果文件";
    links.push(`<a class="${className}" href="${h(fileUrl)}" target="_blank" rel="noopener noreferrer">打开文件 · ${h(fileName)}</a>`);
  }
  if (externalUrl) {
    links.push(`<a class="${className}" href="${h(externalUrl)}" target="_blank" rel="noopener noreferrer">打开外部链接</a>`);
  }
  return links.join("");
}

async function pageShowcase(token = routeRenderToken) {
  if (!(await requireUser())) return;
  const submissions = await showcaseSubmissions();
  if (token !== routeRenderToken) return;
  const challengeGroups = groupSubmissionsByTask(submissions);
  const categories = [...new Set(submissions.map(s => s.tasks?.category).filter(Boolean))];
  const levelBuckets = [1, 2, 3].map(lv => ({
    level: lv,
    count: submissions.filter(s => {
      const difficulty = Math.min(3, Math.max(1, Number(s.tasks?.level || s.groups?.level || 1)));
      return difficulty === lv;
    }).length
  }));
  const personCounts = new Map();
  submissions.forEach(sub => {
    const contributors = sub.contributors?.length ? sub.contributors : [sub.profiles].filter(Boolean);
    contributors.forEach(person => {
      const id = person?.id || person?.display_name;
      if (!id) return;
      const prev = personCounts.get(id) || {
        id: person?.id || "",
        name: person?.display_name || "匿名用户",
        level: person?.level || sub.tasks?.level || sub.groups?.level,
        direction: person?.target_role || person?.direction || sub.tasks?.category || "",
        count: 0
      };
      prev.count += 1;
      personCounts.set(id, prev);
    });
  });
  const rankedPeople = [...personCounts.values()].sort((a, b) => b.count - a.count);
  const topPeople = rankedPeople.slice(0, 6);

  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">public proof</p>
        <h1>成果广场</h1>
        <p>这里展示每期 Challenge 的前三名作品。第一名、第二名、第三名会进入成果广场，并沉淀到成员个人主页里。</p>
      </div>
      <a class="primary-btn" href="#/tasks">去参加挑战</a>
    </section>

    <section class="metrics">
      <div><strong>${submissions.length}</strong><span>前三名作品</span></div>
      <div><strong>${challengeGroups.length}</strong><span>已评选 Challenge</span></div>
      <div><strong>${rankedPeople.length}</strong><span>上榜用户</span></div>
      <div><strong>${submissions.filter(s => Number(s.award_rank || 0) === 1).length}</strong><span>第一名作品</span></div>
    </section>

    <section class="two-col wide-left">
      <div class="panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">winning work</p>
            <h2>按 Challenge 展示前三名</h2>
          </div>
        </div>
        <div class="list">
          ${challengeGroups.map(group => `
            <section class="showcase-group">
              <div class="section-head compact-head">
                <div>
                  <h3>${h(group.title)}</h3>
                  <p class="muted">${h(group.category)} · ${challengeDifficulty(group.level)}</p>
                </div>
                <span class="pill">${group.submissions.length}/3</span>
              </div>
              <div class="list">
                ${group.submissions.slice(0, 3).map((sub, index) => submissionCard(sub, index)).join("")}
              </div>
            </section>
          `).join("") || `<p class="muted">还没有前三名作品。Challenge 结束后会出现在这里。</p>`}
        </div>
      </div>

      <aside class="panel">
        <h2>前三名成员榜</h2>
        <div class="leaderboard tall">
          ${topPeople.map((person, index) => `
            <div>
              <b>#${index + 1}</b>
              ${person.id
                ? `<a class="leaderboard-profile" href="#/profile/${person.id}">${h(person.name)} · ${level(person.level)}${person.direction ? ` · ${h(person.direction)}` : ""}</a>`
                : `<span>${h(person.name)} · ${level(person.level)}${person.direction ? ` · ${h(person.direction)}` : ""}</span>`}
              <em>${person.count} 个前三名作品</em>
            </div>
          `).join("") || `<p class="muted">还没有可排名的成员。</p>`}
        </div>

        <h2 style="margin-top:22px">难度分布</h2>
        <div class="level-bars">
          ${levelBuckets.map(bucket => `
            <div>
              <span>${challengeDifficulty(bucket.level)}</span>
              <b style="width:${Math.max(8, bucket.count * 18)}px"></b>
              <em>${bucket.count}</em>
            </div>
          `).join("")}
        </div>
      </aside>
    </section>
  `);
}

async function pageAdmin(token = routeRenderToken) {
  if (!(await requireUser())) return;
  if (!canOperateAdmin()) {
    layout(`<section class="panel">${notice("只有管理员可以进入后台。", "error")}</section>`);
    return;
  }
  const [challenges, submissions] = await Promise.all([
    adminChallenges(),
    adminSubmissions()
  ]);
  const submissionGroups = groupSubmissionsByTask(submissions);
  const toLocalInput = value => {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const defaultStart = toLocalInput(Date.now() + 60 * 60 * 1000);
  const defaultEnd = toLocalInput(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (token !== routeRenderToken) return;

  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">operator console</p>
        <h1>运营后台</h1>
        <p>每次发布都会创建一个独立 Challenge 赛期。截止后关闭赛期，再从提交中选出第 1、2、3 名。</p>
      </div>
    </section>

    <section class="two-col wide-left">
      <div class="panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">challenge judging</p>
            <h2>Challenge 评选</h2>
          </div>
        </div>
        <div class="list">
          ${submissionGroups.map(group => `
            <section class="showcase-group">
              <div class="section-head compact-head">
                <div>
                  <h3>${h(group.title)}</h3>
                  <p class="muted">${h(group.category)} · ${challengeDifficulty(group.level)}</p>
                </div>
                <span class="pill">${group.submissions.length} 个提交</span>
              </div>
              <div class="leaderboard tall">
                ${group.submissions.map(sub => `
                  <article class="admin-submission">
                    <div class="admin-submission-summary">
                      <b>${sub.award_rank ? `第 ${sub.award_rank} 名` : "未评"}</b>
                      <span>${h(sub.title)} · ${h(sub.groups?.name || "Circle")}</span>
                      <em>${h((sub.contributors || []).map(item => item.display_name).filter(Boolean).join("、") || sub.profiles?.display_name || "提交者")}</em>
                    </div>
                    <div class="button-row admin-row">
                      ${group.status !== "open" || (group.ends_at && new Date(group.ends_at) <= new Date())
                        ? `${[1, 2, 3].map(rank => `<button class="secondary-btn setRank" data-id="${sub.id}" data-task="${group.id}" data-rank="${rank}" type="button">设为第 ${rank} 名</button>`).join("")}
                           <button class="secondary-btn clearRank" data-id="${sub.id}" type="button">取消名次</button>`
                        : `<span class="pill warm">截止后可排名</span>`}
                      ${renderSubmissionLinks(sub)}
                    </div>
                  </article>
                `).join("")}
              </div>
            </section>
          `).join("") || `<p class="muted">还没有 Challenge 提交。</p>`}
        </div>
      </div>

      <aside class="panel admin-challenge-panel">
        <h2>发布新赛期</h2>
        <form class="form-card flat" id="challengeForm">
          <label>标题<input name="title" required minlength="4" maxlength="160" placeholder="例如：英国零售银行增长策略 Challenge"></label>
          <div class="mini-grid">
            <label>类别<input name="category" required value="Consulting Case" maxlength="80"></label>
            <label>难度
              <select name="level"><option value="1">入门</option><option value="2">进阶</option><option value="3">高阶</option></select>
            </label>
          </div>
          <label>业务背景<textarea name="description" rows="4" required minlength="20" maxlength="2000"></textarea></label>
          <label>交付物<textarea name="deliverable" rows="3" required maxlength="1500"></textarea></label>
          <label>格式要求<textarea name="format_guide" rows="3" required maxlength="2000"></textarea></label>
          <div class="mini-grid">
            <label>每组人数<input name="group_size" type="number" min="2" max="12" value="6" required></label>
            <label>开始时间<input name="starts_at" type="datetime-local" value="${defaultStart}" required></label>
          </div>
          <label>截止时间<input name="ends_at" type="datetime-local" value="${defaultEnd}" required></label>
          <button class="primary-btn" type="submit">发布 Challenge</button>
          <div id="challengeFormMsg"></div>
        </form>

        <h2 style="margin-top:24px">最近赛期</h2>
        <div class="list">
          ${challenges.map(task => `
            <article class="mini-card">
              <div class="pill-row">
                <span class="pill ${task.status === "open" ? "good" : ""}">${h(task.status)}</span>
                <span class="pill">${challengeDifficulty(task.level)}</span>
                <span class="pill">${task.group_size} 人/组</span>
              </div>
              <h3>${h(task.title)}</h3>
              <p class="muted">${h(task.category)} · ${h(challengeDeadline(task))}</p>
              <div class="button-row">
                ${task.status === "open" ? `<button class="secondary-btn setChallengeStatus" data-id="${task.id}" data-status="closed" type="button">结束赛期</button>` : ""}
                ${task.status !== "archived" ? `<button class="secondary-btn setChallengeStatus" data-id="${task.id}" data-status="archived" type="button">归档</button>` : ""}
              </div>
            </article>
          `).join("") || `<p class="muted">还没有 Challenge。</p>`}
        </div>
      </aside>
    </section>
  `);

  document.querySelectorAll(".setRank").forEach(button => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const { error } = await db.rpc("set_submission_rank", {
        p_submission_id: button.dataset.id,
        p_rank: Number(button.dataset.rank)
      });
      if (error) {
        button.disabled = false;
        alert(error.message);
      }
      else if (routePath() === "/admin") await renderRoute();
    });
  });
  document.querySelectorAll(".clearRank").forEach(button => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const { error } = await db.rpc("set_submission_rank", {
        p_submission_id: button.dataset.id,
        p_rank: null
      });
      if (error) {
        button.disabled = false;
        alert(error.message);
      }
      else if (routePath() === "/admin") await renderRoute();
    });
  });
  const challengeForm = document.getElementById("challengeForm");
  if (challengeForm) challengeForm.addEventListener("submit", async event => {
    event.preventDefault();
    const fd = new FormData(challengeForm);
    const button = challengeForm.querySelector("button[type='submit']");
    const message = document.getElementById("challengeFormMsg");
    button.disabled = true;
    button.textContent = "发布中...";
    const { error } = await db.rpc("create_challenge_round", {
      p_title: String(fd.get("title") || "").trim(),
      p_description: String(fd.get("description") || "").trim(),
      p_category: String(fd.get("category") || "").trim(),
      p_level: Number(fd.get("level") || 1),
      p_deliverable: String(fd.get("deliverable") || "").trim(),
      p_format_guide: String(fd.get("format_guide") || "").trim(),
      p_group_size: Number(fd.get("group_size") || 6),
      p_starts_at: new Date(String(fd.get("starts_at"))).toISOString(),
      p_ends_at: new Date(String(fd.get("ends_at"))).toISOString()
    });
    if (error) {
      if (message) message.innerHTML = notice(error.message, "error");
      button.disabled = false;
      button.textContent = "发布 Challenge";
    } else if (routePath() === "/admin") {
      await renderRoute();
    }
  });
  document.querySelectorAll(".setChallengeStatus").forEach(button => {
    button.addEventListener("click", async () => {
      const label = button.dataset.status === "closed" ? "结束" : "归档";
      if (!confirm(`确定${label}这个 Challenge 赛期吗？`)) return;
      button.disabled = true;
      const { error } = await db.rpc("set_challenge_status", {
        p_task_id: button.dataset.id,
        p_status: button.dataset.status
      });
      if (error) {
        button.disabled = false;
        alert(error.message);
      }
      else if (routePath() === "/admin") await renderRoute();
    });
  });
}

async function pageProfile(profileId, token = routeRenderToken) {
  if (!(await requireUser())) return;
  const targetId = profileId || user.id;
  const isSelf = targetId === user.id;
  const { data: targetProfile, error: profileError } = await db
    .from("profiles")
    .select(profileFields)
    .eq("id", targetId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!targetProfile) {
    layout(`<section class="panel">${notice("没有找到这个用户。", "error")}</section>`);
    return;
  }
  const [mine, subs, invites, endorsements, submissionCount] = await Promise.all([
    isSelf ? memberships() : Promise.resolve([]),
    profileSubmissions(targetId),
    isSelf ? pendingInvites() : Promise.resolve([]),
    profileEndorsements(targetId),
    profileSubmissionCount(targetId)
  ]);
  const { count: messageCount } = await db.from("messages").select("id", { count: "exact", head: true }).eq("user_id", targetId);
  const tagCounts = endorsements.reduce((acc, item) => {
    acc[item.tag] = (acc[item.tag] || 0) + 1;
    return acc;
  }, {});
  if (token !== routeRenderToken) return;
  layout(`
    <section class="profile-head panel">
      <div class="avatar-large">${h((targetProfile.display_name || "C").slice(0, 1))}</div>
      <div>
        <p class="eyebrow">public profile</p>
        <h1>${h(targetProfile.display_name || "未命名用户")}</h1>
        <p>${level(targetProfile.level)} · ${h(targetProfile.stage)} · ${h(profileValue(targetProfile, "target_role", targetProfile.direction || ""))}</p>
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
      <div><strong>${messageCount || 0}</strong><span>可见发言</span></div>
      <div><strong>${submissionCount}</strong><span>成果</span></div>
      <div><strong>${endorsements.length}</strong><span>推荐标签</span></div>
    </section>
    <section class="panel">
      <div class="section-head"><h2>成员推荐标签</h2></div>
      <div class="tag-cloud">
        ${Object.keys(tagCounts).map(tag => `<span>${h(tag)} × ${tagCounts[tag]}</span>`).join("") || `<p class="muted">还没有收到推荐标签。被观察、完成 Challenge、输出高质量讨论后会逐渐积累。</p>`}
      </div>
      ${endorsements.length ? `
        <div class="list" style="margin-top:14px">
          ${endorsements.slice(0, 6).map(item => `
            <article class="mini-card">
              <div class="pill-row">
                <span class="pill good">${h(item.tag)}</span>
                <span class="pill">${level(item.endorser?.level || 1)}</span>
              </div>
              <p>${h(item.note || "成员推荐")}</p>
              <p class="muted">${h(item.endorser?.display_name || "推荐成员")} · ${time(item.created_at)}</p>
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
            ${sub.award_rank ? `<span class="pill dark">第 ${sub.award_rank} 名</span>` : ""}
            <span class="pill good">${challengeDifficulty(sub.tasks?.level)}</span>
            <h3>${h(sub.title)}</h3>
            <p>${h(sub.tasks?.title || "Challenge")} · ${time(sub.created_at)}</p>
            <div class="button-row submission-actions">
              ${renderSubmissionLinks(sub)}
              ${sub.groups?.id ? `<a class="text-btn" href="#/work/${sub.groups.id}">${isSelf ? "查看比赛结果" : "查看成果详情"}</a>` : ""}
            </div>
          </article>
        `).join("") || `<p class="muted">还没有成果。完成 Challenge Circle 后会自动展示在这里。</p>`}
      </div>
    </section>
  `);
}

async function pageOnboarding(token = routeRenderToken) {
  if (!(await requireUser())) return;
  const needsOnboardingBeforeSave = profileNeedsOnboarding(profile);
  if (token !== routeRenderToken) return;
  layout(`
    <section class="panel form-wrap">
      <p class="eyebrow">profile setup</p>
      <h1>编辑个人主页</h1>
      <form id="profileForm" class="form-card flat">
        <label>昵称<input name="display_name" required minlength="1" maxlength="40" value="${h(profile.display_name || "")}"></label>
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
        <label>一句话介绍<textarea name="bio" rows="5" maxlength="500" placeholder="你的目标岗位、当前进度，以及你希望小队怎么帮你推进。">${h(profile.bio || "")}</textarea></label>
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
      direction: String(fd.get("target_role") || "").trim(),
      bio: String(fd.get("bio") || "").trim(),
      application_track: String(fd.get("application_track") || ""),
      target_role: String(fd.get("target_role") || ""),
      application_progress: String(fd.get("application_progress") || ""),
      intensity: String(fd.get("intensity") || "")
    };
    const contextChanged = String(profile?.application_track || "") !== payload.application_track
      || canonicalChatRole(profile?.target_role) !== canonicalChatRole(payload.target_role);
    let { data, error } = await db.from("profiles").update(payload).eq("id", user.id).select(profileFields).single();
    if (error && /column|schema|cache/i.test(error.message || "")) {
      const legacyPayload = {
        display_name: payload.display_name,
        stage: payload.stage,
        direction: payload.direction,
        bio: payload.bio
      };
      const retry = await db.from("profiles").update(legacyPayload).eq("id", user.id).select(profileFields).single();
      data = retry.data;
      error = retry.error || { message: "资料已保存，但申请画像字段需要先重新运行 Supabase SQL 才能持久保存。" };
    }
    if (data) profile = { ...data, level_reset_at: contextChanged ? new Date().toISOString() : profile?.level_reset_at, is_admin: await myAdminFlag() };
    const stillNeedsOnboarding = profileNeedsOnboarding(profile);
    document.getElementById("profileMsg").innerHTML = error
      ? notice(error.message, "error")
      : notice(
        stillNeedsOnboarding
          ? "已保存。请补全昵称和申请目标后继续。"
          : contextChanged
            ? "申请路径或岗位大类已改变，阶段已重置为 Starter。原聊天 Circle 暂时保留，你可以在聊天 Circle 广场主动重新匹配。"
            : "已保存",
        stillNeedsOnboarding ? "" : "success"
      );
    if (!error && needsOnboardingBeforeSave && !profileNeedsOnboarding(profile)) {
      setTimeout(() => {
        if (routePath() === "/onboarding") go("/home");
      }, 350);
    }
  });
}

async function pageWorkbench(groupId, token = routeRenderToken) {
  if (!(await requireUser())) return;
  const { data: group, error } = await db.from("groups").select("*, task:task_id (*)").eq("id", groupId).single();
  if (error) {
    if (error.code === "PGRST116") {
      if (token !== routeRenderToken) return;
      layout(`<section class="panel">${notice("Challenge Circle 不存在，或你没有查看权限。", "error")}</section>`);
      return;
    }
    throw error;
  }
  if (group.circle_type !== "task") return go(`/group/${groupId}`);

  const [subs, members] = await Promise.all([
    taskSubmissions(group.task_id),
    db.from("group_members").select("user_id").eq("group_id", groupId).eq("status", "active")
  ]);
  const isMember = (members.data || []).some(m => m.user_id === user.id);
  const existing = subs.find(sub => sub.groups?.id === groupId);
  const isSubmissionContributor = !existing || (existing.contributors || []).some(person => person?.id === user.id);
  const taskEndsAt = group.task?.ends_at ? new Date(group.task.ends_at).getTime() : null;
  const challengeOpen = group.task?.status === "open"
    && (!group.task?.starts_at || new Date(group.task.starts_at).getTime() <= Date.now())
    && (!taskEndsAt || taskEndsAt > Date.now());
  const canEditSubmission = isMember && challengeOpen && isSubmissionContributor;
  if (token !== routeRenderToken) return;

  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <div class="pill-row"><span class="pill dark">Challenge 工作台</span><span class="pill good">${challengeDifficulty(group.level)}</span></div>
        <h1>${h(group.task?.title || group.name)}</h1>
        <p>${h(group.task?.description || "")}</p>
      </div>
      <a class="secondary-btn" href="#/group/${groupId}">返回讨论</a>
    </section>
    <section class="two-col wide-left">
      <div class="panel">
        <h2>${canEditSubmission ? (existing ? "更新成果" : "提交成果") : challengeOpen ? "成果已锁定" : "提交已截止"}</h2>
        <div class="deliverable"><strong>交付物</strong><span>${h(group.task?.deliverable || "")}</span></div>
        <div class="deliverable"><strong>交付格式</strong><span>${h(group.task?.format_guide || "结论摘要、关键假设、分析过程、风险与下一步。")} 可以直接上传文件，也可以提交 Google Drive、Notion 等外部链接。</span></div>
        ${canEditSubmission ? `
          <form class="form-card flat" id="submitForm">
            <label>成果标题<input name="title" required minlength="3" maxlength="160" value="${h(existing?.title || "")}" placeholder="例如：英国茶饮市场进入方案"></label>
            <label class="submission-upload-label">直接上传文件
              <input id="submissionFile" name="file" type="file">
              <span>支持 Word、PPT、PDF、Excel、图片和压缩包，单个文件不超过 50MB</span>
            </label>
            ${existing?.submission_file_name ? `
              <div class="existing-submission-file">
                <strong>当前文件</strong>
                <span>${h(existing.submission_file_name)} · ${formatFileSize(existing.submission_file_size)}</span>
                ${existing.submission_file_url ? `<a class="text-btn" href="${h(existing.submission_file_url)}" target="_blank" rel="noreferrer">打开</a>` : ""}
              </div>
            ` : ""}
            <label>外部链接（可选）<input name="url" type="url" value="${h(existing?.submission_url || "")}" placeholder="Google Drive、Notion 或其他链接"></label>
            <label>提交说明<textarea name="content" required minlength="20" maxlength="8000" rows="9" placeholder="写清楚核心结论、分工和链接里的内容。">${h(existing?.content || "")}</textarea></label>
            <button class="primary-btn" id="submitResultBtn" type="submit">${existing ? "更新成果" : "提交成果"}</button>
            <div id="submitMsg"></div>
          </form>
        ` : notice(
          !isMember
            ? "你可以在截止后查看提交墙，但不是这个 Circle 成员，不能提交。"
            : challengeOpen && !isSubmissionContributor
              ? "成果已锁定首次提交时的小队成员，后加入的成员不能覆盖原团队作品。"
              : "Challenge 已截止，成果已经锁定，不能继续提交或修改。"
        )}
      </div>
      <aside class="panel">
        <h2>${challengeOpen ? "本队提交状态" : "全部提交"}</h2>
        <div class="leaderboard tall">
          ${subs.map(sub => `
            <div>
              <b>${sub.award_rank ? `第 ${sub.award_rank} 名` : `提交`}</b>
              <span>${h(sub.groups?.name || "Circle")}</span>
              <em>${sub.award_rank ? "已上榜" : time(sub.created_at)}</em>
            </div>
          `).join("") || `<p class="muted">${challengeOpen ? "本队还没有提交；其他队作品会在截止后公开。" : "还没有提交。"}</p>`}
        </div>
      </aside>
    </section>
    ${subs.length ? `
      <section class="panel">
        <h2>${challengeOpen ? "本队提交详情" : "提交详情"}</h2>
        <div class="list">
          ${subs.map((sub, index) => `
            <article class="list-item">
              <span class="pill dark">${sub.award_rank ? `第 ${sub.award_rank} 名` : `已提交`}</span>
              <h3>${h(sub.title)}</h3>
              <p>${h(sub.groups?.name || "Circle")} · ${h((sub.contributors || []).map(item => item.display_name).filter(Boolean).join("、") || sub.profiles?.display_name || "小组成员")} · ${time(sub.created_at)}</p>
              <div class="button-row submission-actions">${renderSubmissionLinks(sub)}</div>
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
      const file = document.getElementById("submissionFile")?.files?.[0] || null;
      const externalUrl = String(fd.get("url") || "").trim();
      const message = document.getElementById("submitMsg");
      const submitButton = document.getElementById("submitResultBtn");
      if (!file && !externalUrl && !existing?.submission_file_path) {
        message.innerHTML = notice("请上传一个成果文件，或者填写外部链接。", "error");
        return;
      }
      if (file && file.size > 50 * 1024 * 1024) {
        message.innerHTML = notice("单个成果文件不能超过 50MB。", "error");
        return;
      }
      submitButton.disabled = true;
      submitButton.textContent = file ? "正在上传文件..." : "正在保存...";
      let filePath = existing?.submission_file_path || null;
      let fileName = existing?.submission_file_name || null;
      let fileMime = existing?.submission_file_mime || null;
      let fileSize = existing?.submission_file_size || null;
      let uploadedPath = null;
      if (file) {
        const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_").slice(0, 140) || "submission";
        const uniquePart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        uploadedPath = `${groupId}/${user.id}/${uniquePart}-${safeName}`;
        const { error: uploadError } = await db.storage.from("submission-files").upload(uploadedPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream"
        });
        if (uploadError) {
          submitButton.disabled = false;
          submitButton.textContent = existing ? "更新成果" : "提交成果";
          const needsSql = /bucket|not found|row-level security|policy/i.test(uploadError.message || "");
          message.innerHTML = notice(needsSql ? "成果文件存储尚未启用，请先重新运行 Supabase SQL。" : uploadError.message, "error");
          return;
        }
        filePath = uploadedPath;
        fileName = file.name;
        fileMime = file.type || "application/octet-stream";
        fileSize = file.size;
        submitButton.textContent = "正在保存成果...";
      }
      const { error: submitError } = await db.rpc("submit_task_result", {
        p_group_id: groupId,
        p_title: String(fd.get("title") || "").trim(),
        p_content: String(fd.get("content") || "").trim(),
        p_submission_url: externalUrl,
        p_file_path: filePath,
        p_file_name: fileName,
        p_file_mime: fileMime,
        p_file_size: fileSize
      });
      if (submitError && uploadedPath) await db.storage.from("submission-files").remove([uploadedPath]);
      submitButton.disabled = false;
      submitButton.textContent = existing ? "更新成果" : "提交成果";
      message.innerHTML = submitError
        ? notice(/function|p_file_|schema cache/i.test(submitError.message || "") ? "成果文件字段尚未启用，请先重新运行 Supabase SQL。" : submitError.message, "error")
        : notice("成果已保存，文件和链接会同步到成果墙。", "success");
      if (!submitError) {
        if (uploadedPath && existing?.submission_file_path && existing.submission_file_path !== uploadedPath) {
          await db.storage.from("submission-files").remove([existing.submission_file_path]);
        }
        setTimeout(() => {
          if (routePath() === `/work/${groupId}`) renderRoute();
        }, 500);
      }
    });
  }
}

async function pageGroup(groupId, token = routeRenderToken) {
  if (!(await requireUser())) return;
  const { data: group, error } = await db.from("groups").select("*, task:task_id (*)").eq("id", groupId).single();
  if (error) {
    if (error.code === "PGRST116") {
      if (token !== routeRenderToken) return;
      layout(`<section class="panel">${notice("Circle 不存在，或你没有查看权限。", "error")}</section>`);
      return;
    }
    throw error;
  }
  let messageLimit = 100;
  const messagePageSize = 100;
  const mediaUrlCache = new Map();
  let messageChannel = null;

  async function readMembers() {
    const { data, error: memberError } = await db
      .from("group_members")
      .select("user_id, role, joined_at, profiles:user_id (display_name, level, direction, target_role, stage)")
      .eq("group_id", groupId)
      .eq("status", "active")
      .order("joined_at", { ascending: true });
    if (memberError) throw memberError;
    return data || [];
  }

  async function readMessages() {
    let { data, error: msgError } = await db
      .from("messages")
      .select("id, content, message_type, media_url, media_path, media_name, media_mime, media_size, created_at, user_id, profiles:user_id (display_name)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(messageLimit);
    if (msgError && /message_type|media_|column/i.test(msgError.message || "")) {
      const fallback = await db
        .from("messages")
        .select("id, content, created_at, user_id, profiles:user_id (display_name)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(messageLimit);
      data = fallback.data;
      msgError = fallback.error;
    }
    if (msgError) throw msgError;
    const rows = (data || []).reverse();
    rows.forEach(msg => { msg.media_url = null; });
    const mediaRows = rows.filter(msg => msg.media_path);
    await Promise.all(mediaRows.map(async msg => {
      const cached = mediaUrlCache.get(msg.media_path);
      if (cached && cached.expiresAt > Date.now() + 60 * 1000) {
        msg.media_url = cached.url;
        return;
      }
      const { data: signed } = await db.storage.from("chat-media").createSignedUrl(msg.media_path, 60 * 60);
      if (signed?.signedUrl) {
        mediaUrlCache.set(msg.media_path, {
          url: signed.signedUrl,
          expiresAt: Date.now() + 55 * 60 * 1000
        });
        msg.media_url = signed.signedUrl;
      }
    }));
    return rows;
  }

  function messageStreamMarkup(messages) {
    const older = messages.length >= messageLimit
      ? `<button class="load-older-btn" id="loadOlderMessages" type="button">加载更早消息</button>`
      : "";
    return `${older}${renderChatMessages(messages)}`;
  }

  function bindOlderMessages() {
    const button = document.getElementById("loadOlderMessages");
    if (!button) return;
    button.addEventListener("click", async () => {
      const scroll = document.getElementById("chatScroll");
      if (!scroll) return;
      const previousHeight = scroll.scrollHeight;
      button.disabled = true;
      button.textContent = "加载中...";
      try {
        messageLimit += messagePageSize;
        const messages = await readMessages();
        scroll.innerHTML = messageStreamMarkup(messages);
        bindOlderMessages();
        scroll.scrollTop = Math.max(0, scroll.scrollHeight - previousHeight);
      } catch (error) {
        messageLimit = Math.max(messagePageSize, messageLimit - messagePageSize);
        button.disabled = false;
        button.textContent = "重试加载更早消息";
        console.warn("older messages failed", error);
      }
    });
  }

  async function refreshMessageStream(scrollToBottom = true) {
    const scroll = document.getElementById("chatScroll");
    if (!scroll) return;
    const messages = await readMessages();
    scroll.innerHTML = messageStreamMarkup(messages);
    bindOlderMessages();
    if (scrollToBottom) scroll.scrollTop = scroll.scrollHeight;
  }

  let passiveRefreshes = 0;
  let detachPasteUpload = null;
  let messageSending = false;
  let repaintAfterSend = false;

  async function paint(force = false) {
    if (token !== routeRenderToken) return;
    if (routePath() !== `/group/${groupId}`) return;
    if (messageSending) {
      repaintAfterSend = true;
      return;
    }
    if (!force && document.activeElement?.matches?.("#messageInput, #weeklyForm input, #weeklyForm textarea")) return;
    const currentScroll = document.getElementById("chatScroll");
    const openMenu = document.getElementById("chatMenu");
    if (!force && openMenu && !openMenu.hidden) return;
    if (!force && currentScroll) {
      const distanceFromBottom = currentScroll.scrollHeight - currentScroll.scrollTop - currentScroll.clientHeight;
      if (distanceFromBottom > 120) return;
    }
    const [members, messages, league, storedCheckins] = await Promise.all([
      readMembers(),
      readMessages(),
      peerCircleLeague(group),
      weeklyCheckinsForGroup(groupId)
    ]);
    if (token !== routeRenderToken || routePath() !== `/group/${groupId}`) return;
    if (messageSending) {
      repaintAfterSend = true;
      return;
    }
    if (!force && document.activeElement?.matches?.("#messageInput, #weeklyForm input, #weeklyForm textarea")) return;
    const isMember = members.some(m => m.user_id === user.id);
    const isWaitingForMembers = group.circle_type === "exploration" && members.length < 3;
    const isLowerObservedChat = !isMember && group.circle_type === "exploration" && Number(group.level || 1) < Number(profile.level || 1);
    const expectedObservedTopic = `${profileValue(profile, "application_track", "Spring Week") === "Summer Internship" ? "Summer" : "Spring Week"} ${level(group.level)} - ${canonicalChatRole(profileValue(profile, "target_role", profile.direction || ""))} Circle`;
    const canEvaluateObservedGroup = isLowerObservedChat
      && Number(profile.level || 1) === Number(group.level || 1) + 1
      && normalizedChatTopic(group.topic) === expectedObservedTopic;
    const canInviteObservedMember = canEvaluateObservedGroup
      && Number(profile.level || 1) === 3
      && Number(group.level || 1) === 2;
    const topic = group.circle_type === "task" ? group.task?.title : normalizedChatTopic(group.topic);
    const activeNames = members.slice(0, 4).map(m => m.profiles?.display_name || "用户").join("、");
    const checkins = storedCheckins || weeklyCheckins(messages);
    const myCheckin = latestCheckinForUser(checkins);
    const myCheckedIn = Boolean(myCheckin);
    const messageDraft = document.getElementById("messageInput")?.value || "";
    const currentWeeklyForm = document.getElementById("weeklyForm");
    const weeklyDraft = currentWeeklyForm ? new FormData(currentWeeklyForm) : null;
    layout(`
      <section class="chat-workspace">
        <aside class="chat-side">
          <a href="${isLowerObservedChat ? "#/observe" : "#/home"}" class="side-back">‹ 返回</a>
          <div class="side-card main-side-card">
            <div class="pill-row">
              <span class="pill ${group.circle_type === "task" ? "dark" : "warm"}">${circleTypeName(group.circle_type)}</span>
              <span class="pill good">${circleLevelLabel(group)}</span>
              ${isWaitingForMembers ? `<span class="pill warm">等待组队</span>` : ""}
              ${isLowerObservedChat ? `<span class="pill">只读观察</span>` : ""}
            </div>
            <h2>${h(circleDisplayName(group))}</h2>
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
                    <em>${level(m.profiles?.level)} · ${h(m.profiles?.target_role || m.profiles?.direction || "")}</em>
                  </span>
                </a>
              `).join("")}
            </div>
          </div>

          <div class="side-card">
            <div class="side-title"><strong>上下文</strong></div>
            <p>
              ${isLowerObservedChat
              ? `你正在观察 ${level(group.level)} 讨论，可以给优秀成员推荐标签或邀请升级。`
              : group.circle_type === "task"
              ? `Challenge 交付：${h(group.task?.deliverable || "提交小组作品。")}`
              : isWaitingForMembers
              ? `已匹配 ${members.length}/3 人，凑齐 3 人后开放聊天和周同步。`
              : "长期聊天 Circle，适合持续复盘和沉淀关系。"}
            </p>
            <div class="side-actions">
              ${group.circle_type === "task" ? `<a class="secondary-btn" href="#/work/${groupId}">Challenge 工作台</a>` : ""}
              ${isLowerObservedChat ? `<button class="secondary-btn" id="sideToggleMembers" type="button">推荐 / 升级成员</button>` : ""}
            </div>
          </div>
        </aside>

        <div class="wechat">
          <div class="drop-hint" id="dropHint">松开上传到这个 Circle</div>
          <header class="chat-top">
            <a href="${isLowerObservedChat ? "#/observe" : "#/home"}" class="back-link mobile-chat-back">‹</a>
            <div>
              <h1>${h(circleDisplayName(group))}</h1>
              <p>${members.length}/${group.max_members} · ${h(activeNames || topic || "")}</p>
            </div>
            <button class="icon-btn" id="moreBtn" type="button">•••</button>
          </header>
          <div class="chat-menu" id="chatMenu" hidden>
            <div class="pill-row">
              <span class="pill ${group.circle_type === "task" ? "dark" : "warm"}">${circleTypeName(group.circle_type)}</span>
              <span class="pill good">${circleLevelLabel(group)}</span>
              ${isWaitingForMembers ? `<span class="pill warm">等待组队</span>` : ""}
              ${isLowerObservedChat ? `<span class="pill">只读观察</span>` : ""}
            </div>
            <div class="chat-menu-context">
              ${isLowerObservedChat
              ? canEvaluateObservedGroup
                ? `你正在只读观察 ${level(group.level)} 讨论。可以展开成员，给表现好的候选人添加推荐标签或发升级邀请。`
                : `你正在只读观察 ${level(group.level)} 讨论。只有同一申请路径、同一岗位大类且相邻阶段的用户才能推荐或邀请成员。`
              : group.circle_type === "task"
              ? `Challenge 交付：${h(group.task?.deliverable || "提交小组作品。")}`
              : isWaitingForMembers
              ? `正在等待更多同路人。凑齐 3 人后开放聊天和每周同步，目前已匹配 ${members.length} 人。`
              : "这是长期聊天 Circle。建议稳定参与、持续复盘，不鼓励频繁退出换圈。"}
            </div>
            ${group.circle_type === "task" ? `<a href="#/work/${groupId}">Challenge 工作台</a>` : ""}
            ${isLowerObservedChat ? `<button id="toggleMembers" type="button">${canEvaluateObservedGroup ? "推荐 / 升级成员" : "查看成员"}</button>` : ""}
            ${isMember ? `<button id="leaveGroup" class="danger" type="button">${group.circle_type === "task" ? "退出 Challenge Circle" : "退出长期聊天 Circle"}</button>` : ""}
          </div>
          ${group.circle_type === "task" ? `<div class="task-shortcut"><a href="#/work/${groupId}">Challenge 工作台</a></div>` : ""}
          ${isLowerObservedChat ? `
            <div class="member-drawer" id="memberDrawer" hidden>
              ${members.map(m => `
                <article>
                  <div><strong>${h(m.profiles?.display_name || "用户")}</strong><span>${level(m.profiles?.level)} · ${h(m.profiles?.target_role || m.profiles?.direction || "")}</span></div>
                  ${canEvaluateObservedGroup && profile.level > (m.profiles?.level || 1) && m.user_id !== user.id ? `
                    <div class="button-row">
                      <button class="secondary-btn endorseUser" data-user="${m.user_id}">推荐标签</button>
                      ${canInviteObservedMember && Number(m.profiles?.level || 1) === 2 ? `<button class="secondary-btn inviteUp" data-user="${m.user_id}">邀请升级</button>` : ""}
                      <a class="text-btn" href="#/profile/${m.user_id}">主页</a>
                    </div>
                  ` : `<a class="text-btn" href="#/profile/${m.user_id}">主页</a>`}
                </article>
              `).join("")}
            </div>
          ` : ""}
          <div class="chat-scroll" id="chatScroll">
            ${messageStreamMarkup(messages)}
          </div>
          <footer class="composer">
            ${isMember && !isWaitingForMembers ? `
              <form id="messageForm">
                <div class="composer-tools">
                  <span>${h(group.circle_type === "task" ? "挑战讨论" : "群聊")}</span>
                  <span id="charCount">0/5000</span>
                </div>
                <div class="composer-row">
                  <button class="tool-btn plus-icon" id="attachBtn" type="button" aria-label="上传图片或文件" title="上传图片或文件"></button>
                  <input id="fileInput" class="hidden-file-input" type="file" multiple>
                  <textarea id="messageInput" name="content" rows="1" maxlength="5000" placeholder="输入消息..."></textarea>
                  <button class="send-btn" id="sendBtn" type="submit" disabled>发送</button>
                </div>
                <div class="upload-status" id="uploadStatus" role="status" aria-live="polite" hidden></div>
              </form>
            ` : isMember && isWaitingForMembers
              ? notice(`已匹配 ${members.length}/3 人。凑齐后自动开放聊天，你不需要重复加入。`)
              : notice("你能查看这个 Circle，但不是成员，不能发言。")}
          </footer>
        </div>

        <aside class="chat-feed">
          ${group.circle_type === "exploration" ? `
            <div class="feed-card">
              <div class="side-title">
                <strong>同类 Circle 周榜</strong>
                <span>${h(normalizedChatTopic(group.topic) || "Circle")}</span>
              </div>
              ${renderPeerLeague(league, group)}
            </div>
          ` : ""}

          <div class="feed-card">
            <div class="side-title">
              <strong>${group.circle_type === "task" ? "挑战看板" : isLowerObservedChat ? "观察看板" : "本组周同步"}</strong>
              <span>${circleLevelLabel(group)}</span>
            </div>
            ${group.circle_type === "task" ? `
              <p>${h(group.task?.description || "围绕 Challenge 推进讨论。")}</p>
              <div class="feed-block">
                <strong>比赛交付物</strong>
                <p>${h(group.task?.deliverable || "提交小组成果。")}</p>
              </div>
              <a class="primary-btn" href="#/work/${groupId}">打开 Challenge 工作台</a>
            ` : isLowerObservedChat ? `
              <p>你可以一边看候选小队的真实讨论，一边判断谁值得被推荐或升级。</p>
              <div class="feed-block">
                <strong>观察重点</strong>
                <p>看谁能提出清晰问题、推动讨论、总结结论、给出有依据的判断。</p>
              </div>
            ` : `
              <p>${isWaitingForMembers ? "小队正在匹配成员，凑齐 3 人后开始本周同步。" : "这个 Circle 是长期目标小队。每周保留一份进展记录；提交后仍然可以更新。"}</p>
              ${isWaitingForMembers ? "" : `<div class="rank-list">${renderWeeklyRank(checkins)}</div>`}
              ${myCheckedIn && !isWaitingForMembers ? `<div class="notice success slim-notice">你这周已经同步过，下面会更新当前记录。</div>` : ""}
              ${isMember && !isWaitingForMembers ? `
                <form class="weekly-form" id="weeklyForm">
                  <div class="mini-grid">
                    <label>申请<input name="apps" type="number" min="0" max="200" value="${myCheckin?.apps ?? 0}"></label>
                    <label>Networking<input name="networking" type="number" min="0" max="200" value="${myCheckin?.networking ?? 0}"></label>
                  </div>
                  <label>学到了什么<textarea name="learning" rows="2" maxlength="300" placeholder="例如：改了 CV bullet，练了 DCF，发现一个目标 team">${h(myCheckin?.learning || "")}</textarea></label>
                  <label>现在卡在哪里<textarea name="blocker" rows="2" maxlength="300" placeholder="例如：不知道怎么 cold message，HireVue 故事不够顺">${h(myCheckin?.blocker || "")}</textarea></label>
                  <button class="primary-btn" type="submit">${myCheckedIn ? "更新本周进度" : "同步本周进度"}</button>
                </form>
              ` : ""}
              <div class="feed-block">
                <strong>本周行动榜</strong>
                <p>成员自报的行动数据，每周重新计算，只用于保持节奏，不作为水平判断或升级依据。</p>
              </div>
            `}
          </div>

        </aside>
      </section>
    `, { full: true, hideNav: true });

    const restoredMessageInput = document.getElementById("messageInput");
    if (restoredMessageInput) restoredMessageInput.value = messageDraft;
    const restoredWeeklyForm = document.getElementById("weeklyForm");
    if (weeklyDraft && restoredWeeklyForm) {
      for (const [name, value] of weeklyDraft.entries()) {
        const field = restoredWeeklyForm.elements.namedItem(name);
        if (field) field.value = value;
      }
    }

    const scroll = document.getElementById("chatScroll");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    bindOlderMessages();
    const more = document.getElementById("moreBtn");
    const menu = document.getElementById("chatMenu");
    if (more && menu) more.addEventListener("click", () => menu.hidden = !menu.hidden);
    const toggle = document.getElementById("toggleMembers");
    const sideToggle = document.getElementById("sideToggleMembers");
    const drawer = document.getElementById("memberDrawer");
    if (toggle && drawer) toggle.addEventListener("click", () => drawer.hidden = !drawer.hidden);
    if (sideToggle && drawer) sideToggle.addEventListener("click", () => drawer.hidden = !drawer.hidden);

    const weeklyForm = document.getElementById("weeklyForm");
    if (weeklyForm) {
      weeklyForm.addEventListener("submit", async e => {
        e.preventDefault();
        const fd = new FormData(weeklyForm);
        const apps = Math.max(0, Number(fd.get("apps") || 0));
        const networking = Math.max(0, Number(fd.get("networking") || 0));
        const learning = String(fd.get("learning") || "").trim() || "还没写";
        const blocker = String(fd.get("blocker") || "").trim() || "暂时没有";
        const submitBtn = weeklyForm.querySelector("button");
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = myCheckedIn ? "更新中" : "同步中";
        }
        const { error: weeklyError } = await db.rpc("upsert_weekly_checkin", {
          p_group_id: groupId,
          p_apps: apps,
          p_networking: networking,
          p_learning: learning,
          p_blocker: blocker
        });
        if (weeklyError) {
          const needsSql = /upsert_weekly_checkin|weekly_checkins|function|schema cache/i.test(weeklyError.message || "");
          alert(needsSql ? "还需要在 Supabase 里重新运行 supabase/schema.sql，才能启用“每周一次、可更新”的周同步。" : weeklyError.message);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = myCheckedIn ? "更新本周进度" : "同步本周进度";
          }
          return;
        }
        await paint(true);
      });
    }

    document.querySelectorAll(".inviteUp").forEach(button => {
      button.addEventListener("click", async () => {
        const reason = prompt("写一句邀请理由。对方接受后会解锁更高阶段，但不会自动换群。");
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
          p_note: note.trim(),
          p_group_id: groupId
        });
        alert(endorseError ? endorseError.message : "已添加推荐标签");
      });
    });

    const leave = document.getElementById("leaveGroup");
    if (leave) {
      leave.addEventListener("click", async () => {
        const copy = group.circle_type === "exploration"
          ? "聊天 Circle 是长期关系圈，退出后会中断当前关系。确定退出吗？"
          : "确定退出这个 Challenge Circle 吗？";
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
      const attachBtn = document.getElementById("attachBtn");
      const fileInput = document.getElementById("fileInput");
      const uploadStatus = document.getElementById("uploadStatus");
      let attachmentUploadInProgress = false;
      const syncComposer = () => {
        const value = textarea.value;
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
        const hasText = value.trim().length > 0;
        if (sendBtn) sendBtn.disabled = messageSending || !hasText;
        if (charCount) charCount.textContent = `${value.length}/5000`;
      };
      const send = async () => {
        if (messageSending) return;
        const content = String(new FormData(form).get("content") || "").trim();
        if (!content) return;
        const previous = textarea.value;
        const optimisticId = `local-${Date.now()}`;
        const scroll = document.getElementById("chatScroll");
        messageSending = true;
        textarea.value = "";
        syncComposer();
        if (sendBtn) {
          sendBtn.textContent = "发送中";
        }
        if (scroll) {
          const optimisticMessage = {
            id: optimisticId,
            user_id: user.id,
            content,
            created_at: new Date().toISOString(),
            profiles: { display_name: profile?.display_name || "我" }
          };
          if (scroll.querySelector(".empty, .chat-empty")) scroll.innerHTML = "";
          scroll.insertAdjacentHTML("beforeend", renderChatBubble(optimisticMessage));
          scroll.scrollTop = scroll.scrollHeight;
        }
        try {
          let sendError = null;
          try {
            const result = await db.from("messages").insert({ group_id: groupId, user_id: user.id, content });
            sendError = result.error;
          } catch (error) {
            sendError = error;
          }
          if (token !== routeRenderToken || routePath() !== `/group/${groupId}`) return;
          if (sendError) {
            textarea.value = `${previous}${textarea.value ? `\n${textarea.value}` : ""}`;
            scroll?.querySelector(`[data-message-id="${optimisticId}"]`)?.remove();
            alert(sendError.message || "消息发送失败，请检查网络后重试。");
          }
          try {
            await refreshMessageStream(true);
          } catch (error) {
            console.warn("message refresh failed after send", error);
          }
        } finally {
          messageSending = false;
          if (token === routeRenderToken && routePath() === `/group/${groupId}`) {
            if (sendBtn) sendBtn.textContent = "发送";
            syncComposer();
            if (repaintAfterSend) {
              repaintAfterSend = false;
              try {
                await paint(true);
              } catch (error) {
                console.warn("deferred chat refresh failed", error);
              }
            }
          }
        }
      };
      const setUploadStatus = (message = "", state = "") => {
        if (!uploadStatus) return;
        uploadStatus.textContent = message;
        uploadStatus.className = `upload-status${state ? ` ${state}` : ""}`;
        uploadStatus.hidden = !message;
      };
      const sendAttachment = async file => {
        if (!file) return { ok: false, message: "没有读取到文件。" };
        if (file.size > 50 * 1024 * 1024) {
          return { ok: false, message: `${file.name} 超过 50MB` };
        }
        const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_").slice(0, 120) || "upload";
        const uniquePart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const mediaPath = `${groupId}/${user.id}/${uniquePart}-${safeName}`;
        const imageByExtension = /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(file.name);
        const messageType = file.type.startsWith("image/") || (!file.type && imageByExtension) ? "image" : "file";
        const { error: uploadError } = await db.storage.from("chat-media").upload(mediaPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream"
        });
        if (uploadError) {
          const needsSql = /bucket|not found|row-level security|policy/i.test(uploadError.message || "");
          return {
            ok: false,
            needsSql,
            message: needsSql ? "附件存储尚未启用" : `${file.name}：${uploadError.message}`
          };
        }
        const { error: messageError } = await db.from("messages").insert({
          group_id: groupId,
          user_id: user.id,
          content: file.name.slice(0, 500),
          message_type: messageType,
          media_path: mediaPath,
          media_name: file.name,
          media_mime: file.type || "application/octet-stream",
          media_size: file.size
        });
        if (messageError) {
          const needsSql = /message_type|media_|column/i.test(messageError.message || "");
          await db.storage.from("chat-media").remove([mediaPath]);
          return {
            ok: false,
            needsSql,
            message: needsSql ? "附件消息字段尚未启用" : `${file.name}：${messageError.message}`
          };
        }
        return { ok: true };
      };
      const sendAttachments = async files => {
        const picked = Array.from(files || []).filter(Boolean);
        if (!picked.length) return;
        if (attachmentUploadInProgress) {
          setUploadStatus("上一批附件还在上传，请稍等。", "uploading");
          return;
        }
        attachmentUploadInProgress = true;
        const batch = picked.slice(0, 10);
        const failures = [];
        let uploaded = 0;
        if (attachBtn) {
          attachBtn.disabled = true;
          attachBtn.setAttribute("aria-label", "正在上传");
        }
        if (fileInput) fileInput.disabled = true;
        try {
          for (let index = 0; index < batch.length; index += 1) {
            const file = batch[index];
            setUploadStatus(`正在上传 ${index + 1}/${batch.length} · ${file.name}`, "uploading");
            const result = await sendAttachment(file);
            if (result.ok) uploaded += 1;
            else failures.push(result);
          }
          if (uploaded) await refreshMessageStream(true);
          if (picked.length > batch.length) {
            failures.push({ message: `一次最多上传 10 个，另有 ${picked.length - batch.length} 个未上传` });
          }
          if (failures.length) {
            const needsSql = failures.some(item => item.needsSql);
            const details = [...new Set(failures.map(item => item.message))].slice(0, 2).join("；");
            setUploadStatus(`上传完成 ${uploaded} 个，失败 ${failures.length} 个：${details}`, "error");
            if (needsSql) alert("附件存储还没有在 Supabase 中启用。请重新运行项目里的 supabase/schema.sql 后再试。");
            return;
          }
          setUploadStatus(`${uploaded} 个附件已发送`, "success");
          setTimeout(() => {
            if (uploadStatus?.classList.contains("success")) setUploadStatus();
          }, 2600);
        } catch (error) {
          console.warn("attachment upload failed", error);
          setUploadStatus(`上传中断：${error.message || "请检查网络后重试"}`, "error");
        } finally {
          attachmentUploadInProgress = false;
          if (attachBtn) {
            attachBtn.disabled = false;
            attachBtn.setAttribute("aria-label", "上传图片或文件");
          }
          if (fileInput) fileInput.disabled = false;
        }
      };
      form.addEventListener("submit", async e => {
        e.preventDefault();
        await send();
      });
      if (attachBtn && fileInput) {
        attachBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", async () => {
          const files = Array.from(fileInput.files || []);
          fileInput.value = "";
          await sendAttachments(files);
        });
      }
      const wechatPanel = document.querySelector(".wechat");
      const dropHint = document.getElementById("dropHint");
      if (wechatPanel) {
        let dragDepth = 0;
        const showDrop = () => {
          if (dropHint) dropHint.classList.add("show");
          wechatPanel.classList.add("dragging-file");
        };
        const hideDrop = () => {
          if (dropHint) dropHint.classList.remove("show");
          wechatPanel.classList.remove("dragging-file");
        };
        wechatPanel.addEventListener("dragenter", e => {
          if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
          e.preventDefault();
          dragDepth += 1;
          showDrop();
        });
        wechatPanel.addEventListener("dragover", e => {
          if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          showDrop();
        });
        wechatPanel.addEventListener("dragleave", e => {
          if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
          dragDepth = Math.max(0, dragDepth - 1);
          if (dragDepth === 0) hideDrop();
        });
        wechatPanel.addEventListener("drop", async e => {
          const files = Array.from(e.dataTransfer?.items || [])
            .filter(item => item.kind === "file")
            .map(item => item.getAsFile())
            .filter(Boolean);
          if (!files.length) files.push(...Array.from(e.dataTransfer?.files || []));
          if (!files.length) return;
          e.preventDefault();
          dragDepth = 0;
          hideDrop();
          await sendAttachments(files);
        });
      }
      const handlePasteUpload = async e => {
        if (routePath() !== `/group/${groupId}`) return;
        const files = Array.from(e.clipboardData?.items || [])
          .filter(item => item.kind === "file")
          .map(item => item.getAsFile())
          .filter(Boolean);
        if (!files.length) files.push(...Array.from(e.clipboardData?.files || []));
        if (!files.length) return;
        e.preventDefault();
        await sendAttachments(files);
      };
      if (detachPasteUpload) detachPasteUpload();
      document.addEventListener("paste", handlePasteUpload);
      detachPasteUpload = () => {
        document.removeEventListener("paste", handlePasteUpload);
        detachPasteUpload = null;
      };
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
  if (token !== routeRenderToken || routePath() !== `/group/${groupId}`) return;
  messageChannel = db
    .channel(`messages:${groupId}:${user.id}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `group_id=eq.${groupId}`
    }, async () => {
      if (routePath() !== `/group/${groupId}`) return;
      try {
        const scroll = document.getElementById("chatScroll");
        const distanceFromBottom = scroll
          ? scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight
          : 0;
        await refreshMessageStream(distanceFromBottom < 140);
      } catch (error) {
        console.warn("realtime message refresh failed", error);
      }
    })
    .subscribe();

  cleanupCurrentPage = () => {
    if (detachPasteUpload) detachPasteUpload();
    if (messageChannel) {
      db.removeChannel(messageChannel);
      messageChannel = null;
    }
  };

  refreshTimer = setInterval(async () => {
    try {
      if (routePath() !== `/group/${groupId}`) return;
      passiveRefreshes += 1;
      if (passiveRefreshes % 5 === 0) {
        await paint(false);
        return;
      }
      const currentScroll = document.getElementById("chatScroll");
      if (currentScroll) {
        const distanceFromBottom = currentScroll.scrollHeight - currentScroll.scrollTop - currentScroll.clientHeight;
        if (distanceFromBottom > 120) return;
      }
      await refreshMessageStream(true);
    } catch (error) {
      console.warn("message refresh failed", error);
    }
  }, 30000);
}

function bindReadyUnlockButton() {
  const button = document.getElementById("unlockReadyBtn");
  if (!button) return;
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "解锁中";
    const { error } = await db.rpc("unlock_ready_stage");
    if (error) {
      button.disabled = false;
      button.textContent = "解锁 Ready";
      const needsSql = /function .*unlock_ready_stage|Could not find the function/i.test(error.message);
      alert(needsSql ? "还需要在 Supabase 里重新运行 supabase/schema.sql，才能启用 Ready 解锁。" : error.message);
      return;
    }
    profile = null;
    await ensureProfile();
    await syncActiveChatCircle();
    if (routePath() === "/home") await renderRoute();
    else go("/home");
  });
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
      if (routePath() === "/home") await renderRoute();
    });
  });
}

window.addEventListener("hashchange", renderRoute);
init();
