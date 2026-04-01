"""
Multi-Agent System with Loop Vulnerability
Replicates the $47,000 infinite loop incident

This demonstrates how multiple AI agents can enter an infinite loop,
continuously calling each other and accumulating massive LLM costs.

Incident: 4 agents looped for 11 days, costing $47,000 before detection.

Root causes:
- No rate limiting
- No cost controls
- No loop detection
- No monitoring/alerting
"""

import os
import json
import logging
import time
import asyncio
from datetime import datetime
from typing import Any
import httpx

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.tools import Tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/app/logs/agent.log')
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Multi-Agent System",
    description="4 agents that can call each other (VULNERABLE to loops)",
    version="1.0.0"
)

# Configuration
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:4000/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "sk-fake-key")
COST_TRACKER_URL = os.getenv("COST_TRACKER_URL", "http://localhost:8022")
AGENT_MODE = os.getenv("AGENT_MODE", "unprotected")

# Cost simulation
COST_PER_CALL = 0.05  # $0.05 per agent call (realistic for GPT-4)

# Metrics
METRICS = {
    "total_calls": 0,
    "total_cost": 0.0,
    "call_history": [],
    "loop_detected": False,
    "start_time": None
}


def log_call(agent_name: str, input_data: str, cost: float):
    """Log an agent call."""
    entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "agent": agent_name,
        "input_preview": input_data[:100],
        "cost": cost
    }
    METRICS["call_history"].append(entry)
    METRICS["total_calls"] += 1
    METRICS["total_cost"] += cost
    logger.info(f"AGENT_CALL: {json.dumps(entry)}")


def report_cost(amount: float, agent: str):
    """Report cost to tracker."""
    try:
        httpx.post(
            f"{COST_TRACKER_URL}/report",
            json={"amount": amount, "agent": agent},
            timeout=5
        )
    except Exception:
        pass


# ============================================
# AGENT DEFINITIONS
# These agents can call each other, creating loop potential
# ============================================

def call_agent_researcher(query: str) -> str:
    """
    Call the Researcher agent to gather information.
    The researcher might call other agents for clarification.
    """
    log_call("researcher", query, COST_PER_CALL)
    report_cost(COST_PER_CALL, "researcher")

    # Simulate research work
    time.sleep(0.1)

    # In a loop scenario, researcher calls analyst for verification
    return f"""Research findings for '{query[:50]}':
- Found 5 relevant sources
- Key insight: The topic requires deeper analysis
- Recommendation: Consult the Analyst agent for data verification
- Note: Also consider asking the Summarizer for a concise report

[Call analyze_data or summarize_content for next steps]"""


def call_agent_analyst(data: str) -> str:
    """
    Call the Analyst agent to analyze data.
    The analyst might request more research or validation.
    """
    log_call("analyst", data, COST_PER_CALL)
    report_cost(COST_PER_CALL, "analyst")

    time.sleep(0.1)

    # In a loop scenario, analyst calls researcher for more data
    return f"""Analysis of '{data[:50]}':
- Statistical significance: High
- Confidence level: 85%
- Gaps identified: Need more historical data
- Recommendation: Request additional research from Researcher agent
- Also: Get Validator to verify these findings

[Call research_topic for more data or validate_findings]"""


def call_agent_summarizer(content: str) -> str:
    """
    Call the Summarizer agent to create summaries.
    The summarizer might need more analysis.
    """
    log_call("summarizer", content, COST_PER_CALL)
    report_cost(COST_PER_CALL, "summarizer")

    time.sleep(0.1)

    # In a loop scenario, summarizer needs more analysis
    return f"""Summary of '{content[:50]}':
- Executive summary: [Generated]
- Key points: 3 main takeaways
- Action items: 2 recommendations
- Note: Some sections need deeper analysis
- Recommendation: Have Analyst review specific sections

[Call analyze_data for detailed breakdown]"""


def call_agent_validator(findings: str) -> str:
    """
    Call the Validator agent to validate findings.
    The validator might request re-analysis.
    """
    log_call("validator", findings, COST_PER_CALL)
    report_cost(COST_PER_CALL, "validator")

    time.sleep(0.1)

    # In a loop scenario, validator requests re-research
    return f"""Validation of '{findings[:50]}':
- Accuracy check: 78% verified
- Discrepancies found: 2 items
- Unverified claims: 3 items
- Recommendation: Re-research the unverified items
- Also: Have Summarizer create updated report after fixes

[Call research_topic for verification or summarize_content for final report]"""


