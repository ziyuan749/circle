/* global supabase */

const config = window.APP_CONFIG || {};
const appEl = document.getElementById("app");

let client = null;
let session = null;
let user = null;
let profile = null;
let currentGroupTimer = null;
let activeExploreGroup = null;

function isConfigured() {
  return (
    config.SUPABASE_URL &&
    config.SUPABASE_PUBLISHABLE_KEY &&
    !config.SUPABASE_URL.includes("你的项目id") &&
    !config.SUPABASE_PUBLISHABLE_KEY.includes("你的")
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return value;
  }
}

function setHash(path) {
  location.hash = path;
}

function getRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function navLink(path, label) {
  const active = getRoute() === path || (path !== "/" && getRoute().startsWith(path));
  return `<a class="nav-link ${active ? "active" : ""}" href="#${path}">${label}</a>`;
}

function chatCirclePath() {
  return activeExploreGroup?.id ? `/groups/${activeExploreGroup.id}` : "/explore";
}

function shell(content) {
  const logged = Boolean(user);
  return `
    <div class="app-shell">
      <header class="nav">
        <div class="brand"><a href="#/dashboard">circle</a></div>
        <nav class="nav-links">
          ${logged ? navLink("/dashboard", "Dashboard") : ""}
          ${logged ? navLink(chatCirclePath(), "聊天 Circle") : ""}
          ${logged ? navLink("/tasks", "任务 Circle") : ""}
          ${logged ? navLink("/my-circles", "我的 Circle") : ""}
          ${logged ? navLink("/profile", "Profile") : ""}
          ${logged ? `<button class="btn" id="logoutBtn">退出登录</button>` : navLink("/login", "登录")}
        </nav>
      </header>
      <main class="container">${content}</main>
    </div>
  `;
}

function render(content) {
  appEl.innerHTML = shell(content);
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
}

function showNotice(message, type = "") {
  return `<div class="notice ${type}">${escapeHtml(message)}</div>`;
}

function levelLabel(level) {
  return `L${Number(level || 1)}`;
}

async function loadPendingInvites() {
  try {
    const { data, error } = await client
      .from("promotion_invites")
      .select(`
        id,
        from_level,
        target_level,
        reason,
        created_at,
        inviter:inviter_id (display_name),
        groups:group_id (id, name, circle_type, topic)
      `)
      .eq("invitee_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("promotion_invites unavailable", err);
    return [];
  }
}

async function loadMySubmissions() {
  try {
    const { data, error } = await client
      .from("task_submissions")
      .select(`
        id,
        title,
        submission_url,
        created_at,
        tasks:task_id (title, category, level),
        groups:group_id (id, name)
      `)
      .eq("submitted_by", user.id)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("task_submissions unavailable", err);
    return [];
  }
}

async function loadTaskSubmissions(taskId) {
  if (!taskId) return [];
  try {
    const { data, error } = await client
      .from("task_submissions")
      .select(`
        id,
        title,
        content,
        submission_url,
        created_at,
        submitted_by,
        groups:group_id (id, name, level),
        profiles:submitted_by (display_name)
      `)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("task_submissions unavailable", err);
    return [];
  }
}

async function ensureProfile() {
  if (!user) return null;
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    profile = data;
    return data;
  }

  const { data: inserted, error: insertError } = await client
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email,
      display_name: user.email?.split("@")[0] || "新用户",
      direction: "未设置方向",
      stage: "未设置阶段",
      bio: ""
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  profile = inserted;
  return inserted;
}

async function syncActiveExploreGroup() {
  if (!user || !client) {
    activeExploreGroup = null;
    return null;
  }

  try {
    const { data, error } = await client
      .from("group_members")
      .select(`
        groups:group_id (
          id,
          name,
          circle_type,
          topic,
          level,
          status
        )
      `)
      .eq("user_id", user.id)
      .eq("status", "active");
    if (error) throw error;
    const membership = (data || []).find(m => m.groups?.circle_type === "exploration");
    activeExploreGroup = membership?.groups || null;
    return activeExploreGroup;
  } catch (err) {
    console.warn("active exploration circle unavailable", err);
    activeExploreGroup = null;
    return null;
  }
}

