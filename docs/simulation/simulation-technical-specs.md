# Technical Deployment Specifications

*Detailed infrastructure specs for simulation environments*

---

## Company 1: Meridian Financial Services

### Infrastructure Overview

| Component | Technology | Version |
|-----------|------------|---------|
| **Cloud** | AWS | - |
| **Orchestration** | EKS (Kubernetes) | 1.29 |
| **Container Runtime** | containerd | 1.7 |
| **Service Mesh** | None (plain K8s) | - |
| **Ingress** | AWS ALB Ingress Controller | 2.6 |
| **CI/CD** | GitHub Actions + ArgoCD | - |
| **Secrets** | AWS Secrets Manager | - |
| **Monitoring** | Datadog | - |
| **Logging** | CloudWatch + Datadog | - |

### Agent 1: Portfolio Research Assistant

#### Container Specification

```yaml
# Image
registry: 123456789.dkr.ecr.us-east-1.amazonaws.com
image: meridian/portfolio-research-agent
tag: v1.4.2

# Base image
FROM python:3.11-slim

# Dependencies
requirements:
  - langchain==0.2.16
  - langgraph==0.2.34
  - openai==1.51.0
  - redis==5.0.1
  - tavily-python==0.5.0
  - boto3==1.34.0
  - pydantic==2.9.0
  - fastapi==0.115.0
  - uvicorn==0.31.0

# Size
image_size: 892MB
```

#### Kubernetes Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: portfolio-research-agent
  namespace: ai-agents
  labels:
    app: portfolio-research
    team: ai
    cost-center: wealth-management
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: portfolio-research
  template:
    metadata:
      labels:
        app: portfolio-research
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8000"
    spec:
      serviceAccountName: portfolio-research-sa
      containers:
      - name: agent
        image: 123456789.dkr.ecr.us-east-1.amazonaws.com/meridian/portfolio-research-agent:v1.4.2
        ports:
        - containerPort: 8000
          name: http
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        env:
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: llm-credentials
              key: openai-api-key
        - name: TAVILY_API_KEY
          valueFrom:
            secretKeyRef:
              name: llm-credentials
              key: tavily-api-key
        - name: REDIS_URL
          value: "redis://redis-master.ai-agents.svc.cluster.local:6379"
        - name: LITELLM_PROXY_URL
          value: "http://litellm-proxy.ai-agents.svc.cluster.local:4000"
        - name: S3_BUCKET
          value: "meridian-research-docs"
        - name: LOG_LEVEL
          value: "INFO"
        - name: ENVIRONMENT
          value: "production"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: tmp
        emptyDir: {}
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - portfolio-research
              topologyKey: "kubernetes.io/hostname"
---
apiVersion: v1
kind: Service
metadata:
  name: portfolio-research-agent
  namespace: ai-agents
spec:
  selector:
    app: portfolio-research
  ports:
  - port: 80
    targetPort: 8000
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: portfolio-research-hpa
  namespace: ai-agents
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: portfolio-research-agent
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

#### Secrets Management

```yaml
# External Secrets Operator config
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: llm-credentials
  namespace: ai-agents
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: aws-secrets-manager
  target:
    name: llm-credentials
    creationPolicy: Owner
  data:
  - secretKey: openai-api-key
    remoteRef:
      key: prod/ai-agents/openai
      property: api_key
  - secretKey: tavily-api-key
    remoteRef:
      key: prod/ai-agents/tavily
      property: api_key
```

#### LiteLLM Proxy Configuration

```yaml
# litellm-config.yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY
    model_info:
      max_tokens: 128000
      input_cost_per_token: 0.000005
      output_cost_per_token: 0.000015

  - model_name: gpt-4o-mini
    litellm_params:
      model: openai/gpt-4o-mini
      api_key: os.environ/OPENAI_API_KEY

litellm_settings:
  drop_params: true
  set_verbose: false
  cache: true
  cache_params:
    type: redis
    host: redis-master.ai-agents.svc.cluster.local
    port: 6379

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL

  # Rate limiting
  global_max_parallel_requests: 100

  # Callbacks for logging
  success_callback: ["langfuse"]
  failure_callback: ["langfuse"]
```

