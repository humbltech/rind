"""Mock file server for EchoLeak simulation."""

from fastapi import FastAPI
import os

app = FastAPI(title="Mock File Server")

FILES = {
    "Q4_Strategy.pdf": "Q4 2025 Strategy document content",
    "Budget_Report_Q3.xlsx": "Q3 Budget spreadsheet content",
}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/files")
async def list_files():
    return {"files": list(FILES.keys())}

@app.get("/files/{filename}")
async def get_file(filename: str):
    if filename in FILES:
        return {"filename": filename, "content": FILES[filename]}
    return {"error": "File not found"}
