# Rind UI Design Guidelines

## Design Philosophy

> **Enterprise-grade, modern, professional** - Not a developer side project, but a product enterprises trust with their AI security.

> **Seamless and Intuitive** - Every feature must feel natural. If a user has to think about how to use it, we've failed.

---

## Dual-Experience Architecture

Rind provides **two distinct experiences** built on the **same underlying data**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   ┌─────────────────────┐         ┌─────────────────────┐           │
│   │  DEVELOPER PORTAL   │         │  SECURITY CONSOLE   │           │
│   │                     │         │                     │           │
│   │  • Quick onboarding │         │  • Policy management│           │
│   │  • SDK snippets     │         │  • Compliance reports│          │
│   │  • Agent debugging  │         │  • Threat detection │           │
│   │  • Trace explorer   │         │  • Audit trails     │           │
│   │  • "What's my agent │         │  • "What risks exist│           │
│   │    doing?"          │         │    across all agents?"│         │
│   │                     │         │                     │           │
│   └──────────┬──────────┘         └──────────┬──────────┘           │
│              │                               │                       │
│              └───────────────┬───────────────┘                       │
│                              │                                       │
│              ┌───────────────▼───────────────┐                       │
│              │     SHARED DATA LAYER         │                       │
│              │                               │                       │
│              │  • Same policies              │                       │
│              │  • Same audit logs            │                       │
│              │  • Same agent registry        │                       │
│              │  • Real-time sync             │                       │
│              └───────────────────────────────┘                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Developer Portal (Primary Entry Point)

**Persona:** ML engineers, platform engineers, developers building agents
**Goal:** Ship faster with security built-in

| Principle | Implementation |
|-----------|----------------|
| **Minutes to value** | One-line SDK install → immediate traces |
| **Code-centric** | Copy-paste snippets, CLI commands |
| **Non-blocking** | Security doesn't slow down iteration |
| **Self-service** | No tickets to security team needed |

**Key Screens:**
- Quickstart wizard (3 steps max)
- Trace explorer (debug individual requests)
- Agent dashboard (my agents only)
- SDK documentation (inline, contextual)

### Security Console

**Persona:** Security engineers, CISOs, compliance officers
**Goal:** Complete visibility and control across all agents

| Principle | Implementation |
|-----------|----------------|
| **Organization-wide view** | All agents, all teams, all policies |
| **Policy-as-code** | YAML editor with validation |
| **Compliance-ready** | Export-ready audit reports |
| **Threat-focused** | Anomalies, violations, risks |

**Key Screens:**
- Security dashboard (org-wide metrics)
- Policy editor (Monaco with validation)
- Compliance center (SOC2, GDPR, EU AI Act)
- Threat timeline (cross-agent anomalies)

### Shared Principles (Both Experiences)

1. **Same data, different lens** - Developer sees their agents; Security sees all agents
2. **Policies apply universally** - Security sets rules, developers work within them
3. **Real-time sync** - Changes in one experience reflect immediately in the other
4. **Graceful handoff** - Easy to escalate from dev to security when needed

---

## Seamless UX Principles

### 1. Zero-Friction Onboarding

```
Step 1: Create account (SSO or email)
Step 2: Copy SDK snippet
Step 3: See first trace

Target: < 5 minutes from signup to value
```

### 2. Progressive Disclosure

- **Level 1 (Default):** Essential info only, smart defaults
- **Level 2 (Expand):** More options for power users
- **Level 3 (Advanced):** Full control via YAML/API

**Example:** Policy creation
- Level 1: "Block dangerous SQL" (one click)
- Level 2: Choose which tools, set severity
- Level 3: Full YAML editor

### 3. Contextual Help (Not Separate Docs)

- Tooltips on complex fields
- "Learn more" expands inline, doesn't navigate away
- Example values pre-filled in empty states
- Error messages include fix suggestions

### 4. Immediate Feedback

