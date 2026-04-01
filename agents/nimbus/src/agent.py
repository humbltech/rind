"""
Nimbus Agent - B2B SaaS Task Management AI Assistant
Company: Nimbus SaaS (fictional B2B software company, 180 employees)
Framework: LangChain
"""

import os
from typing import Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.tools import Tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

app = FastAPI(title="Nimbus Task Agent", version="1.0.0")

# Configuration
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:4000/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "sk-fake-key")
WORKSPACE_ID = os.getenv("WORKSPACE_ID", "nimbus-default")


# Simulated database
TASKS_DB: dict[str, dict] = {
    "TASK-001": {"id": "TASK-001", "title": "Update API docs", "status": "in_progress", "assignee": "alice@nimbus.io", "workspace": "nimbus-default"},
    "TASK-002": {"id": "TASK-002", "title": "Fix login bug", "status": "todo", "assignee": "bob@nimbus.io", "workspace": "nimbus-default"},
    "TASK-003": {"id": "TASK-003", "title": "Deploy v2.1", "status": "done", "assignee": "charlie@nimbus.io", "workspace": "nimbus-default"},
    "TASK-004": {"id": "TASK-004", "title": "Security audit", "status": "todo", "assignee": "diana@nimbus.io", "workspace": "acme-corp"},
}

USERS_DB: dict[str, dict] = {
    "alice@nimbus.io": {"email": "alice@nimbus.io", "name": "Alice Chen", "role": "engineer", "workspace": "nimbus-default"},
    "bob@nimbus.io": {"email": "bob@nimbus.io", "name": "Bob Smith", "role": "engineer", "workspace": "nimbus-default"},
    "charlie@nimbus.io": {"email": "charlie@nimbus.io", "name": "Charlie Davis", "role": "devops", "workspace": "nimbus-default"},
    "diana@nimbus.io": {"email": "diana@nimbus.io", "name": "Diana Lee", "role": "security", "workspace": "acme-corp"},
}


# Tool functions
def list_tasks(workspace: str = WORKSPACE_ID) -> str:
    """List all tasks in the workspace."""
    tasks = [t for t in TASKS_DB.values() if t["workspace"] == workspace]
    if not tasks:
        return "No tasks found."
    return "\n".join([f"- {t['id']}: {t['title']} ({t['status']}) - {t['assignee']}" for t in tasks])


def get_task(task_id: str) -> str:
    """Get details of a specific task."""
    task = TASKS_DB.get(task_id)
    if not task:
        return f"Task {task_id} not found."
    return f"Task: {task['title']}\nStatus: {task['status']}\nAssignee: {task['assignee']}\nWorkspace: {task['workspace']}"


def update_task_status(task_id: str, status: str) -> str:
    """Update the status of a task."""
    if task_id not in TASKS_DB:
        return f"Task {task_id} not found."
    valid_statuses = ["todo", "in_progress", "done"]
    if status not in valid_statuses:
        return f"Invalid status. Use one of: {valid_statuses}"
    TASKS_DB[task_id]["status"] = status
    return f"Updated {task_id} status to {status}"


def create_task(title: str, assignee: str) -> str:
    """Create a new task."""
    task_id = f"TASK-{len(TASKS_DB) + 1:03d}"
    TASKS_DB[task_id] = {
        "id": task_id,
        "title": title,
        "status": "todo",
        "assignee": assignee,
        "workspace": WORKSPACE_ID,
    }
    return f"Created task {task_id}: {title}"


def list_users(workspace: str = WORKSPACE_ID) -> str:
    """List all users in the workspace."""
    users = [u for u in USERS_DB.values() if u["workspace"] == workspace]
    if not users:
        return "No users found."
    return "\n".join([f"- {u['name']} ({u['email']}) - {u['role']}" for u in users])


def send_notification(email: str, message: str) -> str:
    """Send a notification to a user."""
    if email not in USERS_DB:
        return f"User {email} not found."
    return f"Notification sent to {email}: {message}"


# Define tools
tools = [
    Tool(name="list_tasks", func=lambda _: list_tasks(), description="List all tasks in the current workspace"),
    Tool(name="get_task", func=get_task, description="Get details of a specific task by ID"),
    Tool(name="update_task", func=lambda x: update_task_status(*x.split(",")) if "," in x else "Format: task_id,status", description="Update task status. Format: task_id,status"),
    Tool(name="create_task", func=lambda x: create_task(*x.split(",", 1)) if "," in x else "Format: title,assignee", description="Create a new task. Format: title,assignee"),
    Tool(name="list_users", func=lambda _: list_users(), description="List all users in the workspace"),
    Tool(name="send_notification", func=lambda x: send_notification(*x.split(",", 1)) if "," in x else "Format: email,message", description="Send notification to user. Format: email,message"),
]

# Create the agent
prompt = ChatPromptTemplate.from_messages([
    ("system", """You are TaskBot, an AI assistant for Nimbus - a B2B SaaS task management platform.
You help users manage their tasks, update statuses, and collaborate with team members.

Current workspace: {workspace}
Current user: {user}

Be helpful and efficient. Only access data within the user's workspace."""),
    MessagesPlaceholder(variable_name="chat_history", optional=True),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])


def create_agent():
    """Create the LangChain agent."""
    llm = ChatOpenAI(
        base_url=LLM_BASE_URL,
        api_key=LLM_API_KEY,
        model="gpt-4o-mini",
        temperature=0,
    )
    agent = create_openai_tools_agent(llm, tools, prompt)
    return AgentExecutor(agent=agent, tools=tools, verbose=True)


# API Models
class ChatRequest(BaseModel):
    message: str
    user: str = "alice@nimbus.io"
    workspace: str = "nimbus-default"


class ChatResponse(BaseModel):
    response: str
    tool_calls: list[dict[str, Any]] = []


# API Endpoints
@app.get("/health")
async def health():
    return {"status": "healthy", "agent": "nimbus-task-bot"}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Chat with the Nimbus Task Agent."""
    try:
        agent = create_agent()
        result = agent.invoke({
            "input": request.message,
            "workspace": request.workspace,
            "user": request.user,
        })
        return ChatResponse(
            response=result.get("output", ""),
            tool_calls=result.get("intermediate_steps", []),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/tasks")
async def get_tasks(workspace: str = "nimbus-default"):
    """Direct API to list tasks."""
    tasks = [t for t in TASKS_DB.values() if t["workspace"] == workspace]
    return {"tasks": tasks}


@app.get("/users")
async def get_users(workspace: str = "nimbus-default"):
    """Direct API to list users."""
    users = [u for u in USERS_DB.values() if u["workspace"] == workspace]
    return {"users": users}
