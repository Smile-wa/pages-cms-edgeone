# Pages CMS

[Pages CMS](https://pagescms.org) is an open source CMS for GitHub repositories. It is especially well suited for static sites and content-driven apps built with tools like Jekyll, Hugo, Next.js, Astro, VuePress, and similar stacks.

You can use the hosted version directly at [app.pagescms.org](https://app.pagescms.org), or run your own local development copy from this repository.

[![Screenshot of the Pages CMS editor](https://pagescms.org/media/screenshot.png)](https://demo.pagescms.org)

*[Watch the demo ▶](https://demo.pagescms.org)*

## Documentation

Full documentation lives at [pagescms.org/docs](https://pagescms.org/docs).

Useful starting points:

- [Install locally](https://pagescms.org/docs/guides/installing/)
- [Create the GitHub App](https://pagescms.org/docs/guides/installing/github-app/)
- [Environment variables](https://pagescms.org/docs/development/environment-variables/)
- [Upgrading to 2.x](https://pagescms.org/docs/guides/upgrading-to-2/)

## Use online

The easiest way to get started is the hosted version at [app.pagescms.org](https://app.pagescms.org).

Use that if you want to:

- try Pages CMS immediately,
- edit content without running anything locally,
- stay on the latest hosted version.

## Local development

### What you need

- PostgreSQL
- a GitHub App
- a local `.env.local`
- the Pages CMS repo checked out locally

### Quick start

1. Clone the repository:

```bash
git clone https://github.com/pagescms/pagescms.git
cd pagescms
```

2. Start PostgreSQL locally:

```bash
docker run --name pagescms-db -e POSTGRES_USER=pagescms -e POSTGRES_PASSWORD=pagescms -e POSTGRES_DB=pagescms -p 5432:5432 -d postgres:16
```

3. Install dependencies:

```bash
npm install
```

4. Create `.env.local` with at least:

```bash
DATABASE_URL=postgresql://pagescms:pagescms@localhost:5432/pagescms
BETTER_AUTH_SECRET=your-random-secret
CRYPTO_KEY=your-random-secret
```

Optional but useful:

```bash
BASE_URL=https://cms.example.com
ADMIN_EMAILS=admin@example.com
```

Notes:

- In production, `BASE_URL` should be the single canonical URL for the app.
- Do not mix a custom domain and a `*.netlify.app` URL for the same install.
- `ADMIN_EMAILS` is a comma-separated allowlist for access to the admin panel.

Generate secrets with:

```bash
openssl rand -base64 32
```

5. Create your GitHub App with the helper:

```bash
npm run setup:github-app -- --base-url http://localhost:3000
```

Useful options:

- `--owner-type personal|org`
- `--org <slug>`
- `--app-name "Pages CMS (local)"`
- `--env .env.local`
- `--no-open`

6. Run database migrations:

```bash
npm run db:migrate
```

If cache state is known stale or corrupted, clear it with:

```bash
npm run db:clear-cache
```

7. Start the app:

```bash
npm run dev
```

If you need GitHub webhooks to reach your local app, use a public tunnel URL as the helper `--base-url`.

For more detail, see:

- [Install locally](https://pagescms.org/docs/guides/installing/)
- [Create the GitHub App](https://pagescms.org/docs/guides/installing/github-app/)
- [Environment variables](https://pagescms.org/docs/development/environment-variables/)
- [Caching](https://pagescms.org/docs/development/caching/)

## Deploy to Tencent EdgeOne Makers

For a step-by-step checklist, see [DEPLOY_EDGEONE.md](./DEPLOY_EDGEONE.md).

EdgeOne Makers (formerly EdgeOne Pages) runs this project as a full-stack Next.js 16 app. Build settings are committed in `edgeone.json`: `npm ci`, `npm run build`, output `.next`, Node `22.11.0`, 60s cloud-function timeout.

1. Provision a PostgreSQL database with TLS. Use a pooled connection URL when available, e.g. `postgresql://user:pass@host:5432/pagescms?sslmode=require`.
2. Run migrations once **before** deploying (they are intentionally not part of `npm run build`):

   ```bash
   DATABASE_URL="postgresql://..." npm run db:migrate
   ```

3. Import the repo in the EdgeOne Makers console. Set the canonical app URL and all required env vars in **Project Settings → Environment Variables**:

   ```text
   BASE_URL=https://cms.example.com
   DATABASE_URL=postgresql://...?sslmode=require
   BETTER_AUTH_SECRET=...
   CRYPTO_KEY=...
   GITHUB_APP_ID=...
   GITHUB_APP_NAME=...
   # GITHUB_APP_PRIVATE_KEY too long for EdgeOne? Split it into hex chunks:
   # npm run key:split -- private-key.pem
   GITHUB_APP_PRIVATE_KEY_1=...  # hex only (0-9a-f), _1, _2, ... (see DEPLOY_EDGEONE.md)
   GITHUB_APP_WEBHOOK_SECRET=...
   GITHUB_APP_CLIENT_ID=...
   GITHUB_APP_CLIENT_SECRET=...
   EMAIL_FROM=...
   RESEND_API_KEY=...           # or SMTP_* when EMAIL_PROVIDER=smtp
   POSTGRES_MAX_CONNECTIONS=3   # per serverless instance
   ```

   `BASE_URL` is required at runtime (auth callbacks and invite links use it). The build itself intentionally falls back to a placeholder so a missing URL cannot break deployment.

4. Keep cloud functions in the same region as the database for lower latency (`edgeone.json` → `cloudFunctions.mainlandRegions` / `overseasRegions`; paid plans can change regions).
5. Register/renew the GitHub App callback and webhook URLs against the production domain:

   ```bash
   npm run setup:github-app -- --base-url https://cms.example.com
   ```

   The webhook URL is `https://cms.example.com/api/webhook/github`.
6. Deploy. On each deployment EdgeOne invalidates cached build output automatically.

Performance notes:

- Hashed `/_next/static/*` assets get a one-year immutable cache; `/_next/image/*` and `/images/*` get a one-day browser cache with stale-while-revalidate.
- Authenticated API responses are forced to `private, no-store` via `edgeone.json`; only the public `/api/app/version` endpoint is cached for one hour. Do not add broad HTML caching — pages are personalized.
- Native `<img>` avatars and thumbnails use lazy loading; private-repo images still come from signed GitHub URLs (not the image optimizer).
- The database client is reused across warm invocations with a small connection pool. Tune `POSTGRES_MAX_CONNECTIONS` to your database connection limit.
- `next.config.mjs` does not define rewrites/redirects because EdgeOne does not support Next.js-level rewrites; use `edgeone.json` if you need them.

## Support the project

- [Contribute code](https://github.com/pagescms/pagescms/pulls)
- [Report issues](https://github.com/pagescms/pagescms/issues)
- [Sponsor me](https://github.com/sponsors/hunvreus)
- [Star the project on GitHub](https://github.com/pagescms/pagescms)
- [Join the Discord chat](https://pagescms.org/chat)

## License

Everything in this repo is released under the [MIT License](LICENSE).