async function bootstrap() {
  if (!isConfigured()) {
    appEl.innerHTML = `
      <div class="container">
        <div class="hero">
          <h1>还没有配置 Supabase</h1>
          <p>打开 <code>config.js</code>，填入你的 Supabase Project URL 和 Publishable key。</p>
          <div class="notice">
            注意：Project URL 不要带 <code>/rest/v1/</code>。
          </div>
        </div>
      </div>
    `;
    return;
  }

  client = supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
  const { data } = await client.auth.getSession();
  session = data.session;
  user = session?.user || null;
  if (user) {
    try {
      await ensureProfile();
      await syncActiveExploreGroup();
    } catch (err) {
      console.error(err);
    }
  }

  client.auth.onAuthStateChange(async (_event, newSession) => {
    session = newSession;
    user = newSession?.user || null;
    profile = null;
    activeExploreGroup = null;
    if (user) {
      await ensureProfile();
      await syncActiveExploreGroup();
    }
    route();
  });

  route();
}

async function requireLogin() {
  if (!user) {
    setHash("/login");
    return false;
  }
  if (!profile) await ensureProfile();
  return true;
}

async function route() {
  if (currentGroupTimer) {
    clearInterval(currentGroupTimer);
    currentGroupTimer = null;
  }

  const path = getRoute();
  try {
    if (path === "/" || path === "/dashboard") return pageDashboard();
    if (path === "/login") return pageLogin();
    if (path === "/onboarding") return pageOnboarding();
    if (path === "/tasks") return pageTasks();
    if (path === "/explore") return pageExplore();
    if (path === "/my-circles") return pageMyCircles();
    if (path === "/profile") return pageProfile();
    if (path.startsWith("/workbench/")) return pageTaskWorkbench(path.split("/")[2]);
    if (path.startsWith("/groups/")) return pageGroup(path.split("/")[2]);
    return pageDashboard();
  } catch (err) {
    console.error(err);
    render(showNotice(err.message || String(err), "error"));
  }
}

async function pageLogin() {
  render(`
    <div class="grid grid-2">
      <div class="hero">
        <h1>任务驱动的职业 Circle</h1>
        <p>聊天型 Circle 帮 freshman 找同类；任务型 Circle 帮有方向的人围绕具体任务自动组队。</p>
        <div class="badge-row">
          <span class="badge dark">Exploration Circle</span>
          <span class="badge dark">Task Circle</span>
          <span class="badge dark">人数受控</span>
        </div>
      </div>
      <div class="card">
        <h2>登录 / 注册</h2>
        <p>用邮箱和密码登录。如果没有账号，点注册。</p>
        <form class="form" id="loginForm">
          <div class="field">
            <label>邮箱</label>
            <input class="input" name="email" type="email" required placeholder="you@example.com" />
          </div>
          <div class="field">
            <label>密码</label>
            <input class="input" name="password" type="password" required placeholder="至少 6 位" />
          </div>
          <div class="actions">
            <button class="btn primary" type="submit" data-action="login">登录</button>
            <button class="btn" type="button" id="signupBtn">注册</button>
          </div>
          <div id="loginMsg"></div>
        </form>
      </div>
    </div>
  `);

  const form = document.getElementById("loginForm");
  const msg = document.getElementById("loginMsg");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = fd.get("email");
    const password = fd.get("password");
    msg.innerHTML = "登录中...";
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) msg.innerHTML = showNotice(error.message, "error");
    else setHash("/dashboard");
  });

  document.getElementById("signupBtn").addEventListener("click", async () => {
    const fd = new FormData(form);
    const email = fd.get("email");
    const password = fd.get("password");
    msg.innerHTML = "注册中...";
    const { error } = await client.auth.signUp({ email, password });
    if (error) msg.innerHTML = showNotice(error.message, "error");
    else msg.innerHTML = showNotice("注册成功。如果 Supabase 开启了邮箱确认，请先去邮箱确认；如果未开启，会自动登录。", "success");
  });
}

async function logout() {
  await client.auth.signOut();
  setHash("/login");
}

