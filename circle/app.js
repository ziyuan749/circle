/* global supabase */

const config = window.APP_CONFIG || {};
const app = document.getElementById("app");

let db = null;
let session = null;
let user = null;
let profile = null;
let activeChatCircle = null;
let refreshTimer = null;

const chatTopics = [
  ["Spring Week 申请 Circle", "网申、简历、HireVue、第一段经历包装。"],
  ["投行 Summer 申请 Circle", "technical、networking、面试复盘和申请节奏。"],
  ["投资研究 Circle", "公司研究、行业判断、股票 pitch 和研究框架。"],
  ["咨询 Case 训练 Circle", "case partner、market sizing、profitability 和复盘。"],
  ["AI 产品求职 Circle", "产品 sense、作品集、冷启动和 AI 应用讨论。"],
  ["创业探索 Circle", "想法验证、用户访谈、MVP 和找队友。"]
];

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

function routePath() {
  const raw = location.hash.replace(/^#/, "") || "/home";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function go(path) {
  location.hash = path;
}

function level(value = 1) {
  return `L${Number(value || 1)}`;
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

function layout(content, options = {}) {
  const logged = Boolean(user);
  app.innerHTML = `
    <div class="app-frame ${options.full ? "full" : ""}">
      ${options.hideNav ? "" : `
        <header class="topbar">
          <a class="brand" href="#/home">circle</a>
          <nav class="main-nav">
            ${logged ? nav("/home", "今日") : ""}
            ${logged ? `<a class="nav-item ${routePath().startsWith("/chat") || routePath().startsWith("/group") ? "active" : ""}" href="#${chatHomePath()}">聊天 Circle</a>` : ""}
            ${logged ? nav("/tasks", "任务") : ""}
            ${logged ? nav("/mine", "我的") : ""}
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
    if (path === "/tasks") return pageTasks();
    if (path === "/mine") return pageMine();
    if (path === "/profile") return pageProfile();
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
        <p class="eyebrow">career network with levels</p>
        <h1>小圈子，高密度，围绕目标成长。</h1>
        <p>circle 把求职社交拆成长期聊天 Circle 和短期任务 Circle。每个圈最多 6 人，同层匹配，高层可以观察低层并发出升级邀请。</p>
        <div class="rule-strip">
          <span>6 人小圈</span>
          <span>同层聊天</span>
          <span>同级任务</span>
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
  const [mine, invites, subs] = await Promise.all([memberships(), pendingInvites(), mySubmissions(5)]);
  const chat = mine.find(m => m.groups?.circle_type === "exploration")?.groups;
  const taskCircles = mine.filter(m => m.groups?.circle_type === "task");

  layout(`
    <section class="hero-panel">
      <div>
        <p class="eyebrow">你的求职层级</p>
        <h1>${level(profile.level)} · ${h(profile.direction || "未设置方向")}</h1>
        <p>${h(profile.bio || "先选择一个长期聊天 Circle，再用任务 Circle 打出可展示成果。")}</p>
      </div>
      <div class="hero-actions">
        <a class="primary-btn" href="#${chatHomePath()}">${chat ? "进入聊天 Circle" : "选择聊天 Circle"}</a>
        <a class="secondary-btn" href="#/tasks">看同级任务</a>
      </div>
    </section>

    <section class="metrics">
      <div><strong>${chat ? "1" : "0"}</strong><span>长期聊天 Circle</span></div>
      <div><strong>${taskCircles.length}</strong><span>进行中任务 Circle</span></div>
      <div><strong>${subs.length}</strong><span>主页成果</span></div>
      <div><strong>${invites.length}</strong><span>升级邀请</span></div>
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
        ${chat ? circleCard(chat, "这是你唯一的长期聊天圈。建议持续沉淀关系，而不是频繁切换。") : `
          <p class="muted">你还没有聊天 Circle。每个人只能加入一个，避免同时加入多个圈水群。</p>
        `}
      </div>
      <div class="panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">task circles</p>
            <h2>同级任务</h2>
          </div>
          <a class="text-btn" href="#/tasks">进入</a>
        </div>
        ${taskCircles.slice(0, 3).map(m => circleCard(m.groups, m.groups.task?.title || "")).join("") || `<p class="muted">当前没有进行中的任务 Circle。</p>`}
      </div>
    </section>

    ${invites.length ? `
      <section class="panel">
        <div class="section-head"><h2>升级邀请</h2></div>
        <div class="list">
          ${invites.map(invite => `
            <article class="list-item">
              <span class="pill good">${level(invite.from_level)} → ${level(invite.target_level)}</span>
              <h3>${h(invite.inviter?.display_name || "高层用户")} 邀请你进入上一层</h3>
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

async function pageChatLobby() {
  if (!(await requireUser())) return;
  const mine = await memberships();
  const chat = mine.find(m => m.groups?.circle_type === "exploration")?.groups;

  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">one active chat circle</p>
        <h1>选择一个长期聊天 Circle</h1>
        <p>你当前是 ${level(profile.level)}。聊天 Circle 只匹配同层用户，每个人只能加入 1 个。</p>
      </div>
      ${chat ? `<a class="primary-btn" href="#/group/${chat.id}">进入我的聊天 Circle</a>` : ""}
    </section>

    ${chat ? notice(`你已经在「${chat.name}」。如果要换方向，需要先进入当前 Circle 并退出。`) : ""}

    <section class="card-grid">
      ${chatTopics.map(([topic, desc]) => `
        <article class="panel topic-card">
          <div class="pill-row">
            <span class="pill warm">聊天 Circle</span>
            <span class="pill good">${level(profile.level)}</span>
            <span class="pill">最多 6 人</span>
          </div>
          <h2>${h(topic)}</h2>
          <p>${h(desc)}</p>
          <button class="primary-btn joinChat" data-topic="${h(topic)}" ${chat ? "disabled" : ""}>${chat ? "已有聊天 Circle" : "加入"}</button>
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
        go(`/group/${data}`);
      }
    });
  });
}

