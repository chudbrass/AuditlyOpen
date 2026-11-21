"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type IconName =
  | "dashboard"
  | "portfolio"
  | "sites"
  | "scans"
  | "issues"
  | "alerts"
  | "reports"
  | "tasks"
  | "team"
  | "settings"
  | "rules";

interface NavItem {
  label: string;
  href: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "dashboard" },
  { label: "Sites", href: "/sites", icon: "sites" },
  { label: "Issues", href: "/issues", icon: "issues" },
  { label: "Alerts", href: "/alerts", icon: "alerts" },
  { label: "Tasks", href: "/tasks", icon: "tasks" },
  { label: "Reports", href: "/reports", icon: "reports" },
  { label: "Rules", href: "/rules", icon: "rules" },
  { label: "Team", href: "/team", icon: "team" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <path d="M7 31 18 8c.8-1.7 3.4-1.7 4.2 0L33 31h-6.4l-2.5-6H15.8l-2.5 6H7Z" fill="#2563eb" />
      <path d="M17.7 20.2h4.7L20 14.7l-2.3 5.5Z" fill="#60a5fa" />
      <path d="M11 31 21.3 9.8" stroke="#60a5fa" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

function NavIcon({ name }: { name: IconName }) {
  const shared = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      {name === "dashboard" && (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1.5" {...shared} />
          <rect x="14" y="4" width="6" height="6" rx="1.5" {...shared} />
          <rect x="4" y="14" width="6" height="6" rx="1.5" {...shared} />
          <rect x="14" y="14" width="6" height="6" rx="1.5" {...shared} />
        </>
      )}
      {name === "sites" && (
        <>
          <circle cx="12" cy="12" r="8" {...shared} />
          <path d="M4.7 9h14.6M4.7 15h14.6M12 4a14 14 0 0 1 0 16M12 4a14 14 0 0 0 0 16" {...shared} />
        </>
      )}
      {name === "issues" && (
        <>
          <path d="M12 4 21 20H3L12 4Z" {...shared} />
          <path d="M12 9v5M12 17.5h.01" {...shared} />
        </>
      )}
      {name === "alerts" && (
        <>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9Z" {...shared} />
          <path d="M10 21h4" {...shared} />
        </>
      )}
      {name === "tasks" && (
        <>
          <path d="M9 6h11M9 12h11M9 18h11" {...shared} />
          <path d="m4 6 .8.8L6.5 5M4 12l.8.8L6.5 11M4 18l.8.8L6.5 17" {...shared} />
        </>
      )}
      {name === "reports" && (
        <>
          <path d="M7 3h7l4 4v14H7V3Z" {...shared} />
          <path d="M14 3v5h5M10 13h6M10 17h4" {...shared} />
        </>
      )}
      {name === "rules" && (
        <>
          <path d="M5 12h14M12 5v14" {...shared} />
          <path d="M8 8l-3 4 3 4M16 8l3 4-3 4" {...shared} />
        </>
      )}
      {name === "team" && (
        <>
          <path d="M16 19c0-2-1.8-3.5-4-3.5S8 17 8 19" {...shared} />
          <circle cx="12" cy="9" r="3" {...shared} />
          <path d="M4 18c.2-1.7 1.5-3 3.2-3.3M16.8 14.7c1.7.3 3 1.6 3.2 3.3" {...shared} />
        </>
      )}
      {name === "settings" && (
        <>
          <circle cx="12" cy="12" r="3" {...shared} />
          <path d="M19 12a7.2 7.2 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a6.4 6.4 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a6.4 6.4 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7.2 7.2 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a6.4 6.4 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a6.4 6.4 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" {...shared} />
        </>
      )}
      {name === "portfolio" && <path d="M4 7h16v11H4V7ZM8 7V5h8v2" {...shared} />}
      {name === "scans" && (
        <>
          <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3" {...shared} />
          <path d="M8 12h8" {...shared} />
        </>
      )}
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-blue-600/20 text-blue-100 shadow-[inset_3px_0_0_#3b82f6]"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                active ? "bg-blue-500 text-white" : "bg-white/5 text-slate-400"
              }`}
            >
              <NavIcon name={item.icon} />
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:hidden">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <BrandMark className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight text-slate-950">Auditly</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="ui-button h-10 w-10 border border-slate-200 bg-white text-slate-700 shadow-sm"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
        >
          <span className="flex flex-col gap-1">
            <span className="block h-0.5 w-5 rounded-full bg-current" />
            <span className="block h-0.5 w-5 rounded-full bg-current" />
            <span className="block h-0.5 w-5 rounded-full bg-current" />
          </span>
        </button>
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-52 flex-col bg-audit-navy text-white lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-4 pb-5 pt-5">
          <BrandMark className="h-9 w-9 shrink-0" />
          <span className="text-xl font-bold tracking-tight">Auditly</span>
        </Link>
        {nav}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="relative flex h-full w-[min(19rem,calc(100vw-2rem))] flex-col bg-audit-navy text-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-5 pb-5 pt-5">
              <Link href="/" className="flex min-w-0 items-center gap-2.5" onClick={() => setMobileOpen(false)}>
                <BrandMark className="h-9 w-9 shrink-0" />
                <span className="truncate text-xl font-bold tracking-tight">Auditly</span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="ui-button h-9 w-9 shrink-0 bg-white/10 text-xl leading-none text-white hover:bg-white/15"
                aria-label="Close navigation"
              >
                x
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
