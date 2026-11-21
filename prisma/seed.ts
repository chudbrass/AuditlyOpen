/**
 * Demo seed: a full portfolio — 6 sites, ~60 days of scan history, pages, links, and findings
 * generated from the real rule registry (so the Issues triage filters, Rule Reference links,
 * scores, and trend charts all render exactly as they would after real scans).
 *
 * Idempotent: skips any block whose data already exists. `npm run db:seed -- --fresh` wipes
 * sites/scans/tasks/alerts first and reseeds from scratch.
 */
import {
  PrismaClient,
  Prisma,
  TaskStatus,
  TaskPriority,
  AlertLevel,
  Severity,
} from "@prisma/client";
import { ALL_RULES, AuditRule } from "../src/lib/audits/rules";

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

// Deterministic RNG so re-seeding a fresh DB produces the same believable demo.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260705);
const rand = (min: number, max: number) => min + rng() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const chance = (p: number) => rng() < p;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// ---------------------------------------------------------------------------
// Demo portfolio: each site has a personality (score trajectory + issue mix)
// ---------------------------------------------------------------------------

interface DemoSite {
  name: string;
  rootUrl: string;
  paths: string[];
  startScore: number; // overall score ~60 days ago
  endScore: number; // overall score today
  messiness: number; // 0..1 — scales finding volume on the latest scan
  scheduleCron: string | null;
}

const BLOG_PATHS = [
  "/",
  "/about",
  "/archive",
  "/posts/announcing-v3",
  "/posts/incident-retrospective",
  "/posts/design-tokens-at-scale",
  "/posts/postgres-tuning-notes",
  "/posts/a11y-quick-wins",
  "/posts/hiring-engineers",
  "/tags/engineering",
  "/tags/design",
];

const DEMO_SITES: DemoSite[] = [
  {
    name: "Acme Marketing",
    rootUrl: "https://www.acme.com",
    paths: [
      "/", "/pricing", "/features", "/customers", "/about", "/contact", "/careers",
      "/security", "/product/analytics", "/product/automation", "/product/integrations",
      "/resources", "/resources/webinars", "/resources/case-studies", "/legal/privacy",
      "/legal/terms", "/blog", "/blog/series-b", "/blog/product-update-june", "/demo",
    ],
    startScore: 84,
    endScore: 92,
    messiness: 0.25,
    scheduleCron: "0 3 * * *",
  },
  {
    name: "Acme Docs",
    rootUrl: "https://docs.acme.com",
    paths: [
      "/", "/getting-started", "/installation", "/configuration", "/api/rest",
      "/api/webhooks", "/api/errors", "/guides/sso", "/guides/import", "/guides/export",
      "/reference/cli", "/reference/sdk-js", "/reference/sdk-python", "/changelog", "/faq",
    ],
    startScore: 90,
    endScore: 95,
    messiness: 0.12,
    scheduleCron: "0 4 * * *",
  },
  {
    name: "Acme Store",
    rootUrl: "https://store.acme.com",
    paths: [
      "/", "/catalog", "/catalog/hardware", "/catalog/licenses", "/catalog/swag",
      "/product/9241", "/product/8412", "/product/7770", "/product/6120", "/cart",
      "/checkout", "/account/login", "/account/register", "/support", "/shipping",
      "/returns", "/gift-cards", "/deals",
    ],
    startScore: 74,
    endScore: 58,
    messiness: 0.85,
    scheduleCron: "0 2 * * *",
  },
  {
    name: "Northwind Blog",
    rootUrl: "https://blog.northwind.dev",
    paths: BLOG_PATHS,
    startScore: 68,
    endScore: 79,
    messiness: 0.45,
    scheduleCron: null,
  },
  {
    name: "Bell Preview — Consumer",
    rootUrl: "https://preview.bell-consumer.example",
    paths: [
      "/", "/en/mobility", "/en/internet", "/en/tv", "/en/bundles", "/en/deals",
      "/en/support", "/en/support/billing", "/en/store-locator", "/fr/mobilite",
      "/fr/internet", "/fr/tele", "/fr/forfaits", "/fr/rabais", "/fr/soutien",
      "/en/my-account", "/en/outage-map",
    ],
    startScore: 61,
    endScore: 71,
    messiness: 0.7,
    scheduleCron: "0 */6 * * *",
  },
  {
    name: "Contoso Careers",
    rootUrl: "https://careers.contoso.io",
    paths: [
      "/", "/openings", "/openings/senior-frontend", "/openings/sre", "/openings/pm",
      "/teams/engineering", "/teams/design", "/benefits", "/culture", "/interview-process",
      "/locations", "/faq",
    ],
    startScore: 80,
    endScore: 86,
    messiness: 0.3,
    scheduleCron: "0 5 * * 1",
  },
];

