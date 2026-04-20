// Sidebar — the △ AEGIS identity mark + navigation shell.
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
    // Subtle teal radial glow behind the triangle — the brand is alive, not printed
    <div className="px-5 py-5 border-b border-border-subtle">
      <div className="flex items-center gap-3">
        <div
          className="relative flex items-center justify-center w-8 h-8"
          style={{
            background: 'radial-gradient(circle at 50% 60%, color-mix(in srgb, var(--aegis-accent) 18%, transparent) 0%, transparent 70%)',
          }}
        >
          {/* The △ is the Aegis logo mark — reserved for identity, not decoration */}
          <svg width="20" height="18" viewBox="0 0 20 18" fill="none" aria-label="Aegis">
            <polygon points="10,1 19,17 1,17" fill="none" stroke="var(--aegis-accent)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <span className="text-sm font-semibold tracking-[0.12em] text-foreground uppercase">Aegis</span>
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