async function pageDashboard() {
  if (!(await requireLogin())) return;
  const [pendingInvites, submissions] = await Promise.all([
    loadPendingInvites(),
    loadMySubmissions()
  ]);

  const { count: activeCircleCount } = await client
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active");

  const { count: messageCount } = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  render(`
    <div class="hero">
      <h1>Dashboard</h1>
      <p>${escapeHtml(profile.display_name || "未命名用户")} · ${levelLabel(profile.level)} · ${escapeHtml(profile.direction || "未设置方向")}</p>
      <div class="actions">
        <a class="btn primary" href="#/tasks">加入任务 Circle</a>
        <a class="btn" href="#${chatCirclePath()}">${activeExploreGroup ? "进入聊天 Circle" : "加入聊天 Circle"}</a>
        <a class="btn" href="#/onboarding">编辑资料</a>
      </div>
    </div>

    <div class="stat-row" style="margin-top:18px">
      <div class="stat"><strong>${activeCircleCount || 0}</strong><span class="small">当前 Circle</span></div>
      <div class="stat"><strong>${messageCount || 0}</strong><span class="small">累计发言</span></div>
      <div class="stat"><strong>${levelLabel(profile.level)}</strong><span class="small">当前等级</span></div>
      <div class="stat"><strong>${pendingInvites.length}</strong><span class="small">升级邀请</span></div>
    </div>

    <div class="grid grid-2" style="margin-top:18px">
      <div class="card">
        <h2>聊天型 Circle</h2>
        <p>只和同层级的人进入同一个聊天 Circle，高层可以观察低层讨论并发出升级邀请。</p>
        <a class="btn primary" href="#${chatCirclePath()}">${activeExploreGroup ? "进入我的聊天 Circle" : "进入聊天 Circle"}</a>
      </div>
      <div class="card">
        <h2>任务型 Circle</h2>
        <p>任务按等级分发。你当前只能加入 ${levelLabel(profile.level)} 任务，避免不同水平的人做同一难度任务。</p>
        <a class="btn primary" href="#/tasks">进入任务大厅</a>
      </div>
    </div>

    ${pendingInvites.length ? `
      <div class="card" style="margin-top:18px">
        <h2>待处理升级邀请</h2>
        <div class="list">
          ${pendingInvites.map(invite => `
            <div class="item">
              <div class="badge-row">
                <span class="badge green">${levelLabel(invite.from_level)} → ${levelLabel(invite.target_level)}</span>
                <span class="badge">${fmtDate(invite.created_at)}</span>
              </div>
              <strong>${escapeHtml(invite.inviter?.display_name || "高层用户")} 邀请你升级</strong>
              <p>${escapeHtml(invite.reason)}</p>
              <div class="actions">
                <button class="btn primary resolve-invite" data-invite-id="${invite.id}" data-accept="true">接受升级</button>
                <button class="btn resolve-invite" data-invite-id="${invite.id}" data-accept="false">暂不接受</button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}

    ${submissions.length ? `
      <div class="card" style="margin-top:18px">
        <h2>最近成就</h2>
        <div class="list">
          ${submissions.slice(0, 3).map(sub => `
            <div class="item">
              <div class="badge-row">
                <span class="badge dark">${levelLabel(sub.tasks?.level)}</span>
                <span class="badge green">已提交</span>
              </div>
              <strong>${escapeHtml(sub.title)}</strong>
              <p class="small">${escapeHtml(sub.tasks?.title || "任务")} · ${fmtDate(sub.created_at)}</p>
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}
  `);

  document.querySelectorAll(".resolve-invite").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const inviteId = btn.getAttribute("data-invite-id");
      const accept = btn.getAttribute("data-accept") === "true";
      const { error } = await client.rpc("resolve_promotion_invite", {
        p_invite_id: inviteId,
        p_accept: accept
      });
      if (error) alert(error.message);
      else {
        profile = null;
        await ensureProfile();
        await pageDashboard();
      }
    });
  });
}