// Canned offending-element snippets keyed by element type — shown in the expanded issue rows.
const SNIPPETS: Record<string, string[]> = {
  images: [
    `<img src="/assets/hero-2400w.jpg">`,
    `<img src="/media/promo-banner.png" class="w-full">`,
    `<img src="/uploads/team-photo.jpg" alt="">`,
  ],
  links: [
    `<a href="/promo" class="card-overlay"></a>`,
    `<a href="/plans">Click here</a>`,
    `<a href="/whitepaper-final-v2.pdf">Download</a>`,
  ],
  forms: [
    `<input type="email" name="newsletter_email" placeholder="Email address">`,
    `<select name="province" onchange="this.form.submit()">…</select>`,
    `<button class="icon-btn"><svg aria-hidden="true">…</svg></button>`,
  ],
  headings: [`<h4 class="section-title">Plans &amp; pricing</h4>`, `<h2 class="visually-styled"></h2>`],
  tables: [`<table class="rate-table"><tr><td>Fibre 1.5</td><td>$95</td></tr>…</table>`],
  media: [`<iframe src="https://player.vimeo.com/video/812345"></iframe>`, `<video autoplay src="/bg-loop.mp4"></video>`],
  aria: [`<div role="lst" class="results"></div>`, `<div aria-hidden="true"><button>Close</button></div>`],
  scripts: [`<div onclick="openPlanModal()" class="plan-card">…</div>`, `<script src="http://cdn.legacy.example/tracker.js"></script>`],
  structure: [`<div id="content" style="width:1180px">…</div>`, `<font color="#666">Legacy notice</font>`],
  metadata: [`<meta name="viewport" content="width=device-width, maximum-scale=1">`],
  content: [`<span style="color:#e00">Press the red button on the right to continue</span>`],
};

// How likely a given rule fires on a messy site (scaled down by site cleanliness).
const SEVERITY_BASE_RATE: Record<Severity, number> = {
  CRITICAL: 0.35,
  SERIOUS: 0.5,
  MODERATE: 0.6,
  MINOR: 0.7,
};

function demoMessage(rule: AuditRule): string {
  // Rules whose real messages embed counts — synthesize a plausible one; otherwise use a
  // generic phrasing derived from the rule name.
  const count = randInt(1, 8);
  const templates: Record<string, string> = {
    "a11y.img-alt": `${count} images without usable alt text`,
    "a11y.link-name": `${count} links with no accessible name`,
    "a11y.button-name": `${count} buttons with no accessible name`,
    "a11y.input-label": `${count} form fields without labels`,
    "a11y.heading-order": `${count} heading level skips`,
    "a11y.empty-heading": `${count} empty headings`,
    "a11y.link-generic-text": `${count} links with generic text`,
    "a11y.duplicate-ids": `${count} id values are reused`,
    "qa.doc-link-unlabeled": `${count} document links that hide their file type`,
    "qa.mixed-content": `${count} insecure (http://) resources on an HTTPS page`,
  };
  return templates[rule.id] ?? rule.name;
}

// ---------------------------------------------------------------------------