#### Network Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              AWS VPC                                     │
│                           10.0.0.0/16                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     Public Subnets (10.0.1.0/24)                  │   │
│  │  ┌────────────────────────────────────────────────────────────┐  │   │
│  │  │                    AWS ALB (Internet-facing)                │  │   │
│  │  │                    api.meridian.com                         │  │   │
│  │  └───────────────────────────┬────────────────────────────────┘  │   │
│  └──────────────────────────────┼───────────────────────────────────┘   │
│                                 │                                        │
│  ┌──────────────────────────────┼───────────────────────────────────┐   │
│  │                     Private Subnets (10.0.10.0/24)                │   │
│  │                                                                    │   │
│  │  ┌─────────────────────────────────────────────────────────────┐  │   │
│  │  │                        EKS Cluster                           │  │   │
│  │  │                                                               │  │   │
│  │  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │  │   │
│  │  │   │ Agent Pod 1 │  │ Agent Pod 2 │  │ Agent Pod 3 │         │  │   │
│  │  │   │ 10.0.10.12  │  │ 10.0.10.13  │  │ 10.0.10.14  │         │  │   │
│  │  │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │  │   │
│  │  │          │                │                │                  │  │   │
│  │  │          └────────────────┼────────────────┘                  │  │   │
│  │  │                           │                                    │  │   │
│  │  │   ┌───────────────────────▼───────────────────────────────┐   │  │   │
│  │  │   │              LiteLLM Proxy Service                     │   │  │   │
│  │  │   │              10.0.10.50:4000                          │   │  │   │
│  │  │   └───────────────────────┬───────────────────────────────┘   │  │   │
│  │  │                           │                                    │  │   │
│  │  │   ┌───────────────────────▼───────────────────────────────┐   │  │   │
│  │  │   │              Redis (ElastiCache)                       │   │  │   │
│  │  │   │              10.0.10.100:6379                         │   │  │   │
│  │  │   └───────────────────────────────────────────────────────┘   │  │   │
│  │  │                                                               │  │   │
│  │  └─────────────────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                 │                                        │
│                                 │ NAT Gateway                            │
│                                 ▼                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │   OpenAI API            │
                    │   api.openai.com:443    │
                    └─────────────────────────┘
```

#### CI/CD Pipeline

```yaml
# .github/workflows/deploy-agent.yml
name: Deploy Portfolio Research Agent

on:
  push:
    branches: [main]
    paths:
      - 'agents/portfolio-research/**'

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: meridian/portfolio-research-agent
  EKS_CLUSTER: meridian-prod

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG ./agents/portfolio-research
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG

      - name: Update Kubernetes deployment
        run: |
          aws eks update-kubeconfig --name $EKS_CLUSTER --region $AWS_REGION
          kubectl set image deployment/portfolio-research-agent \
            agent=${{ steps.login-ecr.outputs.registry }}/$ECR_REPOSITORY:${{ github.sha }} \
            -n ai-agents
          kubectl rollout status deployment/portfolio-research-agent -n ai-agents
```

---

### Agent 2: Client Communication Drafter (Shadow AI)

**This agent was built quickly without proper infrastructure review.**

#### Deployment Reality

```yaml
# This is what the developer actually did (NOT best practice)

# Single deployment.yaml committed to a personal repo
apiVersion: apps/v1
kind: Deployment
metadata:
  name: client-comms-bot
  namespace: default  # Not even in ai-agents namespace!
spec:
  replicas: 2
  selector:
    matchLabels:
      app: client-comms
  template:
    spec:
      containers:
      - name: bot
        image: meridian/client-comms:latest  # No version pinning!
        env:
        - name: OPENAI_API_KEY
          value: "sk-proj-xxxx..."  # HARDCODED IN YAML! 😱
        - name: SALESFORCE_TOKEN
          value: "xxxxx"  # Also hardcoded!
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          # No limits set - can consume unlimited resources
```

#### How It Actually Runs

```
Developer's laptop
      │
      ▼
