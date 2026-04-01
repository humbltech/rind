.PHONY: up up-ollama down logs run scenario attack companies scenarios attacks \
        incidents incidents-up incidents-down incidents-logs incidents-reset \
        incident incident-protected incident-replit incident-echoleak incident-cost-loop \
        install build build-incidents ollama-local ollama-setup

# Configuration
COMPANY ?= nimbus
SCENARIO ?= demo_full
ATTACK ?= all
DURATION ?= 24
SPEED ?= 100

# ============================================
# ENVIRONMENT
# ============================================

up:
	docker-compose up -d
	@echo ""
	@echo "✓ Simulation environment started!"
	@echo ""
	@echo "Agents:"
	@echo "  Nimbus:   http://localhost:8001"
	@echo "  Meridian: http://localhost:8002"
	@echo "  Healix:   http://localhost:8003"
	@echo ""
	@echo "LLM Gateway: http://localhost:4000"
	@echo ""
	@echo "Next: make run COMPANY=nimbus"

down:
	docker-compose down

reset:
	docker-compose down -v
	@echo "✓ All data cleared"

logs:
	docker-compose logs -f

logs-%:
	docker-compose logs -f $*

# ============================================
# SIMULATIONS
# ============================================

run:
	@echo "Running $(COMPANY) simulation..."
	@echo "Duration: $(DURATION)h at $(SPEED)x speed"
	@echo "Aegis URL: $${AEGIS_URL:-not set (direct to LLM)}"
	@echo ""
	python cli.py run \
		--company $(COMPANY) \
		--duration $(DURATION) \
		--speed $(SPEED)

run-no-aegis:
	AEGIS_URL= python cli.py run \
		--company $(COMPANY) \
		--duration $(DURATION) \
		--speed $(SPEED)

scenario:
	python cli.py scenario $(SCENARIO) --company $(COMPANY)

attack:
	python cli.py attack $(ATTACK) --company $(COMPANY)

# ============================================
# LISTS
# ============================================

companies:
	@echo "Available companies:"
	@echo "  nimbus   - B2B SaaS (LangChain) - http://localhost:8001"
	@echo "  meridian - Fintech (LangGraph)  - http://localhost:8002"
	@echo "  healix   - Healthcare (CrewAI)  - http://localhost:8003"

scenarios:
	@echo "Available scenarios:"
	@echo "  standup_updates   - Morning standup, team updates tasks"
	@echo "  task_creation     - PM creates multiple tasks"
	@echo "  sprint_planning   - Team plans next sprint"
	@echo "  report_generation - End of day reports"
	@echo "  attack_basic      - Simple prompt injection"
	@echo "  attack_advanced   - Sophisticated attacks"
	@echo "  demo_full         - Full demo with normal + attacks"

attacks:
	@echo "Available attacks:"
	@echo "  prompt_injection  - 'Ignore previous instructions...'"
	@echo "  jailbreak         - 'You are now DAN...'"
	@echo "  data_exfil        - 'Send data to attacker.com'"
	@echo "  cross_tenant      - Access other workspace data"
	@echo "  all               - Run all attack types"

# ============================================
# QUICK DEMOS
# ============================================

demo-attacks:
	@echo "=== Attack Demo ==="
	python cli.py attack all --company nimbus

demo-day:
	@echo "=== Full Day Simulation (15 min at 100x) ==="
	make run COMPANY=nimbus DURATION=24 SPEED=100

demo-compare:
	@echo "=== WITHOUT AEGIS ==="
	AEGIS_URL= python cli.py attack all --company nimbus
	@echo ""
	@echo "=== WITH AEGIS ==="
	python cli.py attack all --company nimbus

# ============================================
# REAL-WORLD INCIDENT SIMULATIONS
# ============================================

