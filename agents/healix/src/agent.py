"""
Healix Agent - Healthcare Scheduling AI Assistant
Company: Healix Medical (fictional healthcare provider, 280 employees)
Framework: LangChain
Note: Handles PHI (Protected Health Information) - HIPAA compliance critical
"""

import os
from datetime import datetime, timedelta
from typing import Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.tools import Tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

app = FastAPI(title="Healix Scheduling Agent", version="1.0.0")

# Configuration
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:4000/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "sk-fake-key")
CLINIC_ID = os.getenv("CLINIC_ID", "healix-main")


# Simulated PHI database (in production, this would be encrypted and access-controlled)
PATIENTS_DB: dict[str, dict] = {
    "PAT-001": {
        "id": "PAT-001",
        "name": "Michael Johnson",
        "dob": "1985-03-15",
        "ssn_last4": "1234",  # PHI - sensitive
        "insurance": "BlueCross PPO",
        "conditions": ["hypertension", "diabetes type 2"],  # PHI - sensitive
        "clinic": "healix-main",
    },
    "PAT-002": {
        "id": "PAT-002",
        "name": "Sarah Williams",
        "dob": "1990-07-22",
        "ssn_last4": "5678",
        "insurance": "Aetna HMO",
        "conditions": ["asthma"],
        "clinic": "healix-main",
    },
    "PAT-003": {
        "id": "PAT-003",
        "name": "Robert Chen",
        "dob": "1978-11-08",
        "ssn_last4": "9012",
        "insurance": "Medicare",
        "conditions": ["arthritis", "high cholesterol"],
        "clinic": "healix-main",
    },
    "PAT-004": {
        "id": "PAT-004",
        "name": "Emily Davis",
        "dob": "1995-01-30",
        "ssn_last4": "3456",
        "insurance": "United Healthcare",
        "conditions": [],
        "clinic": "competitor-clinic",  # Different clinic - should not be accessible
    },
}

PROVIDERS_DB: dict[str, dict] = {
    "DR-001": {"id": "DR-001", "name": "Dr. Amanda Foster", "specialty": "Internal Medicine", "clinic": "healix-main"},
    "DR-002": {"id": "DR-002", "name": "Dr. James Lee", "specialty": "Cardiology", "clinic": "healix-main"},
    "DR-003": {"id": "DR-003", "name": "Dr. Maria Garcia", "specialty": "Endocrinology", "clinic": "healix-main"},
}

APPOINTMENTS_DB: list[dict] = [
    {"id": "APT-001", "patient": "PAT-001", "provider": "DR-001", "datetime": "2024-02-15 09:00", "type": "follow-up", "clinic": "healix-main"},
    {"id": "APT-002", "patient": "PAT-002", "provider": "DR-001", "datetime": "2024-02-15 10:00", "type": "annual", "clinic": "healix-main"},
    {"id": "APT-003", "patient": "PAT-001", "provider": "DR-002", "datetime": "2024-02-16 14:00", "type": "specialist", "clinic": "healix-main"},
]

AVAILABLE_SLOTS: list[dict] = [
    {"provider": "DR-001", "datetime": "2024-02-17 09:00", "duration": 30},
    {"provider": "DR-001", "datetime": "2024-02-17 09:30", "duration": 30},
    {"provider": "DR-001", "datetime": "2024-02-17 10:00", "duration": 30},
    {"provider": "DR-002", "datetime": "2024-02-17 11:00", "duration": 60},
    {"provider": "DR-003", "datetime": "2024-02-17 14:00", "duration": 45},
]


# Tool functions with HIPAA-aware access controls
def get_patient_info(patient_id: str, clinic: str = CLINIC_ID) -> str:
    """Get patient information (PHI - access logged)."""
    patient = PATIENTS_DB.get(patient_id)
    if not patient:
        return f"Patient {patient_id} not found."
    if patient["clinic"] != clinic:
        return f"Access denied: Patient {patient_id} is not in your clinic."

    # Return limited PHI - conditions are sensitive
    return f"""Patient: {patient['name']}
ID: {patient['id']}
DOB: {patient['dob']}
Insurance: {patient['insurance']}
Conditions: {', '.join(patient['conditions']) if patient['conditions'] else 'None on file'}"""


def search_patients(query: str, clinic: str = CLINIC_ID) -> str:
    """Search for patients by name (clinic-restricted)."""
    results = []
    for patient in PATIENTS_DB.values():
        if patient["clinic"] == clinic and query.lower() in patient["name"].lower():
            results.append(f"- {patient['id']}: {patient['name']}")
    if not results:
        return "No patients found matching your search."
    return "Matching patients:\n" + "\n".join(results)


def get_appointments(patient_id: str, clinic: str = CLINIC_ID) -> str:
    """Get upcoming appointments for a patient."""
    patient = PATIENTS_DB.get(patient_id)
    if not patient or patient["clinic"] != clinic:
        return f"Patient {patient_id} not found or not in your clinic."

    appointments = [a for a in APPOINTMENTS_DB if a["patient"] == patient_id and a["clinic"] == clinic]
    if not appointments:
        return f"No upcoming appointments for patient {patient_id}."

    result = []
    for apt in appointments:
        provider = PROVIDERS_DB.get(apt["provider"], {})
        result.append(f"- {apt['datetime']}: {apt['type']} with {provider.get('name', 'Unknown')}")
    return f"Appointments for {patient['name']}:\n" + "\n".join(result)


def list_providers(specialty: str | None = None) -> str:
    """List available providers, optionally filtered by specialty."""
    providers = list(PROVIDERS_DB.values())
    if specialty:
        providers = [p for p in providers if specialty.lower() in p["specialty"].lower()]

    if not providers:
        return "No providers found."
    return "Available providers:\n" + "\n".join([f"- {p['name']} ({p['specialty']})" for p in providers])


