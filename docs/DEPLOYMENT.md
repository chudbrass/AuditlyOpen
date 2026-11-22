# Deploy Auditly on a server

Run the Next.js dashboard and one worker against the same PostgreSQL database. The steps below
use Linux and systemd. Browser-rendered pages and Lighthouse use an optional isolated Chromium
service. The fast crawl works independently of Chromium.

## 1. Provision the server and database

- Install Node.js 22.19 or later (Node.js 24 recommended), npm, and Git. Use a system-wide Node
  installation available to the service account.
- Provision PostgreSQL 15 or later. Create an empty database and a dedicated login role that owns
  it and can create tables and schemas. Prisma uses the `public` schema by default. pg-boss creates
  and manages its own schema when the app and worker start.
- Create distinct system accounts `auditly-web` and `auditly-worker`. Deploy to `/opt/auditly` as
  a separate deploy user and give both service accounts read access. Keep PostgreSQL reachable
  only by the services that need it. Configure backups for the database.

## 2. Configure and build the checkout

Create `/etc/auditly/web.env` and `/etc/auditly/worker.env` as root with mode `0600`. systemd
loads each file for its own service. Keep deployment secrets out of the checkout.

- Set `DATABASE_URL` in both files. It has the form
  `postgresql://USER:PASSWORD@DB_HOST:5432/DB_NAME?schema=public`. Percent-encode reserved
  characters in the username or password. Apply the PostgreSQL provider's TLS settings when
  connecting to a remote database.
- Set `AUDITLY_PASSWORD` only in `web.env`. Use at least 16 characters across at least
  three character classes. A password manager can generate and store it. Every user with that
  password has the same access. The Team page tracks assignments.

Keep `AUDITLY_ALLOW_PRIVATE_NETWORK=false` on shared deployments. At the network firewall,
allow the worker outbound DNS to your resolver, PostgreSQL to the configured database, and
HTTP(S) to public destinations. Block other private, link-local, and metadata destinations.
For a site on a nonstandard HTTP(S) port, add a specific destination and port rule.

Install dependencies and build as the deploy user. The build needs a valid connection-string
format to initialize Prisma, so it can use the placeholder below without database credentials.

```sh
npm ci --include=dev
npx prisma generate
DATABASE_URL='postgresql://build:build@127.0.0.1:1/auditly_build?schema=public' npm run build
```

Run `npm run db:deploy` from a maintenance shell with the actual `DATABASE_URL` supplied
through your secret manager.

## 3. Supervise the dashboard and worker

Use the following template in `/etc/systemd/system/auditly@.service`. Set the absolute npm
and Node paths to match the host. Give the web account write access to `/opt/auditly/.next/cache`
if required by your deployment.

```ini
[Unit]
Description=Auditly %i
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=auditly-%i
WorkingDirectory=/opt/auditly
Environment=NODE_ENV=production
EnvironmentFile=/etc/auditly/%i.env
ExecStart=/usr/bin/npm run worker
Restart=on-failure
RestartSec=5
TimeoutStopSec=45

[Install]
WantedBy=multi-user.target
```

Add `/etc/systemd/system/auditly@web.service.d/start.conf` with the dashboard command.

```ini
[Service]
ExecStart=
ExecStart=/usr/bin/npm run start
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now auditly@web auditly@worker
sudo journalctl -u auditly@web -u auditly@worker -f
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

## 4. Enable browser audits

Install a compatible, security-maintained Chrome or Chromium on the Linux host. Create the
dedicated system account `auditly-browser` with a nologin shell. Give it no access to the app
or its secret files. The browser needs a host that supports Chromium's unprivileged user
namespace sandbox.

Merge the following table into your persistent nftables ruleset under administrator control
and load it before enabling Chromium. The browser can initiate connections only to the
worker's proxy on port 39223. The worker can reach CDP on port 39222. Use the same ports in all
of the examples.

```nft
table inet auditly_browser {
  chain output {
    type filter hook output priority filter; policy accept;
    meta skuid "auditly-browser" oifname "lo" ip daddr 127.0.0.1 tcp dport 39223 accept
    meta skuid "auditly-browser" oifname "lo" ip saddr 127.0.0.1 tcp sport 39222 ct direction reply ct state established accept
    meta skuid "auditly-browser" reject
    ip daddr 127.0.0.1 tcp dport 39222 meta skuid != "auditly-worker" reject
    ip daddr 127.0.0.1 tcp dport 39223 reject
  }
}
```

Keep the nftables service enabled. Use the following unit in
`/etc/systemd/system/auditly-chromium.service`, adjusting the browser and nft executable paths.

```ini
[Unit]
Description=Auditly isolated Chromium
BindsTo=nftables.service
After=nftables.service

[Service]
User=auditly-browser
RuntimeDirectory=auditly-chromium
WorkingDirectory=/run/auditly-chromium
Environment=HOME=/run/auditly-chromium
ProtectHome=true
ProtectSystem=strict
ProtectProc=invisible
PrivateTmp=true
PrivateDevices=true
NoNewPrivileges=true
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
InaccessiblePaths=/opt/auditly /etc/auditly
ExecStartPre=+/usr/sbin/nft list chain inet auditly_browser output
ExecStart=/usr/bin/chromium --headless --user-data-dir=/run/auditly-chromium/profile --remote-debugging-address=127.0.0.1 --remote-debugging-port=39222 --proxy-server=http://127.0.0.1:39223 --proxy-bypass-list=<-loopback> --disable-quic about:blank
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Set `AUDITLY_ISOLATED_CHROMIUM=true` in `worker.env`. Reload systemd, enable and start
`auditly-chromium`, and restart `auditly@worker`. The worker starts its proxy when the first
browser job runs.

Verify that the Chromium sandbox is active and CDP listens only on loopback. From the
`auditly-browser` account, confirm that direct HTTP(S), DNS, and connections to the dashboard
and database fail, and that the worker proxy is reachable during a browser audit. From the
`auditly-web` account, confirm CDP access fails. Repeat these checks after firewall changes.

## 5. Verify the deployment

1. Open the HTTPS dashboard and enter any username with the configured dashboard password.
2. Check `/api/health` for an HTTP 200, then `/api/ready` for HTTP 200 once the database and
   worker heartbeat are online. These endpoints and `/api/metrics` use the same authentication
   as the dashboard.
3. Under **Sites → Add site**, add a hostname your team is authorized to scan. Run a small crawl
   and verify it completes with pages and findings available in the dashboard. If the isolated
   Chromium service is enabled, use **Run performance scan** to audit one of the crawled pages.

For updates, back up PostgreSQL, stop both services, and check out the intended revision.
Repeat the build and migration steps in section 2 before restarting both services.
Verify browser compatibility when Playwright or Chromium changes. Keep the same database to
preserve sites, scan history, and the queue.

When upgrading an earlier installation, check saved site roots and seeds and the previous
application logs for URLs with embedded credentials. Update any affected site URLs through
the dashboard and rotate exposed credentials. Handle affected archived logs and backups under
your organization's retention policy.
