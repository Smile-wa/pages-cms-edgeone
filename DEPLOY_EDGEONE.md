# Pages CMS 部署到腾讯云 EdgeOne Makers

> EdgeOne Pages 已升级为 **EdgeOne Makers**。本项目已按 Next.js 16 全栈模式适配，无需改成静态导出。
> 本文档按顺序操作即可；命令在本地项目根目录执行（Windows 可用 Git Bash）。

## 0. 操作总览

- [ ] 准备带 TLS 的 PostgreSQL 数据库
- [ ] 本地对生产库执行一次数据库迁移
- [ ] 准备环境变量（尤其是 `BASE_URL`、密钥、GitHub App 配置）
- [ ] 将仓库导入 EdgeOne Makers
- [ ] 在控制台配置环境变量与函数地域
- [ ] 部署并验证
- [ ] 用正式域名重新注册 GitHub App 的回调地址与 Webhook

---

## 1. 准备 PostgreSQL

EdgeOne Makers 不提供 PostgreSQL，需要自备数据库。建议使用腾讯云 PostgreSQL 或其他云数据库，并满足：

- PostgreSQL 14+
- 开启 SSL/TLS
- 记录连接地址、端口、用户名、密码、数据库名
- 尽量选择与 EdgeOne 云函数相同的地域，降低延迟

连接串格式：

```text
postgresql://用户名:密码@主机:端口/数据库名?sslmode=require
```

如果云厂商提供**连接池地址**，优先使用连接池地址。本项目默认每个 Serverless 实例最多保持 3 个连接，可通过 `POSTGRES_MAX_CONNECTIONS` 调整。

> 不要把密码写进仓库文件。后面的环境变量在 EdgeOne 控制台配置。

---

## 2. 迁移数据库

项目已移除构建期的自动迁移（`postbuild`），因此**部署前必须手动执行一次**。

在项目根目录执行：

```bash
DATABASE_URL="postgresql://用户名:密码@主机:端口/数据库名?sslmode=require" npm run db:migrate
```

看到迁移执行完成即可。其中包含 0000～0013 号迁移；0013 会新增两个大小写不敏感的表达式索引，用于加速仓库/文件缓存查询。

后续如果更新了 `db/migrations` 中的表结构，也要在**新版本部署前**再次执行同样命令。

---

## 3. 准备环境变量

### 3.1 必填变量

| 变量 | 示例 | 说明 |
| --- | --- | --- |
| `BASE_URL` | `https://cms.example.com` | 正式域名，不能带路径；认证回调和邀请链接依赖它 |
| `DATABASE_URL` | `postgresql://...?sslmode=require` | 上一步的数据库连接串 |
| `BETTER_AUTH_SECRET` | 随机字符串 | 登录会话签名密钥 |
| `CRYPTO_KEY` | 随机字符串 | 加密密钥 |
| `GITHUB_APP_ID` | `123456` | GitHub App ID |
| `GITHUB_APP_NAME` | `my-pages-cms` | GitHub App machine name |
| `GITHUB_APP_PRIVATE_KEY` | PEM 内容 | GitHub App 私钥 |
| `GITHUB_APP_WEBHOOK_SECRET` | 随机字符串 | Webhook 签名密钥 |
| `GITHUB_APP_CLIENT_ID` | `Iv1.xxx` | OAuth Client ID |
| `GITHUB_APP_CLIENT_SECRET` | `xxx` | OAuth Client Secret |
| `EMAIL_FROM` | `Pages CMS <no-reply@example.com>` | 发件人 |

生成随机密钥：

```bash
openssl rand -base64 32
```

### 3.2 GitHub App 私钥写法

EdgeOne 的环境变量是单行值，建议把 PEM 的换行转成字面 `\n` 后再粘贴。把私钥保存为本地 `private-key.pem`，执行：