async function seedSites(): Promise<void> {
  const existing = await prisma.site.count();
  if (existing > 0) {
    console.log(`sites: ${existing} already present, skipping site/scan seed`);
    return;
  }

  for (const demo of DEMO_SITES) {
    const site = await prisma.site.create({
      data: {
        name: demo.name,
        rootUrl: demo.rootUrl,
        maxPages: 500,
        checkExternalLinks: true,
        scheduleCron: demo.scheduleCron,
      },
    });

    // ~12 scans over the last 60 days. The two most recent scans are fully materialized
    // (pages, links, findings): the previous one carries ~85% of the latest scan's findings
    // plus a few since-fixed extras, so the "vs previous scan" comparison shows believable
    // new/resolved/persisting numbers. The latest scan's real derived score/issue counts
    // anchor the remaining counters-only history.
    const scanCount = randInt(10, 13);
    const latestBlueprint = buildFindingBlueprint(demo);
    const previousBlueprint = [
      ...latestBlueprint.filter(() => chance(0.85)),
      ...buildResolvedExtras(demo, latestBlueprint),
    ];

    await materializeScan(site.id, demo, new Date(NOW - rand(3.5, 5.5) * DAY), previousBlueprint);
    const latest = await materializeScan(
      site.id,
      demo,
      new Date(NOW - rand(0.2, 0.9) * DAY),
      latestBlueprint
    );

    for (let i = 0; i < scanCount - 2; i++) {
      const progress = i / (scanCount - 2);
      const daysAgo = 7 + (1 - progress) * 51 + rand(-1.5, 1.5);
      const overall = Math.round(
        clamp(demo.startScore + (latest.overall - demo.startScore) * progress + rand(-3, 3), 5, 99)
      );
      await createHistoricalScan(site.id, demo, new Date(NOW - daysAgo * DAY), overall, latest);
    }
    console.log(`sites: seeded ${demo.name} (${scanCount} scans)`);
  }
}

interface LatestScanAnchor {
  overall: number;
  issueCounts: { critical: number; serious: number; moderate: number; minor: number };
}

/** Historical scans carry scores + counters only — enough for every trend chart. */
async function createHistoricalScan(
  siteId: string,
  demo: DemoSite,
  startedAt: Date,
  overall: number,
  latest: LatestScanAnchor
): Promise<void> {
  const pagesFound = demo.paths.length + randInt(0, 6);
  const pagesCrawled = pagesFound - randInt(0, 2);
  // issue volume tracks the score trajectory, anchored to the latest scan's real counts
  const scale = clamp((100 - overall) / Math.max(1, 100 - latest.overall), 0.4, 2.5);
  const jitter = () => rand(0.8, 1.2);
  const critical = Math.round(latest.issueCounts.critical * scale * jitter());
  const serious = Math.round(latest.issueCounts.serious * scale * jitter());
  const moderate = Math.round(latest.issueCounts.moderate * scale * jitter());
  const minor = Math.round(latest.issueCounts.minor * scale * jitter());

  await prisma.scan.create({
    data: {
      siteId,
      status: "COMPLETE",
      startedAt,
      finishedAt: new Date(startedAt.getTime() + randInt(4, 18) * 60_000),
      pagesFound,
      pagesCrawled,
      pagesAudited: Math.min(15, pagesCrawled),
      scoreOverall: overall,
      scoreLinks: Math.round(clamp(overall + rand(-4, 8), 10, 100)),
      scoreSeo: Math.round(clamp(overall + rand(-8, 6), 10, 100)),
      scoreA11y: Math.round(clamp(overall + rand(-10, 4), 10, 100)),
      scoreQa: Math.round(clamp(overall + rand(-5, 9), 10, 100)),
      issueCounts: { critical, serious, moderate, minor },
    },
  });
}

/** A page-anchored finding before it's tied to a concrete scan (path instead of pageId). */
interface FindingBlueprint {
  path: string | null; // null = site-wide (e.g. duplicate titles)
  category: "SEO" | "QA" | "A11Y";
  severity: Severity;
  code: string;
  message: string;
  evidence: Record<string, unknown>;
  conformance: string;
  responsibleRole: string;
  elementType: string;
}

