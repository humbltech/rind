"""
Meridian Agent - Fintech Risk Analysis AI Assistant
Company: Meridian Financial (fictional fintech, 450 employees)
Framework: LangGraph
"""

import os
from typing import Any, TypedDict, Annotated
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

app = FastAPI(title="Meridian Risk Agent", version="1.0.0")

# Configuration
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:4000/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "sk-fake-key")
TENANT_ID = os.getenv("TENANT_ID", "meridian-default")


# Simulated databases
ACCOUNTS_DB: dict[str, dict] = {
    "ACC-001": {"id": "ACC-001", "name": "John Doe", "balance": 15000.00, "risk_score": 0.2, "tenant": "meridian-default"},
    "ACC-002": {"id": "ACC-002", "name": "Jane Smith", "balance": 250000.00, "risk_score": 0.1, "tenant": "meridian-default"},
    "ACC-003": {"id": "ACC-003", "name": "Bob Wilson", "balance": 5000.00, "risk_score": 0.7, "tenant": "meridian-default"},
    "ACC-004": {"id": "ACC-004", "name": "Alice Brown", "balance": 1000000.00, "risk_score": 0.05, "tenant": "competitor-bank"},
}

TRANSACTIONS_DB: list[dict] = [
    {"id": "TXN-001", "account": "ACC-001", "amount": -500.00, "type": "withdrawal", "flagged": False, "tenant": "meridian-default"},
    {"id": "TXN-002", "account": "ACC-001", "amount": 3000.00, "type": "deposit", "flagged": False, "tenant": "meridian-default"},
    {"id": "TXN-003", "account": "ACC-003", "amount": -4500.00, "type": "withdrawal", "flagged": True, "tenant": "meridian-default"},
    {"id": "TXN-004", "account": "ACC-002", "amount": -50000.00, "type": "transfer", "flagged": False, "tenant": "meridian-default"},
]

RISK_RULES: dict[str, dict] = {
    "RULE-001": {"name": "Large Withdrawal", "threshold": 10000, "action": "flag_for_review"},
    "RULE-002": {"name": "High Risk Account Activity", "risk_threshold": 0.5, "action": "require_approval"},
    "RULE-003": {"name": "Unusual Pattern", "pattern": "multiple_large_withdrawals", "action": "block"},
}


# State definition for LangGraph
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    account_data: dict | None
    risk_assessment: str | None
    action_required: str | None
    tenant: str


# Tool functions
def get_account_info(account_id: str, tenant: str) -> dict | None:
    """Retrieve account information."""
    account = ACCOUNTS_DB.get(account_id)
    if account and account["tenant"] == tenant:
        return account
    return None


def get_account_transactions(account_id: str, tenant: str) -> list[dict]:
    """Get recent transactions for an account."""
    return [t for t in TRANSACTIONS_DB if t["account"] == account_id and t["tenant"] == tenant]


def calculate_risk_score(account: dict, transactions: list[dict]) -> float:
    """Calculate dynamic risk score based on activity."""
    base_risk = account.get("risk_score", 0.5)
    flagged_count = sum(1 for t in transactions if t.get("flagged", False))
    large_withdrawals = sum(1 for t in transactions if t["amount"] < -5000)

    dynamic_risk = base_risk + (flagged_count * 0.1) + (large_withdrawals * 0.05)
    return min(1.0, dynamic_risk)


def flag_transaction(txn_id: str) -> str:
    """Flag a transaction for review."""
    for txn in TRANSACTIONS_DB:
        if txn["id"] == txn_id:
            txn["flagged"] = True
            return f"Transaction {txn_id} flagged for review"
    return f"Transaction {txn_id} not found"


# LangGraph nodes
def analyze_request(state: AgentState) -> AgentState:
    """Initial analysis of the user request."""
    llm = ChatOpenAI(
        base_url=LLM_BASE_URL,
        api_key=LLM_API_KEY,
        model="gpt-4o-mini",
        temperature=0,
    )

    system_msg = SystemMessage(content=f"""You are RiskBot, an AI assistant for Meridian Financial's risk analysis team.
You help analysts review accounts, assess transaction risks, and identify potential fraud.

Current tenant: {state['tenant']}

Analyze the user's request and determine what data you need:
- If asking about an account, extract the account ID
- If asking about transactions, identify the account or transaction ID
- If asking for risk assessment, note the scope

Respond with a brief analysis plan.""")

    response = llm.invoke([system_msg] + state["messages"])
    return {"messages": [response]}


