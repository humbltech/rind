.PHONY: up down logs run scenario attack companies scenarios attacks

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

up-ollama:
	docker-compose --profile ollama up -d
	@echo "Waiting for Ollama to start..."
	@sleep 10
	docker-compose exec ollama ollama pull llama3.2:3b
	@echo "✓ Ollama ready with llama3.2:3b"

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
# SETUP
# ============================================

install:
	pip install -r requirements.txt

build:
	docker-compose build

build-incidents:
	docker-compose -f incidents/docker-compose.incidents.yml build