/** Registry-driven issue mix for a site, reused across the two materialized scans. */
function buildFindingBlueprint(demo: DemoSite): FindingBlueprint[] {
  const blueprint: FindingBlueprint[] = [];

  for (const rule of ALL_RULES) {
    const fireChance = SEVERITY_BASE_RATE[rule.severity] * demo.messiness * 1.3;
    if (!chance(clamp(fireChance, 0.02, 0.9))) continue;
    const pageHits = randInt(1, Math.max(1, Math.round(demo.paths.length * demo.messiness * 0.35)));
    const hitPaths = [...demo.paths].sort(() => rng() - 0.5).slice(0, pageHits);
    for (const path of hitPaths) {
      blueprint.push({
        path,
        category: rule.conformance === "QA" ? "QA" : rule.conformance === "SEO" ? "SEO" : "A11Y",
        severity: rule.severity,
        code: rule.id,
        message: demoMessage(rule),
        evidence: {
          helpUrl: rule.helpUrl,
          count: randInt(1, 6),
          samples: [pick(SNIPPETS[rule.elementType] ?? SNIPPETS.structure)],
        },
        conformance: rule.conformance,
        responsibleRole: rule.role,
        elementType: rule.elementType,
      });
    }
  }

  // Duplicate-title finding for messy sites (scan-level, no page)
  if (demo.messiness > 0.5) {
    blueprint.push({
      path: null,
      category: "SEO",
      severity: "SERIOUS",
      code: "seo.duplicate-title",
      message: `4 pages share the title "${demo.name}"`,
      evidence: { title: demo.name, pageUrls: demo.paths.slice(0, 4).map((p) => `${demo.rootUrl}${p}`) },
      conformance: "SEO",
      responsibleRole: "author",
      elementType: "metadata",
    });
  }

  return blueprint;
}

/** Findings present in the previous scan but fixed since — the "resolved" side of the compare strip. */
function buildResolvedExtras(demo: DemoSite, latest: FindingBlueprint[]): FindingBlueprint[] {
  const taken = new Set(latest.map((f) => `${f.code}::${f.path ?? ""}`));
  const candidates = ALL_RULES.filter((r) => r.severity !== "CRITICAL");
  const extras: FindingBlueprint[] = [];
  const target = randInt(3, 8);
  for (let attempts = 0; attempts < 40 && extras.length < target; attempts++) {
    const rule = pick(candidates);
    const path = pick(demo.paths);
    const key = `${rule.id}::${path}`;
    if (taken.has(key)) continue;
    taken.add(key);
    extras.push({
      path,
      category: rule.conformance === "QA" ? "QA" : rule.conformance === "SEO" ? "SEO" : "A11Y",
      severity: rule.severity,
      code: rule.id,
      message: demoMessage(rule),
      evidence: {
        helpUrl: rule.helpUrl,
        count: randInt(1, 4),
        samples: [pick(SNIPPETS[rule.elementType] ?? SNIPPETS.structure)],
      },
      conformance: rule.conformance,
      responsibleRole: rule.role,
      elementType: rule.elementType,
    });
  }
  return extras;
}

