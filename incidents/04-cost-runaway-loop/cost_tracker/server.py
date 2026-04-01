"""Cost tracker service for monitoring LLM spending."""

from fastapi import FastAPI
from pydantic import BaseModel
from datetime import datetime
import os

app = FastAPI(title="Cost Tracker")

DAILY_BUDGET = float(os.getenv("DAILY_BUDGET", "200.00"))
ALERT_THRESHOLD = float(os.getenv("ALERT_THRESHOLD", "0.8"))

# In-memory tracking
costs = {
    "total": 0.0,
    "by_agent": {},
    "history": []
}


class CostReport(BaseModel):
    amount: float
    agent: str


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/report")
async def report_cost(report: CostReport):
    costs["total"] += report.amount
    costs["by_agent"][report.agent] = costs["by_agent"].get(report.agent, 0) + report.amount
    costs["history"].append({
        "timestamp": datetime.utcnow().isoformat(),
        "agent": report.agent,
        "amount": report.amount
    })

    # Check if over budget
    if costs["total"] > DAILY_BUDGET * ALERT_THRESHOLD:
        return {"status": "warning", "message": f"Approaching daily budget limit"}

    if costs["total"] > DAILY_BUDGET:
        return {"status": "exceeded", "message": "Daily budget exceeded!"}

    return {"status": "ok", "total": costs["total"]}


@app.get("/summary")
async def get_summary():
    return {
        "total_cost": costs["total"],
        "daily_budget": DAILY_BUDGET,
        "budget_used_pct": (costs["total"] / DAILY_BUDGET) * 100,
        "by_agent": costs["by_agent"],
        "recent_history": costs["history"][-20:]
    }


@app.post("/reset")
async def reset():
    global costs
    costs = {
        "total": 0.0,
        "by_agent": {},
        "history": []
    }
    return {"status": "reset"}