async function pageTasks() {
  if (!(await requireUser())) return;
  const { data: tasks, error } = await db
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .eq("level", profile.level)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const cards = [];
  for (const task of tasks || []) {
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
          <button class="primary-btn joinTask" data-id="${task.id}">加入同级任务</button>
          <span class="muted">${groupCount.count || 0} 个 Circle</span>
        </div>
      </article>
    `);
  }

  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">level-matched tasks</p>
        <h1>${level(profile.level)} 任务广场</h1>
        <p>任务只按同层级开放，避免 senior 和 junior 做同一难度任务导致体验失衡。</p>
      </div>
    </section>
    <section class="card-grid">
      ${cards.join("") || `<div class="panel">${notice("当前层级还没有开放任务。可以先在聊天 Circle 里沉淀，等待新任务或升级邀请。")}</div>`}
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
        button.textContent = "加入同级任务";
      } else {
        go(`/work/${data}`);
      }
    });
  });
}

async function pageMine() {
  if (!(await requireUser())) return;
  const mine = await memberships();
  const chat = mine.filter(m => m.groups?.circle_type === "exploration");
  const tasks = mine.filter(m => m.groups?.circle_type === "task");
  layout(`
    <section class="hero-panel compact-hero">
      <div>
        <p class="eyebrow">your circles</p>
        <h1>我的 Circle</h1>
        <p>聊天 Circle 是长期关系，任务 Circle 是短期成果。两者分开，路径更清楚。</p>
      </div>
    </section>
    <section class="two-col">
      <div class="panel">
        <h2>长期聊天 Circle</h2>
        ${chat.map(m => circleCard(m.groups, "长期求职社交圈")).join("") || `<p class="muted">还没有聊天 Circle。</p><a class="primary-btn" href="#/chat">去选择</a>`}
      </div>
      <div class="panel">
        <h2>任务 Circle</h2>
        ${tasks.map(m => circleCard(m.groups, m.groups.task?.title || "")).join("") || `<p class="muted">还没有任务 Circle。</p><a class="primary-btn" href="#/tasks">去任务广场</a>`}
      </div>
    </section>
  `);
}

async function pageProfile() {
  if (!(await requireUser())) return;
  const [mine, subs, invites] = await Promise.all([memberships(), mySubmissions(), pendingInvites()]);
  const { count: messageCount } = await db.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  layout(`
    <section class="profile-head panel">
      <div class="avatar-large">${h((profile.display_name || user.email || "C").slice(0, 1))}</div>
      <div>
        <p class="eyebrow">public profile</p>
        <h1>${h(profile.display_name || "未命名用户")}</h1>
        <p>${level(profile.level)} · ${h(profile.stage)} · ${h(profile.direction)}</p>
        <p>${h(profile.bio || "还没有填写介绍。")}</p>
        <a class="secondary-btn" href="#/onboarding">编辑资料</a>
      </div>
    </section>
    <section class="metrics">
      <div><strong>${mine.length}</strong><span>Circle</span></div>
      <div><strong>${messageCount || 0}</strong><span>发言</span></div>
      <div><strong>${subs.length}</strong><span>成果</span></div>
      <div><strong>${invites.length}</strong><span>升级邀请</span></div>
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
        <label>阶段
          <select name="stage">
            ${["Freshman", "Sophomore", "Junior", "Master", "Working", "Other"].map(stage => `<option ${profile.stage === stage ? "selected" : ""}>${stage}</option>`).join("")}
          </select>
        </label>
        <label>方向<input name="direction" value="${h(profile.direction || "")}" placeholder="投行 / 咨询 / 股票研究 / AI 产品"></label>
        <label>一句话介绍<textarea name="bio" rows="5" placeholder="你想在 circle 里练什么、找什么样的人？">${h(profile.bio || "")}</textarea></label>
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
      bio: String(fd.get("bio") || "").trim()
    };
    const { data, error } = await db.from("profiles").update(payload).eq("id", user.id).select("*").single();
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
        ` : notice("你可以查看同级提交墙，但不是这个 Circle 成员，不能提交。")}
      </div>
      <aside class="panel">
        <h2>同级提交墙</h2>
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
    if (!force && document.activeElement?.matches?.("#messageInput")) return;
    const [members, messages] = await Promise.all([readMembers(), readMessages()]);
    const isMember = members.some(m => m.user_id === user.id);
    const topic = group.circle_type === "task" ? group.task?.title : group.topic;
    layout(`
      <section class="wechat">
        <header class="chat-top">
          <a href="#/mine" class="back-link">‹ 退出</a>
          <div>
            <h1>${h(group.name)}</h1>
            <p>${members.length}/${group.max_members} · ${h(topic || "")}</p>
          </div>
          <button class="icon-btn" id="moreBtn" type="button">•••</button>
        </header>
        <div class="chat-menu" id="chatMenu" hidden>
          <div class="pill-row">
            <span class="pill ${group.circle_type === "task" ? "dark" : "warm"}">${circleTypeName(group.circle_type)}</span>
            <span class="pill good">${level(group.level)}</span>
          </div>
          ${group.circle_type === "task" ? `<a href="#/work/${groupId}">任务工作台</a>` : ""}
          <button id="toggleMembers" type="button">展开成员与升级邀请</button>
          ${isMember ? `<button id="leaveGroup" class="danger" type="button">${group.circle_type === "task" ? "退出任务 Circle" : "退出长期聊天 Circle"}</button>` : ""}
        </div>
        <div class="chat-note">
          ${group.circle_type === "task"
            ? `任务：${h(group.task?.deliverable || "提交小组成果。")} <a href="#/work/${groupId}">去提交</a>`
            : "长期聊天 Circle：这里是主要关系沉淀区，建议保持稳定参与。"}
        </div>
        <div class="member-drawer" id="memberDrawer" hidden>
          ${members.map(m => `
            <article>
              <div><strong>${h(m.profiles?.display_name || "用户")}</strong><span>${level(m.profiles?.level)} · ${h(m.profiles?.direction || "")}</span></div>
              ${profile.level > (m.profiles?.level || 1) && m.user_id !== user.id ? `<button class="secondary-btn inviteUp" data-user="${m.user_id}">邀请升级</button>` : ""}
            </article>
          `).join("")}
        </div>
        <div class="chat-scroll" id="chatScroll">
          ${messages.map(msg => `
            <div class="bubble-line ${msg.user_id === user.id ? "mine" : ""}">
              <div class="chat-avatar">${h((msg.profiles?.display_name || "C").slice(0, 1))}</div>
              <div>
                <div class="bubble-meta">${h(msg.profiles?.display_name || "用户")} · ${time(msg.created_at)}</div>
                <div class="bubble">${h(msg.content)}</div>
              </div>
            </div>
          `).join("") || `<p class="empty">还没有消息。</p>`}
        </div>
        <footer class="composer">
          ${isMember ? `
            <form id="messageForm">
              <textarea id="messageInput" name="content" rows="1" placeholder="输入消息，Enter 发送"></textarea>
              <button class="primary-btn" type="submit">发送</button>
            </form>
          ` : notice("你能查看这个 Circle，但不是成员，不能发言。")}
        </footer>
      </section>
    `, { full: true, hideNav: true });

    const scroll = document.getElementById("chatScroll");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    const more = document.getElementById("moreBtn");
    const menu = document.getElementById("chatMenu");
    if (more && menu) more.addEventListener("click", () => menu.hidden = !menu.hidden);
    const toggle = document.getElementById("toggleMembers");
    const drawer = document.getElementById("memberDrawer");
    if (toggle && drawer) toggle.addEventListener("click", () => drawer.hidden = !drawer.hidden);

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
          go("/mine");
        }
      });
    }

    const form = document.getElementById("messageForm");
    if (form) {
      const send = async () => {
        const content = String(new FormData(form).get("content") || "").trim();
        if (!content) return;
        const { error: sendError } = await db.from("messages").insert({ group_id: groupId, user_id: user.id, content });
        if (sendError) alert(sendError.message);
        else {
          form.reset();
          await paint(true);
        }
      };
      form.addEventListener("submit", async e => {
        e.preventDefault();
        await send();
      });
      document.getElementById("messageInput").addEventListener("keydown", async e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          await send();
        }
      });
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