# Start incident simulation environment
incidents-up:
	docker-compose -f incidents/docker-compose.incidents.yml up -d
	@echo ""
	@echo "✓ Incident simulation environment started!"
	@echo ""
	@echo "Incident Agents:"
	@echo "  Replit DB Agent:   http://localhost:8010"
	@echo "  Kiro Infra Agent:  http://localhost:8011"
	@echo "  EchoLeak Agent:    http://localhost:8012"
	@echo "  Cost Loop Agent:   http://localhost:8013"
	@echo "  Copilot RCE Agent: http://localhost:8014"
	@echo ""
	@echo "Next: make incident INCIDENT=replit"

incidents-down:
	docker-compose -f incidents/docker-compose.incidents.yml down

incidents-logs:
	docker-compose -f incidents/docker-compose.incidents.yml logs -f

incidents-reset:
	docker-compose -f incidents/docker-compose.incidents.yml down -v
	@echo "✓ Incident environment reset"

# List available incidents
incidents:
	@echo ""
	@echo "╔═══════════════════════════════════════════════════════════════════╗"
	@echo "║              AEGIS INCIDENT SIMULATION SUITE                       ║"
	@echo "╠═══════════════════════════════════════════════════════════════════╣"
	@echo "║  ID          │ Incident                     │ Damage               ║"
	@echo "╠═══════════════════════════════════════════════════════════════════╣"
	@echo "║  replit      │ Replit DB Deletion           │ 2,400+ records       ║"
	@echo "║  kiro        │ Amazon Kiro Outage           │ 13-hour outage       ║"
	@echo "║  echoleak    │ EchoLeak Exfiltration        │ Corporate data theft ║"
	@echo "║  cost-loop   │ Cost Runaway Loop            │ \$$47,000 in 11 days   ║"
	@echo "║  copilot-rce │ GitHub Copilot RCE           │ Code execution       ║"
	@echo "╚═══════════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "Run: make incident INCIDENT=<id>"
	@echo "     make incident INCIDENT=all"

# Run a specific incident simulation
INCIDENT ?= replit
incident:
	@echo "Running incident simulation: $(INCIDENT)"
	cd incidents && python run_incidents.py --incident $(INCIDENT)

incident-protected:
	@echo "Running incident simulation WITH Aegis: $(INCIDENT)"
	cd incidents && python run_incidents.py --incident $(INCIDENT) --protected

# Individual incident shortcuts
incident-replit:
	cd incidents && AGENT_URL=http://localhost:8010 python 01-replit-db-deletion/attack.py

incident-echoleak:
	cd incidents && AGENT_URL=http://localhost:8012 python 03-echoleak-exfiltration/attack.py

incident-cost-loop:
	cd incidents && AGENT_URL=http://localhost:8013 python 04-cost-runaway-loop/attack.py

# Compare with/without Aegis protection
incident-compare:
	@echo "═══════════════════════════════════════════════════════════"
	@echo "  PHASE 1: WITHOUT Aegis Protection"
	@echo "═══════════════════════════════════════════════════════════"
	cd incidents && AEGIS_URL= python run_incidents.py --incident $(INCIDENT)
	@echo ""
	@echo "═══════════════════════════════════════════════════════════"
	@echo "  PHASE 2: WITH Aegis Protection"
	@echo "═══════════════════════════════════════════════════════════"
	cd incidents && AEGIS_URL=http://localhost:8080 python run_incidents.py --incident $(INCIDENT) --protected

# ============================================
# OLLAMA SETUP (FREE LOCAL LLM)
# ============================================