```bash
node <<'NODE'
const fs = require('fs');
const key = fs.readFileSync('private-key.pem', 'utf8').trim().replace(/\r?\n/g, '\\n');
console.log(key);
NODE
```

输出是一整行，复制整行作为 `GITHUB_APP_PRIVATE_KEY` 的值。代码会自动把 `\n` 还原成真实换行。

### 3.3 邮件与可选变量

二选一：

```text
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxx
```

或：

```text
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=xxx
SMTP_PASSWORD=xxx
```

推荐 `resend`（HTTP API，更适合 Serverless；SMTP 长连接在函数冻结后可能失效）。

可选调优：

```text
ADMIN_EMAILS=admin@example.com,other@example.com
POSTGRES_MAX_CONNECTIONS=3
CACHE_CHECK_MIN=5
CONFIG_CHECK_MIN=5
FILE_TTL_MIN=1440
```

完整变量说明见 `.env.local.example`。

---

## 4. 导入项目到 EdgeOne Makers

1. 登录 EdgeOne Makers 控制台。
2. 新建项目，选择 GitHub 仓库（本项目仓库）。
3. 构建配置会自动读取项目根目录的 `edgeone.json`；请核对以下值：

| 配置项 | 值 |
| --- | --- |
| 安装命令 | `npm ci` |
| 构建命令 | `npm run build` |
| 输出目录 | `.next` |
| Node 版本 | `22.11.0` |
| 云函数超时 | 60 秒 |

`edgeone.json` 已提交在项目根目录，正常情况下不需要手动改。

> 注意：EdgeOne 不支持 `next.config` 中的 rewrites/redirects。本项目没有依赖它们；如需新增，请写在 `edgeone.json` 的 `redirects` / `rewrites` 中。

---

## 5. 配置 EdgeOne 项目环境变量

在 **项目设置 → 环境变量** 中逐条添加第 3 步准备的变量。

特别确认：

- `BASE_URL` 使用正式域名，例如 `https://cms.example.com`
- `DATABASE_URL` 带 `sslmode=require`
- `GITHUB_APP_PRIVATE_KEY` 是单行 `\n` 形式
- `BETTER_AUTH_SECRET` 不要在构建日志中暴露

构建阶段即使没有 `BASE_URL` 也能完成（代码会回退到占位 URL），但**运行时必须设置**，否则认证相关功能会报错。

### 函数地域（可选）

云函数默认地域：中国大陆 `ap-guangzhou`，海外 `ap-singapore`。如数据库在其他地域，可在 `edgeone.json` 中修改：

```json
{
  "cloudFunctions": {
    "mainlandRegions": ["ap-beijing"],
    "overseasRegions": ["ap-hongkong"],
    "nodejs": { "maxDuration": 60 }
  }
}
```

免费版不支持修改函数地域。

---

## 6. 部署

保存环境变量后触发部署（推送代码或点击控制台部署）。

观察构建日志：

- 安装依赖、执行 `next build`
- 构建结束后输出目录为 `.next`
- 不再出现 `postbuild` 数据库迁移步骤

如果构建日志出现 Google Fonts 下载失败，说明构建容器无法访问 `fonts.googleapis.com`。当前项目使用 `next/font/google`；解决方式是开放构建环境出网，或后续把字体改为本地文件。

---

## 7. 验证部署

按顺序检查：

1. 打开 `https://你的域名/sign-in`，页面能正常渲染，样式加载正常。
2. 访问 `https://你的域名/api/app/version`，应返回 JSON：

```json
{
  "status": "success",
  "latest": "...",
  "repository": "pagescms/pagescms",
  "source": "package.json"
}
```

3. 登录、进入项目列表，确认 GitHub App 安装信息能加载。
4. 打开任意仓库的内容页，确认文件列表、图片缩略图正常。
5. 在浏览器开发者工具中确认：
   - `/_next/static/*` 返回 `Cache-Control: public, max-age=31536000, immutable`
   - `/api/*` 返回 `Cache-Control: private, no-store`