/** Materialize a complete scan — pages, links, findings — from a blueprint. */
async function materializeScan(
  siteId: string,
  demo: DemoSite,
  startedAt: Date,
  blueprint: FindingBlueprint[]
): Promise<LatestScanAnchor> {
  const scan = await prisma.scan.create({
    data: {
      siteId,
      status: "COMPLETE",
      startedAt,
      finishedAt: new Date(startedAt.getTime() + randInt(6, 20) * 60_000),
      pagesFound: demo.paths.length,
      pagesCrawled: demo.paths.length,
      pagesAudited: Math.min(15, demo.paths.length),
    },
  });

  // Pages
  const target = demo.endScore;
  const auditedCount = Math.min(15, demo.paths.length);
  const pages = await Promise.all(
    demo.paths.map((path, idx) => {
      const audited = idx < auditedCount;
      const perfScore = audited ? randInt(clamp(target - 25, 15, 90), clamp(target + 8, 30, 99)) : null;
      return prisma.page.create({
        data: {
          scanId: scan.id,
          url: `${demo.rootUrl}${path === "/" ? "" : path}`.replace(/\/$/, "") || demo.rootUrl,
          status: audited ? "AUDITED" : "FETCHED",
          httpStatus: 200,
          depth: path === "/" ? 0 : path.split("/").length - 1,
          audited,
          title:
            path === "/"
              ? `${demo.name} — Home`
              : `${path.split("/").filter(Boolean).pop()!.replace(/[-_]/g, " ")} — ${demo.name}`,
          metaDescription: chance(0.75)
            ? `Everything about ${path.split("/").filter(Boolean).pop() ?? "our product"} from ${demo.name}.`
            : null,
          h1Count: chance(0.85) ? 1 : pick([0, 2]),
          perfScore,
          metrics: audited
            ? {
                lcp: Math.round(rand(1200, 5200)),
                cls: Math.round(rand(0, 0.32) * 1000) / 1000,
                tbt: Math.round(rand(40, 900)),
                fcp: Math.round(rand(700, 2600)),
              }
            : undefined,
          fetchedAt: startedAt,
        },
      });
    })
  );

  // Links — mostly healthy, a few broken scaled by messiness
  const linkRows: Prisma.LinkCreateManyInput[] = [];
  for (const page of pages) {
    const linkCount = randInt(4, 9);
    for (let i = 0; i < linkCount; i++) {
      const internal = chance(0.8);
      const broken = chance(demo.messiness * 0.06);
      linkRows.push({
        scanId: scan.id,
        sourceUrl: page.url,
        targetUrl: internal
          ? `${demo.rootUrl}${pick(demo.paths)}`
          : pick([
              "https://twitter.com/acme",
              "https://github.com/acme",
              "https://status.example.com",
              "https://partner-portal.example.net/apply",
              "https://old-cdn.example.org/brochure.pdf",
            ]),
        isInternal: internal,
        httpStatus: broken ? pick([404, 410, 500]) : 200,
        broken,
        error: broken ? null : null,
      });
    }
  }
  await prisma.link.createMany({ data: linkRows });

  // Findings from the blueprint (shared across the two materialized scans so the
  // vs-previous-scan comparison sees persisting issues)
  const pageByPath = new Map(demo.paths.map((path, i) => [path, pages[i]]));
  const findingRows: Prisma.FindingCreateManyInput[] = blueprint.map((f) => {
    const page = f.path !== null ? pageByPath.get(f.path) : undefined;
    return {
      scanId: scan.id,
      pageId: page?.id ?? null,
      category: f.category,
      severity: f.severity,
      code: f.code,
      message: f.message,
      evidence: { pageUrl: page?.url, ...f.evidence } as Prisma.InputJsonValue,
      conformance: f.conformance,
      responsibleRole: f.responsibleRole,
      elementType: f.elementType,
    };
  });

  // Broken-link findings consistent with the Link rows
  for (const link of linkRows.filter((l) => l.broken)) {
    const page = pages.find((p) => p.url === link.sourceUrl);
    findingRows.push({
      scanId: scan.id,
      pageId: page?.id ?? null,
      category: "LINKS",
      severity: link.isInternal ? "SERIOUS" : "MODERATE",
      code: link.isInternal ? "links.broken-internal" : "links.broken-external",
      message: `Broken ${link.isInternal ? "internal" : "external"} link: ${link.targetUrl}`,
      evidence: {
        sourceUrl: link.sourceUrl,
        targetUrl: link.targetUrl,
        httpStatus: link.httpStatus ?? null,
      },
      conformance: "QA",
      responsibleRole: "author",
      elementType: "links",
    });
  }

  await prisma.finding.createMany({ data: findingRows });

  // Derive real scores + issue counts from what we actually created, so every widget agrees.
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const f of findingRows) {
    bySeverity[f.severity!.toLowerCase() as keyof typeof bySeverity]++;
  }
  const weight = { CRITICAL: 25, SERIOUS: 15, MODERATE: 7, MINOR: 3 } as Record<string, number>;
  const density = (cat: string) =>
    findingRows
      .filter((f) => f.category === cat)
      .reduce((sum, f) => sum + weight[f.severity as string], 0) / pages.length;
  const catScore = (cat: string) => Math.max(0, Math.round(100 - density(cat)));

  const brokenCount = linkRows.filter((l) => l.broken).length;
  const scoreLinks = Math.max(0, Math.round(100 * (1 - brokenCount / linkRows.length)));
  const scoreSeo = catScore("SEO");
  const scoreQa = catScore("QA");
  const scoreA11y = catScore("A11Y");
  const present = [scoreLinks, scoreSeo, scoreQa, scoreA11y].filter(
    (s): s is number => s !== null
  );

  const scoreOverall = Math.round(present.reduce((a, b) => a + b, 0) / present.length);
  await prisma.scan.update({
    where: { id: scan.id },
    data: {
      scoreLinks,
      scoreSeo,
      scoreQa,
      scoreA11y,
      scoreOverall,
      issueCounts: bySeverity,
    },
  });

  return { overall: scoreOverall, issueCounts: bySeverity };
}

