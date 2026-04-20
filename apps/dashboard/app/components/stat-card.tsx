// StatCard — displays a single numeric metric with label and optional trend indicator.
// Value animates from 0 to target on mount (count-up), giving the dashboard life.
// Used for: Sessions, Active Sessions, Tool Calls, Threats, Registered Servers.

'use client';

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  // When true, the value and icon are colored with severity-critical to signal danger
  isAlert?: boolean;
  // Sub-label shown below the value — e.g. "2 active" for a total sessions card
  subLabel?: string;
}

export function StatCard({ label, value, icon: Icon, isAlert, subLabel }: StatCardProps) {
  const animatedValue = useCountUp(value);

  return (
    <div className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-4 transition-colors duration-150 hover:bg-overlay/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-[0.08em] uppercase text-muted">{label}</span>
        <Icon
          size={15}
          className={isAlert && value > 0 ? 'text-critical' : 'text-dim'}
          strokeWidth={1.5}
        />
      </div>

      <div>
        <span
          className={[
            'text-3xl font-bold tabular-nums',
            isAlert && value > 0 ? 'text-critical' : 'text-foreground',
          ].join(' ')}
        >
          {animatedValue}
        </span>
        {subLabel && (
          <span className="ml-2 text-sm text-muted">{subLabel}</span>
        )}
      </div>
    </div>
  );
}

// Count-up hook — animates from 0 to `target` over 600ms on mount.
// Only triggers on initial render — re-renders with a changed value
// update immediately without re-animating (prevents jarring animation on every poll).
function useCountUp(target: number): number {
  const [displayed, setDisplayed] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    // Only animate the very first time a non-zero value arrives
    if (hasAnimated.current || target === 0) {
      setDisplayed(target);
      return;
    }

    hasAnimated.current = true;
    const duration = 600;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out-expo so it decelerates into the final value
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayed(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [target]);

  return displayed;
}
