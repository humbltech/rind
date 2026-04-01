# Aegis SDK Architecture: LangChain/LangGraph

## Overview

The Aegis SDK provides observability and security instrumentation for LangChain and LangGraph applications. It captures traces, tool calls, LLM interactions, and costs while enabling policy enforcement and anomaly detection.

---

## Design Principles

1. **Zero-config start** - Works with one line of code
2. **Non-invasive** - No changes to existing agent code
3. **Low overhead** - < 1ms latency per operation
4. **Async-first** - Non-blocking telemetry export
5. **Graceful degradation** - Agents work if Aegis is down

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         YOUR LANGCHAIN APPLICATION                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   import { AegisCallbackHandler } from '@aegis/langchain';                  │
│                                                                              │
│   const aegis = new AegisCallbackHandler({ apiKey: '...' });                │
│   const agent = createReactAgent({ llm, tools, callbacks: [aegis] });       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │       AEGIS SDK               │
                    ├───────────────────────────────┤
                    │  ┌─────────────────────────┐  │
                    │  │   Callback Handler      │  │
                    │  │   ─────────────────     │  │
                    │  │   • LLM start/end       │  │
                    │  │   • Tool start/end      │  │
                    │  │   • Chain start/end     │  │
                    │  │   • Agent action        │  │
                    │  │   • Retriever query     │  │
                    │  └─────────────────────────┘  │
                    │               │               │
                    │  ┌─────────────────────────┐  │
                    │  │   Span Builder          │  │
                    │  │   ─────────────────     │  │
                    │  │   • Trace context       │  │
                    │  │   • Parent-child links  │  │
                    │  │   • Timing              │  │
                    │  │   • Token counting      │  │
                    │  └─────────────────────────┘  │
                    │               │               │
                    │  ┌─────────────────────────┐  │
                    │  │   Export Buffer         │  │
                    │  │   ─────────────────     │  │
                    │  │   • Batch collection    │  │
                    │  │   • Async flush         │  │
                    │  │   • Retry logic         │  │
                    │  │   • Local fallback      │  │
                    │  └─────────────────────────┘  │
                    └───────────────┬───────────────┘
                                    │
                                    │ HTTPS (batched, async)
                                    ▼
                    ┌───────────────────────────────┐
                    │       AEGIS PLATFORM          │
                    │   (or OpenTelemetry endpoint) │
                    └───────────────────────────────┘
```

---

## Core Components

### 1. Callback Handler

The primary integration point with LangChain's callback system.

```typescript
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';

export class AegisCallbackHandler extends BaseCallbackHandler {
  name = 'AegisCallbackHandler';

  private config: AegisConfig;
  private spanBuilder: SpanBuilder;
  private exporter: SpanExporter;

  constructor(config: AegisConfig) {
    super();
    this.config = config;
    this.spanBuilder = new SpanBuilder(config);
    this.exporter = new SpanExporter(config);
  }