// ---------------------------------------------------------------------------

const TEAM = [
  { name: "Sophia Moore", email: "sophia@example.com", role: "Admin" },
  { name: "Ethan Clark", email: "ethan@example.com", role: "Member" },
  { name: "Maya Patel", email: "maya@example.com", role: "Member" },
  { name: "Liam Johnson", email: "liam@example.com", role: "Member" },
  { name: "Olivia Smith", email: "olivia@example.com", role: "Viewer" },
];

async function seedTeam() {
  for (const member of TEAM) {
    await prisma.teamMember.upsert({
      where: { email: member.email },
      update: {},
      create: member,
    });
  }
  console.log(`team: ${TEAM.length} members`);
}

async function seedTasks() {
  const existing = await prisma.task.count();
  if (existing > 0) {
    console.log(`tasks: ${existing} already present, skipping`);
    return;
  }
  const members = await prisma.teamMember.findMany();
  const sites = await prisma.site.findMany({ select: { id: true, rootUrl: true, name: true } });
  if (sites.length === 0) {
    console.log("tasks: no sites, skipping");
    return;
  }
  const siteFor = (i: number) => sites[i % sites.length];

  const rows: {
    title: string;
    description?: string;
    status: TaskStatus;
    priority: TaskPriority;
    assigneeIdx: number;
    siteIdx: number;
    findingCode?: string;
    path?: string;
    dueOffsetDays: number;
  }[] = [
    { title: "Fix broken checkout link", description: "404 from the pricing page footer.", status: "OPEN", priority: "URGENT", assigneeIdx: 1, siteIdx: 2, findingCode: "links.broken-internal", path: "/checkout", dueOffsetDays: 1 },
    { title: "Add alt text to hero images", status: "IN_PROGRESS", priority: "HIGH", assigneeIdx: 2, siteIdx: 2, findingCode: "a11y.img-alt", path: "/", dueOffsetDays: 3 },
    { title: "Resolve color-contrast violations on nav", status: "IN_PROGRESS", priority: "HIGH", assigneeIdx: 1, siteIdx: 4, findingCode: "a11y.color-contrast", path: "/en/mobility", dueOffsetDays: 4 },
    { title: "Write meta descriptions for blog posts", status: "OPEN", priority: "MEDIUM", assigneeIdx: 3, siteIdx: 3, findingCode: "seo.missing-meta-description", dueOffsetDays: 7 },
    { title: "Investigate slow LCP on landing page", status: "OPEN", priority: "HIGH", assigneeIdx: 2, siteIdx: 0, findingCode: "performance.needs-improvement", path: "/", dueOffsetDays: 5 },
    { title: "Add labels to newsletter signup form", status: "COMPLETED", priority: "MEDIUM", assigneeIdx: 3, siteIdx: 0, findingCode: "a11y.input-label", dueOffsetDays: -2 },
    { title: "Deduplicate page titles on product pages", status: "COMPLETED", priority: "LOW", assigneeIdx: 0, siteIdx: 2, findingCode: "seo.duplicate-title", dueOffsetDays: -5 },
    { title: "Set canonical URLs sitewide", status: "OPEN", priority: "LOW", assigneeIdx: 4, siteIdx: 1, findingCode: "seo.missing-canonical", dueOffsetDays: 14 },
    { title: "Add hreflang alternates for EN/FR pages", status: "OPEN", priority: "MEDIUM", assigneeIdx: 1, siteIdx: 4, findingCode: "seo.missing-hreflang", dueOffsetDays: 6 },
    { title: "Replace onclick divs with buttons in plan cards", status: "IN_PROGRESS", priority: "HIGH", assigneeIdx: 0, siteIdx: 4, findingCode: "a11y.clickable-div", path: "/en/bundles", dueOffsetDays: 2 },
    { title: "Review external link policy", description: "Several outbound links 301 through trackers.", status: "OPEN", priority: "MEDIUM", assigneeIdx: 0, siteIdx: 0, dueOffsetDays: -1 },
  ];

  await prisma.task.createMany({
    data: rows.map((r) => {
      const site = siteFor(r.siteIdx);
      return {
        title: r.title,
        description: r.description ?? null,
        status: r.status,
        priority: r.priority,
        siteId: site.id,
        assigneeId: members[r.assigneeIdx % members.length]?.id ?? null,
        findingCode: r.findingCode ?? null,
        pageUrl: r.path ? `${site.rootUrl}${r.path === "/" ? "" : r.path}` : null,
        dueAt: new Date(NOW + r.dueOffsetDays * DAY),
      };
    }),
  });
  console.log(`tasks: seeded ${rows.length}`);
}

