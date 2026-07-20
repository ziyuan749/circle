# circle

circle 是一个面向海外中国留学生的 Spring Week / Summer 申请目标小队 MVP。现阶段先专注金融和咨询申请，把用户按申请路径、准备阶段和执行强度匹配进 6 人小队。

核心机制是：

- 聊天 Circle：长期申请小队，每人同时只能加入 1 个，最多 6 人，按 Spring / Summer、岗位方向和准备阶段匹配。
- 任务 Circle：短期成果圈，围绕 CV、tracker、HireVue、technical、case、networking 和 referral 任务自动组队。
- 阶段系统：前台展示 Starter / Ready / Competitive / Peer Lead / Mentor，而不是 L1/L2/L3。Spring Week 默认按同目标匹配，不强行细分；Summer 才使用轻量阶段。
- 升级机制：Summer Starter 可以通过申请画像、周同步和行动量解锁 Ready；Competitive 以上仍由 Peer Lead / Mentor 基于真实讨论和输出邀请确认。
- 任务分阶段：不同准备阶段不会接同一个任务，避免难度和能力错配。
- 成果信号：用户的任务提交、推荐标签和 Circle 排行会沉淀到个人主页，形成比聊天更可信的职业信号。

## 文件结构

```text
circle/
├── index.html
├── app.js
├── styles.css
├── config.js
├── supabase/
│   └── schema.sql
└── README.md
```

## 当前已实现

- 邮箱注册 / 登录
- 个人主页和申请画像编辑
- Spring / Summer、目标地区、目标岗位、当前进度、准备强度画像
- 首页今日申请行动台
- Starter / Ready / Competitive / Peer Lead / Mentor 阶段
- Summer Ready 行为解锁：加入聊天 Circle、补全申请画像、本周周同步，并满足连续两周同步或本周 5 个申请 / 3 次 networking
- 阶段升级后会退出旧阶段聊天 Circle，需要重新选择同阶段长期 Circle，避免不同水平的人继续混聊
- 每人只能加入一个聊天 Circle
- 聊天 Circle 按 Spring / Summer、阶段、地区、岗位和强度匹配
- 任务 Circle 按当前申请阶段和画像推荐
- 自动加入未满任务 Circle
- Spring Week 和 Summer 申请任务种子
- 任务工作台
- 提交成果标题、说明和链接
- 同阶段提交墙
- 成果广场
- Circle 排行榜
- 成果展示在个人主页
- Mentor 推荐标签
- 用户主页荣誉区
- Peer Lead / Mentor 查看上一阶段 Circle
- Ready / Competitive / Peer Lead / Mentor 可以在观察区查看上一阶段候选小队
- Peer Lead / Mentor 向候选人发送升级邀请
- 接受 / 拒绝升级邀请
- 类微信群聊界面
- Enter 发送消息，Shift + Enter 换行
- 聊天上传图片和文件：图片在聊天里预览，文件以卡片形式打开

## Supabase 设置

打开 `config.js`，填入 Supabase 的 Project URL 和 publishable key：

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://你的项目.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "你的 publishable key"
};
```

然后进入 Supabase 后台：

```text
SQL Editor -> New query
```

复制 `supabase/schema.sql` 的全部内容，粘贴并运行。

如果你之前运行过旧版 SQL，也需要重新运行一次。新版 SQL 会补齐新字段、函数、权限和种子任务。

聊天图片和文件使用 Supabase Storage 的 `chat-media` 私有桶。重新运行 SQL 后会自动创建桶和权限；单个文件默认限制为 10MB。

## 本地打开

这个项目是纯静态网页，不需要 npm。

推荐用本地服务器打开：

```bash
python3 -m http.server 3000
```

然后访问：

```text
http://127.0.0.1:3000/#/login
```

## 部署

可以部署到 Netlify。

Netlify 设置：

```text
Build command: 留空
Publish directory: .
```