  // LLM Events
  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>
  ): Promise<void> {
    this.spanBuilder.startSpan({
      type: 'llm',
      runId,
      parentRunId,
      name: llm.id?.[llm.id.length - 1] ?? 'unknown',
      input: this.config.captureInput ? prompts : undefined,
      metadata: {
        model: extraParams?.invocation_params?.model,
        temperature: extraParams?.invocation_params?.temperature,
      },
    });
  }

  async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    this.spanBuilder.endSpan({
      runId,
      output: this.config.captureOutput ? output : undefined,
      tokens: {
        prompt: output.llmOutput?.tokenUsage?.promptTokens,
        completion: output.llmOutput?.tokenUsage?.completionTokens,
      },
    });
  }

  async handleLLMError(err: Error, runId: string): Promise<void> {
    this.spanBuilder.endSpan({
      runId,
      error: {
        message: err.message,
        stack: this.config.captureStackTraces ? err.stack : undefined,
      },
    });
  }

  // Tool Events
  async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.spanBuilder.startSpan({
      type: 'tool',
      runId,
      parentRunId,
      name: tool.id?.[tool.id.length - 1] ?? 'unknown',
      input: this.config.captureInput ? input : undefined,
    });
  }

  async handleToolEnd(output: string, runId: string): Promise<void> {
    this.spanBuilder.endSpan({
      runId,
      output: this.config.captureOutput ? output : undefined,
    });
  }

  // Chain Events
  async handleChainStart(
    chain: Serialized,
    inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.spanBuilder.startSpan({
      type: 'chain',
      runId,
      parentRunId,
      name: chain.id?.[chain.id.length - 1] ?? 'unknown',
      input: this.config.captureInput ? inputs : undefined,
    });
  }

  // Agent Events
  async handleAgentAction(
    action: AgentAction,
    runId: string
  ): Promise<void> {
    this.spanBuilder.addEvent({
      runId,
      name: 'agent_action',
      attributes: {
        tool: action.tool,
        input: this.config.captureInput ? action.toolInput : undefined,
        log: action.log,
      },
    });
  }

  // Flush on completion
  async handleChainEnd(
    outputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.spanBuilder.endSpan({
      runId,
      output: this.config.captureOutput ? outputs : undefined,
    });

    // Root chain completed - flush all spans
    if (!parentRunId) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    const spans = this.spanBuilder.getCompletedSpans();
    await this.exporter.export(spans);
  }
}
```

### 2. Configuration

```typescript
interface AegisConfig {
  // Required
  apiKey: string;

  // Optional - defaults shown
  endpoint?: string;              // Default: 'https://api.aegis.security'
  projectId?: string;             // Auto-detected from API key
  environment?: string;           // Default: 'production'

  // Privacy controls
  captureInput?: boolean;         // Default: true
  captureOutput?: boolean;        // Default: true
  captureStackTraces?: boolean;   // Default: false
  piiRedaction?: boolean;         // Default: true

  // Performance
  batchSize?: number;             // Default: 100
  flushInterval?: number;         // Default: 5000 (ms)
  maxRetries?: number;            // Default: 3

  // Sampling (for high-volume)
  sampleRate?: number;            // Default: 1.0 (100%)

  // OpenTelemetry compatibility
  otlpEndpoint?: string;          // Export to OTLP instead/also
  otlpHeaders?: Record<string, string>;
}
```

### 3. Span Model

```typescript
interface AegisSpan {
  // Identity
  traceId: string;         // Root trace ID
  spanId: string;          // This span's ID
  parentSpanId?: string;   // Parent span ID

  // Classification
  type: 'llm' | 'tool' | 'chain' | 'retriever' | 'agent';
  name: string;

  // Timing
  startTime: number;       // Unix timestamp ms
  endTime?: number;
  duration?: number;       // Computed

  // Data
  input?: unknown;
  output?: unknown;

  // LLM-specific
  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  model?: string;
  cost?: number;           // USD, computed from model + tokens

  // Status
  status: 'running' | 'success' | 'error';
  error?: {
    message: string;
    type?: string;
    stack?: string;
  };

  // Events (for agent actions, etc.)
  events?: SpanEvent[];

  // Context
  metadata?: Record<string, unknown>;
  tags?: string[];

  // SDK info
  sdk: {
    name: string;          // '@aegis/langchain'
    version: string;
  };
}

interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}
```

### 4. Cost Calculation

```typescript
// Pricing per 1M tokens (as of March 2026)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'claude-3-opus': { input: 15.00, output: 75.00 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'gemini-1.5-pro': { input: 3.50, output: 10.50 },
};

function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}
```

---

## LangGraph Integration

For LangGraph's graph-based workflows:

```typescript
import { AegisCallbackHandler } from '@aegis/langchain';
import { StateGraph } from '@langchain/langgraph';

const aegis = new AegisCallbackHandler({
  apiKey: process.env.AEGIS_API_KEY,
});

// Option 1: Pass to graph compilation
const graph = new StateGraph({ channels: { messages: [] } })
  .addNode('agent', agentNode)
  .addNode('tools', toolsNode)
  .addEdge('agent', 'tools')
  .compile({
    callbacks: [aegis],
  });