async function seedAlerts() {
  const existing = await prisma.alert.count();
  if (existing > 0) {
    console.log(`alerts: ${existing} already present, skipping`);
    return;
  }
  const sites = await prisma.site.findMany({ select: { id: true, name: true } });
  if (sites.length === 0) {
    console.log("alerts: no sites, skipping");
    return;
  }
  const hour = 60 * 60 * 1000;
  const store = sites.find((s) => s.name.includes("Store")) ?? sites[0];
  const bell = sites.find((s) => s.name.includes("Bell")) ?? sites[0];
  const docs = sites.find((s) => s.name.includes("Docs")) ?? sites[0];
  const samples: { siteId: string; level: AlertLevel; message: string; hoursAgo: number; read: boolean }[] = [
    { siteId: store.id, level: "CRITICAL", message: "Critical issues increased (3 → 9)", hoursAgo: 2, read: false },
    { siteId: store.id, level: "WARNING", message: "Site health dropped 8 points since last scan (66 → 58)", hoursAgo: 2, read: false },
    { siteId: bell.id, level: "WARNING", message: "High issue spike detected (24 → 41)", hoursAgo: 7, read: false },
    { siteId: docs.id, level: "OK", message: "Scan complete — no critical issues", hoursAgo: 11, read: true },
    { siteId: bell.id, level: "INFO", message: "Sitemap updated — 3 new pages discovered", hoursAgo: 26, read: true },
    { siteId: sites[0].id, level: "INFO", message: "Issues down 6 since last scan (31 → 25)", hoursAgo: 30, read: true },
    { siteId: store.id, level: "WARNING", message: "12% of discovered pages were not scanned", hoursAgo: 49, read: true },
  ];
  await prisma.alert.createMany({
    data: samples.map((s) => ({
      siteId: s.siteId,
      level: s.level,
      message: s.message,
      read: s.read,
      createdAt: new Date(NOW - s.hoursAgo * hour),
    })),
  });
  console.log(`alerts: seeded ${samples.length}`);
}

async function resetDemoData() {
  console.log("fresh: wiping sites, scans, tasks, and alerts…");
  await prisma.task.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.site.deleteMany(); // cascades to scans/pages/links/findings
}

async function main() {
  if (process.argv.includes("--fresh")) await resetDemoData();
  await seedSites();
  await seedTeam();
  await seedTasks();
  await seedAlerts();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
