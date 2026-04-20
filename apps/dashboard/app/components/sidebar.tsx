// Sidebar — the Geometric A mark (D-034) + RIND wordmark + navigation shell.
// Phase 1: single active route (overview). Phase 2 will add sessions, policies, audit log.
// The sidebar is static — no client interactivity needed.

import { Activity, Shield, ScrollText, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { icon: Activity,    label: 'Overview',  active: true  },
  { icon: Shield,      label: 'Policies',  active: false },
  { icon: ScrollText,  label: 'Audit Log', active: false },
  { icon: Settings,    label: 'Settings',  active: false },
] as const;

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 flex flex-col border-r border-border bg-surface h-screen sticky top-0">
      <LogoMark />
      <Nav />
      <SidebarFooter />
    </aside>
  );
}

function LogoMark() {
  return (
    <div className="px-4 py-4 border-b border-border-subtle">
      <div className="flex items-center gap-3">
        {/*
          Icon chip: dark canvas bg + subtle border + teal ambient glow.
          The contained shape gives the mark visual anchoring — floating lines
          on a flat bg read as a sketch; a chip reads as a product.
        */}
        <div
          className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-canvas border border-border-subtle shrink-0 overflow-hidden"
          style={{
            boxShadow: [
              '0 0 0 1px color-mix(in srgb, var(--rind-accent) 15%, transparent)',
              'inset 0 1px 0 rgba(255,255,255,0.06)',
            ].join(', '),
          }}
        >
          {/* Teal wash rising from the base — gives the mark a light source */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 80% 60% at 50% 100%, color-mix(in srgb, var(--rind-accent) 14%, transparent), transparent)',
            }}
          />
          {/*
            Geometric A mark — D-034 canonical spec.
            Gradient stroke: lighter teal at apex → standard teal at base.
            Crossbar sits at 55% height, mathematically aligned to the diagonals.
          */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-label="Rind" className="relative">
            <defs>
              <linearGradient id="rind-mark-grad" x1="10" y1="2" x2="10" y2="18" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="var(--rind-accent-light)" />
                <stop offset="100%" stopColor="var(--rind-accent)" />
              </linearGradient>
            </defs>
            <line x1="3"  y1="18" x2="10" y2="2"  stroke="url(#rind-mark-grad)" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="17" y1="18" x2="10" y2="2"  stroke="url(#rind-mark-grad)" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="5"  y1="12" x2="15" y2="12" stroke="url(#rind-mark-grad)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0">
          <span className="block text-sm font-semibold tracking-[0.12em] text-foreground uppercase">Rind</span>
          <span className="block text-[10px] text-muted tracking-wide">Control Plane · v0.1</span>
        </div>
      </div>
    </div>
  );
}

function Nav() {
  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {NAV_ITEMS.map((item) => (
        <NavItem key={item.label} {...item} />
      ))}
    </nav>
  );
}

function NavItem({ icon: Icon, label, active }: typeof NAV_ITEMS[number]) {
  return (
    <div
      className={[
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors duration-150',
        active
          ? 'bg-overlay text-foreground'
          : 'text-muted hover:text-foreground hover:bg-overlay/60',
      ].join(' ')}
    >
      <Icon
        size={15}
        className={active ? 'text-accent' : 'text-dim'}
        strokeWidth={active ? 2 : 1.5}
      />
      <span>{label}</span>
      {/* Disabled items show a pill so devs know Phase 2 is coming */}
      {!active && (
        <span className="ml-auto text-[10px] text-dim border border-border-subtle rounded px-1.5 py-0.5">
          soon
        </span>
      )}
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="px-5 py-4 border-t border-border-subtle">
      <p className="text-[10px] text-dim leading-relaxed">
        Phase 1 · MCP Proxy
        <br />
        Proxy on <span className="font-mono text-muted">:7777</span>
      </p>
    </div>
  );
}