// Option 2: Pass at invocation
await graph.invoke(
  { messages: [new HumanMessage('Hello')] },
  { callbacks: [aegis] }
);
```

### Graph-Specific Spans

```typescript
// Additional span type for LangGraph
interface GraphSpan extends AegisSpan {
  type: 'graph';
  graph: {
    name: string;
    nodeExecutions: {
      nodeName: string;
      executionOrder: number;
      state?: unknown;  // If capturing state
    }[];
    edgesTaken: string[];
  };
}
```

---

## Privacy & PII Handling

### Automatic Redaction

```typescript
const PII_PATTERNS = [
  // Email
  { pattern: /\b[\w.-]+@[\w.-]+\.\w{2,}\b/gi, replacement: '[EMAIL]' },
  // Phone
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE]' },
  // SSN
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
  // Credit card
  { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, replacement: '[CARD]' },
  // IP address
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP]' },
];

function redactPII(text: string): string {
  let redacted = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}
```

### Configurable Capture Levels

```typescript
type CaptureLevel = 'none' | 'metadata' | 'full';

interface PrivacyConfig {
  llmInput: CaptureLevel;      // Default: 'full'
  llmOutput: CaptureLevel;     // Default: 'full'
  toolInput: CaptureLevel;     // Default: 'full'
  toolOutput: CaptureLevel;    // Default: 'metadata'
  chainState: CaptureLevel;    // Default: 'none'

  // Field-level redaction
  redactFields?: string[];     // e.g., ['password', 'apiKey', 'secret']
}
```

---

## Export & Batching

### Async Export Pipeline

```typescript
class SpanExporter {
  private buffer: AegisSpan[] = [];
  private flushTimer: NodeJS.Timer | null = null;
  private config: AegisConfig;

  constructor(config: AegisConfig) {
    this.config = config;
    this.startFlushTimer();
  }

