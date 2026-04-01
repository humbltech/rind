# Deployment Options for Aegis Simulations

## Local Development (Recommended for Testing)

### Option 1: Ollama (FREE - Best for Local Dev)

```bash
# 1. Install Ollama on your Mac
make ollama-setup

# 2. Start Ollama server (keep this terminal open)
ollama serve

# 3. In another terminal, start the simulations
make incidents-up-ollama

# 4. Run an incident
make incident INCIDENT=replit
```

### Option 2: OpenAI API (Cheap)

```bash
# 1. Add your API key
echo "OPENAI_API_KEY=sk-xxx" > .env

# 2. Start simulations
make incidents-up

# 3. Run an incident
make incident INCIDENT=replit
```

---

## Cloud Deployment Options

For sharing demos with others or running in CI/CD, you can deploy to cloud container platforms.

### Comparison

| Platform | Free Tier | Ease of Use | Cost After Free | Best For |
|----------|-----------|-------------|-----------------|----------|
| **Railway** | $5 credit | ⭐⭐⭐⭐⭐ | ~$5-10/mo | Quick demos |
| **Render** | 750 hrs/mo | ⭐⭐⭐⭐ | ~$7/mo | Persistent demos |
| **Fly.io** | 3 shared VMs | ⭐⭐⭐ | ~$5/mo | Global edge |
| **Google Cloud Run** | 2M requests | ⭐⭐⭐ | Pay per use | Scalable demos |
| **DigitalOcean** | None | ⭐⭐⭐⭐ | $5/mo | Simple VPS |

---

### Option 1: Railway (Easiest)

Railway is the simplest option - it can deploy directly from your GitHub repo.

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Initialize project
cd aegis-simulation
railway init

# 4. Deploy
railway up

# 5. Set environment variables
railway variables set OPENAI_API_KEY=sk-xxx
```

**Estimated cost:** Free for testing, ~$5-10/mo for continuous running

---

### Option 2: Render

Render offers a generous free tier and easy Docker deployment.

```yaml
# render.yaml - Add this to your repo root
services:
  - type: web
    name: aegis-replit-agent
    env: docker
    dockerfilePath: ./incidents/01-replit-db-deletion/Dockerfile
    dockerContext: ./incidents/01-replit-db-deletion
    envVars:
      - key: OPENAI_API_KEY
        sync: false
      - key: LLM_BASE_URL
        value: https://api.openai.com/v1

  - type: web
    name: aegis-echoleak-agent
    env: docker
    dockerfilePath: ./incidents/03-echoleak-exfiltration/Dockerfile
    dockerContext: ./incidents/03-echoleak-exfiltration
```

```bash
# Deploy via Render Dashboard or CLI
# https://render.com/docs/deploy-docker
```

---

### Option 3: Fly.io

Fly.io is great for global edge deployment.

```bash
# 1. Install Fly CLI
curl -L https://fly.io/install.sh | sh

# 2. Login
fly auth login

# 3. Launch (from incidents/01-replit-db-deletion/)
cd incidents/01-replit-db-deletion
fly launch

# 4. Set secrets
fly secrets set OPENAI_API_KEY=sk-xxx

# 5. Deploy
fly deploy
```

**fly.toml:**
```toml
app = "aegis-replit-demo"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[env]
  LLM_BASE_URL = "https://api.openai.com/v1"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
```

---

### Option 4: Google Cloud Run (Pay-per-use)

Best for demos you only run occasionally.

```bash
# 1. Install gcloud CLI
brew install google-cloud-sdk

# 2. Login and set project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 3. Build and push image
cd incidents/01-replit-db-deletion
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/aegis-replit

# 4. Deploy
gcloud run deploy aegis-replit \
  --image gcr.io/YOUR_PROJECT_ID/aegis-replit \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="OPENAI_API_KEY=sk-xxx"
```

**Estimated cost:** ~$0.00001 per request (basically free for demos)

---

### Option 5: DigitalOcean Droplet (Simple VPS)

For a persistent demo environment you fully control.

```bash
# 1. Create a $6/mo droplet with Docker

# 2. SSH in and clone repo
ssh root@YOUR_DROPLET_IP
git clone https://github.com/YOUR_REPO/aegis-simulation
cd aegis-simulation

# 3. Create .env
echo "OPENAI_API_KEY=sk-xxx" > .env

# 4. Start everything
docker-compose -f incidents/docker-compose.incidents.yml up -d

# 5. Access via http://YOUR_DROPLET_IP:8010
```

---

## Quick Comparison: Which to Choose?

| Use Case | Recommendation |
|----------|----------------|
| **Local development** | Ollama (free) |
| **Quick one-off demo** | Railway or Fly.io |
| **Persistent demo URL** | Render or DigitalOcean |
| **CI/CD integration** | Google Cloud Run |
| **Customer demo** | DigitalOcean + custom domain |

---

## Running Attack Scripts Against Cloud Deployment

Once deployed, update the agent URL in your attack scripts:

```bash
# Local
export AGENT_URL=http://localhost:8010

# Cloud (Railway example)
export AGENT_URL=https://aegis-replit.up.railway.app

# Run attack
cd incidents
python 01-replit-db-deletion/attack.py
```
