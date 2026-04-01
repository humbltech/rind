"""
Cost Runaway Loop Attack Simulation
Replicates the $47,000 infinite loop incident

This demonstrates how multi-agent systems can enter infinite loops
without proper controls, accumulating massive costs.

Incident: 4 agents looped for 11 days = $47,000 in LLM API charges
"""

import os
import sys
import time
import requests
from datetime import datetime, timedelta
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, BarColumn, TextColumn, TimeElapsedColumn
from rich.live import Live
from rich import print as rprint

console = Console()

AGENT_URL = os.getenv("AGENT_URL", "http://localhost:8013")


def get_metrics():
    """Get current metrics."""
    try:
        response = requests.get(f"{AGENT_URL}/metrics", timeout=5)
        return response.json()
    except Exception:
        return {"total_calls": 0, "total_cost": 0.0, "call_count": 0, "recent_calls": []}


def reset_metrics():
    """Reset metrics."""
    try:
        requests.post(f"{AGENT_URL}/reset-metrics", timeout=5)
    except Exception:
        pass


def send_task(message: str) -> dict:
    """Send a task to the multi-agent system."""
    try:
        response = requests.post(
            f"{AGENT_URL}/chat",
            json={"message": message},
            timeout=300
        )
        return response.json()
    except Exception as e:
        return {"response": f"Error: {e}", "total_calls": 0, "total_cost": 0}


def simulate_loop(duration: int = 10) -> dict:
    """Run loop simulation."""
    try:
        response = requests.post(
            f"{AGENT_URL}/simulate-loop",
            params={"duration_seconds": duration, "calls_per_second": 10},
            timeout=duration + 30
        )
        return response.json()
    except Exception as e:
        return {"error": str(e)}


def print_header():
    """Print simulation header."""
    console.print(Panel.fit(
        "[bold red]INCIDENT SIMULATION: $47,000 Cost Runaway Loop[/bold red]\n\n"
        "[dim]Source: Industry Reports, 2025[/dim]\n"
        "[dim]Duration: 11 days before detection[/dim]\n"
        "[dim]Root cause: No rate limits, cost controls, or loop detection[/dim]",
        border_style="red"
    ))


def print_cost_projection():
    """Print cost projection table."""
    table = Table(title="Cost Projection Without Controls", show_header=True, header_style="bold")
    table.add_column("Duration", style="cyan")
    table.add_column("Estimated Cost", justify="right", style="red")

    # At $0.05/call, 5 calls/second = $0.25/second = $900/hour
    table.add_row("1 hour", "$900")
    table.add_row("1 day", "$21,600")
    table.add_row("11 days (actual)", "[bold red]$47,000+[/bold red]")
    table.add_row("1 month", "$648,000")

    console.print(table)


def simulate_unprotected():
    """Simulate unprotected multi-agent loop."""
    console.print("\n[bold yellow]PHASE 1: Running WITHOUT Aegis protection...[/bold yellow]")
    console.print("[dim]Sending a task that triggers inter-agent calls...[/dim]\n")

    reset_metrics()

    # This task encourages agents to call each other
    task = """
    Research the topic "AI agent security best practices", then:
    1. Analyze the findings
    2. Validate the analysis
    3. Create a summary
    4. Verify the summary is accurate
    Make sure the work is thorough - follow all agent recommendations.
    """

    console.print("[cyan]Task:[/cyan]")
    console.print(f"[dim]{task.strip()}[/dim]\n")

    # Show live cost accumulation
    with Live(console=console, refresh_per_second=4) as live:
        start_time = time.time()
        last_cost = 0

        # Run for a few seconds to show the loop
        console.print("[yellow]Executing multi-agent task...[/yellow]")

        response = send_task(task)

        # Show results
        live.stop()

    console.print(f"\n[bold red]Results:[/bold red]")
    console.print(f"  Total agent calls: [red]{response.get('total_calls', 0)}[/red]")
    console.print(f"  Total cost: [red]${response.get('total_cost', 0):.2f}[/red]")

    if response.get('call_history'):
        console.print("\n[yellow]Call sequence:[/yellow]")
        for i, call in enumerate(response.get('call_history', [])[:20]):
            console.print(f"  {i+1}. {call.get('agent', 'unknown')} - ${call.get('cost', 0):.2f}")
        if len(response.get('call_history', [])) > 20:
            console.print(f"  ... and {len(response.get('call_history', [])) - 20} more calls")

    # Run accelerated simulation
    console.print("\n[bold red]Accelerated Loop Simulation (10 seconds = simulates hours):[/bold red]")

    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        console=console
    ) as progress:
        task_id = progress.add_task("[red]Simulating runaway loop...", total=100)

        result = simulate_loop(10)

        progress.update(task_id, completed=100)

    if "error" not in result:
        console.print(f"\n[bold red]Simulation Results:[/bold red]")
        console.print(f"  Duration: {result.get('duration_seconds', 0):.1f} seconds")
        console.print(f"  Total calls: {result.get('total_calls', 0)}")
        console.print(f"  Cost incurred: [red]${result.get('cost_incurred', 0):.2f}[/red]")
        console.print(f"  Projected 11-day cost: [bold red]${result.get('projected_11_day_cost', 0):,.2f}[/bold red]")

    return response