6. 触发一次内容保存，确认写操作没有被缓存，也没有 403。

---

## 8. 配置 GitHub App

GitHub App 需要配置：

- Homepage URL：`https://cms.example.com`
- Callback URL：`https://cms.example.com/api/auth/callback/github`
- Webhook URL：`https://cms.example.com/api/webhook/github`
- Webhook secret：与 `GITHUB_APP_WEBHOOK_SECRET` 一致

两种方式二选一：

**方式 A：直接使用已有的 GitHub App**

到 GitHub App 设置页修改上面的 Callback URL 和 Webhook URL，并确认 EdgeOne 中的 `GITHUB_APP_CLIENT_ID`、`GITHUB_APP_CLIENT_SECRET`、`GITHUB_APP_PRIVATE_KEY`、`GITHUB_APP_WEBHOOK_SECRET` 与这个 App 一致。

**方式 B：用助手新建一个生产用 GitHub App**

```bash
npm run setup:github-app -- --base-url https://cms.example.com
```

常用参数：

```text
--owner-type personal|org
--org <slug>
--app-name "Pages CMS (prod)"
--env .env.local
--no-open
```

助手会打开浏览器完成 GitHub App 注册，并输出新的环境变量值；把这些新值更新到 EdgeOne 控制台。若使用 `--env .env.local`，注意该文件不要提交到仓库。

> 如果你之前用本地地址创建过 GitHub App，必须完成方式 A 或 B，否则登录后回调会失败。

---

## 9. 已启用的性能优化

部署配置已经包含这些优化，无需额外操作：

- 带 hash 的 `/_next/static/*`：浏览器缓存 1 年
- `/_next/image/*`、`/images/*`：浏览器缓存 1 天 + stale-while-revalidate
- 所有 `/api/*`：默认 `private, no-store`，仅公开的版本接口缓存 1 小时
- 数据库连接在 Serverless 热启动间复用，生产连接池默认 3
- `proxy.ts` 跳过静态资源，减少边缘函数开销
- 头像/缩略图懒加载
- `lucide-react`、`date-fns` 按需导入，减小首屏 JS
- `config`、`cache_file_meta` 增加大小写不敏感索引

页面本身是登录后的个性化内容，**不要**给 HTML 页面加公共 CDN 缓存。

---

## 10. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 构建失败，提示缺少数据库 | 构建环境有误连数据库的步骤 | 确认 `postbuild` 已移除；迁移改为手动执行 |
| 构建失败，提示 `BASE_URL` | 旧代码仍在模块顶层抛错 | 确认 `lib/base-url.ts` 已更新 |
| 构建时 Google Fonts 下载失败 | 构建容器无法出网 | 开放出网，或改成本地字体 |
| 登录后跳转回首页 | GitHub App 回调地址还是本地地址 | 重新执行第 8 步 |
| 所有写操作返回 403 | CSRF 校验拿不到正确 Host | 确认 EdgeOne 透传 `Origin` / `Host`；代码已兼容 `x-forwarded-host` |
| 数据库连接数打满 | Serverless 并发 × 连接池过大 | 调低 `POSTGRES_MAX_CONNECTIONS`，或使用数据库池化地址 |
| Webhook 事件偶尔丢失 | 平台不支持 `after()` 后台任务 | 代码已先等待最多 8 秒；如仍有问题，可改为完全同步处理 |
| 页面样式或脚本 404 | 输出目录配错 | 必须是 `.next`，不是 `out` |

---

## 11. 后续更新流程

日常代码更新：

1. 推送代码到 GitHub 触发 EdgeOne 自动部署。
2. 如果更新包含 `db/migrations`，先按第 2 步对生产库执行迁移，再部署新版本。

回滚：在 EdgeOne 控制台选择历史部署记录重新发布；如果回退涉及表结构变更，数据库迁移**不会自动回滚**，需要手动处理。