  add(span: AegisSpan): void {
    this.buffer.push(span);

    if (this.buffer.length >= this.config.batchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const spans = this.buffer.splice(0, this.buffer.length);

    try {
      await this.sendWithRetry(spans);
    } catch (err) {
      // Fallback: write to local file for later recovery
      await this.writeToFallback(spans);
    }
  }

  private async sendWithRetry(
    spans: AegisSpan[],
    attempt = 1
  ): Promise<void> {
    try {
      const response = await fetch(`${this.config.endpoint}/v1/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Aegis-SDK-Version': SDK_VERSION,
        },
        body: JSON.stringify({ spans }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      if (attempt < this.config.maxRetries) {
        const delay = Math.pow(2, attempt) * 100; // Exponential backoff
        await sleep(delay);
        return this.sendWithRetry(spans, attempt + 1);
      }
      throw err;
    }
  }

  private async writeToFallback(spans: AegisSpan[]): Promise<void> {
    // Write to ~/.aegis/fallback/ for later recovery
    const fallbackDir = path.join(os.homedir(), '.aegis', 'fallback');
    await fs.mkdir(fallbackDir, { recursive: true });

    const filename = `spans-${Date.now()}.json`;
    await fs.writeFile(
      path.join(fallbackDir, filename),
      JSON.stringify(spans)
    );
  }
}
```

### OpenTelemetry Export

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

class OTLPBridge {
  private exporter: OTLPTraceExporter;

  constructor(endpoint: string, headers?: Record<string, string>) {
    this.exporter = new OTLPTraceExporter({
      url: endpoint,
      headers,
    });
  }

  convertSpan(aegisSpan: AegisSpan): OTLPSpan {
    return {
      traceId: aegisSpan.traceId,
      spanId: aegisSpan.spanId,
      parentSpanId: aegisSpan.parentSpanId,
      name: `${aegisSpan.type}:${aegisSpan.name}`,
      startTimeUnixNano: aegisSpan.startTime * 1_000_000,
      endTimeUnixNano: (aegisSpan.endTime ?? Date.now()) * 1_000_000,
      attributes: [
        { key: 'aegis.type', value: { stringValue: aegisSpan.type } },
        { key: 'aegis.tokens.prompt', value: { intValue: aegisSpan.tokens?.prompt } },
        { key: 'aegis.tokens.completion', value: { intValue: aegisSpan.tokens?.completion } },
        { key: 'aegis.cost.usd', value: { doubleValue: aegisSpan.cost } },
        { key: 'aegis.model', value: { stringValue: aegisSpan.model } },
      ].filter(a => a.value !== undefined),
      status: {
        code: aegisSpan.status === 'error' ? 2 : 1,
        message: aegisSpan.error?.message,
      },
    };
  }
}
```

---

## Usage Examples

### Basic Setup

```typescript
import { AegisCallbackHandler } from '@aegis/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

// One-line setup
const aegis = new AegisCallbackHandler({
  apiKey: process.env.AEGIS_API_KEY,
});

// Use with any LangChain component
const llm = new ChatOpenAI({
  model: 'gpt-4o',
  callbacks: [aegis],
});

// Or with agents
const agent = createReactAgent({
  llm,
  tools: [searchTool, calculatorTool],
  callbacks: [aegis],
});
```

### With Environment Variables

```bash
# .env
AEGIS_API_KEY=aegis_sk_...
AEGIS_ENVIRONMENT=staging
AEGIS_CAPTURE_OUTPUT=false  # Privacy mode
```

```typescript
import { AegisCallbackHandler } from '@aegis/langchain';

// Auto-configures from environment
const aegis = AegisCallbackHandler.fromEnv();
```

### Custom Metadata

```typescript
const aegis = new AegisCallbackHandler({
  apiKey: process.env.AEGIS_API_KEY,
});

// Add custom context
aegis.setMetadata({
  userId: 'user_123',
  sessionId: 'session_456',
  feature: 'customer-support',
});

// Add tags for filtering
aegis.addTags(['production', 'high-priority']);
```

### Sampling for High Volume

```typescript
const aegis = new AegisCallbackHandler({
  apiKey: process.env.AEGIS_API_KEY,
  sampleRate: 0.1,  // Only trace 10% of requests
});
```

---

## Package Structure

```
@aegis/langchain/
├── src/
│   ├── index.ts                 # Main exports
│   ├── callback-handler.ts      # AegisCallbackHandler
│   ├── span-builder.ts          # Trace/span construction
│   ├── exporter.ts              # Batch export logic
│   ├── otlp-bridge.ts           # OpenTelemetry conversion
│   ├── privacy.ts               # PII redaction
│   ├── cost.ts                  # Model pricing
│   └── types.ts                 # TypeScript interfaces
├── package.json
├── tsconfig.json
└── README.md
```

### Package.json

```json
{
  "name": "@aegis/langchain",
  "version": "0.1.0",
  "description": "Aegis observability SDK for LangChain/LangGraph",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "peerDependencies": {
    "@langchain/core": ">=0.2.0",
    "@langchain/langgraph": ">=0.2.0"
  },
  "dependencies": {
    "@opentelemetry/exporter-trace-otlp-http": "^0.52.0",
    "@opentelemetry/sdk-trace-base": "^1.25.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsup": "^8.0.0",
    "vitest": "^1.4.0"
  }
}
```

---

## MVP Scope (Month 1)

### In Scope
- [ ] AegisCallbackHandler for LangChain
- [ ] LLM, Tool, Chain, Agent event capture
- [ ] Token counting and cost calculation
- [ ] Async batched export
- [ ] Basic PII redaction
- [ ] OpenTelemetry export option
- [ ] Environment variable configuration

### Out of Scope (Future)
- Python SDK (Month 2)
- Streaming support
- Custom span types
- Real-time alerting hooks
- Offline mode with sync

---

*Previous: [MCP Proxy Architecture](./mcp-proxy.md)*
*Next: [Data Models](./data-models.md)*
