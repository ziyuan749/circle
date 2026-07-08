# circle - No npm MVP

这是一个不需要 `npm install` 的纯前端 MVP。它用普通 HTML/CSS/JavaScript + Supabase CDN 运行。

## 为什么这个版本更适合你现在测试

你之前遇到的错误是 npm 网络源超时，不是产品代码逻辑错误。这个版本先绕开 npm：

- 不需要 Next.js
- 不需要 React
- 不需要 Tailwind
- 不需要 npm install
- 不需要 npm run dev

你只需要配置 Supabase，然后用浏览器打开页面。

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

## 使用步骤

### 1. 配置 Supabase

打开 `config.js`，把里面的两行改成你自己的 Supabase 信息：

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://你的项目id.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "你的 publishable key"
};
```

注意 URL 不要带 `/rest/v1/`。

### 2. 运行数据库 SQL

打开 Supabase 后台：

```text
SQL Editor → New query
```

复制 `supabase/schema.sql` 全部内容，粘贴进去，点击 Run。

### 3. 打开网站

最简单：双击 `index.html`。

如果浏览器因为本地文件安全策略报错，用这个方法：

在 VS Code 终端里进入本文件夹，运行：

```bash
python3 -m http.server 3000
```

然后浏览器打开：

```text
http://localhost:3000
```

## 已实现功能

- 邮箱注册 / 登录
- 编辑 Profile
- Dashboard
- 聊天型 Circle / Exploration Circle
- 任务型 Circle / Task Circle
- 任务大厅
- 用户等级 L1-L5
- 任务按等级分发，用户只能加入同层级任务
- 加入任务后自动分配到未满 Circle
- 每个任务有自己的 Circle 人数上限
- 用户最多同时加入 3 个任务型 Circle
- 用户最多同时加入 1 个聊天型 Circle
- 聊天 Circle 按用户等级单独组队
- 高层用户可以查看低层 Circle
- 高层用户可以邀请低层成员升级
- 任务工作台
- 任务提交链接
- 交付格式要求
- 同级提交墙
- Profile 展示任务成就
- 小组聊天
- 退出 Circle
- Profile 展示参与记录和最近发言

## 更新数据库

如果你已经跑过旧版 SQL，新增功能需要重新运行一次：

```text
supabase/schema.sql
```

新版 SQL 会保留现有表，用 `alter table if not exists` 补新字段，并迁移已有任务和 Circle 的等级。

## 这个版本的定位

这是一个用来验证产品机制的 MVP，不是最终工程架构。

先验证：

> 用户是否愿意因为“聊天探索”或“任务”进入人数受控的小组，并和陌生人交流。

如果机制成立，再迁回 Next.js / Vercel / Supabase 的正式架构。
