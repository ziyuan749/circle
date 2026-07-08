# circle

circle 是一个求职社交产品 MVP，核心机制是：

- 聊天 Circle：长期关系圈，每人同时只能加入 1 个，最多 6 人，同层级匹配。
- 任务 Circle：短期成果圈，围绕一个任务自动组队、提交链接、进入同级提交墙。
- 层级系统：用户从 L1 到 L5。聊天只和同层的人聊，高层可以观察低层讨论。
- 升级机制：高层看到低层用户有水平后，可以发出升级邀请。
- 任务分层：不同层级不会接同一个任务，避免难度和能力错配。

## 文件结构

```text
circle/
├── index.html
├── app.js
├── styles.css
├── config.js
├── netlify.toml
├── supabase/
│   └── schema.sql
└── README.md
```

## 当前已实现

- 邮箱注册 / 登录
- 个人主页和资料编辑
- L1-L5 用户层级
- 每人只能加入一个聊天 Circle
- 聊天 Circle 按层级和方向匹配
- 任务 Circle 按同层级开放
- 自动加入未满任务 Circle
- 任务工作台
- 提交成果标题、说明和链接
- 同级提交墙
- 成果展示在个人主页
- 高层查看低层 Circle
- 高层向低层发送升级邀请
- 接受 / 拒绝升级邀请
- 类微信群聊界面
- Enter 发送消息，Shift + Enter 换行

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

`netlify.toml` 已经包含单页应用需要的跳转配置。