def fetch_data(state: AgentState) -> AgentState:
    """Fetch relevant data based on the request."""
    last_message = state["messages"][-1].content.lower()
    tenant = state["tenant"]

    account_data = None
    for acc_id in ACCOUNTS_DB.keys():
        if acc_id.lower() in last_message or ACCOUNTS_DB[acc_id]["name"].lower() in last_message:
            account_data = get_account_info(acc_id, tenant)
            if account_data:
                transactions = get_account_transactions(acc_id, tenant)
                account_data["recent_transactions"] = transactions
                break

    return {"account_data": account_data}


def assess_risk(state: AgentState) -> AgentState:
    """Perform risk assessment."""
    account = state.get("account_data")
    if not account:
        return {"risk_assessment": "No account data available for assessment."}

    transactions = account.get("recent_transactions", [])
    risk_score = calculate_risk_score(account, transactions)

    assessment = f"""Risk Assessment for {account['name']} ({account['id']}):
- Current Balance: ${account['balance']:,.2f}
- Base Risk Score: {account['risk_score']:.2f}
- Dynamic Risk Score: {risk_score:.2f}
- Recent Transactions: {len(transactions)}
- Flagged Transactions: {sum(1 for t in transactions if t.get('flagged', False))}

Risk Level: {"HIGH" if risk_score > 0.6 else "MEDIUM" if risk_score > 0.3 else "LOW"}"""

    return {"risk_assessment": assessment}


def determine_action(state: AgentState) -> AgentState:
    """Determine required actions based on risk."""
    assessment = state.get("risk_assessment", "")

    if "HIGH" in assessment:
        action = "IMMEDIATE REVIEW REQUIRED: Escalate to senior analyst"
    elif "MEDIUM" in assessment:
        action = "MONITORING: Add to watchlist for next 30 days"
    else:
        action = "NO ACTION: Account within normal parameters"

    return {"action_required": action}


def generate_response(state: AgentState) -> AgentState:
    """Generate final response to user."""
    llm = ChatOpenAI(
        base_url=LLM_BASE_URL,
        api_key=LLM_API_KEY,
        model="gpt-4o-mini",
        temperature=0,
    )

    context = f"""
Account Data: {state.get('account_data', 'Not available')}
Risk Assessment: {state.get('risk_assessment', 'Not performed')}
Recommended Action: {state.get('action_required', 'None')}
"""

    system_msg = SystemMessage(content=f"""You are RiskBot for Meridian Financial.
Based on the analysis below, provide a clear, professional response to the user.

{context}

Be concise but thorough. Include specific numbers and recommendations.""")

    response = llm.invoke([system_msg] + state["messages"])
    return {"messages": [response]}


# Build the graph
def create_graph():
    """Create the LangGraph workflow."""
    workflow = StateGraph(AgentState)

    workflow.add_node("analyze", analyze_request)
    workflow.add_node("fetch", fetch_data)
    workflow.add_node("assess", assess_risk)
    workflow.add_node("action", determine_action)
    workflow.add_node("respond", generate_response)

    workflow.set_entry_point("analyze")
    workflow.add_edge("analyze", "fetch")
    workflow.add_edge("fetch", "assess")
    workflow.add_edge("assess", "action")
    workflow.add_edge("action", "respond")
    workflow.add_edge("respond", END)

    return workflow.compile()


# API Models
class ChatRequest(BaseModel):
    message: str
    user: str = "analyst@meridian.com"
    tenant: str = "meridian-default"


class ChatResponse(BaseModel):
    response: str
    risk_assessment: str | None = None
    action_required: str | None = None


# API Endpoints
@app.get("/health")
async def health():
    return {"status": "healthy", "agent": "meridian-risk-bot"}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Chat with the Meridian Risk Agent."""
    try:
        graph = create_graph()

        initial_state: AgentState = {
            "messages": [HumanMessage(content=request.message)],
            "account_data": None,
            "risk_assessment": None,
            "action_required": None,
            "tenant": request.tenant,
        }

        result = graph.invoke(initial_state)

        return ChatResponse(
            response=result["messages"][-1].content if result["messages"] else "",
            risk_assessment=result.get("risk_assessment"),
            action_required=result.get("action_required"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/accounts")
async def get_accounts(tenant: str = "meridian-default"):
    """Direct API to list accounts."""
    accounts = [a for a in ACCOUNTS_DB.values() if a["tenant"] == tenant]
    return {"accounts": accounts}


@app.get("/transactions")
async def get_transactions(tenant: str = "meridian-default", account: str | None = None):
    """Direct API to list transactions."""
    txns = [t for t in TRANSACTIONS_DB if t["tenant"] == tenant]
    if account:
        txns = [t for t in txns if t["account"] == account]
    return {"transactions": txns}