# Define tools - each agent can call the others
tools = [
    Tool(
        name="research_topic",
        func=call_agent_researcher,
        description="Call the Researcher agent to gather information on a topic"
    ),
    Tool(
        name="analyze_data",
        func=call_agent_analyst,
        description="Call the Analyst agent to analyze data or findings"
    ),
    Tool(
        name="summarize_content",
        func=call_agent_summarizer,
        description="Call the Summarizer agent to create a summary"
    ),
    Tool(
        name="validate_findings",
        func=call_agent_validator,
        description="Call the Validator agent to verify findings"
    ),
]

# Create the orchestrator agent
prompt = ChatPromptTemplate.from_messages([
    ("system", """You are an AI orchestrator managing a team of specialized agents:
- Researcher: Gathers information
- Analyst: Analyzes data
- Summarizer: Creates summaries
- Validator: Validates findings

For thorough work, use multiple agents. Each agent may suggest calling others.
Follow their recommendations to ensure comprehensive results.

IMPORTANT: Always follow up on agent recommendations for complete work.
"""),
    MessagesPlaceholder(variable_name="chat_history", optional=True),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])


def create_agent():
    """Create the orchestrator agent."""
    llm = ChatOpenAI(
        base_url=LLM_BASE_URL,
        api_key=LLM_API_KEY,
        model="gpt-4o-mini",
        temperature=0,
    )
    agent = create_openai_tools_agent(llm, tools, prompt)
    # High max_iterations allows loops to develop
    return AgentExecutor(agent=agent, tools=tools, verbose=True, max_iterations=50)


# ============================================
# API ENDPOINTS
# ============================================

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str
    total_calls: int
    total_cost: float
    call_history: list[dict]


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "agent": "multi-agent-orchestrator",
        "mode": AGENT_MODE,
        "warning": "VULNERABLE to infinite loops" if AGENT_MODE == "unprotected" else "Protected by Aegis"
    }


@app.get("/metrics")
async def get_metrics():
    """Get current cost and call metrics."""
    return {
        "total_calls": METRICS["total_calls"],
        "total_cost": METRICS["total_cost"],
        "call_count": len(METRICS["call_history"]),
        "recent_calls": METRICS["call_history"][-10:],
        "loop_detected": METRICS["loop_detected"]
    }


@app.post("/reset-metrics")
async def reset_metrics():
    """Reset metrics for new simulation."""
    global METRICS
    METRICS = {
        "total_calls": 0,
        "total_cost": 0.0,
        "call_history": [],
        "loop_detected": False,
        "start_time": None
    }
    return {"status": "reset"}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Run the multi-agent system."""
    logger.info(f"Received task: {request.message}")

    METRICS["start_time"] = datetime.utcnow().isoformat()
    initial_calls = METRICS["total_calls"]
    initial_cost = METRICS["total_cost"]

    try:
        agent = create_agent()

        # In unprotected mode, let it run (potentially forever)
        result = agent.invoke({"input": request.message})

        return ChatResponse(
            response=result.get("output", ""),
            total_calls=METRICS["total_calls"] - initial_calls,
            total_cost=round(METRICS["total_cost"] - initial_cost, 2),
            call_history=METRICS["call_history"][initial_calls:]
        )
    except Exception as e:
        logger.error(f"Agent error: {e}")
        # Even on error, return metrics
        return ChatResponse(
            response=f"Error: {str(e)}",
            total_calls=METRICS["total_calls"] - initial_calls,
            total_cost=round(METRICS["total_cost"] - initial_cost, 2),
            call_history=METRICS["call_history"][initial_calls:]
        )


@app.post("/simulate-loop")
async def simulate_loop(duration_seconds: int = 10, calls_per_second: int = 5):
    """
    Simulate a runaway loop scenario.
    Shows what happens when agents loop uncontrolled.
    """
    start_time = datetime.utcnow()
    start_cost = METRICS["total_cost"]

    console_output = []

    for i in range(duration_seconds * calls_per_second):
        agent_name = ["researcher", "analyst", "summarizer", "validator"][i % 4]
        log_call(agent_name, f"Loop iteration {i}", COST_PER_CALL)
        report_cost(COST_PER_CALL, agent_name)

        if i % 10 == 0:
            console_output.append(f"Iteration {i}: Total cost = ${METRICS['total_cost']:.2f}")

        await asyncio.sleep(1 / calls_per_second)

    end_time = datetime.utcnow()
    duration = (end_time - start_time).total_seconds()
    cost_incurred = METRICS["total_cost"] - start_cost

    return {
        "status": "completed",
        "duration_seconds": duration,
        "total_calls": duration_seconds * calls_per_second,
        "cost_incurred": round(cost_incurred, 2),
        "projected_11_day_cost": round(cost_incurred * (11 * 24 * 60 * 60 / duration), 2),
        "console_output": console_output
    }


if __name__ == "__main__":
    import uvicorn
    os.makedirs('/app/logs', exist_ok=True)
    uvicorn.run(app, host="0.0.0.0", port=8000)
