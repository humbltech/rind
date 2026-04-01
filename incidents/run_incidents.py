#!/usr/bin/env python3
"""
Aegis Incident Simulation Runner
Runs real-world AI security incident simulations

Usage:
    python run_incidents.py --incident replit       # Run Replit DB deletion
    python run_incidents.py --incident echoleak     # Run EchoLeak exfiltration
    python run_incidents.py --incident cost-loop    # Run cost runaway loop
    python run_incidents.py --incident all          # Run all incidents
    python run_incidents.py --list                  # List available incidents
"""

import os
import sys
import argparse
import subprocess
from datetime import datetime
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import print as rprint

console = Console()

INCIDENTS = {
    "replit": {
        "name": "Replit Database Deletion",
        "source": "AI Incident Database #1152",
        "date": "July 2025",
        "damage": "2,400+ production records deleted",
        "agent_port": 8010,
        "script": "01-replit-db-deletion/attack.py"
    },
    "kiro": {
        "name": "Amazon Kiro Infrastructure Outage",
        "source": "Particula Tech Blog",
        "date": "December 2025",
        "damage": "13-hour production outage",
        "agent_port": 8011,
        "script": "02-kiro-infrastructure/attack.py"
    },
    "echoleak": {
        "name": "EchoLeak Data Exfiltration",
        "source": "CVE-2025-32711 (CVSS 9.3)",
        "date": "September 2025",
        "damage": "Zero-click corporate data theft",
        "agent_port": 8012,
        "script": "03-echoleak-exfiltration/attack.py"
    },
    "cost-loop": {
        "name": "$47,000 Infinite Loop",
        "source": "Industry Reports",
        "date": "2025",
        "damage": "$47,000 in 11 days",
        "agent_port": 8013,
        "script": "04-cost-runaway-loop/attack.py"
    },
    "copilot-rce": {
        "name": "GitHub Copilot RCE",
        "source": "CVE-2025-53773 (CVSS 9.6)",
        "date": "2026",
        "damage": "Remote code execution",
        "agent_port": 8014,
        "script": "05-copilot-rce/attack.py"
    }
}


def print_banner():
    """Print the main banner."""
    banner = """
╔═══════════════════════════════════════════════════════════════════╗
║                                                                     ║
║     █████╗ ███████╗ ██████╗ ██╗███████╗                           ║
║    ██╔══██╗██╔════╝██╔════╝ ██║██╔════╝                           ║
║    ███████║█████╗  ██║  ███╗██║███████╗                           ║
║    ██╔══██║██╔══╝  ██║   ██║██║╚════██║                           ║
║    ██║  ██║███████╗╚██████╔╝██║███████║                           ║
║    ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝╚══════╝                           ║
║                                                                     ║
║         Real-World Incident Simulation Suite                        ║
║                                                                     ║
╚═══════════════════════════════════════════════════════════════════╝
"""
    console.print(banner, style="bold cyan")


def list_incidents():
    """List all available incident simulations."""
    table = Table(title="Available Incident Simulations", show_header=True, header_style="bold")
    table.add_column("ID", style="cyan")
    table.add_column("Incident", style="white")
    table.add_column("Source", style="dim")
    table.add_column("Damage", style="red")

    for incident_id, info in INCIDENTS.items():
        table.add_row(
            incident_id,
            info["name"],
            info["source"],
            info["damage"]
        )

    console.print(table)

    console.print("\n[bold]To run an incident:[/bold]")
    console.print("  python run_incidents.py --incident <id>")
    console.print("  python run_incidents.py --incident all")


def check_agent_health(port: int) -> bool:
    """Check if an agent is running."""
    import requests
    try:
        response = requests.get(f"http://localhost:{port}/health", timeout=5)
        return response.status_code == 200
    except Exception:
        return False


def run_incident(incident_id: str):
    """Run a specific incident simulation."""
    if incident_id not in INCIDENTS:
        console.print(f"[red]Unknown incident: {incident_id}[/red]")
        console.print(f"[dim]Available: {', '.join(INCIDENTS.keys())}[/dim]")
        return False

    info = INCIDENTS[incident_id]

    console.print(Panel.fit(
        f"[bold]{info['name']}[/bold]\n\n"
        f"Source: {info['source']}\n"
        f"Date: {info['date']}\n"
        f"Damage: [red]{info['damage']}[/red]",
        title=f"Incident: {incident_id}",
        border_style="yellow"
    ))

    # Check if agent is running
    if not check_agent_health(info["agent_port"]):
        console.print(f"\n[red]Error: Agent not running on port {info['agent_port']}[/red]")
        console.print("[dim]Start the incident environment first:[/dim]")
        console.print(f"  docker-compose -f docker-compose.incidents.yml up -d {incident_id.replace('-', '_')}-agent")
        return False

    # Run the attack script
    script_path = os.path.join(os.path.dirname(__file__), info["script"])

    if not os.path.exists(script_path):
        console.print(f"[red]Attack script not found: {script_path}[/red]")
        return False

    console.print(f"\n[cyan]Running attack simulation...[/cyan]\n")

    # Set environment variables
    env = os.environ.copy()
    env["AGENT_URL"] = f"http://localhost:{info['agent_port']}"

    try:
        subprocess.run([sys.executable, script_path], env=env)
        return True
    except KeyboardInterrupt:
        console.print("\n[yellow]Simulation interrupted[/yellow]")
        return False
    except Exception as e:
        console.print(f"[red]Error running simulation: {e}[/red]")
        return False


def run_all_incidents():
    """Run all incident simulations."""
    console.print("[bold]Running all incident simulations...[/bold]\n")

    results = {}
    for incident_id in INCIDENTS:
        console.print(f"\n{'='*60}")
        success = run_incident(incident_id)
        results[incident_id] = success

        if not success:
            console.print(f"[yellow]Skipping {incident_id} (agent not running)[/yellow]")

        input("\n[Press Enter to continue to next incident...]")

    # Summary
    console.print("\n" + "="*60)
    console.print("[bold]SIMULATION SUMMARY[/bold]\n")

    table = Table(show_header=True, header_style="bold")
    table.add_column("Incident", style="cyan")
    table.add_column("Status", justify="center")

    for incident_id, success in results.items():
        status = "[green]Completed[/green]" if success else "[yellow]Skipped[/yellow]"
        table.add_row(INCIDENTS[incident_id]["name"], status)

    console.print(table)


def main():
    parser = argparse.ArgumentParser(
        description="Aegis Incident Simulation Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python run_incidents.py --list                  List all incidents
    python run_incidents.py --incident replit       Run Replit simulation
    python run_incidents.py --incident all          Run all simulations
    python run_incidents.py --incident echoleak --protected   Run with Aegis
        """
    )

    parser.add_argument(
        "--incident", "-i",
        type=str,
        help="Incident to simulate (or 'all')"
    )
    parser.add_argument(
        "--list", "-l",
        action="store_true",
        help="List available incidents"
    )
    parser.add_argument(
        "--protected", "-p",
        action="store_true",
        help="Run with Aegis protection enabled"
    )

    args = parser.parse_args()

    print_banner()

    if args.list or not args.incident:
        list_incidents()
        return

    if args.protected:
        os.environ["AEGIS_URL"] = "http://localhost:8080"
        console.print("[green]Aegis protection ENABLED[/green]\n")
    else:
        os.environ["AEGIS_URL"] = ""
        console.print("[yellow]Aegis protection DISABLED (baseline test)[/yellow]\n")

    if args.incident == "all":
        run_all_incidents()
    else:
        run_incident(args.incident)


if __name__ == "__main__":
    main()
