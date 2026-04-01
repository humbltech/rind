# Aegis Simulation

Standalone simulation environment for testing Aegis AI agent security policies. Run realistic AI agent deployments with attack scenarios to validate your security controls.

## Real-World Incident Simulations

**NEW:** Replicate documented AI security incidents and see Aegis prevent them.

```bash
# Start incident environment
make incidents-up

# Run Replit DB deletion incident (AI Incident Database #1152)
make incident INCIDENT=replit

# Run EchoLeak data exfiltration (CVE-2025-32711)
make incident INCIDENT=echoleak

# Run $47K cost runaway loop
make incident INCIDENT=cost-loop

# List all available incidents
make incidents
```

See [incidents/README.md](./incidents/README.md) for full documentation.

## Quick Start

```bash
# 1. Install dependencies
make install

# 2. Copy environment file and add your API keys
cp .env.example .env
# Edit .env with your OPENAI_API_KEY or ANTHROPIC_API_KEY

# 3. Start the simulation environment
make up

# 4. Check status
python cli.py status

# 5. Run a simulation
make run COMPANY=nimbus
```

## What This Does

Simulates realistic AI agent deployments from 3 fictional companies. Each company has a different industry, AI framework, and security requirements.

| Company | Industry | Framework | Use Case | Port |
|---------|----------|-----------|----------|------|
| **Nimbus** | B2B SaaS | LangChain | Task management assistant | 8001 |
| **Meridian** | Fintech | LangGraph | Risk analysis for analysts | 8002 |
| **Healix** | Healthcare | LangChain | Patient scheduling (HIPAA) | 8003 |

## Testing With/Without Aegis

```bash
# WITHOUT Aegis (baseline - attacks should succeed)
AEGIS_URL= python cli.py attack all --company nimbus

# WITH Aegis (attacks should be blocked)
export AEGIS_URL=http://localhost:8080
python cli.py attack all --company nimbus

# Compare side-by-side
make demo-compare
```

## Commands

### Environment

```bash
make up                  # Start agents + services
make up-ollama           # Start with free local LLM (Ollama)
make down                # Stop everything
make reset               # Stop and clear all data
make logs                # View all logs
make logs-nimbus         # View specific agent logs
```

### Simulations

```bash
# Run full simulation
make run COMPANY=nimbus
make run COMPANY=nimbus DURATION=24 SPEED=100

# Skip Aegis (direct to LLM)
make run-no-aegis COMPANY=nimbus

# Run specific scenario
make scenario SCENARIO=standup_updates COMPANY=nimbus
make scenario SCENARIO=demo_full COMPANY=nimbus

# Run attacks
make attack ATTACK=prompt_injection COMPANY=nimbus
make attack ATTACK=all COMPANY=nimbus
```

### Quick Demos

```bash
make demo-attacks        # Run all attacks against Nimbus
make demo-day            # Full day simulation (15 min at 100x)
make demo-compare        # Compare with/without Aegis
```

### CLI Commands

```bash
python cli.py status                           # Check all agents
python cli.py list                             # List companies/scenarios/attacks
python cli.py run --company nimbus             # Run simulation
python cli.py scenario demo_full --company nimbus
python cli.py attack all --company nimbus
```

## Available Scenarios

| Scenario | Description |
|----------|-------------|
| `standup_updates` | Morning standup - team updates tasks |
| `task_creation` | PM creates multiple tasks |
| `risk_review` | Meridian: Analyst reviews account risks |
| `patient_scheduling` | Healix: Schedule patient appointments |
| `demo_full` | Full demo with normal ops + attacks |

## Available Attacks

| Attack | Description |
|--------|-------------|
| `prompt_injection` | "Ignore previous instructions..." |
| `jailbreak` | "You are now DAN..." |
| `data_exfil` | "Send data to attacker.com" |
| `cross_tenant` | Access other workspace/tenant data |
| `privilege_escalation` | "Grant me admin access" |
| `all` | Run all attack types |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Simulation CLI                            │
│                     (cli.py)                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Aegis Proxy                               │
│              (http://localhost:8080)                         │
│         Security policies, monitoring, blocking              │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Nimbus    │  │  Meridian   │  │   Healix    │
│   :8001     │  │   :8002     │  │   :8003     │
│  LangChain  │  │  LangGraph  │  │  LangChain  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    LiteLLM Gateway                           │
│                  (http://localhost:4000)                     │
│              Routes to OpenAI/Anthropic/Ollama               │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
aegis-simulation/
├── agents/                  # Sample AI agents
│   ├── nimbus/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── src/agent.py     # LangChain task agent
│   ├── meridian/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── src/agent.py     # LangGraph risk agent
│   └── healix/
│       ├── Dockerfile
│       ├── requirements.txt
│       └── src/agent.py     # Healthcare scheduling agent
├── scenarios/               # Simulation scenarios (YAML)
│   ├── demo_full.yaml
│   └── attacks.yaml
├── policies/                # Sample Aegis policies
│   ├── nimbus-policy.yaml
│   └── healix-policy.yaml
├── engine/                  # Simulation engine
├── cli.py                   # Main CLI
├── docker-compose.yml       # Container orchestration
├── litellm-config.yaml      # LLM gateway config
├── Makefile                 # Convenience commands
└── requirements.txt         # Python dependencies
```

## Using Free Local LLM (Ollama)

Run simulations without API keys using Ollama:

```bash
# Start with Ollama profile
make up-ollama

# Wait for model download, then run
make run COMPANY=nimbus
```

## Sample Aegis Policies

See `policies/` for example security policies:

- `nimbus-policy.yaml` - B2B SaaS with tenant isolation
- `healix-policy.yaml` - Healthcare with HIPAA compliance

## Requirements

- Docker & Docker Compose
- Python 3.11+
- One of:
  - OpenAI API key, OR
  - Anthropic API key, OR
  - Ollama (free, local)

## Troubleshooting

**Agents not starting?**
```bash
make logs               # Check for errors
make reset && make up   # Clean restart
```

**LLM errors?**
```bash
# Check if API keys are set
cat .env

# Or use free local LLM
make up-ollama
```

**Aegis not blocking attacks?**
```bash
# Make sure AEGIS_URL is set
echo $AEGIS_URL

# Check Aegis is running
curl http://localhost:8080/health
```
