# Aegis Project Setup Guide

## Monorepo Structure

```
aegis/
├── apps/
│   ├── dashboard/           # Next.js 15 dashboard
│   ├── api/                 # Hono API server
│   └── proxy/               # MCP Proxy server
│
├── packages/
│   ├── sdk-langchain/       # @aegis/langchain SDK
│   ├── sdk-core/            # @aegis/core shared types
│   ├── policy-engine/       # Policy evaluation engine
│   ├── db/                  # Database schema & migrations
│   └── ui/                  # Shared UI components
│
├── tools/
│   ├── mcp-scanner/         # CLI scanner tool
│   └── scripts/             # Build & deployment scripts
│
├── docs/                    # Documentation (existing)
├── research/                # Research materials (existing)
│
├── package.json             # Root workspace config
├── pnpm-workspace.yaml
├── turbo.json               # Turborepo config
├── biome.json               # Linting & formatting
└── tsconfig.json            # Base TypeScript config
```

---

## Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| **Package Manager** | pnpm | 9.x |
| **Monorepo** | Turborepo | 2.x |
| **Runtime** | Node.js | 22.x LTS |
| **Language** | TypeScript | 5.4+ |
| **Linting** | Biome | 1.9+ |
| **Testing** | Vitest | 2.x |

### App-Specific

| App | Framework | Key Dependencies |
|-----|-----------|------------------|
| **Dashboard** | Next.js 15 | React 19, Tailwind, shadcn/ui |
| **API** | Hono | Zod, Pino, jose |
| **Proxy** | Hono + MCP SDK | @modelcontextprotocol/sdk |

### Database

| Service | Provider | Purpose |
|---------|----------|---------|
| **PostgreSQL** | Supabase | Primary database |
| **Redis** | Upstash | Rate limiting, cache |

---

## Initial Setup

### 1. Create Monorepo

```bash
# Create root directory
mkdir aegis && cd aegis

# Initialize pnpm workspace
pnpm init

# Create workspace config
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tools/*'
EOF

# Create root package.json
cat > package.json << 'EOF'
{
  "name": "aegis",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "turbo": "^2.3.0",
    "typescript": "^5.4.0"
  }
}
EOF
```

### 2. Configure Turborepo

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

### 3. Configure TypeScript

```json
// tsconfig.json (root)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true
  },
  "exclude": ["node_modules", "dist", ".next"]
}
```

### 4. Configure Biome

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error",
        "noConsoleLog": "warn"
      },
      "complexity": {
        "noForEach": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  }
}
```

---

## Package: @aegis/core

Shared types and utilities.

```bash
mkdir -p packages/sdk-core/src
cd packages/sdk-core
pnpm init
```

```json
// packages/sdk-core/package.json
{
  "name": "@aegis/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0"
  }
}
```

```typescript
// packages/sdk-core/src/index.ts
export * from './types/span';
export * from './types/config';
export * from './types/policy';
```

```typescript
// packages/sdk-core/src/types/span.ts
export type SpanType = 'llm' | 'tool' | 'chain' | 'retriever' | 'agent' | 'graph';
export type SpanStatus = 'running' | 'success' | 'error';

export interface AegisSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;

  type: SpanType;
  name: string;

  startTime: number;
  endTime?: number;
  duration?: number;

  input?: unknown;
  output?: unknown;

  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  model?: string;
  cost?: number;

  status: SpanStatus;
  error?: {
    message: string;
    type?: string;
    stack?: string;
  };

  events?: SpanEvent[];
  metadata?: Record<string, unknown>;
  tags?: string[];

  sdk: {
    name: string;
    version: string;
  };
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}
```

```typescript
// packages/sdk-core/src/types/config.ts
export interface AegisConfig {
  apiKey: string;
  endpoint?: string;
  projectId?: string;
  environment?: string;

  captureInput?: boolean;
  captureOutput?: boolean;
  captureStackTraces?: boolean;
  piiRedaction?: boolean;

  batchSize?: number;
  flushInterval?: number;
  maxRetries?: number;
  sampleRate?: number;

  otlpEndpoint?: string;
  otlpHeaders?: Record<string, string>;
}

