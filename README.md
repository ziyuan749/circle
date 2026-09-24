# circle

circle 是一个面向海外中国留学生的 Spring Week / Summer 申请目标小队 MVP。现阶段先专注金融和咨询申请，把用户按申请路径、聊天阶段和 Finance / Consulting 两个方向匹配进 6 人小队。

核心机制是：

- 聊天 Circle：长期申请小队，每人同时只能加入 1 个，最多 6 人，按 Spring / Summer、聊天阶段和 Finance / Consulting 匹配；先进入等待组队，凑齐 3 人后开放聊天和周同步。
- Challenge Circle：运营者手动发布赛期，同一时间最多 2 个全站主赛，围绕 consulting mini-project、stock pitch、investment memo、business sense teardown、AI 产品方案等作品自动组队。
- 阶段系统：聊天 Circle 只保留 Starter / Ready / Competitive 三层，Spring Week 和 Summer 都按这三层及 Finance / Consulting 匹配。
- 升级机制：Starter 完整填写画像并连续两周同步后解锁 Ready；Ready 到 Competitive 由更高层级成员基于真实讨论和输出邀请确认。
- Challenge 主赛：Challenge 不按 Spring / Summer 分流，尽量让更多用户做同一道题；题目本身保留入门 / 进阶 / 高阶三档。
- 成果信号：用户的 Challenge 作品、推荐标签和 Circle 排行会沉淀到个人主页；小组作品会记入所有参赛成员，而不是只记在最后提交者名下。

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
- 首次登录先补全申请画像，再进入推荐和组队流程
- 个人主页和申请画像编辑
- Spring / Summer、目标岗位、当前进度、准备强度画像
- 首页今日申请行动台
- Starter / Ready / Competitive 三层聊天阶段
- Ready 行为解锁：加入聊天 Circle、补全申请画像，并至少连续两周完成周同步
- 阶段升级只改变个人标签，不会自动退出原聊天 Circle；新层级 Circle 会开放，由用户主动决定是否切换
- 切换 Spring / Summer 或 Finance / Consulting 岗位大类时，聊天阶段重置为 Starter，旧 Circle 暂时保留，由用户主动重新匹配
- 本组周同步：每人每个 Circle 每周保留一份进度记录，可以反复更新；榜单每周重算，只是自报行动节奏，不用于判断水平或升级
- 每人只能加入一个聊天 Circle
- 聊天 Circle 按 Spring / Summer、阶段和 Finance / Consulting 匹配，不再按地区或金融细分拆分；具体目标岗位仍保留在个人画像中，画像改变后可以主动重新匹配
- Challenge Circle 每周只突出少数全站主赛，所有用户都可以参赛，并显示开赛和截止时间
- 同一时间最多开放 2 个全站主赛；每位用户最多同时加入 3 个进行中的 Challenge Circle
- 自动加入未满 Challenge Circle
- Consulting / Investing / Business Sense / AI 产品 Challenge 种子
- Challenge 工作台
- Challenge 截止前只允许查看本队成果，截止后公开同题提交并锁定修改
- 已结束的 Challenge 可以从个人主页重新进入结果页，不会因首页隐藏已完成小队而丢失入口
- 提交成果标题、说明，并可直接上传 Word、PPT、PDF 等文件或填写外部链接
- 同难度提交墙
- 成果广场
- 成果广场按 Challenge 分组展示第 1、2、3 名
- 成果广场只展示真实比赛中由管理员评出的前三名作品，不生成虚拟成果
- 运营后台：管理员可以发布、结束和归档独立 Challenge 赛期，并在截止后设置第 1/2/3 名
- Circle 排行榜
- 小组成果展示在每位贡献成员的个人主页
- 成员推荐标签
- 用户主页荣誉区
- Ready / Competitive 可以在观察区查看上一阶段候选小队
- Competitive 成员可以基于真实 Ready Circle 讨论邀请 Ready 用户升级
- 接受 / 拒绝升级邀请
- 类微信群聊界面，支持实时新消息和加载更早消息
- Enter 发送消息，Shift + Enter 换行
- 聊天上传图片和文件：图片在聊天里预览，文件以卡片形式打开
- Challenge 作品在首次提交时冻结贡献成员；已提交的队伍不再补入新成员，后续编辑或离队也不会改掉原有署名
- 同一场 Challenge 只能代表一支队伍；退出后可在有空位时回到原队伍，但不能换队重复参赛
- 改变申请路径或岗位大类会重置聊天阶段；旧方向的周同步不会用于新一轮 Ready 解锁
- 成果文件提交会核对私有存储中的实际文件，不能只填写一个不存在的文件路径

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

如果你之前运行过旧版 SQL，数据库规则也需要更新。`schema.sql` 包含种子 Challenge 和状态整理语句；在已有真实用户数据的项目中，先备份并审阅脚本，不要不加检查地重复运行整份文件。脚本不会再创建模拟用户或虚拟成果。

聊天图片和文件使用 Supabase Storage 的 `chat-media` 私有桶。重新运行 SQL 后会自动创建桶和权限；支持选择、拖拽或粘贴上传，一次最多 10 个，单个文件默认限制为 50MB。

Challenge 成果文件使用独立的 `submission-files` 私有桶。单个成果文件最大 50MB，文件会绑定到小组提交；参赛成员和管理员可以查看，获奖后其他已登录用户也可以从成果广场打开。外部成果链接只允许 `http` / `https`，被替换的旧文件不会继续对查看者开放。

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