┌─────────────────────────────────────────┐
│  kubectl apply -f deployment.yaml       │
│  (applied to prod cluster directly!)    │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│  EKS Cluster (default namespace)        │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  client-comms-bot                   │ │
│  │  - No health checks                 │ │
│  │  - No resource limits               │ │
│  │  - API keys in env vars (visible!)  │ │
│  │  - Logs to stdout (no collection)   │ │
│  └─────────────────┬──────────────────┘ │
│                    │                     │
│          (Direct to OpenAI)              │
│          (Bypasses LiteLLM!)             │
└────────────────────┼────────────────────┘
                     │
                     ▼
           ┌─────────────────┐
           │  OpenAI API     │
           │  (No tracking!) │
           └─────────────────┘
```

#### Security Issues

| Issue | Reality |
|-------|---------|
| **API Key Management** | Hardcoded in deployment YAML |
| **Network Policy** | None - can reach anything |
| **Logging** | stdout only, not collected |
| **Monitoring** | No Datadog integration |
| **RBAC** | Runs as default service account |
| **Resource Limits** | None set |
| **Image Tag** | `:latest` - no version control |
| **Secrets Access** | Has Salesforce admin token |

---

### Agent 3: Compliance Analyzer (Pilot)

**Running on a single EC2 instance, "just for testing"**

#### Infrastructure

```
EC2 Instance
├── Type: t3.large
├── AMI: Amazon Linux 2023
├── Storage: 100GB gp3
├── Region: us-east-1
└── Security Group: sg-0abc123 (SSH + HTTP from office IP)

Software Stack:
├── Python 3.11 (pyenv)
├── Docker 24.0
├── docker-compose
└── nginx (reverse proxy)
```

#### Actual Deployment

```yaml
# docker-compose.yml on the EC2 instance
version: '3.8'

services:
  compliance-agent:
    build: .
    ports:
      - "8080:8000"
    environment:
      - ANTHROPIC_API_KEY=sk-ant-xxxx  # In docker-compose file!
      - CHROMA_HOST=chromadb
      - LOG_LEVEL=DEBUG
    volumes:
      - ./regulations:/app/data/regulations
      - ./outputs:/app/outputs
    restart: unless-stopped

  chromadb:
    image: chromadb/chroma:latest
    volumes:
      - ./chroma_data:/chroma/chroma
    ports:
      - "8001:8000"  # Exposed to network!

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - compliance-agent
```

#### Access Pattern

```
Compliance Team (4 users)
        │
        ▼
┌───────────────────────────────────────────┐
│  http://10.0.5.47/                        │
│  (Internal IP, no auth!)                  │
└───────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│  EC2 Instance (t3.large)                  │
│  ├── nginx (:80)                          │
│  ├── compliance-agent (:8080)             │
│  └── chromadb (:8001)                     │
│                                            │
│  SSH access:                               │
│  - Developer's personal key               │
│  - No bastion host                        │
│  - Direct from office IP                  │
└───────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│  Anthropic API                            │
│  (Claude 3.5 Sonnet)                      │
│  ~$1,500/month                            │
└───────────────────────────────────────────┘
```

---

## Company 2: Nimbus SaaS

### Infrastructure Overview

| Component | Technology | Version |
|-----------|------------|---------|
| **Cloud** | GCP | - |
| **Compute** | Cloud Run | Gen2 |
| **Database** | MongoDB Atlas | 7.0 |
| **Cache** | Memorystore (Redis) | 7.0 |
| **Vector DB** | Pinecone | - |
| **CI/CD** | GitHub Actions + Cloud Build | - |
| **Secrets** | GCP Secret Manager | - |
| **Monitoring** | Cloud Monitoring + custom | - |
| **Logging** | Cloud Logging + BigQuery | - |

### Agent 1: AI Project Assistant (Customer-Facing)

#### Container Specification

```yaml
# Image
registry: gcr.io/nimbus-prod
image: project-assistant
tag: v2.1.0

