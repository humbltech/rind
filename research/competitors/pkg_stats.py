#!/usr/bin/env python3
"""npm + PyPI download stats. No auth needed."""
import requests
from datetime import datetime

def npm_downloads(package):
    r = requests.get(f"https://api.npmjs.org/downloads/point/last-week/{package}")
    if r.status_code != 200:
        return {"error": f"npm {package}: HTTP {r.status_code}"}
    data = r.json()
    # Also get package metadata
    meta = requests.get(f"https://registry.npmjs.org/{package}/latest")
    version = meta.json().get("version", "?") if meta.status_code == 200 else "?"
    desc = meta.json().get("description", "") if meta.status_code == 200 else ""
    return {
        "package": package,
        "ecosystem": "npm",
        "weekly_downloads": data.get("downloads", 0),
        "version": version,
        "description": desc,
    }

def pypi_downloads(package):
    # PyPI stats via pypistats.org (no auth)
    r = requests.get(f"https://pypistats.org/api/packages/{package}/recent")
    if r.status_code != 200:
        return {"error": f"pypi {package}: HTTP {r.status_code}"}
    data = r.json().get("data", {})
    # Get version from PyPI
    meta = requests.get(f"https://pypi.org/pypi/{package}/json")
    version = meta.json()["info"]["version"] if meta.status_code == 200 else "?"
    desc = meta.json()["info"]["summary"] if meta.status_code == 200 else ""
    return {
        "package": package,
        "ecosystem": "pypi",
        "monthly_downloads": data.get("last_month", 0),
        "weekly_downloads": data.get("last_week", 0),
        "version": version,
        "description": desc,
    }

packages = [
    ("npm", "langsmith"),
    ("npm", "@modelcontextprotocol/sdk"),
    ("pypi", "langsmith"),
    ("pypi", "litellm"),
    ("pypi", "mcp"),
]

results = []
for ecosystem, pkg in packages:
    print(f"Fetching {ecosystem}/{pkg}...")
    if ecosystem == "npm":
        results.append(npm_downloads(pkg))
    else:
        results.append(pypi_downloads(pkg))

# Save to markdown
output_path = "/Users/atinderpalsingh/projects/aegis-bundle/aegis/research/competitors/pkg-stats.md"
with open(output_path, "w") as f:
    f.write(f"# Package Download Stats\n**Pulled**: {datetime.now().strftime('%Y-%m-%d')}\n\n")
    f.write("| Package | Ecosystem | Weekly Downloads | Monthly Downloads | Version |\n")
    f.write("|---------|-----------|-----------------|-------------------|--------|\n")
    for r in results:
        if "error" in r:
            f.write(f"| ERROR: {r['error']} | | | | |\n")
            continue
        weekly = f"{r.get('weekly_downloads', 0):,}"
        monthly = f"{r.get('monthly_downloads', 0):,}" if 'monthly_downloads' in r else "—"
        f.write(f"| `{r['package']}` | {r['ecosystem']} | {weekly} | {monthly} | {r['version']} |\n")
    f.write("\n## Notes\n")
    f.write("- npm: weekly downloads from npmjs.org API\n")
    f.write("- PyPI: monthly/weekly from pypistats.org\n")

print(f"✓ Saved: {output_path}")
