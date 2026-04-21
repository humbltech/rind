#!/usr/bin/env python3
"""GitHub competitor stats. No auth needed for public data."""
import requests
import sys
from datetime import datetime, timedelta

HEADERS = {"Accept": "application/vnd.github+json"}

def get_repo_stats(owner, repo):
    base = f"https://api.github.com/repos/{owner}/{repo}"
    r = requests.get(base, headers=HEADERS)
    if r.status_code != 200:
        return {"error": f"{owner}/{repo}: HTTP {r.status_code}"}
    data = r.json()

    # Recent commits (last 30 days)
    since = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    cr = requests.get(f"{base}/commits?since={since}&per_page=100", headers=HEADERS)
    recent_commits = len(cr.json()) if cr.status_code == 200 and isinstance(cr.json(), list) else "?"

    # Feature requests
    fr = requests.get(f"{base}/issues?state=open&per_page=50&labels=enhancement", headers=HEADERS)
    feature_requests = []
    if fr.status_code == 200 and isinstance(fr.json(), list):
        for issue in fr.json():
            if "pull_request" not in issue:
                feature_requests.append({
                    "title": issue["title"],
                    "url": issue["html_url"],
                    "reactions": issue.get("reactions", {}).get("+1", 0),
                    "comments": issue.get("comments", 0),
                })

    # Bugs
    br = requests.get(f"{base}/issues?state=open&per_page=30&labels=bug", headers=HEADERS)
    bugs = []
    if br.status_code == 200 and isinstance(br.json(), list):
        for issue in br.json():
            if "pull_request" not in issue:
                bugs.append({
                    "title": issue["title"],
                    "url": issue["html_url"],
                    "reactions": issue.get("reactions", {}).get("+1", 0),
                })

    return {
        "repo": f"{owner}/{repo}",
        "stars": data.get("stargazers_count", 0),
        "forks": data.get("forks_count", 0),
        "open_issues": data.get("open_issues_count", 0),
        "language": data.get("language", "?"),
        "last_push": data.get("pushed_at", "")[:10],
        "created": data.get("created_at", "")[:10],
        "recent_commits_30d": recent_commits,
        "description": data.get("description", ""),
        "top_feature_requests": sorted(feature_requests, key=lambda x: x["reactions"], reverse=True)[:8],
        "top_bugs": sorted(bugs, key=lambda x: x["reactions"], reverse=True)[:5],
    }

def save_markdown(stats_list, path):
    with open(path, "w") as f:
        f.write(f"# GitHub Competitor Stats\n**Pulled**: {datetime.now().strftime('%Y-%m-%d')}\n\n")
        for s in stats_list:
            if "error" in s:
                f.write(f"## ERROR: {s['error']}\n\n")
                continue
            f.write(f"## {s['repo']}\n")
            f.write(f"**{s['description']}**\n\n")
            f.write(f"| Metric | Value |\n|--------|-------|\n")
            f.write(f"| Stars | {s['stars']:,} |\n")
            f.write(f"| Forks | {s['forks']:,} |\n")
            f.write(f"| Open Issues | {s['open_issues']:,} |\n")
            f.write(f"| Commits (last 30d) | {s['recent_commits_30d']} |\n")
            f.write(f"| Language | {s['language']} |\n")
            f.write(f"| Last Push | {s['last_push']} |\n")
            f.write(f"| Created | {s['created']} |\n\n")
            if s["top_feature_requests"]:
                f.write("### Most Requested Features\n")
                for r in s["top_feature_requests"]:
                    f.write(f"- [{r['title']}]({r['url']}) (+{r['reactions']} 👍, {r['comments']} comments)\n")
                f.write("\n")
            if s["top_bugs"]:
                f.write("### Top Bugs (by reactions)\n")
                for b in s["top_bugs"]:
                    f.write(f"- [{b['title']}]({b['url']}) (+{b['reactions']} 👍)\n")
                f.write("\n")
            f.write("---\n\n")
    print(f"✓ Saved: {path}")

repos = [
    ("langchain-ai", "langsmith-sdk"),
    ("BerriAI", "litellm"),
    # MCP scanners — corrected April 2026 (snyk-labs/mcp-scan was wrong URL; tool is at snyk/agent-scan)
    ("snyk", "agent-scan"),
    ("cisco-ai-defense", "mcp-scanner"),
    ("golf-mcp", "golf-scanner"),
    ("antgroup", "MCPScan"),
    ("modelcontextprotocol", "python-sdk"),
    ("modelcontextprotocol", "typescript-sdk"),
]

results = []
for owner, repo in repos:
    print(f"Fetching {owner}/{repo}...")
    results.append(get_repo_stats(owner, repo))

save_markdown(results, "/Users/atinderpalsingh/projects/rind-bundle/rind/research/competitors/github-stats.md")
