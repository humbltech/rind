# Aegis Technical Architecture

This directory contains the technical architecture documentation for the Aegis platform.

## Documents

| Document | Description | Status |
|----------|-------------|--------|
| [MCP Proxy](./mcp-proxy.md) | Core proxy architecture for MCP security | Draft |
| [LangChain SDK](./sdk-langchain.md) | Observability SDK for LangChain/LangGraph | Draft |
| [Data Models](./data-models.md) | Database schemas and API contracts | Draft |
| [Project Setup](./project-setup.md) | Monorepo structure, tooling, bootstrap guide | Draft |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AEGIS PLATFORM                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         INGEST LAYER                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │ LangChain   │  │ CrewAI      │  │ Custom      │  │ MCP Proxy   │   │  │
│  │  │ SDK         │  │ SDK         │  │ SDK         │  │             │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       PROCESSING LAYER                                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    │  │
│  │  │ Trace       │  │ Policy      │  │ Anomaly     │                    │  │
│  │  │ Collector   │  │ Engine      │  │ Detection   │                    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        STORAGE LAYER                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    │  │
│  │  │ PostgreSQL  │  │ ClickHouse  │  │ Redis       │                    │  │
│  │  │ (Metadata)  │  │ (Traces)    │  │ (Cache)     │                    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        PRESENTATION LAYER                              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    │  │
│  │  │ Dashboard   │  │ API         │  │ Alerts      │                    │  │
│  │  │ (Next.js)   │  │ (REST/WS)   │  │ (Webhooks)  │                    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **SDKs** | TypeScript, Python | Match framework ecosystems |
| **MCP Proxy** | Node.js/Bun, Hono | Native MCP support, low latency |
| **API** | Node.js, Hono | Fast, TypeScript-first |
| **Dashboard** | Next.js 15, React 19 | Modern, performant |
| **Database** | PostgreSQL (Supabase) | Multi-tenant, RLS |
| **Time-series** | ClickHouse (future) | High-volume trace storage |
| **Cache** | Redis | Rate limiting, sessions |
| **Queue** | BullMQ | Async processing |
| **Deployment** | Docker, Kubernetes | Standard enterprise |

## Build Sequence (90 Days)

### Month 1: Foundation
```
Week 1-2: LangChain SDK
├── Callback handler
├── Span builder
├── Async exporter
└── Basic dashboard (traces list)

Week 3-4: Dashboard MVP
├── Project setup (Next.js)
├── Auth (Supabase)
├── Trace viewer
└── Agent inventory
```

### Month 2: MCP Security
```
Week 1-2: MCP Proxy
├── Protocol handler
├── Auth layer
├── Tool inventory
└── Request logging

Week 3-4: Policy Engine
├── Rule DSL
├── Evaluation engine
├── Tool pinning
└── Rate limiting
```

### Month 3: Launch
```
Week 1-2: Integration
├── OTEL export
├── Datadog integration
├── GitHub Actions
└── Documentation

Week 3-4: Polish
├── Public launch
├── Free tier
├── MCP Scanner CLI
└── Marketing site
```

## Key Design Decisions

### 1. Callback-based SDK (not wrapper)
- Works with any LangChain component
- No code changes required
- Graceful degradation

### 2. MCP Proxy (not secure registry)
- Retrofits to existing servers
- Single enforcement point
- Complete visibility

### 3. PostgreSQL + RLS (not separate DBs)
- Native multi-tenancy
- Single database operations
- Simpler infrastructure

### 4. Event-driven processing
- Async ingest for low latency
- Batch processing for efficiency
- Real-time for alerts

---

*Last Updated: March 2026*
