# Deploy Auditly on a server

Run the Next.js dashboard and one worker against the same PostgreSQL database. The steps below
use Linux and systemd. On another platform, use its service manager to run the same two npm
commands from the checkout with a shared `.env`.

## 1. Provision the server and database

- Install Node.js 22.19 or later (Node.js 24 recommended), npm, and Git. Use a system-wide Node
  installation available to the service account.
- Provision PostgreSQL 15 or later. Create an empty database and a dedicated login role that owns
  it and can create tables and schemas. Prisma uses the `public` schema by default. pg-boss creates
  and manages its own schema when the app and worker start.
- Create a dedicated operating system service account and clone the repository where that account
  can read and build it. The examples use the account `auditly` and checkout `/opt/auditly`.
  Keep PostgreSQL reachable only by the services that need it. Configure backups for the database.

## 2. Configure and build the checkout

Run these commands from the checkout as the service account, or ensure the resulting files are
owned by that account:

```sh
npm ci --include=dev
umask 077
cp .env.example .env
chmod 600 .env
```

Set these two values in `.env`:

- `DATABASE_URL` is the connection string for the new database. It has the form
  `postgresql://USER:PASSWORD@DB_HOST:5432/DB_NAME?schema=public`. Percent-encode reserved
  characters in the username or password. Apply the PostgreSQL provider's TLS settings when
  connecting to a remote database.
- `AUDITLY_PASSWORD` is the shared dashboard password. Use at least 16 characters across at least
  three character classes. A password manager can generate and store it. Every user with that
  password has the same access. The Team page tracks assignments.

Keep `AUDITLY_ALLOW_PRIVATE_NETWORK=false` on shared deployments. The worker needs outbound
DNS and HTTP(S) to reach configured sites and their resources.

```sh
npx prisma generate
npm run db:deploy
npm run build
```

For Lighthouse and browser-rendered pages, install Chromium's OS dependencies on a supported
Linux distribution, then download Chromium as the worker account so it can use its own browser
cache:

```sh
sudo /opt/auditly/node_modules/.bin/playwright install-deps chromium
npx playwright install chromium
```

Run the first command from an administrator shell on the server. The second runs from the
checkout as the worker account. Alternatively, supply the path to a compatible system Chrome
or Chromium in `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## 3. Supervise the dashboard and worker

Use the following template in `/etc/systemd/system/auditly@.service`. Set `WorkingDirectory`
to the checkout and `ExecStart` to the system-wide absolute path from `command -v npm`.

```ini
[Unit]
Description=Auditly %i
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=auditly
WorkingDirectory=/opt/auditly
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run %i
Restart=on-failure
RestartSec=5
TimeoutStopSec=45

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now auditly@start auditly@worker
sudo journalctl -u auditly@start -u auditly@worker -f
```

The dashboard listens on loopback port 3210. For team access, use your workplace's
HTTPS reverse proxy and TLS certificate. Set the upstream Host and forwarded headers from
the proxy's own request information, replacing any values supplied by clients. Same-origin
writes depend on the dashboard seeing the hostname and scheme the browser used. An Nginx
`location` in your HTTPS server block can use:

```nginx
location / {
    proxy_pass http://127.0.0.1:3210;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

Keep port 3210 private. Use the workplace VPN or an access gateway to restrict who can reach
the HTTPS endpoint.

## 4. Verify the deployment

1. Open the HTTPS dashboard and enter any username with the configured dashboard password.
2. Check `/api/health` for an HTTP 200, then `/api/ready` for HTTP 200 once the database and
   worker heartbeat are online. These endpoints and `/api/metrics` use the same authentication
   as the dashboard.
3. Under **Sites → Add site**, add a hostname your team is authorized to scan. Run a small crawl
   and verify it completes with pages and findings available in the dashboard. If Chromium is
   installed, use **Run performance scan** to audit one of the crawled pages.

For updates, back up PostgreSQL, stop both services, check out the intended revision, and run
`npm ci --include=dev`, `npx prisma generate`, `npm run db:deploy`, and `npm run build` before
restarting both services.
Reinstall the Playwright Chromium version when Playwright changes. Keep the same database to
preserve sites, scan history, and the queue.