# Base
FROM node:20-slim

# Dependencies (package.json)
dependencies:
  "@langchain/core": "0.3.14"
  "@langchain/openai": "0.3.5"
  "express": "4.21.0"
  "mongoose": "8.7.0"
  "ioredis": "5.4.1"
  "zod": "3.23.8"
  "pino": "9.4.0"
  "@google-cloud/secret-manager": "5.6.0"

# Size
image_size: 456MB
```

#### Cloud Run Service

```yaml
# service.yaml (Cloud Run)
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: project-assistant
  annotations:
    run.googleapis.com/launch-stage: GA
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "2"
        autoscaling.knative.dev/maxScale: "50"
        run.googleapis.com/cpu-throttling: "false"
        run.googleapis.com/execution-environment: gen2
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      serviceAccountName: project-assistant-sa@nimbus-prod.iam.gserviceaccount.com
      containers:
      - image: gcr.io/nimbus-prod/project-assistant:v2.1.0
        ports:
        - containerPort: 8080
        resources:
          limits:
            cpu: "2"
            memory: 2Gi
        env:
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: mongodb-uri
              key: latest
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: openai-api-key
              key: latest
        - name: REDIS_URL
          value: "redis://10.0.0.5:6379"
        - name: NODE_ENV
          value: "production"
        - name: LOG_LEVEL
          value: "info"
        startupProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 0
          periodSeconds: 1
          failureThreshold: 30
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          periodSeconds: 10
```

#### Rate Limiting Implementation

```typescript
// src/middleware/rateLimiter.ts
import { Redis } from 'ioredis';

interface RateLimits {
  free: { requests: 50, window: 86400 };      // 50/day
  pro: { requests: 500, window: 86400 };      // 500/day
  enterprise: { requests: -1, window: 0 };     // unlimited
}

export class TierRateLimiter {
  constructor(private redis: Redis) {}

  async checkLimit(workspaceId: string, tier: keyof RateLimits): Promise<boolean> {
    const limits = RATE_LIMITS[tier];
    if (limits.requests === -1) return true;

    const key = `ratelimit:${workspaceId}:${Date.now() / limits.window}`;
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, limits.window);
    }

    return count <= limits.requests;
  }
}
```

#### Multi-Tenant Data Architecture

```typescript
// src/models/project.ts
import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  // Tenant isolation field
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },

  name: String,
  tasks: [{
    title: String,
    status: String,
    assignee: String,
    // ... other fields
  }],

  // AI interaction metadata
  aiMetadata: {
    lastAgentInteraction: Date,
    totalAgentRequests: Number,
  }
});

// CRITICAL: All queries MUST include workspaceId
projectSchema.pre('find', function() {
  if (!this.getQuery().workspaceId) {
    throw new Error('workspaceId required for all queries');
  }
});
```

#### API Key Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Request Flow                                    │
└─────────────────────────────────────────────────────────────────────────┘

User Request
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Cloud Load Balancer                                                     │
│  - SSL termination                                                       │
│  - Request routing                                                       │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Cloud Run: project-assistant                                            │
│                                                                          │
│  1. Extract JWT from Authorization header                                │
│  2. Validate JWT with Google Identity Platform                           │
│  3. Extract workspaceId from JWT claims                                  │
│  4. Check rate limit for workspace tier                                  │
│  5. Process request with LangChain                                       │
│                                                                          │
│  API Keys loaded at startup from Secret Manager:                         │
│  - OPENAI_API_KEY (shared across all tenants)                           │
│  - MONGODB_URI (single cluster, multi-tenant)                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  OpenAI API                                                              │
│  - Single API key for all requests                                       │
│  - No per-tenant tracking at OpenAI level                               │
│  - Cost attribution done via BigQuery logs                              │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Logging to BigQuery

```typescript
// src/logging/bigquery.ts
import { BigQuery } from '@google-cloud/bigquery';