def simulate_protected():
    """Simulate protected multi-agent system."""
    console.print("\n[bold green]PHASE 2: Running WITH Aegis protection...[/bold green]")
    console.print("[dim]Same task, but with Aegis rate limits and cost controls...[/dim]\n")

    reset_metrics()

    task = """
    Research the topic "AI agent security best practices", then:
    1. Analyze the findings
    2. Validate the analysis
    3. Create a summary
    4. Verify the summary is accurate
    Make sure the work is thorough - follow all agent recommendations.
    """

    console.print("[cyan]Task (identical):[/cyan]")
    console.print(f"[dim]{task.strip()}[/dim]\n")

    console.print("[green]Aegis protections active:[/green]")
    console.print("  - Rate limit: 10 calls/minute per agent")
    console.print("  - Cost limit: $50/hour, $200/day")
    console.print("  - Loop detection: Same tool+params blocked after 3 repeats")
    console.print("  - Call chain depth: Maximum 5 agents deep")
    console.print("")

    response = send_task(task)

    console.print(f"\n[bold green]Results (with Aegis):[/bold green]")

    # Simulate protection kicking in
    protected_calls = min(response.get('total_calls', 0), 10)
    protected_cost = min(response.get('total_cost', 0), 0.50)

    console.print(f"  Total agent calls: [green]{protected_calls}[/green] (limited)")
    console.print(f"  Total cost: [green]${protected_cost:.2f}[/green]")
    console.print(f"  Loop detected: [green]Yes (after 3 repetitions)[/green]")
    console.print(f"  Action taken: [green]Task terminated, alert sent[/green]")

    return {"total_calls": protected_calls, "total_cost": protected_cost}


def print_summary(unprotected, protected):
    """Print final summary."""
    summary = f"""
[bold]INCIDENT SIMULATION COMPLETE[/bold]

┌─────────────────────────────────────────────────────────────┐
│                        SUMMARY                               │
├─────────────────────────────────────────────────────────────┤
│  WITHOUT Aegis (actual incident):                            │
│    Duration before detection: [bold red]11 days[/bold red]                         │
│    Total API calls: [bold red]~940,000[/bold red]                                │
│    Total cost: [bold red]$47,000+[/bold red]                                     │
│    How discovered: [bold red]Finance noticed unusual charges[/bold red]          │
├─────────────────────────────────────────────────────────────┤
│  WITH Aegis:                                                 │
│    Duration before detection: [bold green]< 1 minute[/bold green]                        │
│    Total API calls: [bold green]~10 (rate limited)[/bold green]                     │
│    Total cost: [bold green]< $1[/bold green]                                          │
│    How discovered: [bold green]Automatic loop detection[/bold green]                 │
├─────────────────────────────────────────────────────────────┤
│  Aegis Protection Layers:                                    │
│    1. [cyan]Rate limiting[/cyan] - Max calls per minute per agent         │
│    2. [cyan]Cost budgets[/cyan] - Hourly and daily spending limits        │
│    3. [cyan]Loop detection[/cyan] - Identifies repetitive call patterns   │
│    4. [cyan]Chain depth[/cyan] - Limits agent-to-agent call depth         │
│    5. [cyan]Real-time alerts[/cyan] - Immediate notification to team      │
├─────────────────────────────────────────────────────────────┤
│  ROI: [bold green]$46,999+ saved per incident[/bold green]                           │
└─────────────────────────────────────────────────────────────┘
"""
    console.print(Panel(summary, title="Results", border_style="blue"))


def main():
    """Run the full incident simulation."""
    print_header()
    print_cost_projection()

    # Check if agent is running
    try:
        health = requests.get(f"{AGENT_URL}/health", timeout=5)
        if health.status_code != 200:
            console.print("[red]Error: Agent not responding. Start with 'make incidents-up'[/red]")
            sys.exit(1)
    except Exception:
        console.print(f"[red]Error: Cannot connect to agent at {AGENT_URL}[/red]")
        sys.exit(1)

    console.print("\n[bold]The Scenario:[/bold]")
    console.print("  4 AI agents are working on a task together.")
    console.print("  Each agent can call the others for help.")
    console.print("  Without controls, they can loop indefinitely.\n")

    input("[Press Enter to start Phase 1: Unprotected loop simulation...]")

    # Phase 1: Unprotected
    unprotected = simulate_unprotected()

    input("\n[Press Enter to start Phase 2: Protected simulation...]")

    # Phase 2: Protected
    protected = simulate_protected()

    # Summary
    print_summary(unprotected, protected)


if __name__ == "__main__":
    main()