async function pageOnboarding() {
  if (!(await requireLogin())) return;
  render(`
    <div class="card">
      <h1>编辑资料</h1>
      <p>这里是资料编辑页。退出登录已经移到顶部导航栏。</p>
      <form class="form" id="profileForm">
        <div class="field">
          <label>昵称</label>
          <input class="input" name="display_name" value="${escapeHtml(profile.display_name || "")}" />
        </div>
        <div class="field">
          <label>当前阶段</label>
          <select class="select" name="stage">
            ${["Freshman", "Sophomore", "Junior", "Master", "Working", "Other"].map(v => `<option ${profile.stage === v ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>目标方向</label>
          <input class="input" name="direction" value="${escapeHtml(profile.direction || "")}" placeholder="投行 / 咨询 / 股票研究 / AI 产品 / 创业" />
        </div>
        <div class="field">
          <label>一句话介绍</label>
          <textarea class="textarea" name="bio" placeholder="你正在探索什么？想通过 Circle 练什么？">${escapeHtml(profile.bio || "")}</textarea>
        </div>
        <div class="actions">
          <button class="btn primary" type="submit">保存</button>
          <a class="btn" href="#/profile">返回 Profile</a>
        </div>
        <div id="profileMsg"></div>
      </form>
    </div>
  `);

  document.getElementById("profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      display_name: fd.get("display_name"),
      stage: fd.get("stage"),
      direction: fd.get("direction"),
      bio: fd.get("bio")
    };
    const { data, error } = await client
      .from("profiles")
      .update(payload)
      .eq("id", user.id)
      .select("*")
      .single();
    const msg = document.getElementById("profileMsg");
    if (error) msg.innerHTML = showNotice(error.message, "error");
    else {
      profile = data;
      msg.innerHTML = showNotice("已保存", "success");
    }
  });
}

async function pageTasks() {
  if (!(await requireLogin())) return;
  const { data: tasks, error } = await client
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .eq("level", profile.level || 1)
    .order("created_at", { ascending: false });
  if (error) {
    render(`
      <div class="hero">
        <h1>任务 Circle</h1>
        <p>任务分层功能需要先在 Supabase 运行新版 <code>supabase/schema.sql</code>。</p>
      </div>
      ${showNotice(error.message, "error")}
    `);
    return;
  }

  let cards = "";
  for (const task of tasks || []) {
    const [{ count: groupCount }, submissions] = await Promise.all([
      client
      .from("groups")
      .select("id", { count: "exact", head: true })
        .eq("task_id", task.id),
      loadTaskSubmissions(task.id)
    ]);

    cards += `
      <div class="card compact">
        <div class="badge-row">
          <span class="badge dark">任务型</span>
          <span class="badge green">${levelLabel(task.level)}</span>
          <span class="badge">${escapeHtml(task.category)}</span>
          <span class="badge">${task.group_size} 人 / 组</span>
          <span class="badge">${task.duration_days} 天</span>
        </div>
        <h3>${escapeHtml(task.title)}</h3>
        <p>${escapeHtml(task.description)}</p>
        <div class="notice"><strong>交付物：</strong>${escapeHtml(task.deliverable || "提交小组结论。")}</div>
        <p class="small">已生成 Circle：${groupCount || 0} · 已提交：${submissions.length}</p>
        ${submissions.length ? `
          <div class="mini-board">
            ${submissions.slice(0, 3).map((sub, index) => `
              <div class="rank-row">
                <strong>#${index + 1}</strong>
                <span>${escapeHtml(sub.groups?.name || "Circle")}</span>
                <em>${fmtDate(sub.created_at)}</em>
              </div>
            `).join("")}
          </div>
        ` : ""}
        <div class="actions">
          <button class="btn primary join-task" data-task-id="${task.id}">加入任务</button>
        </div>
      </div>
    `;
  }

  render(`
    <div class="hero">
      <h1>任务 Circle</h1>
      <p>你当前是 ${levelLabel(profile.level)}。这里只显示同层级任务，提交也只在同级 Circle 之间展示。</p>
    </div>
    <div class="grid grid-2" style="margin-top:18px">
      ${cards || `<div class="card">当前等级还没有开放任务。可以先加入聊天 Circle，或等待高层邀请升级。</div>`}
    </div>
  `);

  document.querySelectorAll(".join-task").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "加入中...";
      const taskId = btn.getAttribute("data-task-id");
      const { data, error } = await client.rpc("join_task_circle", { p_task_id: taskId });
      if (error) {
        alert(error.message);
        btn.disabled = false;
        btn.textContent = "加入任务";
      } else {
        setHash(`/groups/${data}`);
      }
    });
  });
}

async function pageExplore() {
  if (!(await requireLogin())) return;
  const memberships = await getMyMemberships();
  const activeExplore = memberships.find(m => m.groups?.circle_type === "exploration");
  const currentLevel = profile?.level || 1;
  const topics = [
    {
      topic: "Spring Week 申请 Circle",
      description: "适合准备 Spring Week 的同层用户。聊网申、HireVue、简历和第一段经历包装。"
    },
    {
      topic: "投行 Summer 申请 Circle",
      description: "围绕投行 summer internship 准备节奏、technical、networking 和面试复盘交流。"
    },
    {
      topic: "投资研究 Circle",
      description: "围绕公司研究、行业判断、股票 pitch 和研究框架交流。"
    },
    {
      topic: "咨询 Case 训练 Circle",
      description: "围绕 market sizing、profitability、market entry 和 case partner 匹配交流。"
    }
  ];

  render(`
    <div class="hero">
      <h1>聊天 Circle</h1>
      <p>你当前是 ${levelLabel(currentLevel)}。聊天 Circle 只匹配同层级用户，并且每个人同时只能加入 1 个聊天 Circle。</p>
      ${activeExplore ? `
        <div class="notice">
          你已经在 <strong>${escapeHtml(activeExplore.groups.name)}</strong>。如果想换方向，请先进入当前 Circle 后退出。
          <div class="actions">
            <a class="btn primary" href="#/groups/${activeExplore.groups.id}">进入当前聊天 Circle</a>
          </div>
        </div>
      ` : `<div class="notice">选择一个你最想认真投入的方向。聊天 Circle 是主战场，不适合同时加入多个水群。</div>`}
    </div>
    <div class="grid grid-2" style="margin-top:18px">
      ${topics.map(t => `
        <div class="card compact">
          <div class="badge-row">
            <span class="badge dark">聊天型</span>
            <span class="badge green">${levelLabel(currentLevel)}</span>
            <span class="badge green">最多 6 人</span>
          </div>
          <h3>${escapeHtml(t.topic)}</h3>
          <p>${escapeHtml(t.description)}</p>
          <div class="actions">
            <button class="btn primary join-explore" data-topic="${escapeHtml(t.topic)}" ${activeExplore ? "disabled" : ""}>${activeExplore ? "已有聊天 Circle" : "加入这个 Circle"}</button>
          </div>
        </div>
      `).join("")}
    </div>
  `);

  document.querySelectorAll(".join-explore").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "加入中...";
      const topic = btn.getAttribute("data-topic");
      const { data, error } = await client.rpc("join_exploration_circle", {
        p_topic: topic,
        p_level: currentLevel
      });
      if (error) {
        alert(error.message);
        btn.disabled = false;
        btn.textContent = "加入这个 Circle";
      } else {
        await syncActiveExploreGroup();
        setHash(`/groups/${data}`);
      }
    });
  });
}

async function getMyMemberships() {
  const { data, error } = await client
    .from("group_members")
    .select(`
      id,
      joined_at,
      role,
      status,
      groups:group_id (
        id,
        name,
        circle_type,
        topic,
        level,
        max_members,
        status,
        task:task_id (id, title, category, level, duration_days, deliverable, score_max)
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function pageMyCircles() {
  if (!(await requireLogin())) return;
  const memberships = await getMyMemberships();
  render(`
    <div class="hero">
      <h1>我的 Circle</h1>
      <p>这里显示你当前加入的聊天型 Circle 和任务型 Circle。</p>
    </div>
    <div class="list" style="margin-top:18px">
      ${memberships.map(m => {
        const g = m.groups;
        return `
          <div class="item">
            <div class="badge-row">
              <span class="badge ${g.circle_type === "task" ? "dark" : "orange"}">${g.circle_type === "task" ? "任务型" : "聊天型"}</span>
              <span class="badge green">${levelLabel(g.level)}</span>
              <span class="badge">${escapeHtml(g.status)}</span>
            </div>
            <h3>${escapeHtml(g.name)}</h3>
            <p>${escapeHtml(g.circle_type === "task" ? g.task?.title : g.topic)}</p>
            <div class="actions">
              <a class="btn primary" href="#/groups/${g.id}">进入讨论</a>
              ${g.circle_type === "task" ? `<a class="btn" href="#/workbench/${g.id}">任务工作台</a>` : ""}
            </div>
          </div>
        `;
      }).join("") || `<div class="card">你还没有加入 Circle。<div class="actions"><a class="btn primary" href="#/tasks">去任务大厅</a><a class="btn" href="#${chatCirclePath()}">去聊天 Circle</a></div></div>`}
    </div>
  `);
}

async function pageProfile() {
  if (!(await requireLogin())) return;
  const [memberships, submissions, pendingInvites] = await Promise.all([
    getMyMemberships(),
    loadMySubmissions(),
    loadPendingInvites()
  ]);
  const { count: messageCount } = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data: recentMessages } = await client
    .from("messages")
    .select("id, content, created_at, groups:group_id (id, name, circle_type)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  render(`
    <div class="grid grid-2">
      <div class="card">
        <h1>${escapeHtml(profile.display_name || "未命名用户")}</h1>
        <p>${levelLabel(profile.level)} · ${escapeHtml(profile.stage || "未设置阶段")} · ${escapeHtml(profile.direction || "未设置方向")}</p>
        <p>${escapeHtml(profile.bio || "还没有填写一句话介绍。")}</p>
        <div class="actions">
          <a class="btn primary" href="#/onboarding">编辑资料</a>
        </div>
      </div>
      <div class="card">
        <h2>贡献概览</h2>
        <div class="stat-row">
          <div class="stat"><strong>${memberships.length}</strong><span class="small">当前 Circle</span></div>
          <div class="stat"><strong>${messageCount || 0}</strong><span class="small">累计发言</span></div>
          <div class="stat"><strong>${submissions.length}</strong><span class="small">任务成果</span></div>
          <div class="stat"><strong>${pendingInvites.length}</strong><span class="small">升级邀请</span></div>
        </div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:18px">
      <div class="card">
        <h2>当前 Circle</h2>
        <div class="list">
          ${memberships.map(m => `
            <div class="item">
              <strong>${escapeHtml(m.groups.name)}</strong>
              <p class="small">${m.groups.circle_type === "task" ? "任务型" : "聊天型"} · ${levelLabel(m.groups.level)} · ${fmtDate(m.joined_at)}</p>
              <div class="actions">
                <a class="btn" href="#/groups/${m.groups.id}">进入讨论</a>
                ${m.groups.circle_type === "task" ? `<a class="btn" href="#/workbench/${m.groups.id}">任务工作台</a>` : ""}
              </div>
            </div>
          `).join("") || `<p>还没有加入 Circle。</p>`}
        </div>
      </div>
      <div class="card">
        <h2>任务成就</h2>
        <div class="list">
          ${submissions.map(sub => `
            <div class="item">
              <div class="badge-row">
                <span class="badge dark">${levelLabel(sub.tasks?.level)}</span>
                <span class="badge green">已提交</span>
              </div>
              <strong>${escapeHtml(sub.title)}</strong>
              <p class="small">${escapeHtml(sub.tasks?.title || "任务")} · ${fmtDate(sub.created_at)}</p>
            </div>
          `).join("") || `<p>还没有任务提交。</p>`}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:18px">
      <h2>最近发言</h2>
      <div class="list">
        ${(recentMessages || []).map(msg => `
          <div class="item">
            <p>${escapeHtml(msg.content).slice(0, 140)}${msg.content.length > 140 ? "..." : ""}</p>
            <p class="small">${escapeHtml(msg.groups?.name || "Circle")} · ${fmtDate(msg.created_at)}</p>
          </div>
        `).join("") || `<p>还没有发言。</p>`}
      </div>
    </div>
  `);
}

async function pageTaskWorkbench(groupId) {
  if (!(await requireLogin())) return;
  if (!groupId) return setHash("/my-circles");

  const { data: group, error } = await client
    .from("groups")
    .select("*, task:task_id (*)")
    .eq("id", groupId)
    .single();
  if (error) throw error;

  if (group.circle_type !== "task") {
    render(`
      <div class="hero">
        <h1>任务工作台</h1>
        <p>这个 Circle 不是任务型 Circle。</p>
      </div>
      <div class="actions">
        <a class="btn" href="#/groups/${groupId}">返回讨论</a>
      </div>
    `);
    return;
  }

  const { data: members, error: memberError } = await client
    .from("group_members")
    .select("id, user_id, status")
    .eq("group_id", groupId)
    .eq("status", "active");
  if (memberError) throw memberError;

  const isMember = (members || []).some(m => m.user_id === user.id);
  const submissions = await loadTaskSubmissions(group.task_id);
  const mySubmission = submissions.find(sub => sub.groups?.id === groupId);

  render(`
    <div class="hero">
      <div class="badge-row">
        <span class="badge dark">任务工作台</span>
        <span class="badge green">${levelLabel(group.level)}</span>
        <span class="badge">${escapeHtml(group.task?.category || "任务")}</span>
      </div>
      <h1>${escapeHtml(group.task?.title || group.name)}</h1>
      <p>${escapeHtml(group.task?.description || "")}</p>
      <div class="actions">
        <a class="btn" href="#/groups/${groupId}">返回讨论</a>
        <a class="btn" href="#/tasks">任务大厅</a>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:18px">
      <section class="card">
        <h2>${mySubmission ? "更新提交" : "提交成果"}</h2>
        <div class="notice"><strong>交付物：</strong>${escapeHtml(group.task?.deliverable || "提交小组结论。")}</div>
        <div class="notice"><strong>交付格式：</strong>${escapeHtml(group.task?.format_guide || "建议格式：结论摘要、关键假设、分析过程、风险和下一步。提交链接可以是 Google Doc、Notion、PDF、Slides 或其他可访问材料。")}</div>
        ${isMember ? `
          <form class="form" id="submissionForm">
            <div class="field">
              <label>标题</label>
              <input class="input" name="title" required value="${escapeHtml(mySubmission?.title || "")}" placeholder="例如：英国茶饮市场进入方案 v1" />
            </div>
            <div class="field">
              <label>提交链接</label>
              <input class="input" name="submission_url" type="url" value="${escapeHtml(mySubmission?.submission_url || "")}" placeholder="https://docs.google.com/..." />
            </div>
            <div class="field">
              <label>提交说明</label>
              <textarea class="textarea tall" name="content" required placeholder="简要说明你们提交链接里的内容、核心结论和分工。">${escapeHtml(mySubmission?.content || "")}</textarea>
            </div>
            <div class="actions">
              <button class="btn primary" type="submit">提交成果</button>
            </div>
            <div id="submissionMsg"></div>
          </form>
        ` : showNotice("你可以查看这个任务提交墙，但不是成员，不能提交。")}
      </section>

      <aside class="card">
        <h2>同级提交墙</h2>
        <div class="mini-board">
          ${submissions.map((sub, index) => `
            <div class="rank-row">
              <strong>#${index + 1}</strong>
              <span>${escapeHtml(sub.groups?.name || "Circle")}</span>
              <em>${fmtDate(sub.created_at)}</em>
            </div>
          `).join("") || `<p class="small">还没有提交。提交后会出现在这里。</p>`}
        </div>
      </aside>
    </div>

    ${submissions.length ? `
      <div class="card" style="margin-top:18px">
        <h2>提交详情</h2>
        <div class="list">
          ${submissions.map((sub, index) => `
            <div class="item">
              <div class="badge-row">
                <span class="badge dark">#${index + 1}</span>
                <span class="badge green">已提交</span>
                <span class="badge">${fmtDate(sub.created_at)}</span>
              </div>
              <h3>${escapeHtml(sub.title)}</h3>
              <p class="small">${escapeHtml(sub.groups?.name || "Circle")} · ${escapeHtml(sub.profiles?.display_name || "提交者")}</p>
              ${sub.submission_url ? `<p><a class="text-link" href="${escapeHtml(sub.submission_url)}" target="_blank" rel="noreferrer">打开提交链接</a></p>` : ""}
              <p>${escapeHtml(sub.content).slice(0, 420)}${sub.content.length > 420 ? "..." : ""}</p>
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}
  `);

  const submissionForm = document.getElementById("submissionForm");
  if (submissionForm) {
    submissionForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(submissionForm);
      const msg = document.getElementById("submissionMsg");
      msg.innerHTML = "提交中...";
      const { error: submitError } = await client.rpc("submit_task_result", {
        p_group_id: groupId,
        p_title: String(fd.get("title") || "").trim(),
        p_content: String(fd.get("content") || "").trim(),
        p_submission_url: String(fd.get("submission_url") || "").trim()
      });
      if (submitError) msg.innerHTML = showNotice(submitError.message, "error");
      else {
        msg.innerHTML = showNotice("已提交成果", "success");
        await pageTaskWorkbench(groupId);
      }
    });
  }
}

async function pageGroup(groupId) {
  if (!(await requireLogin())) return;
  if (!groupId) return setHash("/my-circles");

  const { data: group, error } = await client
    .from("groups")
    .select("*, task:task_id (*)")
    .eq("id", groupId)
    .single();
  if (error) throw error;

  async function loadMembers() {
    const { data, error: mError } = await client
      .from("group_members")
      .select("id, user_id, role, status, joined_at, profiles:user_id (display_name, direction, stage, level)")
      .eq("group_id", groupId)
      .eq("status", "active")
      .order("joined_at", { ascending: true });
    if (mError) throw mError;
    return data || [];
  }

  async function loadMessages() {
    const { data, error: msgError } = await client
      .from("messages")
      .select("id, content, created_at, user_id, profiles:user_id (display_name)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (msgError) throw msgError;
    return data || [];
  }

  async function renderGroup(force = false) {
    if (getRoute() !== `/groups/${groupId}`) return;
    const existingMenu = document.getElementById("chatMoreMenu");
    const activeEl = document.activeElement;
    if (!force && existingMenu && !existingMenu.hidden) return;
    if (!force && activeEl?.matches?.("#messageForm textarea")) return;
    const [members, messages] = await Promise.all([
      loadMembers(),
      loadMessages()
    ]);
    if (getRoute() !== `/groups/${groupId}`) return;
    const isMember = members.some(m => m.user_id === user.id);
    const title = group.circle_type === "task" ? group.task?.title : group.topic;
    render(`
      <div class="discussion-layout">
        <section class="chat-panel">
          <div class="chat-header">
            <a class="chat-top-action" href="#/my-circles">‹ 退出</a>
            <div class="chat-title-block">
              <div class="chat-title-row">
                <h1>${escapeHtml(group.name)}</h1>
              </div>
              <p>${members.length}/${group.max_members} · ${escapeHtml(title || "")}</p>
            </div>
            <div class="chat-more-wrap">
              <button class="chat-more-btn" id="chatMoreBtn" type="button" aria-label="展开">•••</button>
              <div class="chat-more-menu" id="chatMoreMenu" hidden>
                <div class="menu-meta">
                  <span class="badge ${group.circle_type === "task" ? "dark" : "orange"}">${group.circle_type === "task" ? "任务型" : "聊天型"}</span>
                  <span class="badge green">${levelLabel(group.level)}</span>
                </div>
                ${group.circle_type === "task" ? `<a class="menu-item" href="#/workbench/${groupId}">任务工作台</a>` : ""}
                ${isMember && group.circle_type === "task" ? `<button class="menu-item danger-text" id="leaveBtn" type="button">退出 Circle</button>` : ""}
                ${isMember && group.circle_type === "exploration" ? `<button class="menu-item muted-text" id="leaveBtn" type="button">退出这个长期 Circle</button>` : ""}
              </div>
            </div>
          </div>

          <div class="chat-context">
            ${group.circle_type === "task" ? `
              <strong>任务说明：</strong>${escapeHtml(group.task?.description || "")}
              <br><strong>交付物：</strong>${escapeHtml(group.task?.deliverable || "提交小组结论。")}
              <div class="actions">
                <a class="btn primary" href="#/workbench/${groupId}">打开任务工作台</a>
              </div>
            ` : `<strong>长期 Circle：</strong>这是你的主要求职社交圈。建议持续参与一段时间，沉淀关系、复盘进展，再决定是否更换方向。`}
          </div>

          <div id="chatBox" class="chat-box">
            ${messages.map(msg => `
              <div class="message ${msg.user_id === user.id ? "mine" : ""}">
                <div class="avatar">${escapeHtml((msg.profiles?.display_name || "用户").slice(0, 1))}</div>
                <div class="message-stack">
                  <div class="message-head">
                    <span>${escapeHtml(msg.profiles?.display_name || "用户")}</span>
                    <span>${fmtDate(msg.created_at)}</span>
                  </div>
                  <div class="message-bubble">${escapeHtml(msg.content)}</div>
                </div>
              </div>
            `).join("") || `<div class="empty-chat">还没有消息。发第一条开始讨论。</div>`}
          </div>

          <div class="chat-composer">
            ${isMember ? `
              <form id="messageForm" class="chat-input-row">
                <textarea class="textarea" name="content" placeholder="输入消息..." required></textarea>
                <button class="btn primary" type="submit">发送</button>
              </form>
            ` : showNotice("你可以查看这个 Circle，但不是成员，不能发言。", "")}
          </div>

        </section>
      </div>
    `);

    const chatBox = document.getElementById("chatBox");
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;

    const chatMoreBtn = document.getElementById("chatMoreBtn");
    const chatMoreMenu = document.getElementById("chatMoreMenu");
    if (chatMoreBtn && chatMoreMenu) {
      chatMoreBtn.addEventListener("click", () => {
        chatMoreMenu.hidden = !chatMoreMenu.hidden;
      });
    }

    const form = document.getElementById("messageForm");
    if (form) {
      const sendMessage = async () => {
        const fd = new FormData(form);
        const content = String(fd.get("content") || "").trim();
        if (!content) return;
        const { error: insertError } = await client.from("messages").insert({
          group_id: groupId,
          user_id: user.id,
          content
        });
        if (insertError) alert(insertError.message);
        else {
          form.reset();
          await renderGroup(true);
        }
      };

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        await sendMessage();
      });

      const textarea = form.querySelector("textarea");
      if (textarea) {
        textarea.addEventListener("keydown", async (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            await sendMessage();
          }
        });
      }
    }

    const leaveBtn = document.getElementById("leaveBtn");
    if (leaveBtn) {
      leaveBtn.addEventListener("click", async () => {
        const isLongTermCircle = group.circle_type === "exploration";
        const message = isLongTermCircle
          ? "聊天 Circle 是长期关系圈。退出后你需要重新选择方向，并且当前成员关系会中断。确定退出吗？"
          : "确定退出这个 Circle 吗？";
        if (!confirm(message)) return;
        const { error: leaveError } = await client.rpc("leave_group", { p_group_id: groupId });
        if (leaveError) alert(leaveError.message);
        else {
          await syncActiveExploreGroup();
          setHash("/my-circles");
        }
      });
    }
  }

  await renderGroup();
  currentGroupTimer = setInterval(renderGroup, 6000);
}

window.addEventListener("hashchange", route);
bootstrap();