interface AgentLogEntry {
  timestamp: string;
  workspaceId: string;
  userId: string;
  requestId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  toolsUsed: string[];
  success: boolean;
  errorType?: string;
}

// Schema
const schema = {
  fields: [
    { name: 'timestamp', type: 'TIMESTAMP' },
    { name: 'workspaceId', type: 'STRING' },
    { name: 'userId', type: 'STRING' },
    { name: 'requestId', type: 'STRING' },
    { name: 'model', type: 'STRING' },
    { name: 'promptTokens', type: 'INTEGER' },
    { name: 'completionTokens', type: 'INTEGER' },
    { name: 'totalTokens', type: 'INTEGER' },
    { name: 'costUsd', type: 'FLOAT' },
    { name: 'latencyMs', type: 'INTEGER' },
    { name: 'toolsUsed', type: 'STRING', mode: 'REPEATED' },
    { name: 'success', type: 'BOOLEAN' },
    { name: 'errorType', type: 'STRING' },
  ]
};

// Streaming insert
await bigquery
  .dataset('ai_analytics')
  .table('agent_requests')
  .insert([logEntry]);
```

---

### Agent 2: Internal Support Bot (CrewAI)

#### Container Specification

```yaml
# Image
registry: gcr.io/nimbus-prod
image: internal-support-crew
tag: v1.2.0

# Base
FROM python:3.11-slim

# Dependencies
requirements:
  - crewai==0.80.0
  - crewai-tools==0.14.0
  - openai==1.51.0
  - pinecone-client==5.0.0
  - slack-sdk==3.33.0
  - google-auth==2.35.0
  - flask==3.0.0
  - gunicorn==23.0.0

# Size
image_size: 1.1GB
```

#### CrewAI Configuration

```python
# src/crew.py
from crewai import Agent, Task, Crew, Process
from crewai_tools import tool

# Define agents
hr_agent = Agent(
    role='HR Specialist',
    goal='Answer employee questions about HR policies, benefits, and procedures',
    backstory='You are an HR expert with deep knowledge of company policies.',
    tools=[hr_policy_search, benefits_lookup],
    llm='gpt-4o',
    verbose=True,
)

it_agent = Agent(
    role='IT Support Specialist',
    goal='Help employees with technical issues and access requests',
    backstory='You are an IT expert who can troubleshoot and manage access.',
    tools=[
        ticket_create,
        password_reset,      # DANGEROUS: Can reset any password!
        access_request,      # DANGEROUS: Can grant system access!
        system_status_check,
    ],
    llm='gpt-4o',
    verbose=True,
)

product_agent = Agent(
    role='Product Expert',
    goal='Answer questions about product features and documentation',
    backstory='You are a product expert with complete documentation access.',
    tools=[doc_search, feature_lookup],
    llm='gpt-4o',
    verbose=True,
)

manager_agent = Agent(
    role='Support Manager',
    goal='Route requests to the appropriate specialist',
    backstory='You triage requests and delegate to HR, IT, or Product specialists.',
    llm='gpt-4o-mini',  # Cheaper model for routing
    verbose=True,
)

# Create crew
support_crew = Crew(
    agents=[manager_agent, hr_agent, it_agent, product_agent],
    tasks=[],  # Dynamic based on request
    process=Process.hierarchical,
    manager_agent=manager_agent,
)
```

#### Dangerous Tool Definitions

```python
# src/tools/it_tools.py
from crewai_tools import tool
import requests

@tool
def password_reset(employee_email: str) -> str:
    """Reset an employee's password and send them a reset link.

    Args:
        employee_email: The email of the employee whose password should be reset

    Returns:
        Confirmation message
    """
    # NO VERIFICATION! Agent can reset anyone's password!
    response = requests.post(
        'https://auth.nimbus.io/admin/reset-password',
        json={'email': employee_email},
        headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}  # Admin token!
    )
    return f"Password reset link sent to {employee_email}"


