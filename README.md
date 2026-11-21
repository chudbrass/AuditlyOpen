# Auditly

Auditly is a self-hosted website quality scanner. It tracks broken links, SEO and metadata,
static accessibility, content quality, and security findings across scans. A separate Lighthouse
diagnostic measures performance for a page you select from a completed crawl.

## Run on a server

Follow the [server deployment guide](docs/DEPLOYMENT.md) to provision PostgreSQL, configure
credentials, and run the dashboard and background worker as services behind HTTPS.

## Local development

Use Node.js 22.19+ (Node.js 24 recommended) and PostgreSQL 15+. From the repository root:

```sh
npm ci
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env`. Fill in `DATABASE_URL` and
`AUDITLY_PASSWORD` in `.env`. Use a unique dashboard password of at least 16 characters
with at least three character classes (lowercase, uppercase, digits, symbols).

For an isolated local development database, run `npm run db:dev` in its own terminal.
It listens on port 5432 and persists under `.pgdata`. Set `DATABASE_URL` to
`postgresql://auditly:auditly@localhost:5432/auditly?schema=public` when using this local option.
For an existing PostgreSQL instance, create an empty database owned by your development role
and supply that role's connection string.

```sh
npx prisma generate
npm run db:deploy
npx playwright install chromium
```

Start `npm run dev` and `npm run worker` in separate terminals. Open
[the local dashboard](http://127.0.0.1:3210/) and enter any username with your configured
dashboard password. The worker processes scans and scheduled jobs. If you use the embedded
database, keep its terminal running too.

Use **Sites → Add site** to configure an authorized website, then launch a crawl. Bare and
`www` hostnames are aliases. Other subdomains have separate site entries and history.
A fresh database starts empty. `npm run db:seed` adds optional synthetic demo data for local testing.
The [feature guide](docs/FEATURES-AND-SCANS.md) explains crawl results and performance diagnostics.

```sh
npm run lint
npm run typecheck
npm run test:security
npm run test:scoring
```

See the [architecture](docs/ARCHITECTURE.md) for the dashboard, worker, queue, and data flow.
