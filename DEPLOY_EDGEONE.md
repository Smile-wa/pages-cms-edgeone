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

如果云厂商提供**连接池地址**，优先使用连接池地址。如果密码里有 `@`、`:`、`/`、`?` 等字符，先在连接串中做 URL 编码（例如 `@` 写成 `%40`），避免解析错误。本项目默认每个 Serverless 实例最多保持 3 个连接，可通过 `POSTGRES_MAX_CONNECTIONS` 调整。

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
| `GITHUB_APP_PRIVATE_KEY_1` / `_2` / ... | 十六进制字符串 | GitHub App 私钥的十六进制分片；只含 `0-9`、`a-f`，无空格/换行/符号 |
| `GITHUB_APP_WEBHOOK_SECRET` | 随机字符串 | Webhook 签名密钥 |
| `GITHUB_APP_CLIENT_ID` | `Iv1.xxx` | OAuth Client ID |
| `GITHUB_APP_CLIENT_SECRET` | `xxx` | OAuth Client Secret |
| `EMAIL_FROM` | `no-reply@example.com` | 发件人；建议纯邮箱地址，避免空格和尖括号 |

生成随机密钥（十六进制输出，只有 `0-9`、`a-f`，不会被 EdgeOne 拒绝）：

```bash
openssl rand -hex 32
```

### 3.2 GitHub App 私钥分片（重要）

EdgeOne 单个环境变量的值上限约 **1000 字节**，而且值里**不能有空格、换行、制表符等字符**；GitHub App 的 PEM 私钥通常是 1600～3400 字节，无法直接配置。

项目已支持把私钥**编码成十六进制**后拆成多个环境变量，在运行时解码拼接。十六进制只含 `0-9` 和 `a-f`，完全符合 EdgeOne 的限制。把私钥保存为本地 `private-key.pem`，在项目根目录执行：

```bash
npm run key:split -- private-key.pem
```

输出类似：

```text
# 4 chunk(s), 3408 hex chars
GITHUB_APP_PRIVATE_KEY_1=2d2d2d2d2d424547494e205253412050524956415445204b45592d2d2d...
GITHUB_APP_PRIVATE_KEY_2=...
GITHUB_APP_PRIVATE_KEY_3=...
GITHUB_APP_PRIVATE_KEY_4=...
```

**每条 `=` 后面的整串字符**就是一个环境变量的值，复制到 EdgeOne 控制台逐条创建 `GITHUB_APP_PRIVATE_KEY_1`、`GITHUB_APP_PRIVATE_KEY_2`……直到最后一个分片。

注意：

- 分片编号从 1 开始，必须连续，不能中间缺号。
- 使用分片时**不要**再设置 `GITHUB_APP_PRIVATE_KEY`，否则单变量值会优先生效。
- 默认每片最多 900 个十六进制字符（约 450 字节原始私钥），远低于 1000 字节上限；如需调整用 `--max-chars 900`（允许 100～950）。
- 复制时不要带引号、空格或换行；值本身就是纯十六进制字符串。
- 代码会先把十六进制还原成 PEM（含真实换行），再交给 Octokit，不需要手动处理。
- 本地开发仍可直接使用 PEM 内容作为 `GITHUB_APP_PRIVATE_KEY`（见 `.env.local.example`），两种方式兼容。

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
- GitHub App 私钥按 `GITHUB_APP_PRIVATE_KEY_1`、`_2`……分片配置，值为纯十六进制字符串，不要同时设置单变量 `GITHUB_APP_PRIVATE_KEY`
- 如果控制台提示变量值不能包含空格/换行/特殊字符，检查是否误带了引号、注释或 PEM 原文；所有密钥类变量建议用 `openssl rand -hex 32` 生成
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

到 GitHub App 设置页修改上面的 Callback URL 和 Webhook URL，并确认 EdgeOne 中的 `GITHUB_APP_CLIENT_ID`、`GITHUB_APP_CLIENT_SECRET`、私钥分片（`GITHUB_APP_PRIVATE_KEY_1` 等）、`GITHUB_APP_WEBHOOK_SECRET` 与这个 App 一致。

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

助手会打开浏览器完成 GitHub App 注册，并输出新的环境变量值；把这些新值更新到 EdgeOne 控制台。私钥需要按 3.2 节先分片再配置。若使用 `--env .env.local`，注意该文件不要提交到仓库。

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
| EdgeOne 拒绝保存 `GITHUB_APP_PRIVATE_KEY` | 值超过约 1000 字节上限，或含空格/换行/符号 | 按 3.2 节用 `npm run key:split` 生成纯十六进制分片 |
| 控制台提示变量值有特殊字符 | 粘贴时带了引号、空格、换行或 PEM 原文 | 只复制 `=` 后面的十六进制串；密钥用 `openssl rand -hex 32` 生成 |
| 登录后跳转回首页 | GitHub App 回调地址还是本地地址 | 重新执行第 8 步 |
| 获取 installation token 报私钥错误 | 分片有缺号、值被改动，或同时设置了错误的单变量 | 确认 `_1` 起连续无缺口、值仅含 `0-9a-f`，且未设置 `GITHUB_APP_PRIVATE_KEY` |
| 点击 GitHub 登录提示 “Could not start GitHub sign-in” | 登录接口返回了无文本的错误（常见是 HTTP 403），旧代码只显示通用提示 | 页面现在会显示具体状态码；若看到 403，检查 `BASE_URL` 是否为正式域名、`GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` 是否正确，并查看 EdgeOne 函数日志 |
| 所有写操作返回 403 | CSRF 校验拿不到正确 Host | 代码已兼容 `Origin` / `Referer` / `Sec-Fetch-Site` 和 `x-forwarded-host`；`/api/auth/*` 由 Better Auth 自行校验 |
| 数据库连接数打满 | Serverless 并发 × 连接池过大 | 调低 `POSTGRES_MAX_CONNECTIONS`，或使用数据库池化地址 |
| Webhook 事件偶尔丢失 | 平台不支持 `after()` 后台任务 | 代码已先等待最多 8 秒；如仍有问题，可改为完全同步处理 |
| 页面样式或脚本 404 | 输出目录配错 | 必须是 `.next`，不是 `out` |

---

## 11. 后续更新流程

日常代码更新：

1. 推送代码到 GitHub 触发 EdgeOne 自动部署。
2. 如果更新包含 `db/migrations`，先按第 2 步对生产库执行迁移，再部署新版本。

回滚：在 EdgeOne 控制台选择历史部署记录重新发布；如果回退涉及表结构变更，数据库迁移**不会自动回滚**，需要手动处理。