export const DEFAULT_CONFIG: Partial<AegisConfig> = {
  endpoint: 'https://api.aegis.security',
  environment: 'production',
  captureInput: true,
  captureOutput: true,
  captureStackTraces: false,
  piiRedaction: true,
  batchSize: 100,
  flushInterval: 5000,
  maxRetries: 3,
  sampleRate: 1.0,
};
```

---

## Package: @aegis/langchain

LangChain SDK implementation.

```bash
mkdir -p packages/sdk-langchain/src
cd packages/sdk-langchain
pnpm init
```

```json
// packages/sdk-langchain/package.json
{
  "name": "@aegis/langchain",
  "version": "0.0.1",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "@langchain/core": ">=0.2.0"
  },
  "dependencies": {
    "@aegis/core": "workspace:*"
  },
  "devDependencies": {
    "@langchain/core": "^0.3.0",
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

---

## App: Dashboard

```bash
cd apps
pnpm create next-app dashboard --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd dashboard
```

```json
// apps/dashboard/package.json additions
{
  "dependencies": {
    "@aegis/core": "workspace:*",
    "@supabase/ssr": "^0.5.0",
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

---

## App: API

```bash
mkdir -p apps/api/src
cd apps/api
pnpm init
```

```json
// apps/api/package.json
{
  "name": "@aegis/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format esm",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@aegis/core": "workspace:*",
    "@hono/node-server": "^1.13.0",
    "hono": "^4.6.0",
    "pino": "^9.5.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.4.0"
  }
}
```

```typescript
// apps/api/src/index.ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// API routes
app.route('/v1/traces', tracesRouter);
app.route('/v1/policies', policiesRouter);
app.route('/v1/mcp', mcpRouter);

const port = Number(process.env.PORT) || 3001;
console.log(`API server running on port ${port}`);

serve({ fetch: app.fetch, port });
```

---

## Database: Supabase Setup

### 1. Create Supabase Project

```bash
# Install Supabase CLI
pnpm add -D supabase

# Initialize
pnpm supabase init

# Link to project
pnpm supabase link --project-ref <your-project-ref>
```

### 2. Initial Migration

```sql
-- packages/db/supabase/migrations/001_initial.sql

-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    tier TEXT NOT NULL DEFAULT 'community',
    agent_limit INTEGER NOT NULL DEFAULT 5,
    event_limit BIGINT NOT NULL DEFAULT 100000,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'development',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

CREATE INDEX idx_projects_org ON projects(organization_id);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Agents
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    framework TEXT,
    agent_type TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    last_seen_at TIMESTAMPTZ,
    total_traces BIGINT NOT NULL DEFAULT 0,
    total_tokens BIGINT NOT NULL DEFAULT 0,
    total_cost_usd DECIMAL(10, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_project ON agents(project_id);
CREATE INDEX idx_agents_org ON agents(organization_id);
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
```

### 3. RLS Policies

```sql
-- packages/db/supabase/migrations/002_rls_policies.sql

-- Organization isolation function
CREATE OR REPLACE FUNCTION get_org_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::json->>'org_id',
    current_setting('app.organization_id', true)
  )::UUID
$$;

-- Organizations policy
CREATE POLICY org_isolation ON organizations
    USING (id = get_org_id());

-- Projects policy
CREATE POLICY project_isolation ON projects
    USING (organization_id = get_org_id());

-- Agents policy
CREATE POLICY agent_isolation ON agents
    USING (organization_id = get_org_id());

-- API Keys policy
CREATE POLICY api_key_isolation ON api_keys
    USING (organization_id = get_org_id());
```

---

## Environment Variables

```bash
# .env.local (example)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# API
API_URL=http://localhost:3001
AEGIS_SECRET_KEY=your-secret-key

# Optional: OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

---

## Development Commands

```bash
# Install all dependencies
pnpm install

# Start all services in development
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint & format
pnpm lint
pnpm format

# Database migrations
pnpm supabase migration new <name>
pnpm supabase db push
```

---

## CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm build
      - run: pnpm test
```

---

## Next Steps

After setup, the development sequence is:

### Week 1-2: LangChain SDK
1. Implement `AegisCallbackHandler`
2. Add span builder with parent-child tracking
3. Create async exporter with batching
4. Write tests

### Week 3-4: Dashboard MVP
1. Set up Supabase auth
2. Create trace list view
3. Build trace detail view
4. Add agent inventory

See [technical-strategy.md](../technical-strategy.md) for the full 90-day plan.

---

*Last Updated: March 2026*