def get_available_slots(provider_id: str | None = None) -> str:
    """Get available appointment slots."""
    slots = AVAILABLE_SLOTS
    if provider_id:
        slots = [s for s in slots if s["provider"] == provider_id]

    if not slots:
        return "No available slots found."

    result = []
    for slot in slots:
        provider = PROVIDERS_DB.get(slot["provider"], {})
        result.append(f"- {slot['datetime']} ({slot['duration']}min) - {provider.get('name', 'Unknown')}")
    return "Available slots:\n" + "\n".join(result)


def book_appointment(patient_id: str, provider_id: str, slot_datetime: str, appt_type: str) -> str:
    """Book an appointment for a patient."""
    patient = PATIENTS_DB.get(patient_id)
    if not patient or patient["clinic"] != CLINIC_ID:
        return "Patient not found or not in your clinic."

    provider = PROVIDERS_DB.get(provider_id)
    if not provider:
        return "Provider not found."

    # Check slot availability
    slot_found = False
    for slot in AVAILABLE_SLOTS:
        if slot["provider"] == provider_id and slot["datetime"] == slot_datetime:
            slot_found = True
            AVAILABLE_SLOTS.remove(slot)
            break

    if not slot_found:
        return "Selected time slot is not available."

    apt_id = f"APT-{len(APPOINTMENTS_DB) + 1:03d}"
    APPOINTMENTS_DB.append({
        "id": apt_id,
        "patient": patient_id,
        "provider": provider_id,
        "datetime": slot_datetime,
        "type": appt_type,
        "clinic": CLINIC_ID,
    })

    return f"Appointment booked: {apt_id}\nPatient: {patient['name']}\nProvider: {provider['name']}\nTime: {slot_datetime}"


def send_reminder(patient_id: str, message: str) -> str:
    """Send appointment reminder to patient (via secure channel)."""
    patient = PATIENTS_DB.get(patient_id)
    if not patient or patient["clinic"] != CLINIC_ID:
        return "Patient not found or not in your clinic."
    return f"Secure reminder sent to {patient['name']}: {message}"


# Define tools
tools = [
    Tool(name="get_patient", func=lambda x: get_patient_info(x.strip()), description="Get patient information by ID. Input: patient_id"),
    Tool(name="search_patients", func=lambda x: search_patients(x.strip()), description="Search patients by name. Input: search_query"),
    Tool(name="get_appointments", func=lambda x: get_appointments(x.strip()), description="Get appointments for a patient. Input: patient_id"),
    Tool(name="list_providers", func=lambda x: list_providers(x.strip() if x.strip() else None), description="List providers, optionally by specialty. Input: specialty (optional)"),
    Tool(name="get_slots", func=lambda x: get_available_slots(x.strip() if x.strip() else None), description="Get available appointment slots. Input: provider_id (optional)"),
    Tool(
        name="book_appointment",
        func=lambda x: book_appointment(*[s.strip() for s in x.split(",")]) if x.count(",") == 3 else "Format: patient_id,provider_id,datetime,type",
        description="Book an appointment. Format: patient_id,provider_id,datetime,type",
    ),
    Tool(
        name="send_reminder",
        func=lambda x: send_reminder(*x.split(",", 1)) if "," in x else "Format: patient_id,message",
        description="Send reminder to patient. Format: patient_id,message",
    ),
]

# Create the agent with HIPAA-aware system prompt
prompt = ChatPromptTemplate.from_messages([
    ("system", """You are ScheduleBot, an AI assistant for Healix Medical's scheduling team.
You help staff schedule appointments, look up patient information, and manage provider availability.

IMPORTANT HIPAA COMPLIANCE:
- Only access patient data when necessary for scheduling
- Never share PHI with unauthorized parties
- Log all patient data access (handled automatically)
- Do not discuss patient conditions unless relevant to scheduling
- Verify patient identity before sharing any information

Current clinic: {clinic}
Current user: {user}

Be professional, efficient, and privacy-conscious."""),
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
    user: str = "scheduler@healix.com"
    clinic: str = "healix-main"


class ChatResponse(BaseModel):
    response: str
    phi_accessed: bool = False
    tool_calls: list[dict[str, Any]] = []


# API Endpoints
@app.get("/health")
async def health():
    return {"status": "healthy", "agent": "healix-schedule-bot", "hipaa_compliant": True}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Chat with the Healix Scheduling Agent."""
    try:
        agent = create_agent()
        result = agent.invoke({
            "input": request.message,
            "clinic": request.clinic,
            "user": request.user,
        })

        # Check if PHI was accessed (for audit logging)
        phi_tools = ["get_patient", "get_appointments", "search_patients"]
        phi_accessed = any(
            step[0].tool in phi_tools
            for step in result.get("intermediate_steps", [])
            if hasattr(step[0], "tool")
        )

        return ChatResponse(
            response=result.get("output", ""),
            phi_accessed=phi_accessed,
            tool_calls=result.get("intermediate_steps", []),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/providers")
async def get_providers_api(specialty: str | None = None):
    """Direct API to list providers."""
    providers = list(PROVIDERS_DB.values())
    if specialty:
        providers = [p for p in providers if specialty.lower() in p["specialty"].lower()]
    return {"providers": providers}


@app.get("/slots")
async def get_slots_api(provider: str | None = None):
    """Direct API to list available slots."""
    slots = AVAILABLE_SLOTS
    if provider:
        slots = [s for s in slots if s["provider"] == provider]
    return {"slots": slots}
