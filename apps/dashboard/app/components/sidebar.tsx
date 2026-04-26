// Sidebar — Geometric A mark (D-034) + Rind wordmark + navigation shell.
// Uses Next.js Link + usePathname for client-side routing.
// Active state is derived from the current URL, not hardcoded.
// Collapsible: toggle shrinks to icon-only mode; state persisted in localStorage.

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Shield, ScrollText, Settings, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const NAV_ITEMS = [
  { icon: Activity,   label: 'Overview',  href: '/'         },
  { icon: Search,     label: 'Logs',      href: '/logs'     },
  { icon: Shield,     label: 'Policies',  href: '/policies' },
  { icon: ScrollText, label: 'Audit Log', href: '/audit'    },
  { icon: Settings,   label: 'Settings',  href: '/settings' },
] as const;

// Routes that are built and navigable (all others show "soon")
const ACTIVE_ROUTES = new Set(['/', '/policies', '/logs']);

const STORAGE_KEY = 'rind-sidebar-collapsed';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) === 'true' : false
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <aside
      className={[
        'shrink-0 flex flex-col border-r border-border bg-surface h-screen sticky top-0',
        'transition-[width] duration-200 ease-in-out overflow-hidden',
        collapsed ? 'w-14' : 'w-60',
      ].join(' ')}
    >
      <LogoMark collapsed={collapsed} />
      <Nav collapsed={collapsed} />
      <SidebarFooter collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
    </aside>
  );
}

function LogoMark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="px-3 py-4 border-b border-border-subtle">
      <Link href="/" className="flex items-center gap-3 group min-w-0">
        <div
          className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-canvas border border-border-subtle shrink-0 overflow-hidden"
          style={{
            boxShadow: [
              '0 0 0 1px color-mix(in srgb, var(--rind-accent) 15%, transparent)',
              'inset 0 1px 0 rgba(255,255,255,0.06)',
            ].join(', '),
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 80% 60% at 50% 100%, color-mix(in srgb, var(--rind-accent) 14%, transparent), transparent)',
            }}
          />
          <svg width="22" height="22" viewBox="-2 -2 68 68" fill="none" aria-label="Rind" className="relative">
            <defs>
              <linearGradient id="rind-mark-grad" x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="var(--rind-accent-light)" />
                <stop offset="100%" stopColor="var(--rind-accent)" />
              </linearGradient>
            </defs>
            <g transform="rotate(8 32 32)">
              <circle cx="32" cy="32" r="32" stroke="url(#rind-mark-grad)" strokeWidth="3" />
              <circle cx="32" cy="32" r="22" stroke="url(#rind-mark-grad)" strokeWidth="2" />
              <line x1="32" y1="0" x2="32" y2="10" stroke="url(#rind-mark-grad)" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="block text-sm font-semibold tracking-[0.12em] text-foreground uppercase">Rind</span>
            <span className="block text-[10px] text-muted tracking-wide">Control Plane · v0.1</span>
          </div>
        )}
      </Link>
    </div>
  );
}

function Nav({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <nav className={['flex-1 py-4 space-y-0.5', collapsed ? 'px-1.5' : 'px-3'].join(' ')}>
      {NAV_ITEMS.map((item) => {
        const isBuilt   = ACTIVE_ROUTES.has(item.href);
        const isActive  = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        return (
          <NavItem
            key={item.label}
            icon={item.icon}
            label={item.label}
            href={item.href}
            active={isActive}
            built={isBuilt}
            collapsed={collapsed}
          />
        );
      })}
    </nav>
  );
}

interface NavItemProps {
  icon: typeof NAV_ITEMS[number]['icon'];
  label: string;
  href: string;
  active: boolean;
  built: boolean;
  collapsed: boolean;
}

function NavItem({ icon: Icon, label, href, active, built, collapsed }: NavItemProps) {
  const className = [
    'flex items-center rounded-md text-sm transition-colors duration-150',
    collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2',
    active
      ? 'bg-overlay text-foreground'
      : 'text-muted hover:text-foreground hover:bg-overlay/60',
    !built ? 'cursor-default pointer-events-none' : 'cursor-pointer',
  ].join(' ');

  const inner = (
    <>
      <Icon size={15} className={active ? 'text-accent' : 'text-dim'} strokeWidth={active ? 2 : 1.5} />
      {!collapsed && (
        <>
          <span>{label}</span>
          {!built && (
            <span className="ml-auto text-[10px] text-dim border border-border-subtle rounded px-1.5 py-0.5">
              soon
            </span>
          )}
        </>
      )}
    </>
  );

  const el = built
    ? <Link href={href} className={className}>{inner}</Link>
    : <div className={className}>{inner}</div>;

  if (collapsed) {
    return (
      <div title={label + (!built ? ' (coming soon)' : '')}>
        {el}
      </div>
    );
  }

  return el;
}

function SidebarFooter({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className={['border-t border-border-subtle flex items-center', collapsed ? 'flex-col gap-2 px-1.5 py-3' : 'px-4 py-4 justify-between'].join(' ')}>
      {!collapsed && (
        <p className="text-[10px] text-dim leading-relaxed">
          Phase 1 · MCP Proxy
          <br />
          Proxy on <span className="font-mono text-muted">:7777</span>
        </p>
      )}
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="p-1.5 rounded text-dim hover:text-foreground hover:bg-overlay transition-colors duration-150 shrink-0"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </div>
  );
}