@tool
def access_request(
    employee_email: str,
    system: str,
    access_level: str
) -> str:
    """Grant an employee access to a system.

    Args:
        employee_email: Employee to grant access to
        system: System name (e.g., 'github', 'aws', 'salesforce')
        access_level: Level of access ('read', 'write', 'admin')

    Returns:
        Confirmation message
    """
    # NO APPROVAL WORKFLOW! Direct grant!
    response = requests.post(
        'https://iam.nimbus.io/admin/grant-access',
        json={
            'email': employee_email,
            'system': system,
            'level': access_level,
        },
        headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
    )
    return f"Granted {access_level} access to {system} for {employee_email}"
```

#### Deployment

```yaml
# Cloud Run service for CrewAI
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: internal-support-crew
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "5"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 10  # Low - CrewAI is resource intensive
      timeoutSeconds: 600  # 10 min - multi-agent can take time
      containers:
      - image: gcr.io/nimbus-prod/internal-support-crew:v1.2.0
        resources:
          limits:
            cpu: "4"      # Needs more CPU for multi-agent
            memory: 4Gi
        env:
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: openai-api-key
              key: latest
        - name: PINECONE_API_KEY
          valueFrom:
            secretKeyRef:
              name: pinecone-api-key
              key: latest
        - name: IAM_ADMIN_TOKEN       # Full admin access!
          valueFrom:
            secretKeyRef:
              name: iam-admin-token
              key: latest
        - name: SLACK_BOT_TOKEN
          valueFrom:
            secretKeyRef:
              name: slack-bot-token
              key: latest
```

---

### Agent 3: Code Review Bot

#### GitHub Actions Workflow

```yaml
# .github/workflows/code-review.yml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Get changed files
        id: changed
        run: |
          echo "files=$(git diff --name-only origin/${{ github.base_ref }}...HEAD | tr '\n' ' ')" >> $GITHUB_OUTPUT

      - name: Run AI Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: |
          python scripts/ai_review.py \
            --files "${{ steps.changed.outputs.files }}" \
            --pr $PR_NUMBER
```

#### Review Script

```python
# scripts/ai_review.py
import anthropic
import subprocess
from github import Github

def review_pr(files: list[str], pr_number: int):
    client = anthropic.Anthropic()  # Uses ANTHROPIC_API_KEY env var
    github = Github(os.environ['GITHUB_TOKEN'])

    repo = github.get_repo(os.environ['GITHUB_REPOSITORY'])
    pr = repo.get_pull(pr_number)

    for file in files:
        # Get file diff
        diff = subprocess.run(
            ['git', 'diff', f'origin/{pr.base.ref}...HEAD', '--', file],
            capture_output=True, text=True
        ).stdout

        # Get full file content (CAN SEE SECRETS!)
        try:
            content = open(file).read()
        except:
            continue

        # Send to Claude for review
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": f"""Review this code change:

File: {file}
Diff:
{diff}

Full file:
{content}