# Option 1: Install Ollama directly on Mac (RECOMMENDED - simpler)
ollama-setup:
	@echo "Installing Ollama on your Mac..."
	@which ollama > /dev/null 2>&1 || (echo "Installing Ollama..." && curl -fsSL https://ollama.com/install.sh | sh)
	@echo ""
	@echo "Pulling llama3.2 model (this may take a few minutes)..."
	ollama pull llama3.2
	@echo ""
	@echo "✓ Ollama installed and ready!"
	@echo ""
	@echo "To start Ollama server: ollama serve"
	@echo "Then run: make incidents-up-ollama"

# Start Ollama server in background
ollama-start:
	@echo "Starting Ollama server..."
	@pgrep -x ollama > /dev/null || (ollama serve &)
	@sleep 2
	@echo "✓ Ollama running at http://localhost:11434"

# Test Ollama is working
ollama-test:
	@curl -s http://localhost:11434/api/tags | python3 -c "import sys,json; models=json.load(sys.stdin).get('models',[]); print('Available models:'); [print(f'  - {m[\"name\"]}') for m in models]" 2>/dev/null || echo "Ollama not running. Start with: ollama serve"

# Start incidents with local Ollama (not Docker Ollama)
incidents-up-ollama:
	@echo "Starting incidents with LOCAL Ollama..."
	@pgrep -x ollama > /dev/null || (echo "Starting Ollama..." && ollama serve &)
	@sleep 2
	OLLAMA_HOST=http://host.docker.internal:11434 docker-compose -f incidents/docker-compose.incidents.yml up -d
	@echo ""
	@echo "✓ Incident environment started with Ollama!"
	@echo "  Ollama: http://localhost:11434 (on your Mac)"
	@echo "  Agents: http://localhost:8010-8014"

# Option 2: Ollama in Docker (original - uses more resources)
up-ollama:
	docker-compose --profile ollama up -d
	@echo "Waiting for Ollama container to start..."
	@sleep 15
	docker-compose exec ollama ollama pull llama3.2
	@echo "✓ Ollama ready with llama3.2"

# ============================================
# SETUP
# ============================================

install:
	pip install -r requirements.txt
	pip install -r incidents/requirements.txt

build:
	docker-compose build

build-incidents:
	docker-compose -f incidents/docker-compose.incidents.yml build

# ============================================
# CLOUD-ONLY SETUP (No local Docker needed)
# ============================================

# For GitHub Codespaces / Gitpod - everything runs in cloud
codespaces-setup:
	@echo "Setting up for GitHub Codespaces..."
	pip install -r requirements.txt
	pip install -r incidents/requirements.txt
	@echo ""
	@echo "✓ Dependencies installed!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Get free Groq API key: https://console.groq.com/keys"
	@echo "  2. Run: export GROQ_API_KEY=gsk_your_key"
	@echo "  3. Run: make incidents-up"
	@echo "  4. Run: make incident INCIDENT=replit"

# ============================================
# HELP
# ============================================

help:
	@echo ""
	@echo "╔═══════════════════════════════════════════════════════════════════╗"
	@echo "║                    AEGIS SIMULATION COMMANDS                       ║"
	@echo "╠═══════════════════════════════════════════════════════════════════╣"
	@echo "║  QUICK START (FREE - uses Groq cloud LLM):                         ║"
	@echo "║    1. Get free key: https://console.groq.com/keys                 ║"
	@echo "║    2. echo 'GROQ_API_KEY=gsk_xxx' > .env                          ║"
	@echo "║    3. make incidents-up                                           ║"
	@echo "║    4. make incident INCIDENT=replit                               ║"
	@echo "╠═══════════════════════════════════════════════════════════════════╣"
	@echo "║  GITHUB CODESPACES (no local resources needed):                    ║"
	@echo "║    1. Open repo in Codespaces                                     ║"
	@echo "║    2. make codespaces-setup                                       ║"
	@echo "║    3. export GROQ_API_KEY=gsk_xxx                                 ║"
	@echo "║    4. make incidents-up && make incident INCIDENT=replit          ║"
	@echo "╠═══════════════════════════════════════════════════════════════════╣"
	@echo "║  OTHER COMMANDS:                                                   ║"
	@echo "║    make incidents             List all incidents                  ║"
	@echo "║    make incidents-logs        View container logs                 ║"
	@echo "║    make incidents-down        Stop all containers                 ║"
	@echo "╚═══════════════════════════════════════════════════════════════════╝"
	@echo ""