- Real-time validation as you type
- Optimistic UI updates (don't wait for server)
- Clear success/error states
- Undo for destructive actions

### 5. Keyboard-First Power Users

- Command palette (⌘K) for quick navigation
- Keyboard shortcuts for common actions
- Vim-mode option in code editors
- Tab-through all interactive elements

---

## Core Principles

### 1. Professional & Trustworthy

This is a **security product**. The UI must convey:
- Stability and reliability
- Expertise and competence
- Enterprise readiness

**Do:**
- Clean, uncluttered layouts
- Consistent spacing and alignment
- Professional typography
- Subtle, purposeful animations

**Don't:**
- Playful or whimsical elements
- Bright, distracting colors
- Cheap-looking components
- Cluttered information density

### 2. Modern & Contemporary

Stay current with 2025-2026 design trends:
- Clean minimalism with purpose
- Subtle depth (shadows, layers)
- Smooth micro-interactions
- Dark mode first (security tools)

**Reference Products:**
- Linear (project management)
- Vercel Dashboard
- Stripe Dashboard
- Datadog (observability)
- Wiz (cloud security)

### 3. Information Dense But Scannable

Security dashboards need to show a lot of data. Balance:
- Information density (show what matters)
- Visual hierarchy (what's important)
- Scannability (quick comprehension)

---

## Visual Language

### Colors

```
Primary:     #0F172A (Slate 900) - Deep navy, professional
Accent:      #3B82F6 (Blue 500) - Trust, security
Success:     #10B981 (Emerald 500) - Allowed, healthy
Warning:     #F59E0B (Amber 500) - Attention needed
Danger:      #EF4444 (Red 500) - Blocked, critical
Background:  #020617 (Slate 950) - Dark mode base
Surface:     #0F172A (Slate 900) - Cards, panels
Border:      #1E293B (Slate 800) - Subtle separation
Text:        #F8FAFC (Slate 50) - Primary text
Text Muted:  #94A3B8 (Slate 400) - Secondary text
```

### Typography

```
Font Family: Inter (headings), JetBrains Mono (code/policies)
Scale:
  - Display: 36px / 2.25rem
  - H1: 30px / 1.875rem
  - H2: 24px / 1.5rem
  - H3: 20px / 1.25rem
  - Body: 14px / 0.875rem
  - Small: 12px / 0.75rem
  - Code: 13px / JetBrains Mono
```

### Spacing

```
Base unit: 4px
Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96
Page padding: 24px (mobile), 48px (desktop)
Card padding: 16px (compact), 24px (standard)
```

### Shadows & Depth

```
Elevation 1 (cards):     0 1px 3px rgba(0,0,0,0.3)
Elevation 2 (dropdowns): 0 4px 6px rgba(0,0,0,0.3)
Elevation 3 (modals):    0 10px 25px rgba(0,0,0,0.4)
```

---

## Component Standards

### Cards

```
- Background: Surface color (#0F172A)
- Border: 1px solid Border color (#1E293B)
- Border radius: 8px
- Padding: 24px
- Shadow: Elevation 1
```

### Buttons

```
Primary:   Blue background, white text, hover darken
Secondary: Transparent, border, white text
Danger:    Red background, white text
Ghost:     No border, subtle hover background

Size:
  - sm: 32px height, 12px padding
  - md: 40px height, 16px padding (default)
  - lg: 48px height, 24px padding
```

### Forms

```
Input:
  - Background: Slate 800
  - Border: 1px solid Slate 700
  - Border radius: 6px
  - Height: 40px
  - Focus: Blue border, subtle glow

Labels:
  - Size: 14px
  - Weight: 500
  - Color: Slate 200
  - Margin bottom: 6px
```

### Tables

```
- Header: Slate 800 background, uppercase small text
- Rows: Alternate Slate 900 / transparent
- Hover: Slate 800
- Border: Bottom only, Slate 800
- Padding: 12px 16px
```

### Navigation

```
Sidebar:
  - Width: 240px (expanded), 64px (collapsed)
  - Background: Slate 950
  - Active: Blue background, white text
  - Hover: Slate 800

Topbar:
  - Height: 64px
  - Background: Slate 950
  - Border bottom: 1px Slate 800
```

---

## Page Layouts

### Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ Logo        Search                     Alerts  User Avatar      │
├──────────┬──────────────────────────────────────────────────────┤
│          │                                                       │
│ Sidebar  │  ┌─────────────────────────────────────────────────┐ │
│          │  │ Key Metrics (cards row)                          │ │
│ - Dash   │  │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                 │ │
│ - Agents │  │ │Evals│ │Blocked│ │Agents│ │Cost │               │ │
│ - Keys   │  │ └─────┘ └─────┘ └─────┘ └─────┘                 │ │
│ - Policies│ └─────────────────────────────────────────────────┘ │
│ - Audit  │                                                       │
│ - MCPs   │  ┌─────────────────────┐ ┌─────────────────────────┐ │
│          │  │ Recent Activity     │ │ Policy Violations       │ │
│ ──────── │  │ (timeline)          │ │ (chart)                 │ │
│ Settings │  │                     │ │                         │ │
│          │  └─────────────────────┘ └─────────────────────────┘ │
│          │                                                       │
└──────────┴──────────────────────────────────────────────────────┘
```

### List Pages (Agents, Keys, Policies)

```
┌─────────────────────────────────────────────────────────────────┐
│ Page Title                          [Filter] [Search] [+ New]   │
├─────────────────────────────────────────────────────────────────┤
│ Tabs: All | Active | Inactive                                   │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Table with sortable columns                                  │ │
│ │                                                              │ │
│ │ Name ▼     Status    Created    Actions                     │ │
│ │ ─────────────────────────────────────────────               │ │
│ │ Agent 1    ● Active  2h ago     [View] [Edit] [...]         │ │
│ │ Agent 2    ○ Paused  1d ago     [View] [Edit] [...]         │ │
│ │                                                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ Showing 1-10 of 42                          [<] 1 2 3 4 5 [>]   │
└─────────────────────────────────────────────────────────────────┘
```

### Detail Pages (Single Agent, Policy)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back    Agent: production-assistant                [Actions ▼]│
├─────────────────────────────────────────────────────────────────┤
│ Tabs: Overview | Audit Log | Policies | Settings                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌─────────────────────────┐ ┌─────────────────────────────────┐ │
│ │ Status                  │ │ Activity Graph                  │ │
│ │ ● Active               │ │                                  │ │
│ │                        │ │ ▃▅▇▅▃▅▇█▅▃                       │ │
│ │ Key: rind_sk_...      │ │                                  │ │
│ │ Created: Mar 15, 2026  │ │ Last 24 hours                    │ │
│ └─────────────────────────┘ └─────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Recent Audit Entries                                        │ │
│ │                                                              │ │
│ │ 10:32:15  ALLOW   sql_execute  SELECT * FROM users         │ │
│ │ 10:31:42  DENY    sql_execute  DROP TABLE users            │ │
│ │                                                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Policy Editor

### YAML Editor with Monaco

```
┌─────────────────────────────────────────────────────────────────┐
│ Policy: block-dangerous-queries                      [Save] [Test]│
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 1  - name: "block-dangerous-queries"                        │ │
│ │ 2    type: tool_call                                        │ │
│ │ 3    priority: 1                                            │ │
│ │ 4                                                           │ │
│ │ 5    match:                                                 │ │
│ │ 6      tools: ["sql_execute"]                               │ │
│ │ 7      parameters:                                          │ │
│ │ 8        query:                                             │ │
│ │ 9          regex: "(DROP|DELETE|TRUNCATE)"                  │ │
│ │10                                                           │ │
│ │11    action: DENY                                           │ │
│ │12    response:                                              │ │
│ │13      message: "Destructive queries blocked"               │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ Validation: ✓ Valid policy                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Features:
- Syntax highlighting (YAML)
- Real-time validation
- Autocomplete for policy fields
- Inline error markers
- Test with sample request

---

## Micro-Interactions

### Loading States

- Skeleton loaders for content (not spinners)
- Subtle pulse animation
- Progressive loading (show what's ready)

### Transitions

- Page transitions: 200ms ease-out
- Modal entrance: 150ms scale + fade
- Sidebar collapse: 200ms ease
- Hover states: 100ms

### Feedback

- Button click: Subtle scale (0.98) + color change
- Form submit: Loading state in button
- Success: Toast notification (top right)
- Error: Inline message + toast for critical

---

## Responsive Design

### Breakpoints

```
sm:  640px  (mobile landscape)
md:  768px  (tablet)
lg:  1024px (laptop)
xl:  1280px (desktop)
2xl: 1536px (large desktop)
```

### Mobile Considerations

- Sidebar becomes bottom nav or hamburger
- Tables become cards on mobile
- Touch-friendly tap targets (44px min)
- Simplified metrics on small screens

---

## Accessibility

### Requirements

- WCAG 2.1 AA compliance
- Keyboard navigation (full)
- Screen reader support
- Color contrast ratios (4.5:1 text, 3:1 UI)
- Focus indicators (visible, high contrast)
- ARIA labels on interactive elements

### Testing

- Test with VoiceOver (macOS)
- Test with keyboard only
- Run axe-core in CI

---

## Tech Stack

### Recommended

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui (customized)
- **Charts:** Recharts or Tremor
- **Code Editor:** Monaco Editor
- **Icons:** Lucide React
- **Forms:** React Hook Form + Zod
- **Tables:** TanStack Table

### Why shadcn/ui?

- Not a component library (copy-paste, own the code)
- Tailwind-based (consistent with our styling)
- Accessible by default
- Highly customizable
- Used by Vercel, Linear aesthetics

---

## Inspiration Gallery

### Security Products
- **Wiz** - Cloud security, clean dashboard
- **Snyk** - Developer security, modern feel
- **CrowdStrike** - Enterprise security, data-rich

### Developer Tools
- **Linear** - Minimal, fast, keyboard-first
- **Vercel** - Clean, modern, developer-focused
- **Railway** - Beautiful, simple infrastructure

### Observability
- **Datadog** - Information dense but clear
- **Grafana** - Flexible dashboards
- **Honeycomb** - Query-focused UI

---

## Review Checklist

Before shipping any UI:

- [ ] Dark mode looks professional (not just inverted)
- [ ] Information hierarchy is clear
- [ ] Loading states for all async operations
- [ ] Error states handled gracefully
- [ ] Keyboard navigation works
- [ ] Touch targets are 44px+ on mobile
- [ ] Typography is consistent
- [ ] Spacing follows the scale
- [ ] No accessibility errors (axe)
- [ ] Looks good at 1280px and 1920px

---

## UX Anti-Patterns (Never Do These)

### Friction Points to Eliminate

| Anti-Pattern | Why It's Bad | What to Do Instead |
|--------------|--------------|---------------------|
| **Requiring config before value** | Users bounce | Show value first, configure later |
| **Modal overload** | Feels like bureaucracy | Inline editing, sheets from edge |
| **Vague errors** | "Something went wrong" | Specific message + action to fix |
| **Loading without context** | Users don't know what's happening | Skeleton + "Loading policies..." |
| **Hiding behind menus** | Key actions get lost | Surface important actions |
| **Forcing full-page reloads** | Breaks flow | SPA navigation, optimistic updates |
| **Unclear empty states** | Users confused | Clear message + single action CTA |
| **Terminology overload** | "Configure your RBAC IAM policy" | Plain language, jargon on hover |

### Developer-Hostile Patterns

- Requiring GUI for everything (let me use CLI/API)
- Hiding copy buttons on code snippets
- Auto-formatting code differently than my editor
- Breaking SDK changes without migration guides
- Slow API responses that block iteration

### Security-Hostile Patterns

- No export capability for compliance audits
- Missing audit timestamps or actor info
- Policies that can be bypassed by developers
- No bulk operations for managing at scale
- Alert fatigue from noise

---

## Design Review Questions

Before shipping any feature, ask:

**Seamlessness:**
- [ ] Can a new user complete this in < 30 seconds?
- [ ] Are there fewer than 3 clicks to accomplish the goal?
- [ ] Does it work without reading documentation?
- [ ] Is the happy path obvious?

**Intuitiveness:**
- [ ] Would a developer understand this without security expertise?
- [ ] Would a security engineer understand this without dev expertise?
- [ ] Are labels clear and jargon-free?
- [ ] Do similar actions look similar?

**Developer Experience:**
- [ ] Can I copy-paste and it works?
- [ ] Is there a CLI/API alternative?
- [ ] Does it integrate with my existing workflow?
- [ ] Is it fast enough for iteration?

**Security Experience:**
- [ ] Can I see the full picture at a glance?
- [ ] Can I drill down when needed?
- [ ] Can I export for compliance?
- [ ] Will I be alerted to what matters?

---

*Last Updated: March 2026*