Provide specific suggestions for improvements, security issues, and best practices."""
            }]
        )

        # Post comment on PR
        pr.create_issue_comment(
            f"## AI Review: `{file}`\n\n{response.content[0].text}"
        )
```

---

## Company 3: Healix Medical Group

### Infrastructure Overview

| Component | Technology | Version |
|-----------|------------|---------|
| **Cloud** | Azure | - |
| **Orchestration** | AKS | 1.28 |
| **Database** | Azure SQL | - |
| **EMR Integration** | HL7 FHIR API | R4 |
| **LLM** | Azure OpenAI | GPT-4 |
| **CI/CD** | Azure DevOps | - |
| **Secrets** | Azure Key Vault | - |
| **Monitoring** | Azure Monitor | - |
| **Logging** | Azure Log Analytics | - |
| **Compliance** | Azure Policy + Defender | - |

### Agent 1: Clinical Documentation Assistant

#### Container Specification

```yaml
# Image
registry: healixacr.azurecr.io
image: clinical-docs-assistant
tag: v1.1.0-hipaa

# Base
FROM python:3.11-slim

# Dependencies
requirements:
  - langchain==0.2.16
  - langgraph==0.2.34
  - openai==1.51.0
  - azure-identity==1.18.0
  - azure-keyvault-secrets==4.8.0
  - azure-cognitiveservices-speech==1.40.0
  - fhir.resources==7.1.0
  - cryptography==43.0.0
  - fastapi==0.115.0
  - uvicorn==0.31.0

# Security hardening
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -s /bin/false appuser

USER appuser

# Size
image_size: 1.2GB
```

#### AKS Deployment with HIPAA Controls

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clinical-docs-assistant
  namespace: hipaa-workloads
  labels:
    app: clinical-docs
    compliance: hipaa
    data-classification: phi
spec:
  replicas: 2
  selector:
    matchLabels:
      app: clinical-docs
  template:
    metadata:
      labels:
        app: clinical-docs
        compliance: hipaa
      annotations:
        # Azure Policy enforcement
        azure.workload.identity/use: "true"
        # Pod security
        seccomp.security.alpha.kubernetes.io/pod: runtime/default
    spec:
      serviceAccountName: clinical-docs-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
      - name: agent
        image: healixacr.azurecr.io/clinical-docs-assistant:v1.1.0-hipaa
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
              - ALL
        ports:
        - containerPort: 8000
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        env:
        - name: AZURE_OPENAI_ENDPOINT
          value: "https://healix-openai.openai.azure.com"
        - name: AZURE_OPENAI_DEPLOYMENT
          value: "gpt-4-hipaa"
        - name: FHIR_SERVER_URL
          value: "https://healix-fhir.azurehealthcareapis.com"
        - name: KEY_VAULT_URL
          value: "https://healix-kv.vault.azure.net"
        - name: APPLICATIONINSIGHTS_CONNECTION_STRING
          valueFrom:
            secretKeyRef:
              name: app-insights
              key: connection-string
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: cache
          mountPath: /app/.cache
      volumes:
      - name: tmp
        emptyDir:
          sizeLimit: 100Mi
      - name: cache
        emptyDir:
          sizeLimit: 500Mi
      # Node selection for HIPAA nodes
      nodeSelector:
        compliance: hipaa
      tolerations:
      - key: "compliance"
        operator: "Equal"
        value: "hipaa"
        effect: "NoSchedule"
```

#### Network Policy (Zero Trust)

```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: clinical-docs-network-policy
  namespace: hipaa-workloads
spec:
  podSelector:
    matchLabels:
      app: clinical-docs
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: api-gateway
    ports:
    - protocol: TCP
      port: 8000
  egress:
  # Azure OpenAI
  - to:
    - ipBlock:
        cidr: 0.0.0.0/0  # Azure OpenAI IPs (should be more specific)
    ports:
    - protocol: TCP
      port: 443
  # FHIR Server
  - to:
    - namespaceSelector:
        matchLabels:
          name: fhir-services
    ports:
    - protocol: TCP
      port: 443
  # DNS
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: UDP
      port: 53
```

#### Azure OpenAI Configuration

```json
{
  "deployment_name": "gpt-4-hipaa",
  "model": "gpt-4",
  "version": "0613",
  "capacity": 80,
  "content_filter": {
    "hate": "high",
    "sexual": "high",
    "violence": "high",
    "self_harm": "high"
  },
  "data_residency": "East US",
  "customer_managed_key": true,
  "private_endpoint": true,
  "logging": {
    "enabled": true,
    "retention_days": 2555,  // 7 years for HIPAA
    "log_analytics_workspace": "/subscriptions/.../logAnalytics"
  }
}
```

#### FHIR Integration

```python
# src/fhir_client.py
from fhir.resources.patient import Patient
from fhir.resources.observation import Observation
from azure.identity import DefaultAzureCredential

class FHIRClient:
    def __init__(self):
        self.credential = DefaultAzureCredential()
        self.base_url = os.environ['FHIR_SERVER_URL']

    async def get_patient(self, mrn: str) -> Patient:
        """
        Fetch patient by MRN.

        HIPAA NOTE: This fetches ALL patient data.
        No minimum necessary filtering implemented!
        """
        token = self.credential.get_token(f"{self.base_url}/.default")

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/Patient",
                params={"identifier": f"MRN|{mrn}"},
                headers={"Authorization": f"Bearer {token.token}"}
            )

        bundle = response.json()
        if bundle.get('entry'):
            return Patient.parse_obj(bundle['entry'][0]['resource'])
        raise PatientNotFoundError(mrn)

    async def get_recent_labs(self, patient_id: str) -> list[Observation]:
        """Fetch recent lab results for patient."""
        # Also fetches ALL labs, not just relevant ones
        ...
```

#### Audit Logging

```python
# src/audit.py
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry import trace

# HIPAA audit requirements
class HIPAAAuditLogger:
    def log_phi_access(
        self,
        user_id: str,
        patient_mrn: str,
        action: str,
        phi_fields_accessed: list[str],
        justification: str,
    ):
        """
        Log PHI access for HIPAA compliance.
        Retained for 7 years minimum.
        """
        tracer = trace.get_tracer(__name__)
        with tracer.start_as_current_span("phi_access") as span:
            span.set_attribute("audit.user_id", user_id)
            span.set_attribute("audit.patient_mrn", patient_mrn)
            span.set_attribute("audit.action", action)
            span.set_attribute("audit.phi_fields", ",".join(phi_fields_accessed))
            span.set_attribute("audit.justification", justification)
            span.set_attribute("audit.timestamp", datetime.utcnow().isoformat())
            span.set_attribute("audit.compliance", "hipaa")
```

---

## Summary: Technical Deployment Comparison

| Aspect | Meridian (AWS/EKS) | Nimbus (GCP/Cloud Run) | Healix (Azure/AKS) |
|--------|-------------------|------------------------|-------------------|
| **Orchestration** | Kubernetes (EKS) | Serverless (Cloud Run) | Kubernetes (AKS) |
| **Scaling** | HPA (3-10 pods) | Auto (2-50 instances) | Manual (2 pods) |
| **LLM Provider** | OpenAI via LiteLLM | OpenAI direct | Azure OpenAI |
| **API Key Storage** | AWS Secrets Manager | GCP Secret Manager | Azure Key Vault |
| **Container Registry** | ECR | GCR | ACR |
| **CI/CD** | GitHub Actions + ArgoCD | GitHub Actions + Cloud Build | Azure DevOps |
| **Monitoring** | Datadog | Cloud Monitoring | Azure Monitor |
| **Logging** | CloudWatch + Datadog | BigQuery | Log Analytics |
| **Network** | VPC + ALB | Cloud Load Balancer | VNet + App Gateway |
| **Compliance** | SOC 2 | SOC 2 (working) | HIPAA |

---

## For Simulation: What to Build

### Minimum Viable Simulation

```yaml
# docker-compose.simulation.yml
services:
  # Simulate Kubernetes-style deployment
  langchain-agent:
    build: ./agents/langchain-sample
    environment:
      - LLM_PROXY_URL=http://litellm:4000
      - RIND_PROXY_URL=http://rind-proxy:8080

  crewai-agent:
    build: ./agents/crewai-sample
    environment:
      - LLM_PROXY_URL=http://litellm:4000
      - RIND_PROXY_URL=http://rind-proxy:8080

  # LiteLLM as LLM gateway (realistic)
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports:
      - "4000:4000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./litellm-config.yaml:/app/config.yaml

  # Rind proxy (your product)
  rind-proxy:
    build: ../apps/proxy
    ports:
      - "8080:8080"
    environment:
      - UPSTREAM_URL=http://litellm:4000
    volumes:
      - ./policies:/etc/rind/policies

  # Mock services
  mock-database:
    image: mongo:7

  mock-fhir:
    build: ./mocks/fhir-server

  # Monitoring stack
  prometheus:
    image: prom/prometheus

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
```

This gives you a realistic simulation environment that mirrors how Meridian, Nimbus, and Healix actually deploy their agents.
